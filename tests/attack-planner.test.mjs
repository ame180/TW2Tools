import test from "node:test";
import assert from "node:assert/strict";
import {
  SPEED_CLASSES,
  minutesPerTileByClass,
  parseVillageLine,
  targetsByDistance,
  buildSendPlan,
  formatPlanText,
  emptyPlan,
  serializePlan,
  parsePlan
} from "../js/lib/attack-planner.js";

test("parseVillageLine rejects coordinates with a leading zero, which stored plans would drop", () => {
  assert.equal(parseVillageLine("Typo 050|500"), null);
  assert.equal(parseVillageLine("Typo (500|099)"), null);
});

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

function samplePlan() {
  return {
    ...emptyPlan(),
    landing: "2026-10-20T21:00:00",
    sources: [{ key: "500|500", x: 500, y: 500, name: "Fort" }],
    targets: [
      { key: "520|505", x: 520, y: 505, name: "Wolf Den" },
      { key: "515|490", x: 515, y: 490, name: "515|490" }
    ],
    attacks: [
      { id: 4, sourceKey: "500|500", targetKey: "520|505", speedClassId: "noble", offsetSeconds: 1, note: "4 nobles", sent: false },
      { id: 9, sourceKey: "500|500", targetKey: "515|490", speedClassId: "lc", offsetSeconds: 0, note: "", sent: true }
    ],
    activeSourceKey: "500|500",
    lastSpeedClassId: "lc",
    lastTargetKey: "515|490",
    nextAttackId: 10
  };
}

test("parsePlan restores a serialized plan with renumbered attack ids", () => {
  const plan = parsePlan(JSON.stringify(serializePlan(samplePlan())));
  const expected = samplePlan();
  expected.attacks[0].id = 1;
  expected.attacks[1].id = 2;
  expected.nextAttackId = 3;
  assert.deepEqual(plan, expected);
});

test("parsePlan rejects text that is not a plan", () => {
  for (const text of ["", "not json", "null", "[]", "42", JSON.stringify({ version: 2 }), null]) {
    assert.equal(parsePlan(text), null, String(text));
  }
});

test("parsePlan drops invalid villages, duplicates and dangling attacks", () => {
  const plan = parsePlan(JSON.stringify({
    version: 1,
    landing: "tomorrow",
    sources: [{ name: "Fort", x: 500, y: 500 }, { name: "Copy", x: 500, y: 500 }, { x: 50, y: 500 }, { name: "  ", x: 501, y: 502 }],
    targets: [{ name: "Wolf Den", x: 520, y: 505 }],
    attacks: [
      { sourceKey: "500|500", targetKey: "520|505", speedClassId: "ram", offsetSeconds: 2.7, note: 5, sent: "yes" },
      { sourceKey: "500|500", targetKey: "999|999", speedClassId: "ram" },
      { sourceKey: "500|500", targetKey: "520|505", speedClassId: "warp" },
      null
    ],
    activeSourceKey: "123|123",
    lastSpeedClassId: "warp",
    lastTargetKey: "999|999"
  }));

  assert.equal(plan.landing, "");
  assert.deepEqual(plan.sources.map((village) => [village.key, village.name]), [["500|500", "Fort"], ["501|502", "501|502"]]);
  assert.deepEqual(plan.attacks, [
    { id: 1, sourceKey: "500|500", targetKey: "520|505", speedClassId: "ram", offsetSeconds: 2, note: "", sent: false }
  ]);
  assert.equal(plan.activeSourceKey, "500|500");
  assert.equal(plan.lastSpeedClassId, emptyPlan().lastSpeedClassId);
  assert.equal(plan.lastTargetKey, null);
});

test("formatPlanText lists unsent attacks and dates sends before the landing day", () => {
  const landingMs = new Date(2026, 9, 20, 21, 0, 0).getTime();
  const plan = samplePlan();
  const row = (attack, sendMs) => ({ attack, source: plan.sources[0], target: plan.targets.find((village) => village.key === attack.targetKey), sendMs });
  const rows = [
    row({ ...plan.attacks[0], offsetSeconds: 0, note: " " }, new Date(2026, 9, 19, 23, 40, 10).getTime()),
    row(plan.attacks[1], new Date(2026, 9, 20, 18, 0, 0).getTime()),
    row(plan.attacks[0], new Date(2026, 9, 20, 19, 5, 33).getTime())
  ];

  assert.equal(formatPlanText(rows, landingMs), [
    "Landing: 20.10 21:00:00",
    "",
    "19.10 23:40:10  Fort (500|500) → Wolf Den (520|505)  Noble",
    "19:05:33  Fort (500|500) → Wolf Den (520|505)  Noble +1s  4 nobles"
  ].join("\n"));
});
