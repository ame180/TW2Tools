import test from "node:test";
import assert from "node:assert/strict";
import {
  SPEED_CLASSES,
  minutesPerTileByClass,
  parseVillageLine,
  targetsByDistance,
  buildSendPlan
} from "../js/lib/attack-planner.js";

test("parseVillageLine reads a game-style copy with name and coordinates", () => {
  assert.deepEqual(parseVillageLine("Red Fort (507|498)"), { key: "507|498", x: 507, y: 498, name: "Red Fort" });
});

test("parseVillageLine ignores digits inside the village name", () => {
  assert.equal(parseVillageLine("Mill 2 (500|500)").name, "Mill 2");
  assert.equal(parseVillageLine("Mill 2 500 500").name, "Mill 2");
  assert.deepEqual(parseVillageLine("Keep 123 (480|510)"), { key: "480|510", x: 480, y: 510, name: "Keep 123" });
});

test("parseVillageLine accepts the walk time separators", () => {
  for (const line of ["500|501", "500/501", "500, 501", "500 501", "(500 | 501)", "Name 500/ 501"]) {
    const village = parseVillageLine(line);
    assert.equal(village?.key, "500|501", line);
  }
});

test("parseVillageLine allows a trailing continent tag", () => {
  assert.deepEqual(parseVillageLine("village (455|521) K55"), { key: "455|521", x: 455, y: 521, name: "village" });
});

test("parseVillageLine uses coordinates as the name when none is given", () => {
  assert.equal(parseVillageLine("  (500|500) ").name, "500|500");
});

test("parseVillageLine rejects lines without two 3-digit coordinates at the end", () => {
  for (const line of ["", "junk", "Mill 2", "Mill 23 500", "50|500", "5000|500", "500|5000", "500|500 trailing"]) {
    assert.equal(parseVillageLine(line), null, line);
  }
});

test("minutesPerTileByClass reads speeds from unit data", () => {
  const units = { light_cavalry: { speed: 8 }, axe: { speed: 14 } };
  const speeds = minutesPerTileByClass(units);
  assert.equal(speeds.lc, 8);
  assert.equal(speeds.axe, 14);
  assert.equal(speeds.treb, 0);
  assert.equal(Object.keys(speeds).length, SPEED_CLASSES.length);
});

test("targetsByDistance sorts nearest first", () => {
  const source = { key: "500|500", x: 500, y: 500 };
  const far = { key: "520|500", x: 520, y: 500 };
  const near = { key: "505|500", x: 505, y: 500 };
  const sorted = targetsByDistance(source, [far, near]);
  assert.deepEqual(sorted.map((entry) => entry.village.key), ["505|500", "520|500"]);
  assert.equal(sorted[0].distance, 5);
});

const source = { key: "500|500", x: 500, y: 500, name: "Home" };
const target = { key: "510|500", x: 510, y: 500, name: "Enemy" };
const minutesPerTile = { lc: 8, axe: 14, noble: 35 };
const landingMs = Date.UTC(2026, 9, 20, 20, 0, 0);

function attack(id, speedClassId, offsetSeconds = 0) {
  return { id, sourceKey: source.key, targetKey: target.key, speedClassId, offsetSeconds, note: "", sent: false };
}

test("buildSendPlan sends at landing time minus travel time", () => {
  const [row] = buildSendPlan({ attacks: [attack(1, "axe")], sources: [source], targets: [target], landingMs, minutesPerTile });
  assert.equal(row.travelSeconds, 8400);
  assert.equal(row.landsMs, landingMs);
  assert.equal(row.sendMs, landingMs - 8400 * 1000);
});

test("buildSendPlan applies the landing offset to both landing and send time", () => {
  const [row] = buildSendPlan({ attacks: [attack(1, "noble", -2)], sources: [source], targets: [target], landingMs, minutesPerTile });
  assert.equal(row.landsMs, landingMs - 2000);
  assert.equal(row.sendMs, landingMs - 2000 - 21000 * 1000);
});

test("buildSendPlan orders by send time, slowest first, keeping several attacks on one pair", () => {
  const attacks = [attack(1, "lc"), attack(2, "noble", 1), attack(3, "axe"), attack(4, "noble", 2)];
  const rows = buildSendPlan({ attacks, sources: [source], targets: [target], landingMs, minutesPerTile });
  assert.deepEqual(rows.map((row) => row.attack.id), [2, 4, 3, 1]);
});

test("buildSendPlan skips attacks whose villages were removed", () => {
  const orphan = { ...attack(1, "axe"), targetKey: "999|999" };
  assert.deepEqual(buildSendPlan({ attacks: [orphan], sources: [source], targets: [target], landingMs, minutesPerTile }), []);
});
