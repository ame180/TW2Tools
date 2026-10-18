// Battle calculator state, kept as form values (skill levels, weapon select values).
// toSequenceInput / toFormPaladins convert to and from engine values; operations never mutate.
// Defender paladins carry a uid that defender changes refer to.
// defenderChanges[i] holds the defender changes before hit i. They belong to the position, not the hit: moving hits
// leaves them in place. defenderChanges[0] stays empty, the first hit's defender is state.defender.

import { UNIT_KEYS } from "./battle.js";
import { healPercent } from "./healing.js";
import { emptyChanges, applyChanges, mergeChanges } from "./defender-changes.js";

export const NO_PALADIN = "";
export const NO_WEAPON = "none";
export const DEFAULT_FAITH = 100;
export const INPUT_UNIT_KEYS = UNIT_KEYS.filter((unit) => unit !== "knight");

function emptyUnits() {
  const units = {};
  for (const unit of INPUT_UNIT_KEYS) units[unit] = 0;
  return units;
}

export function createInitialState({
  weaponMasteryLevel = 0, ironWallLevel = 0, grandmaster = false, medic = false, medicus = false, provisionLimit = null
} = {}) {
  return {
    defender: {
      units: emptyUnits(),
      paladins: [],
      wall: 0,
      faith: DEFAULT_FAITH,
      night: false,
      ironWallLevel
    },
    hits: [{
      attacker: {
        units: emptyUnits(),
        paladinWeapon: NO_PALADIN,
        paladinLevel: 1,
        faith: DEFAULT_FAITH,
        morale: 100,
        luck: 0,
        weaponMasteryLevel,
        grandmaster,
        medic,
        medicus,
        provisionLimit
      }
    }],
    defenderChanges: [emptyChanges()],
    activeHit: 0
  };
}

export function addHit(state) {
  const hits = [...state.hits, structuredClone(state.hits[state.hits.length - 1])];
  const defenderChanges = [...state.defenderChanges, emptyChanges()];
  return { ...state, hits, defenderChanges, activeHit: hits.length - 1 };
}

// The changes on both sides of a deleted hit now happen back to back, so they merge.
export function deleteHit(state, index) {
  if (state.hits.length <= 1 || index < 0 || index >= state.hits.length) return state;

  const hits = state.hits.filter((_, hitIndex) => hitIndex !== index);
  const activeHit = index <= state.activeHit ? Math.max(0, state.activeHit - 1) : state.activeHit;
  const gaps = state.defenderChanges;

  if (index === 0) {
    const defender = applyChanges(state.defender, gaps[1]);
    return { ...state, hits, defender, defenderChanges: [emptyChanges(), ...gaps.slice(2)], activeHit };
  }
  if (index === hits.length) {
    return { ...state, hits, defenderChanges: gaps.slice(0, index), activeHit };
  }
  const merged = mergeChanges(gaps[index], gaps[index + 1]);
  const defenderChanges = [...gaps.slice(0, index), merged, ...gaps.slice(index + 2)];
  return { ...state, hits, defenderChanges, activeHit };
}

export function moveHit(state, index, delta) {
  const target = index + delta;
  if (index < 0 || index >= state.hits.length || target < 0 || target >= state.hits.length) return state;

  const hits = [...state.hits];
  [hits[index], hits[target]] = [hits[target], hits[index]];

  let activeHit = state.activeHit;
  if (activeHit === index) activeHit = target;
  else if (activeHit === target) activeHit = index;
  return { ...state, hits, activeHit };
}

export function selectHit(state, index) {
  if (index < 0 || index >= state.hits.length) return state;
  return { ...state, activeHit: index };
}

export function setActiveAttacker(state, attacker) {
  const hits = state.hits.map((hit, index) => (index === state.activeHit ? { ...hit, attacker } : hit));
  return { ...state, hits };
}

export function setActiveDefenderChanges(state, changes) {
  if (state.activeHit === 0) return state;
  const defenderChanges = state.defenderChanges.map((gap, index) => (index === state.activeHit ? changes : gap));
  return { ...state, defenderChanges };
}

export function attackerProvisions(attacker, unitStats) {
  let total = attacker.paladinWeapon === NO_PALADIN ? 0 : unitStats.knight.provisions;
  for (const unit of INPUT_UNIT_KEYS) total += (attacker.units[unit] || 0) * unitStats[unit].provisions;
  return total;
}

export function isOverProvisionLimit(attacker, unitStats) {
  return attacker.provisionLimit !== null && attackerProvisions(attacker, unitStats) > attacker.provisionLimit;
}

export function toFormPaladins(enginePaladins) {
  return enginePaladins.map((paladin) => ({ uid: paladin.uid, weapon: paladin.id ?? NO_WEAPON, level: paladin.level }));
}

function toEnginePaladin(paladin, weapons) {
  return { uid: paladin.uid, id: weapons[paladin.weapon] ? paladin.weapon : null, level: paladin.level };
}

function toEngineChanges(changes, weapons) {
  const swaps = {};
  for (const [uid, paladin] of Object.entries(changes.paladins.swaps)) {
    swaps[uid] = toEnginePaladin(paladin, weapons);
  }
  return {
    ...changes,
    units: { ...changes.units },
    paladins: {
      removed: [...changes.paladins.removed],
      swaps,
      arriving: changes.paladins.arriving.map((paladin) => toEnginePaladin(paladin, weapons))
    }
  };
}

export function toSequenceInput(state, { units, weapons, tribeSkills = {}, healing = {} }) {
  const { defender } = state;
  return {
    unitStats: units,
    weaponData: weapons,
    healExcludedUnits: healing.excludedUnits ?? [],
    defender: {
      units: { ...defender.units },
      paladins: defender.paladins.map((paladin) => toEnginePaladin(paladin, weapons)),
      wall: defender.wall,
      faith: defender.faith,
      night: defender.night,
      ironWall: tribeSkills.ironWall?.[defender.ironWallLevel] ?? 0
    },
    hits: state.hits.map(({ attacker }, index) => ({
      attackerUnits: { ...attacker.units, knight: attacker.paladinWeapon === NO_PALADIN ? 0 : 1 },
      attackerWeapon: weapons[attacker.paladinWeapon]
        ? { id: attacker.paladinWeapon, level: attacker.paladinLevel }
        : null,
      morale: attacker.morale,
      luck: attacker.luck,
      faithAttacker: attacker.faith,
      weaponMastery: tribeSkills.weaponMastery?.[attacker.weaponMasteryLevel] ?? 0,
      grandmaster: attacker.grandmaster,
      healPercent: healPercent(attacker, healing),
      defenderChanges: toEngineChanges(state.defenderChanges[index], weapons)
    }))
  };
}
