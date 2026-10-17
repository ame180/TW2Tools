import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { simulate } from "../js/lib/battle.js";
import { simulateSequence, summarizeSequence, defenderProvisions, provisionBaselines } from "../js/lib/battle-sequence.js";
import { emptyChanges } from "../js/lib/defender-changes.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));

const HALBERD = { uid: 1, id: "halberd_of_guan_yu", level: 3 };
const LONGSWORD = { uid: 2, id: "paracelsus_longsword", level: 3 };

function defender(overrides) {
  return { units: {}, paladins: [], wall: 0, faith: 100, night: false, ironWall: 0, ...overrides };
}

function runSequence(defenderState, hits) {
  return simulateSequence({ unitStats: data.units, weaponData: data.weapons, defender: defenderState, hits });
}

function changes(overrides = {}) {
  const base = emptyChanges();
  return { ...base, ...overrides, paladins: { ...base.paladins, ...overrides.paladins } };
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
});

test("no hits gives no steps and an empty summary", () => {
  assert.deepEqual(runSequence(defender({ units: { spear: 10 }, wall: 5 }), []), []);
  const summary = summarizeSequence([]);
  assert.equal(summary.finalWall, null);
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

test("healing is computed per hit from attacker losses and does not change the fight", () => {
  const excluded = data.healing.excludedUnits;
  const baseHit = { attackerUnits: { axe: 3000, light_cavalry: 500, ram: 100 }, morale: 100, luck: 0, faithAttacker: 100 };
  const defenderState = defender({ units: { spear: 3000, sword: 3000 }, wall: 10 });

  const plain = simulateSequence({
    unitStats: data.units, weaponData: data.weapons, defender: defenderState, hits: [baseHit, baseHit]
  });
  const healed = simulateSequence({
    unitStats: data.units, weaponData: data.weapons, defender: defenderState, healExcludedUnits: excluded,
    hits: [{ ...baseHit, healPercent: 20 }, { ...baseHit, healPercent: 0 }]
  });

  assert.deepEqual(healed.map((step) => step.result), plain.map((step) => step.result));
  assert.deepEqual(healed.map((step) => step.defenderAfter), plain.map((step) => step.defenderAfter));

  const firstLosses = healed[0].result.attacker.losses;
  assert.equal(healed[0].healPercent, 20);
  assert.equal(healed[0].attackerHealed.axe, Math.floor(firstLosses.axe * 0.2));
  assert.equal(healed[0].attackerHealed.ram, 0);
  assert.ok(healed[0].attackerHealed.axe > 0);
  assert.ok(Object.values(healed[1].attackerHealed).every((count) => count === 0));

  const summary = summarizeSequence(healed);
  assert.equal(summary.attackerHealed.axe, healed[0].attackerHealed.axe);
  assert.equal(summary.attackerHealed.light_cavalry, healed[0].attackerHealed.light_cavalry);
});

test("hits without healPercent heal nothing", () => {
  const steps = runSequence(defender({ units: { spear: 1000 } }), [{ attackerUnits: { axe: 2000 } }]);
  assert.equal(steps[0].healPercent, 0);
  assert.ok(Object.values(steps[0].attackerHealed).every((count) => count === 0));
});

test("changes before a hit apply to the carried defender before the fight", () => {
  const steps = runSequence(defender({ units: { spear: 1000, sword: 1000 }, wall: 15 }), [
    { attackerUnits: { axe: 2000, ram: 100 } },
    {
      attackerUnits: { axe: 2000 },
      defenderChanges: changes({ units: { spear: 500, sword: -100000 }, wall: 18, paladins: { arriving: [HALBERD] } })
    }
  ]);
  const [first, second] = steps;

  assert.deepEqual(second.defenderCarried, first.defenderAfter);
  assert.equal(second.defenderBefore.units.spear, first.defenderAfter.units.spear + 500);
  assert.equal(second.defenderBefore.units.sword, 0);
  assert.equal(second.defenderBefore.wall, 18);
  assert.deepEqual(second.defenderBefore.paladins, [HALBERD]);
  assert.deepEqual(second.result, runSingle({
    attackerUnits: { axe: 2000 },
    defenderUnits: { ...second.defenderBefore.units, knight: 1 },
    defenderWeapons: [HALBERD],
    wall: 18
  }));
});

test("faith and night changes carry forward to later hits", () => {
  const hit = { attackerUnits: { axe: 500 } };
  const steps = runSequence(defender({ units: { spear: 5000 }, faith: 100 }), [
    hit,
    { ...hit, defenderChanges: changes({ faith: 50, night: true }) },
    hit,
    { ...hit, defenderChanges: changes({ night: false }) }
  ]);

  assert.deepEqual(steps.map((step) => step.defenderBefore.faith), [100, 50, 50, 50]);
  assert.deepEqual(steps.map((step) => step.defenderBefore.night), [false, true, true, false]);
  assert.deepEqual(steps[2].result, runSingle({
    ...hit,
    defenderUnits: { ...steps[2].defenderBefore.units, knight: 0 },
    faithDefender: 50,
    night: true
  }));
});

test("a hit without changes fights the carried defender", () => {
  const steps = runSequence(defender({ units: { spear: 1000 } }), [
    { attackerUnits: { axe: 500 } },
    { attackerUnits: { axe: 500 }, defenderChanges: emptyChanges() }
  ]);
  assert.deepEqual(steps[1].defenderBefore, steps[1].defenderCarried);
});

test("provision baselines grow only by what arrives", () => {
  const hit = { attackerUnits: { axe: 100 } };
  const steps = runSequence(defender({ units: { spear: 1000 } }), [
    hit,
    { ...hit, defenderChanges: changes({ units: { spear: 300, sword: -50 } }) },
    { ...hit, defenderChanges: changes({ units: { spear: -200 } }) }
  ]);
  const start = defenderProvisions(steps[0].defenderBefore, data.units);
  const arrived = defenderProvisions(steps[1].defenderBefore, data.units)
    - defenderProvisions(steps[1].defenderCarried, data.units);

  assert.deepEqual(provisionBaselines(steps, data.units), [start, start + arrived, start + arrived]);
});

test("paladin changes follow the paladin's uid and skip paladins that died earlier", () => {
  const steps = runSequence(defender({ units: { spear: 300, sword: 300 }, paladins: [HALBERD, LONGSWORD] }), [
    { attackerUnits: { axe: 450 } },
    { attackerUnits: { axe: 10 }, defenderChanges: changes({ paladins: { swaps: { 1: LONGSWORD, 2: HALBERD } } }) }
  ]);
  assert.deepEqual(steps[1].defenderCarried.paladins, [HALBERD]);
  assert.deepEqual(steps[1].defenderBefore.paladins, [{ ...LONGSWORD, uid: 1 }]);
});
