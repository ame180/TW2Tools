import test from "node:test";
import assert from "node:assert/strict";
import { calculateMoralePercent } from "../js/lib/morale.js";

test("matches observed in-game data point", () => {
  const morale = calculateMoralePercent(40000, 51);
  assert.equal(Math.round(morale), 27);
});

test("caps at 100% against similar or larger defenders", () => {
  assert.equal(calculateMoralePercent(10000, 10000), 100);
  assert.equal(calculateMoralePercent(10000, 50000), 100);
});

test("returns 100% for zero attacker points", () => {
  assert.equal(calculateMoralePercent(0, 5000), 100);
});

test("approaches base morale against tiny defenders", () => {
  const morale = calculateMoralePercent(1000000, 1);
  assert.ok(morale > 27 && morale < 27.1, `expected ~27, got ${morale}`);
});
