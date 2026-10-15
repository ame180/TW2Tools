import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { maxBarracksSpeedDivisor, recruitSummary } from "../js/lib/recruit.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));

function summarize(unitCounts) {
  return recruitSummary(unitCounts, data.units, data.recruitModifiers);
}

test("maxed barracks bonuses: speed techs I-III and tribe 5 + domination", () => {
  assert.equal(maxBarracksSpeedDivisor(data.recruitModifiers), 1.3 * 1.3);
});

test("no units costs nothing", () => {
  assert.deepEqual(summarize({}), {
    wood: 0, clay: 0, iron: 0, provisions: 0, barracksTime: 0, hallOfOrdersTime: 0,
  });
});

test("barracks units at base price and maxed recruit speed", () => {
  const summary = summarize({ spear: 100, axe: 0 });
  assert.equal(summary.wood, 5000);
  assert.equal(summary.clay, 3000);
  assert.equal(summary.iron, 2000);
  assert.equal(summary.provisions, 100);
  assert.equal(summary.barracksTime, Math.round(9000 / 1.69));
  assert.equal(summary.hallOfOrdersTime, 0);
});

test("hall of orders units queue separately at base time", () => {
  const summary = summarize({ berserker: 10, trebuchet: 2, axe: 1 });
  assert.equal(summary.hallOfOrdersTime, 10 * 1200 + 2 * 1200);
  assert.equal(summary.barracksTime, Math.round(150 / 1.69));
  assert.equal(summary.wood, 10 * 1200 + 2 * 4000 + 60);
});

test("nobles count towards resources but no queue", () => {
  const summary = summarize({ nobleman: 1 });
  assert.equal(summary.wood, 40000);
  assert.equal(summary.provisions, 100);
  assert.equal(summary.barracksTime, 0);
  assert.equal(summary.hallOfOrdersTime, 0);
});

test("paladins are not recruited and are ignored", () => {
  assert.equal(summarize({ knight: 2 }).provisions, 0);
});
