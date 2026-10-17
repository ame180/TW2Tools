import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createInitialState, addHit, deleteHit, moveHit, selectHit, setActiveAttacker, setActiveDefenderChanges,
  toSequenceInput, toFormPaladins, NO_PALADIN, NO_WEAPON
} from "../js/lib/battle-calc-state.js";
import { emptyChanges } from "../js/lib/defender-changes.js";
import { defenderProvisions } from "../js/lib/battle-sequence.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));

function withAxes(state, axe) {
  const attacker = structuredClone(state.hits[state.activeHit].attacker);
  attacker.units.axe = axe;
  return setActiveAttacker(state, attacker);
}

function threeHits(activeHit) {
  let state = withAxes(createInitialState(), 100);
  state = withAxes(addHit(state), 200);
  state = withAxes(addHit(state), 300);
  return selectHit(state, activeHit);
}

function axesPerHit(state) {
  return state.hits.map((hit) => hit.attacker.units.axe);
}

test("initial state has one empty hit and an empty defender", () => {
  const state = createInitialState();
  assert.equal(state.hits.length, 1);
  assert.equal(state.activeHit, 0);
  assert.equal(state.hits[0].attacker.units.axe, 0);
  assert.equal(state.hits[0].attacker.units.knight, undefined);
  assert.equal(state.hits[0].attacker.paladinWeapon, NO_PALADIN);
  assert.deepEqual(state.defender.paladins, []);
});

test("added hit copies the last hit without sharing references and becomes active", () => {
  const state = selectHit(threeHits(0), 0);
  const added = addHit(state);

  assert.equal(added.hits.length, 4);
  assert.equal(added.activeHit, 3);
  assert.deepEqual(added.hits[3], state.hits[2]);
  assert.notEqual(added.hits[3].attacker, state.hits[2].attacker);
  assert.notEqual(added.hits[3].attacker.units, state.hits[2].attacker.units);
});

test("deleting a hit keeps the active hit, or selects the previous one when it was deleted", () => {
  assert.deepEqual(axesPerHit(deleteHit(threeHits(0), 1)), [100, 300]);
  assert.equal(deleteHit(threeHits(0), 1).activeHit, 0);
  assert.equal(deleteHit(threeHits(2), 0).activeHit, 1);
  assert.equal(deleteHit(threeHits(1), 1).activeHit, 0);
  assert.equal(deleteHit(threeHits(0), 0).activeHit, 0);
  assert.equal(deleteHit(threeHits(2), 2).activeHit, 1);
});

test("the last remaining hit cannot be deleted", () => {
  const state = createInitialState();
  assert.equal(deleteHit(state, 0), state);
});

test("deleting the first hit keeps the defender start state", () => {
  const state = threeHits(0);
  const defender = { ...state.defender, units: { ...state.defender.units, spear: 500 }, wall: 12 };
  const deleted = deleteHit({ ...state, defender }, 0);
  assert.deepEqual(deleted.defender, defender);
});

test("moving a hit swaps it with its neighbour and the active hit follows", () => {
  const moved = moveHit(threeHits(0), 0, 1);
  assert.deepEqual(axesPerHit(moved), [200, 100, 300]);
  assert.equal(moved.activeHit, 1);

  const neighbourActive = moveHit(threeHits(1), 0, 1);
  assert.equal(neighbourActive.activeHit, 0);

  const unrelatedActive = moveHit(threeHits(2), 0, 1);
  assert.equal(unrelatedActive.activeHit, 2);
});

test("moving past either end is a no-op", () => {
  const state = threeHits(0);
  assert.equal(moveHit(state, 0, -1), state);
  assert.equal(moveHit(state, 2, 1), state);
});

test("selecting an out-of-range hit is a no-op", () => {
  const state = threeHits(1);
  assert.equal(selectHit(state, 3), state);
  assert.equal(selectHit(state, -1), state);
  assert.equal(selectHit(state, 2).activeHit, 2);
});

test("operations do not mutate the given state", () => {
  const state = threeHits(1);
  const copy = structuredClone(state);
  addHit(state);
  deleteHit(state, 1);
  moveHit(state, 0, 1);
  selectHit(state, 2);
  setActiveAttacker(state, createInitialState().hits[0].attacker);
  assert.deepEqual(state, copy);
});

test("sequence input converts form values to engine terms", () => {
  const state = createInitialState();
  state.defender.ironWallLevel = 3;
  state.defender.paladins = [{ weapon: "halberd_of_guan_yu", level: 2 }, { weapon: NO_WEAPON, level: 1 }];
  state.hits[0].attacker.weaponMasteryLevel = 4;
  state.hits[0].attacker.paladinWeapon = "thorgards_battle_axe";
  state.hits[0].attacker.paladinLevel = 3;

  const input = toSequenceInput(state, data);
  assert.equal(input.defender.ironWall, data.tribeSkills.ironWall[3]);
  assert.deepEqual(input.defender.paladins, [{ id: "halberd_of_guan_yu", level: 2 }, { id: null, level: 1 }]);
  assert.equal(input.hits[0].weaponMastery, data.tribeSkills.weaponMastery[4]);
  assert.equal(input.hits[0].attackerUnits.knight, 1);
  assert.deepEqual(input.hits[0].attackerWeapon, { id: "thorgards_battle_axe", level: 3 });
});

test("engine paladins convert back to form values", () => {
  const formPaladins = [{ weapon: "halberd_of_guan_yu", level: 2 }, { weapon: NO_WEAPON, level: 1 }];
  const state = { ...createInitialState(), defender: { ...createInitialState().defender, paladins: formPaladins } };
  assert.deepEqual(toFormPaladins(toSequenceInput(state, data).defender.paladins), formPaladins);
});

test("attacker paladin without a weapon counts as a knight without a weapon bonus", () => {
  const state = createInitialState();
  assert.equal(toSequenceInput(state, data).hits[0].attackerUnits.knight, 0);

  state.hits[0].attacker.paladinWeapon = NO_WEAPON;
  const hit = toSequenceInput(state, data).hits[0];
  assert.equal(hit.attackerUnits.knight, 1);
  assert.equal(hit.attackerWeapon, null);
});

test("defender provisions count paladins and unit food", () => {
  const provisions = defenderProvisions(
    { units: { spear: 10, heavy_cavalry: 2 }, paladins: [{ id: null, level: 1 }] },
    data.units
  );
  assert.equal(provisions, 10 * data.units.spear.provisions + 2 * data.units.heavy_cavalry.provisions + data.units.knight.provisions);
});

test("initial state applies battle defaults to the first attacker and the defender", () => {
  const state = createInitialState({ weaponMasteryLevel: 4, ironWallLevel: 2, grandmaster: true });
  assert.equal(state.hits[0].attacker.weaponMasteryLevel, 4);
  assert.equal(state.hits[0].attacker.grandmaster, true);
  assert.equal(state.defender.ironWallLevel, 2);

  const plain = createInitialState();
  assert.equal(plain.hits[0].attacker.weaponMasteryLevel, 0);
  assert.equal(plain.hits[0].attacker.grandmaster, false);
  assert.equal(plain.defender.ironWallLevel, 0);
});

test("medic and medicus become a per-hit heal percentage", () => {
  let state = createInitialState({ medicus: true });
  state = addHit(state);
  state = setActiveAttacker(state, { ...state.hits[1].attacker, medic: true });

  const input = toSequenceInput(state, data);
  assert.deepEqual(input.hits.map((hit) => hit.healPercent), [10, 20]);
  assert.deepEqual(input.healExcludedUnits, data.healing.excludedUnits);
});

test("healing defaults to off", () => {
  const { attacker } = createInitialState().hits[0];
  assert.equal(attacker.medic, false);
  assert.equal(attacker.medicus, false);
  assert.equal(toSequenceInput(createInitialState(), data).hits[0].healPercent, 0);
});

const BOW = { weapon: "nimrods_longbow", level: 3 };
const HALBERD = { weapon: "halberd_of_guan_yu", level: 2 };

function gap(overrides = {}) {
  const base = emptyChanges();
  return { ...base, ...overrides, paladins: { ...base.paladins, ...overrides.paladins } };
}

function withGaps(state, gaps) {
  return { ...state, defenderChanges: [emptyChanges(), ...gaps] };
}

function spearDeltas(state) {
  return state.defenderChanges.map((changes) => changes.units.spear ?? 0);
}

test("every hit has a defender changes slot, the first one stays empty", () => {
  const state = threeHits(0);
  assert.equal(state.defenderChanges.length, 3);
  assert.ok(state.defenderChanges.every((changes) => JSON.stringify(changes) === JSON.stringify(emptyChanges())));
  assert.equal(state.hits[0].defenderAdjustments, undefined);
});

test("defender changes stay in place when hits move", () => {
  const state = withGaps(threeHits(1), [gap({ units: { spear: 100 } }), gap({ units: { spear: 200 } })]);
  const moved = moveHit(state, 1, 1);
  assert.deepEqual(axesPerHit(moved), [100, 300, 200]);
  assert.deepEqual(spearDeltas(moved), [0, 100, 200]);
});

test("setting changes on the active hit only touches its slot", () => {
  const state = threeHits(2);
  const changes = gap({ wall: 15 });
  const updated = setActiveDefenderChanges(state, changes);
  assert.deepEqual(updated.defenderChanges[2], changes);
  assert.deepEqual(updated.defenderChanges[1], emptyChanges());
});

test("deleting a middle hit merges the changes on both sides of it", () => {
  const state = withGaps(threeHits(0), [
    gap({ units: { spear: 100 }, wall: 10, paladins: { arriving: [BOW] } }),
    gap({ units: { spear: 50 }, faith: 50, paladins: { removed: [1] } })
  ]);
  const deleted = deleteHit(state, 1, 1);

  assert.equal(deleted.defenderChanges.length, 2);
  assert.deepEqual(deleted.defenderChanges[1], gap({
    units: { spear: 150 }, wall: 10, faith: 50, paladins: { removed: [], swaps: {}, arriving: [] }
  }));
});

test("deleting the last hit drops the changes before it", () => {
  const state = withGaps(threeHits(2), [gap({ units: { spear: 100 } }), gap({ units: { spear: 200 } })]);
  assert.deepEqual(spearDeltas(deleteHit(state, 2)), [0, 100]);
});

test("deleting the first hit folds the next changes into the starting defender", () => {
  let state = withGaps(threeHits(0), [
    gap({ units: { spear: 100, sword: -5 }, wall: 15, paladins: { removed: [0], arriving: [BOW] } }),
    gap({ units: { spear: 200 } })
  ]);
  state.defender = { ...state.defender, units: { ...state.defender.units, spear: 1000 }, wall: 12, paladins: [HALBERD] };
  const deleted = deleteHit(state, 0);

  assert.equal(deleted.defender.units.spear, 1100);
  assert.equal(deleted.defender.units.sword, 0);
  assert.equal(deleted.defender.wall, 15);
  assert.deepEqual(deleted.defender.paladins, [BOW]);
  assert.equal(deleted.defender.ironWallLevel, state.defender.ironWallLevel);
  assert.deepEqual(spearDeltas(deleted), [0, 200]);
});

test("sequence input carries each hit's defender changes in engine terms", () => {
  const state = withGaps(addHit(createInitialState()), [
    gap({ units: { spear: 5 }, night: true, paladins: { swaps: { 0: BOW }, arriving: [{ weapon: NO_WEAPON, level: 1 }] } })
  ]);
  const input = toSequenceInput(state, data);

  assert.deepEqual(input.hits[0].defenderChanges, emptyChanges());
  assert.deepEqual(input.hits[1].defenderChanges, gap({
    units: { spear: 5 },
    night: true,
    paladins: { swaps: { 0: { id: "nimrods_longbow", level: 3 } }, arriving: [{ id: null, level: 1 }] }
  }));
});
