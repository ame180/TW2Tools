// defender.ironWall is the wall floor, not the tribe skill level.
// Which defending paladins die is unknown; survivors are kept from the start of the list.

import { simulate, strongestWeapons, UNIT_KEYS } from "./battle.js";

const DEFENDER_UNIT_KEYS = UNIT_KEYS.filter((unit) => unit !== "knight");

function survivingUnits(side) {
  const units = {};
  for (const unit of DEFENDER_UNIT_KEYS) {
    units[unit] = side.quantity[unit] - side.losses[unit];
  }
  return units;
}

function countDefenderUnits(defenderState) {
  let total = defenderState.paladins.length;
  for (const unit of DEFENDER_UNIT_KEYS) total += defenderState.units[unit] || 0;
  return total;
}

export function simulateSequence({ unitStats, weaponData, defender, hits }) {
  const steps = [];
  let defenderBefore = {
    units: { ...defender.units },
    paladins: defender.paladins.map((paladin) => ({ ...paladin })),
    wall: defender.wall,
  };

  for (const hit of hits) {
    const result = simulate({
      ...hit,
      unitStats,
      weaponData,
      defenderUnits: { ...defenderBefore.units, knight: defenderBefore.paladins.length },
      defenderWeapons: strongestWeapons(defenderBefore.paladins),
      wall: defenderBefore.wall,
      night: defender.night,
      faithDefender: defender.faith,
      ironWall: defender.ironWall,
    });

    const survivingPaladins = result.defender.quantity.knight - result.defender.losses.knight;
    const defenderAfter = {
      units: survivingUnits(result.defender),
      paladins: defenderBefore.paladins.slice(0, survivingPaladins),
      wall: result.wallAfter,
    };

    steps.push({ defenderBefore, result, defenderAfter });
    defenderBefore = defenderAfter;
  }

  return steps;
}

// clearedAt: hit that took the defender to 0 units, paladins counted, wall ignored; null if none.
export function summarizeSequence(steps) {
  const attackerLosses = {};
  const defenderLosses = {};
  for (const unit of UNIT_KEYS) {
    attackerLosses[unit] = 0;
    defenderLosses[unit] = 0;
  }

  let clearedAt = null;
  steps.forEach((step, index) => {
    for (const unit of UNIT_KEYS) {
      attackerLosses[unit] += step.result.attacker.losses[unit];
      defenderLosses[unit] += step.result.defender.losses[unit];
    }

    const tookDefenderToZero =
      countDefenderUnits(step.defenderBefore) > 0 && countDefenderUnits(step.defenderAfter) === 0;
    if (clearedAt === null && tookDefenderToZero) clearedAt = index;
  });

  const finalWall = steps.length === 0 ? null : steps[steps.length - 1].defenderAfter.wall;

  return { attackerLosses, defenderLosses, finalWall, clearedAt };
}
