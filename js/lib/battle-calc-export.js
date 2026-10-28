// Battle calculator setup as exported text: every hit, the starting defender and the defender changes between hits.
// Parsing takes untrusted pasted text: a broken structure rejects the whole import, an invalid field falls back to
// its default on its own. Paladin uids must be unique; a repeated one is dropped.

import { createInitialState, INPUT_UNIT_KEYS, NO_PALADIN, NO_WEAPON, DEFAULT_FAITH, WEAPON_LEVELS } from "./battle-calc-state.js";
import { emptyChanges } from "./defender-changes.js";
import { isProvisionLimit } from "./provision-limit.js";

export const BATTLE_EXPORT_VERSION = 1;

const UID_PATTERN = /^[0-9a-f]{16}$/;
const MAX_WALL = 20;
const MIN_MORALE = 25;
const MAX_MORALE = 100;
const MAX_LUCK = 15;

function serializePaladin({ uid, weapon, level }) {
  return { uid, weapon, level };
}

export function serializeBattleState(state) {
  const { defender } = state;
  return {
    version: BATTLE_EXPORT_VERSION,
    defender: {
      units: { ...defender.units },
      paladins: defender.paladins.map(serializePaladin),
      wall: defender.wall,
      faith: defender.faith,
      night: defender.night,
      ironWallLevel: defender.ironWallLevel
    },
    hits: state.hits.map(({ attacker }) => ({
      attacker: {
        units: { ...attacker.units },
        paladinWeapon: attacker.paladinWeapon,
        paladinLevel: attacker.paladinLevel,
        faith: attacker.faith,
        morale: attacker.morale,
        luck: attacker.luck,
        weaponMasteryLevel: attacker.weaponMasteryLevel,
        grandmaster: attacker.grandmaster,
        medic: attacker.medic,
        medicus: attacker.medicus,
        provisionLimit: attacker.provisionLimit
      }
    })),
    defenderChanges: state.defenderChanges.map((changes) => {
      const swaps = {};
      for (const [uid, paladin] of Object.entries(changes.paladins.swaps)) swaps[uid] = serializePaladin(paladin);
      return {
        units: { ...changes.units },
        wall: changes.wall,
        faith: changes.faith,
        night: changes.night,
        paladins: {
          removed: [...changes.paladins.removed],
          swaps,
          arriving: changes.paladins.arriving.map(serializePaladin)
        }
      };
    }),
    activeHit: state.activeHit
  };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIntegerIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isSkillLevel(level, levels = []) {
  return isIntegerIn(level, 0, levels.length - 1);
}

function pick(value, isValid, fallback) {
  return isValid(value) ? value : fallback;
}

function parseUnits(stored) {
  const units = {};
  for (const unit of INPUT_UNIT_KEYS) {
    const count = isObject(stored) ? stored[unit] : undefined;
    units[unit] = Number.isSafeInteger(count) && count >= 0 ? count : 0;
  }
  return units;
}

function parseUnitDeltas(stored) {
  const deltas = {};
  if (!isObject(stored)) return deltas;
  for (const unit of INPUT_UNIT_KEYS) {
    if (Number.isSafeInteger(stored[unit]) && stored[unit] !== 0) deltas[unit] = stored[unit];
  }
  return deltas;
}

function parsePaladin(stored, uid, weapons) {
  return {
    uid,
    weapon: stored?.weapon === NO_WEAPON || weapons[stored?.weapon] ? stored.weapon : NO_WEAPON,
    level: pick(stored?.level, (level) => WEAPON_LEVELS.includes(level), 1)
  };
}

// Paladins joining the battle (starting or arriving) claim their uid; later ones repeating it are dropped.
function parseNewPaladins(stored, usedUids, weapons) {
  const paladins = [];
  for (const entry of Array.isArray(stored) ? stored : []) {
    const uid = entry?.uid;
    if (typeof uid !== "string" || !UID_PATTERN.test(uid) || usedUids.has(uid)) continue;
    usedUids.add(uid);
    paladins.push(parsePaladin(entry, uid, weapons));
  }
  return paladins;
}

function parseAttacker(stored, fallback, { weapons, tribeSkills, faithLevels }) {
  if (!isObject(stored)) return structuredClone(fallback);
  const isPaladinWeapon = (weapon) => weapon === NO_PALADIN || weapon === NO_WEAPON || Boolean(weapons[weapon]);
  const isFlag = (flag) => typeof flag === "boolean";
  return {
    units: parseUnits(stored.units),
    paladinWeapon: pick(stored.paladinWeapon, isPaladinWeapon, NO_PALADIN),
    paladinLevel: pick(stored.paladinLevel, (level) => WEAPON_LEVELS.includes(level), 1),
    faith: pick(stored.faith, (faith) => faithLevels.includes(faith), DEFAULT_FAITH),
    morale: pick(stored.morale, (morale) => isIntegerIn(morale, MIN_MORALE, MAX_MORALE), MAX_MORALE),
    luck: pick(stored.luck, (luck) => isIntegerIn(luck, -MAX_LUCK, MAX_LUCK), 0),
    weaponMasteryLevel: pick(stored.weaponMasteryLevel, (level) => isSkillLevel(level, tribeSkills.weaponMastery), 0),
    grandmaster: pick(stored.grandmaster, isFlag, false),
    medic: pick(stored.medic, isFlag, false),
    medicus: pick(stored.medicus, isFlag, false),
    provisionLimit: pick(stored.provisionLimit, isProvisionLimit, null)
  };
}

function parseChanges(stored, usedUids, { weapons, faithLevels }) {
  const changes = emptyChanges();
  if (!isObject(stored)) return changes;

  changes.units = parseUnitDeltas(stored.units);
  changes.wall = pick(stored.wall, (wall) => isIntegerIn(wall, 0, MAX_WALL), null);
  changes.faith = pick(stored.faith, (faith) => faithLevels.includes(faith), null);
  changes.night = pick(stored.night, (night) => typeof night === "boolean", null);

  const isUid = (uid) => typeof uid === "string" && UID_PATTERN.test(uid);
  const paladins = isObject(stored.paladins) ? stored.paladins : {};
  const removed = Array.isArray(paladins.removed) ? paladins.removed : [];
  changes.paladins.removed = [...new Set(removed.filter(isUid))];
  for (const [uid, paladin] of Object.entries(isObject(paladins.swaps) ? paladins.swaps : {})) {
    if (isUid(uid) && isObject(paladin)) changes.paladins.swaps[uid] = parsePaladin(paladin, uid, weapons);
  }
  changes.paladins.arriving = parseNewPaladins(paladins.arriving, usedUids, weapons);
  return changes;
}

// Returns null for anything that is not an exported battle.
export function parseBattleState(json, { weapons = {}, tribeSkills = {}, faithLevels = [] } = {}) {
  let stored;
  try {
    stored = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObject(stored) || stored.version !== BATTLE_EXPORT_VERSION) return null;
  const { hits, defenderChanges } = stored;
  if (!Array.isArray(hits) || hits.length === 0 || !Array.isArray(defenderChanges)
    || defenderChanges.length !== hits.length || !isObject(stored.defender)) {
    return null;
  }

  const data = { weapons, tribeSkills, faithLevels };
  const initial = createInitialState();
  const usedUids = new Set();
  const storedDefender = stored.defender;
  const defender = {
    units: parseUnits(storedDefender.units),
    paladins: parseNewPaladins(storedDefender.paladins, usedUids, weapons),
    wall: pick(storedDefender.wall, (wall) => isIntegerIn(wall, 0, MAX_WALL), 0),
    faith: pick(storedDefender.faith, (faith) => faithLevels.includes(faith), DEFAULT_FAITH),
    night: pick(storedDefender.night, (night) => typeof night === "boolean", false),
    ironWallLevel: pick(storedDefender.ironWallLevel, (level) => isSkillLevel(level, tribeSkills.ironWall), 0)
  };

  return {
    defender,
    hits: hits.map((hit) => ({ attacker: parseAttacker(hit?.attacker, initial.hits[0].attacker, data) })),
    defenderChanges: defenderChanges.map((changes, index) =>
      (index === 0 ? emptyChanges() : parseChanges(changes, usedUids, data))),
    activeHit: pick(stored.activeHit, (index) => isIntegerIn(index, 0, hits.length - 1), 0)
  };
}
