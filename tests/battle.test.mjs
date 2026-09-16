import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { simulate, UNIT_KEYS } from "../js/lib/battle.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));

function run(overrides) {
  return simulate({ unitStats: data.units, weaponData: data.weapons, ...overrides });
}

test("overwhelming attacker annihilates defender", () => {
  const result = run({ attackerUnits: { axe: 1000 }, defenderUnits: { spear: 10 } });
  assert.equal(result.defender.losses.spear, 10);
  assert.ok(result.attacker.losses.axe < 20);
});

test("overwhelming defender annihilates attacker", () => {
  const result = run({ attackerUnits: { axe: 10 }, defenderUnits: { spear: 1000 } });
  assert.equal(result.attacker.losses.axe, 10);
});

test("losses never exceed quantity and are never negative", () => {
  const result = run({
    attackerUnits: { axe: 137, light_cavalry: 55, archer: 21, ram: 30 },
    defenderUnits: { spear: 200, sword: 90, trebuchet: 12, heavy_cavalry: 33 },
    wall: 14,
    night: true,
    morale: 40,
    luck: -15
  });

  for (const side of [result.attacker, result.defender]) {
    for (const unit of UNIT_KEYS) {
      assert.ok(side.losses[unit] >= 0, `${unit} losses negative`);
      assert.ok(side.losses[unit] <= side.quantity[unit], `${unit} losses exceed quantity`);
    }
  }
});

test("pre-round: defender trebuchets cancel attacker rams 1:1", () => {
  const withTrebs = run({
    attackerUnits: { axe: 500, ram: 30 },
    defenderUnits: { spear: 10, trebuchet: 10 },
    wall: 20
  });
  const withoutTrebs = run({
    attackerUnits: { axe: 500, ram: 30 },
    defenderUnits: { spear: 10 },
    wall: 20
  });

  assert.ok(
    withTrebs.wallAfter >= withoutTrebs.wallAfter,
    "cancelled rams must not deal more wall damage"
  );
  assert.ok(withTrebs.attacker.losses.ram >= 10, "cancelled rams count as losses");
});

test("iron wall keeps the wall at or above its floor", () => {
  const result = run({
    attackerUnits: { axe: 2000, ram: 300 },
    defenderUnits: { spear: 10 },
    wall: 12,
    ironWall: 8
  });
  assert.ok(result.wallAfter >= 8, `wall ${result.wallAfter} broke below iron wall 8`);
});

test("wall already below iron wall level stays unchanged", () => {
  const result = run({
    attackerUnits: { axe: 2000, ram: 300 },
    defenderUnits: { spear: 10 },
    wall: 5,
    ironWall: 10
  });
  assert.equal(result.wallAfter, 5);
});

test("berserker doubles against defender food more than twice its own", () => {
  // Without the doubling mechanic this scenario kills 42 spears (upstream oracle);
  // with doubled berserker attack it kills 118.
  const result = run({ attackerUnits: { berserker: 10 }, defenderUnits: { spear: 1000 } });
  assert.equal(result.defender.losses.spear, 118);
});

test("higher faith reduces attacker losses", () => {
  const base = run({ attackerUnits: { axe: 200 }, defenderUnits: { spear: 100 }, faithAttacker: 100 });
  const blessed = run({ attackerUnits: { axe: 200 }, defenderUnits: { spear: 100 }, faithAttacker: 110 });
  assert.ok(blessed.attacker.losses.axe <= base.attacker.losses.axe);
});

test("night bonus increases attacker losses", () => {
  const day = run({ attackerUnits: { axe: 200 }, defenderUnits: { spear: 150 } });
  const night = run({ attackerUnits: { axe: 200 }, defenderUnits: { spear: 150 }, night: true });
  assert.ok(night.attacker.losses.axe > day.attacker.losses.axe);
});

test("Carol's Morning Star increases ram wall damage", () => {
  const scenario = {
    attackerUnits: { axe: 2000, ram: 100 },
    defenderUnits: { spear: 50 },
    wall: 20
  };
  const bare = run(scenario);
  const withStar = run({ ...scenario, attackerWeapon: { id: "carols_morning_star", level: 3 } });
  assert.ok(
    withStar.wallAfter < bare.wallAfter,
    `expected lower wall with weapon (${withStar.wallAfter} vs ${bare.wallAfter})`
  );
});

test("empty defender leaves attacker untouched", () => {
  const result = run({ attackerUnits: { axe: 100 }, defenderUnits: {} });
  assert.equal(result.attacker.losses.axe, 0);
});

test("weapon data uses the in-game per-level bonus values", () => {
  const standard = Object.entries(data.weapons).filter(([id]) => !["carols_morning_star", "aletheias_bonfire"].includes(id));

  for (const [id, weapon] of standard) {
    for (const bonus of [weapon.attackBonus, weapon.defenceBonus]) {
      assert.ok(
        JSON.stringify(bonus) === "[10,20,30]" || JSON.stringify(bonus) === "[5,10,20]",
        `${id} has unexpected bonus levels ${JSON.stringify(bonus)}`
      );
    }
  }

  assert.deepEqual(data.weapons.carols_morning_star.wallBonus, [25, 50, 100]);
  assert.deepEqual(data.weapons.aletheias_bonfire.attackBonus, [25, 50, 100]);
});

test("every unit has the three defence stats", () => {
  for (const unit of UNIT_KEYS) {
    for (const stat of ["def_inf", "def_cav", "def_arc"]) {
      assert.equal(typeof data.units[unit][stat], "number", `${unit}.${stat} missing`);
    }
  }
});
