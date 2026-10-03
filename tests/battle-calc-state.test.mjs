import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createInitialState, addHit, deleteHit, moveHit, selectHit, setActiveAttacker, toSequenceInput, toFormPaladins,
  NO_PALADIN, NO_WEAPON
} from "../js/lib/battle-calc-state.js";
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
  assert.equal(provisions, 10 * data.units.spear.food + 2 * data.units.heavy_cavalry.food + data.units.knight.food);
});
