import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { simulate } from "../js/lib/battle.js";
import { simulateSequence, summarizeSequence } from "../js/lib/battle-sequence.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));

const HALBERD = { id: "halberd_of_guan_yu", level: 3 };
const LONGSWORD = { id: "paracelsus_longsword", level: 3 };

function defender(overrides) {
  return { units: {}, paladins: [], wall: 0, faith: 100, night: false, ironWall: 0, ...overrides };
}

function runSequence(defenderState, hits) {
  return simulateSequence({ unitStats: data.units, weaponData: data.weapons, defender: defenderState, hits });
}

function runSingle(overrides) {
  return simulate({ unitStats: data.units, weaponData: data.weapons, ...overrides });
}

test("a single hit matches a direct simulation", () => {
  const hit = {
    attackerUnits: { axe: 5000, light_cavalry: 1000, ram: 200, knight: 1 },
    attackerWeapon: { id: "thorgards_battle_axe", level: 2 },
    morale: 80,
    luck: -5,
    faithAttacker: 105,
    weaponMastery: 4,
    grandmaster: true
  };
  const steps = runSequence(
    defender({ units: { spear: 2000, sword: 2000 }, paladins: [HALBERD], wall: 15, faith: 110, night: true, ironWall: 3 }),
    [hit]
  );

  assert.equal(steps.length, 1);
  assert.deepEqual(steps[0].result, runSingle({
    ...hit,
    defenderUnits: { spear: 2000, sword: 2000, knight: 1 },
    defenderWeapons: [HALBERD],
    wall: 15,
    night: true,
    faithDefender: 110,
    ironWall: 3
  }));
});

test("the next hit starts from the previous hit's survivors and wall", () => {
  const hit = { attackerUnits: { axe: 6000, ram: 300 } };
  const steps = runSequence(defender({ units: { spear: 3000, sword: 3000 }, wall: 20 }), [hit, hit]);
  const [first, second] = steps;

  assert.equal(first.defenderAfter.wall, first.result.wallAfter);
  assert.ok(first.defenderAfter.wall < 20, "rams lower the wall in hit 1");
  assert.ok(first.defenderAfter.units.spear > 0, "defender survives hit 1");
  assert.equal(first.defenderAfter.units.spear, first.result.defender.quantity.spear - first.result.defender.losses.spear);

  assert.deepEqual(second.defenderBefore, first.defenderAfter);
  assert.deepEqual(second.result, runSingle({
    ...hit,
    defenderUnits: { ...first.defenderAfter.units, knight: 0 },
    wall: first.defenderAfter.wall
  }));
});

test("dead defending paladins are dropped from the end and lose their weapon bonus", () => {
  const steps = runSequence(
    defender({ units: { spear: 300, sword: 300 }, paladins: [HALBERD, LONGSWORD] }),
    [{ attackerUnits: { axe: 450 } }, { attackerUnits: { axe: 300 } }]
  );
  const second = steps[1];

  assert.deepEqual(second.defenderBefore.paladins, [HALBERD]);
  assert.equal(second.result.defender.quantity.knight, 1);

  const secondHitInput = {
    attackerUnits: { axe: 300 },
    defenderUnits: { ...second.defenderBefore.units, knight: 1 }
  };
  assert.deepEqual(second.result, runSingle({ ...secondHitInput, defenderWeapons: [HALBERD] }));
  assert.notDeepEqual(second.result, runSingle({ ...secondHitInput, defenderWeapons: [HALBERD, LONGSWORD] }));
});

test("defender faith, night and iron wall apply to every hit", () => {
  const settings = { faith: 110, night: true, ironWall: 5 };
  const hit = { attackerUnits: { axe: 3000, ram: 300 } };
  const steps = runSequence(defender({ units: { spear: 100 }, wall: 15, ...settings }), [hit, hit, hit]);

  for (const step of steps) {
    assert.ok(step.defenderAfter.wall >= settings.ironWall, "wall stays at or above the iron wall floor");
    assert.deepEqual(step.result, runSingle({
      ...hit,
      defenderUnits: { ...step.defenderBefore.units, knight: 0 },
      wall: step.defenderBefore.wall,
      night: settings.night,
      faithDefender: settings.faith,
      ironWall: settings.ironWall
    }));
  }
  assert.equal(steps[2].defenderAfter.wall, settings.ironWall);
});

test("after a clear, a remaining wall still costs the next hit, no wall costs nothing", () => {
  const clearingHit = { attackerUnits: { axe: 1000 } };
  const followUp = { attackerUnits: { axe: 100 } };

  const withWall = runSequence(defender({ units: { spear: 10 }, wall: 20 }), [clearingHit, followUp]);
  assert.equal(withWall[1].defenderBefore.wall, 20);
  assert.equal(withWall[1].result.attacker.losses.axe, 23);

  const withoutWall = runSequence(defender({ units: { spear: 10 } }), [clearingHit, followUp]);
  assert.equal(withoutWall[1].result.attacker.losses.axe, 0);
});

test("a noble hit after a clear survives only without a wall", () => {
  const clearingHit = { attackerUnits: { axe: 1000 } };
  const nobleHit = { attackerUnits: { nobleman: 1 } };

  const withoutWall = runSequence(defender({ units: { spear: 10 } }), [clearingHit, nobleHit]);
  assert.equal(withoutWall[1].result.attacker.losses.nobleman, 0);

  const withWall = runSequence(defender({ units: { spear: 10 }, wall: 1 }), [clearingHit, nobleHit]);
  assert.equal(withWall[1].result.attacker.losses.nobleman, 1);
});

test("summary totals losses across hits and reports the final wall and the clearing hit", () => {
  const hit = { attackerUnits: { axe: 6000, ram: 300 } };
  const steps = runSequence(defender({ units: { spear: 3000, sword: 3000 }, wall: 20 }), [hit, hit, hit]);
  const summary = summarizeSequence(steps);

  for (const unit of ["axe", "ram", "spear", "sword"]) {
    const attackerTotal = steps.reduce((sum, step) => sum + step.result.attacker.losses[unit], 0);
    const defenderTotal = steps.reduce((sum, step) => sum + step.result.defender.losses[unit], 0);
    assert.equal(summary.attackerLosses[unit], attackerTotal);
    assert.equal(summary.defenderLosses[unit], defenderTotal);
  }
  assert.equal(summary.defenderLosses.spear, 3000);
  assert.equal(summary.finalWall, steps[2].defenderAfter.wall);
  assert.equal(summary.clearedAt, 1);
});

test("clearing ignores the wall but counts paladins", () => {
  const paladinSurvives = runSequence(
    defender({ units: { spear: 300, sword: 300 }, paladins: [HALBERD, LONGSWORD] }),
    [{ attackerUnits: { axe: 450 } }]
  );
  assert.equal(summarizeSequence(paladinSurvives).clearedAt, null);

  const wallSurvives = runSequence(defender({ units: { spear: 10 }, wall: 20 }), [{ attackerUnits: { axe: 1000 } }]);
  assert.equal(wallSurvives[0].defenderAfter.wall, 20);
  assert.equal(summarizeSequence(wallSurvives).clearedAt, 0);
});

test("a defender that starts empty is never reported as cleared", () => {
  const steps = runSequence(defender({ wall: 5 }), [{ attackerUnits: { axe: 1000 } }]);
  assert.equal(summarizeSequence(steps).clearedAt, null);
});

test("no hits gives no steps and an empty summary", () => {
  assert.deepEqual(runSequence(defender({ units: { spear: 10 }, wall: 5 }), []), []);
  const summary = summarizeSequence([]);
  assert.equal(summary.finalWall, null);
  assert.equal(summary.clearedAt, null);
  assert.equal(summary.attackerLosses.axe, 0);
});

test("inputs are not mutated", () => {
  const defenderState = defender({ units: { spear: 3000, sword: 3000 }, paladins: [HALBERD, LONGSWORD], wall: 20 });
  const hits = [{ attackerUnits: { axe: 6000, ram: 300 } }, { attackerUnits: { axe: 6000, ram: 300 } }];
  const defenderCopy = structuredClone(defenderState);
  const hitsCopy = structuredClone(hits);

  const steps = runSequence(defenderState, hits);
  summarizeSequence(steps);

  assert.deepEqual(defenderState, defenderCopy);
  assert.deepEqual(hits, hitsCopy);
});
