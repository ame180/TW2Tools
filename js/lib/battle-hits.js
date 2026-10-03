// Battle calculator state, kept as form values (skill levels, weapon select values).
// toSequenceInput converts it to engine values; operations never mutate.

import { UNIT_KEYS } from "./battle.js";

export const NO_PALADIN = "";
export const NO_WEAPON = "none";
export const DEFAULT_FAITH = 100;
export const INPUT_UNIT_KEYS = UNIT_KEYS.filter((unit) => unit !== "knight");

function emptyUnits() {
  const units = {};
  for (const unit of INPUT_UNIT_KEYS) units[unit] = 0;
  return units;
}

export function createInitialState() {
  return {
    defender: {
      units: emptyUnits(),
      paladins: [],
      wall: 0,
      faith: DEFAULT_FAITH,
      night: false,
      ironWallLevel: 0
    },
    hits: [{
      attacker: {
        units: emptyUnits(),
        paladinWeapon: NO_PALADIN,
        paladinLevel: 1,
        faith: DEFAULT_FAITH,
        morale: 100,
        luck: 0,
        weaponMasteryLevel: 0,
        grandmaster: false
      },
      defenderAdjustments: {}
    }],
    activeHit: 0
  };
}

export function addHit(state) {
  const hits = [...state.hits, structuredClone(state.hits[state.hits.length - 1])];
  return { ...state, hits, activeHit: hits.length - 1 };
}

export function deleteHit(state, index) {
  if (state.hits.length <= 1 || index < 0 || index >= state.hits.length) return state;

  const hits = state.hits.filter((_, hitIndex) => hitIndex !== index);
  const activeHit = index <= state.activeHit ? Math.max(0, state.activeHit - 1) : state.activeHit;
  return { ...state, hits, activeHit };
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

export function toSequenceInput(state, { units, weapons, tribeSkills = {} }) {
  const { defender } = state;
  return {
    unitStats: units,
    weaponData: weapons,
    defender: {
      units: { ...defender.units },
      paladins: defender.paladins.map((paladin) => ({
        id: weapons[paladin.weapon] ? paladin.weapon : null,
        level: paladin.level
      })),
      wall: defender.wall,
      faith: defender.faith,
      night: defender.night,
      ironWall: tribeSkills.ironWall?.[defender.ironWallLevel] ?? 0
    },
    hits: state.hits.map(({ attacker }) => ({
      attackerUnits: { ...attacker.units, knight: attacker.paladinWeapon === NO_PALADIN ? 0 : 1 },
      attackerWeapon: weapons[attacker.paladinWeapon]
        ? { id: attacker.paladinWeapon, level: attacker.paladinLevel }
        : null,
      morale: attacker.morale,
      luck: attacker.luck,
      faithAttacker: attacker.faith,
      weaponMastery: tribeSkills.weaponMastery?.[attacker.weaponMasteryLevel] ?? 0,
      grandmaster: attacker.grandmaster
    }))
  };
}
