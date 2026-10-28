import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createInitialState, addHit, deleteHit, moveHit, setActiveAttacker, setActiveDefenderChanges, NO_PALADIN, NO_WEAPON
} from "../js/lib/battle-calc-state.js";
import { emptyChanges } from "../js/lib/defender-changes.js";
import { serializeBattleState, parseBattleState, BATTLE_EXPORT_VERSION } from "../js/lib/battle-calc-export.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));

const HALBERD = { uid: "00000000000000a1", weapon: "halberd_of_guan_yu", level: 2 };
const BOW = { uid: "00000000000000b2", weapon: "nimrods_longbow", level: 3 };
const ARRIVING = { uid: "00000000000000c3", weapon: NO_WEAPON, level: 1 };

function roundTrip(state) {
  return parseBattleState(JSON.stringify(serializeBattleState(state)), data);
}

function changes(overrides = {}) {
  const base = emptyChanges();
  return { ...base, ...overrides, paladins: { ...base.paladins, ...overrides.paladins } };
}

function fullSetup() {
  let state = createInitialState({ weaponMasteryLevel: 3, ironWallLevel: 2, medic: true, provisionLimit: 25600 });
  state = {
    ...state,
    defender: { ...state.defender, units: { ...state.defender.units, spear: 4000, sword: 2000 }, paladins: [HALBERD, BOW], wall: 18, night: true }
  };
  state = setActiveAttacker(state, {
    ...state.hits[0].attacker,
    units: { ...state.hits[0].attacker.units, axe: 6000, light_cavalry: 3000, ram: 300 },
    paladinWeapon: "thorgards_battle_axe",
    paladinLevel: 3,
    faith: 110,
    morale: 87,
    luck: -7,
    grandmaster: true
  });
  state = addHit(state);
  state = setActiveDefenderChanges(state, changes({
    units: { spear: 500, archer: -20 }, wall: 12, faith: 50,
    paladins: { removed: [HALBERD.uid], swaps: { [BOW.uid]: { ...BOW, weapon: NO_WEAPON } }, arriving: [ARRIVING] }
  }));
  state = addHit(state);
  state = setActiveDefenderChanges(state, changes({ night: false, paladins: { removed: [ARRIVING.uid] } }));
  return state;
}

test("a full setup survives export and import unchanged", () => {
  const state = fullSetup();
  assert.deepEqual(roundTrip(state), state);
});

test("setups after moving and deleting hits survive export and import", () => {
  const moved = moveHit(fullSetup(), 2, -1);
  assert.deepEqual(roundTrip(moved), moved);
  const deleted = deleteHit(fullSetup(), 1);
  assert.deepEqual(roundTrip(deleted), deleted);
});

test("the fresh calculator survives export and import", () => {
  const state = createInitialState();
  assert.deepEqual(roundTrip(state), state);
});

test("anything that is not an exported battle is rejected", () => {
  const valid = serializeBattleState(fullSetup());
  const broken = [
    "", "not json", "null", "[]", "42",
    JSON.stringify({ ...valid, version: BATTLE_EXPORT_VERSION + 1 }),
    JSON.stringify({ ...valid, version: undefined }),
    JSON.stringify({ ...valid, hits: [] }),
    JSON.stringify({ ...valid, hits: "x" }),
    JSON.stringify({ ...valid, defender: null }),
    JSON.stringify({ ...valid, defenderChanges: valid.defenderChanges.slice(1) })
  ];
  for (const text of broken) assert.equal(parseBattleState(text, data), null, text.slice(0, 40));
});

test("invalid fields fall back to their defaults one by one", () => {
  const exported = serializeBattleState(fullSetup());
  const attacker = exported.hits[0].attacker;
  Object.assign(attacker, {
    paladinWeapon: "excalibur", paladinLevel: 4, faith: 99, morale: 10, luck: 1.5, weaponMasteryLevel: 99,
    grandmaster: "yes", provisionLimit: -5, units: { ...attacker.units, axe: -1, spear: "10", catapult: 1e20 }
  });
  Object.assign(exported.defender, { wall: 21, faith: "100", night: 1, ironWallLevel: -1 });
  exported.activeHit = 7;

  const parsed = parseBattleState(JSON.stringify(exported), data);
  assert.deepEqual(
    { ...parsed.hits[0].attacker, units: undefined },
    { ...createInitialState().hits[0].attacker, units: undefined, paladinWeapon: NO_PALADIN, medic: true }
  );
  assert.equal(parsed.hits[0].attacker.units.axe, 0);
  assert.equal(parsed.hits[0].attacker.units.spear, 0);
  assert.equal(parsed.hits[0].attacker.units.catapult, 0);
  assert.equal(parsed.hits[0].attacker.units.light_cavalry, 3000);
  assert.deepEqual(
    { wall: parsed.defender.wall, faith: parsed.defender.faith, night: parsed.defender.night, ironWall: parsed.defender.ironWallLevel },
    { wall: 0, faith: 100, night: false, ironWall: 0 }
  );
  assert.equal(parsed.activeHit, 0);
});

test("invalid defender changes are dropped, unknown units ignored", () => {
  const exported = serializeBattleState(fullSetup());
  exported.defenderChanges[1] = {
    units: { spear: 1.5, sword: -30, knight: 1, dragon: 5 },
    wall: -1, faith: 0, night: "no",
    paladins: { removed: [HALBERD.uid, HALBERD.uid, 7, "nope"], swaps: { 1: BOW, [BOW.uid]: "x" }, arriving: [{ weapon: "x" }] }
  };
  const parsed = parseBattleState(JSON.stringify(exported), data);
  assert.deepEqual(parsed.defenderChanges[1], changes({ units: { sword: -30 }, paladins: { removed: [HALBERD.uid] } }));
});

test("the first hit never carries defender changes", () => {
  const exported = serializeBattleState(fullSetup());
  exported.defenderChanges[0] = exported.defenderChanges[1];
  assert.deepEqual(parseBattleState(JSON.stringify(exported), data).defenderChanges[0], emptyChanges());
});

test("a repeated paladin uid is dropped so changes stay unambiguous", () => {
  const exported = serializeBattleState(fullSetup());
  exported.defender.paladins.push({ ...HALBERD, weapon: NO_WEAPON });
  exported.defenderChanges[2].paladins.arriving = [{ ...BOW }, { ...ARRIVING }];
  const parsed = parseBattleState(JSON.stringify(exported), data);
  assert.deepEqual(parsed.defender.paladins, [HALBERD, BOW]);
  assert.deepEqual(parsed.defenderChanges[2].paladins.arriving, []);
});

test("unknown paladin weapons and levels fall back to no weapon at level 1", () => {
  const exported = serializeBattleState(fullSetup());
  exported.defender.paladins[0] = { uid: HALBERD.uid, weapon: "excalibur", level: 9 };
  exported.defender.paladins[1] = { uid: BOW.uid, weapon: "constructor", level: 1 };
  exported.hits[0].attacker.paladinWeapon = "toString";
  const parsed = parseBattleState(JSON.stringify(exported), data);
  assert.deepEqual(parsed.defender.paladins, [
    { uid: HALBERD.uid, weapon: NO_WEAPON, level: 1 }, { uid: BOW.uid, weapon: NO_WEAPON, level: 1 }
  ]);
  assert.equal(parsed.hits[0].attacker.paladinWeapon, NO_PALADIN);
});
