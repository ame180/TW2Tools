import test from "node:test";
import assert from "node:assert/strict";
import { healPercent, healedUnits, subtractUnits } from "../js/lib/healing.js";

const healing = { medic: 10, medicus: 10, excludedUnits: ["ram", "catapult", "trebuchet", "nobleman", "knight"] };

test("medic and medicus each add their percentage", () => {
  assert.equal(healPercent({ medic: false, medicus: false }, healing), 0);
  assert.equal(healPercent({ medic: true, medicus: false }, healing), 10);
  assert.equal(healPercent({ medic: false, medicus: true }, healing), 10);
  assert.equal(healPercent({ medic: true, medicus: true }, healing), 20);
});

test("healed units round down per unit type", () => {
  const healed = healedUnits({ spear: 47, axe: 9, sword: 10 }, 10, healing.excludedUnits);
  assert.deepEqual(healed, { spear: 4, axe: 0, sword: 1 });
});

test("excluded units are never healed", () => {
  const losses = { ram: 100, catapult: 100, trebuchet: 100, nobleman: 4, knight: 1, axe: 100 };
  assert.deepEqual(healedUnits(losses, 20, healing.excludedUnits), {
    ram: 0, catapult: 0, trebuchet: 0, nobleman: 0, knight: 0, axe: 20
  });
});

test("zero percent heals nothing", () => {
  assert.deepEqual(healedUnits({ spear: 500, axe: 1000 }, 0, healing.excludedUnits), { spear: 0, axe: 0 });
});

test("subtractUnits removes healed units from losses", () => {
  assert.deepEqual(subtractUnits({ spear: 47, ram: 10 }, { spear: 4, ram: 0 }), { spear: 43, ram: 10 });
});
