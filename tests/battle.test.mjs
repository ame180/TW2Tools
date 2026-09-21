import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { simulate, strongestWeapons, UNIT_KEYS } from "../js/lib/battle.js";

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
  // with doubled berserker attack it kills 117 (118 before survivors rounded up).
  const result = run({ attackerUnits: { berserker: 10 }, defenderUnits: { spear: 1000 } });
  assert.equal(result.defender.losses.spear, 117);
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

test("defender faith multiplies the wall bonus", () => {
  const result = run({ attackerUnits: { axe: 10 }, defenderUnits: { spear: 10 }, faithDefender: 110, wall: 20 });
  assert.equal(result.defenderModifier, 220);
});

test("low faith and morale product is rounded down before flat bonuses", () => {
  const result = run({ attackerUnits: { axe: 10 }, defenderUnits: { spear: 10 }, faithAttacker: 50, morale: 27, weaponMastery: 8 });
  assert.equal(result.attackerModifier, 21);
});

test("grandmaster is a flat bonus not scaled by faith or morale", () => {
  const result = run({
    attackerUnits: { axe: 10 },
    defenderUnits: { spear: 10 },
    faithAttacker: 50,
    morale: 27,
    weaponMastery: 8,
    grandmaster: true
  });
  assert.equal(result.attackerModifier, 31);
});

test("luck and weapon mastery add to the attacker modifier", () => {
  const result = run({
    attackerUnits: { axe: 10 },
    defenderUnits: { spear: 10 },
    morale: 90,
    luck: 5,
    weaponMastery: 4,
    grandmaster: true
  });
  assert.equal(result.attackerModifier, 109);
});

test("wall after rams sits between the starting and final wall", () => {
  const result = run({
    attackerUnits: { axe: 3000, ram: 200 },
    defenderUnits: { spear: 500 },
    wall: 20
  });
  assert.ok(result.wallAfterRams < result.wallBefore, "rams must damage the wall before combat");
  assert.ok(result.wallAfter < result.wallAfterRams, "surviving rams must damage the wall after combat");
});

test("strongestWeapons keeps the highest level per weapon and drops empty picks", () => {
  const picked = strongestWeapons([
    { id: "halberd_of_guan_yu", level: 1 },
    null,
    { id: "halberd_of_guan_yu", level: 3 },
    { id: null, level: 2 },
    { id: "baptistes_banner", level: 2 },
    { id: "halberd_of_guan_yu", level: 2 }
  ]);
  assert.deepEqual(picked, [
    { id: "halberd_of_guan_yu", level: 3 },
    { id: "baptistes_banner", level: 2 }
  ]);
});

test("real report: survivors round up", () => {
  const result = run({
    attackerUnits: { axe: 22886, ram: 580, knight: 1 },
    defenderUnits: { axe: 4, light_cavalry: 145, heavy_cavalry: 4043, ram: 13 },
    attackerWeapon: { id: "thorgards_battle_axe", level: 3 },
    weaponMastery: 2,
    grandmaster: true,
    wall: 7
  });
  assert.equal(result.attackerModifier, 112);
  assert.equal(result.attacker.losses.axe, 9128);
  assert.equal(result.attacker.losses.ram, 231);
  assert.equal(result.attacker.losses.knight, 0);
  assert.deepEqual(
    [result.defender.losses.axe, result.defender.losses.light_cavalry, result.defender.losses.heavy_cavalry, result.defender.losses.ram],
    [4, 145, 4043, 13]
  );
  assert.deepEqual([result.wallBefore, result.wallAfterRams, result.wallAfter], [7, 0, 0]);
});

test("defender modifier is rounded down before the night bonus", () => {
  const scenario = { attackerUnits: { axe: 10 }, defenderUnits: { spear: 10 }, faithDefender: 105, wall: 1 };
  assert.equal(run(scenario).defenderModifier, 110);
  assert.equal(run({ ...scenario, night: true }).defenderModifier, 220);
});
