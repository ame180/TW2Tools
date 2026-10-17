// defender.ironWall is the wall floor, not the tribe skill level.
// Which defending paladins die is unknown; survivors are kept from the start of the list.
// Each hit may carry defenderChanges, applied to the previous hit's survivors before the fight.

import { simulate, strongestWeapons, UNIT_KEYS } from "./battle.js";
import { healedUnits } from "./healing.js";
import { applyChanges, emptyChanges } from "./defender-changes.js";

const DEFENDER_UNIT_KEYS = UNIT_KEYS.filter((unit) => unit !== "knight");

function survivingUnits(side) {
  const units = {};
  for (const unit of DEFENDER_UNIT_KEYS) {
    units[unit] = side.quantity[unit] - side.losses[unit];
  }
  return units;
}

export function defenderProvisions(defenderState, unitStats) {
  let total = defenderState.paladins.length * unitStats.knight.provisions;
  for (const unit of DEFENDER_UNIT_KEYS) total += (defenderState.units[unit] || 0) * unitStats[unit].provisions;
  return total;
}

export function simulateSequence({ unitStats, weaponData, defender, hits, healExcludedUnits = [] }) {
  const steps = [];
  let defenderCarried = {
    units: { ...defender.units },
    paladins: defender.paladins.map((paladin) => ({ ...paladin })),
    wall: defender.wall,
    faith: defender.faith,
    night: defender.night,
  };

  for (const { healPercent = 0, defenderChanges = emptyChanges(), ...hit } of hits) {
    const defenderBefore = applyChanges(defenderCarried, defenderChanges);
    const result = simulate({
      ...hit,
      unitStats,
      weaponData,
      defenderUnits: { ...defenderBefore.units, knight: defenderBefore.paladins.length },
      defenderWeapons: strongestWeapons(defenderBefore.paladins),
      wall: defenderBefore.wall,
      night: defenderBefore.night,
      faithDefender: defenderBefore.faith,
      ironWall: defender.ironWall,
    });

    const survivingPaladins = result.defender.quantity.knight - result.defender.losses.knight;
    const defenderAfter = {
      units: survivingUnits(result.defender),
      paladins: defenderBefore.paladins.slice(0, survivingPaladins),
      wall: result.wallAfter,
      faith: defenderBefore.faith,
      night: defenderBefore.night,
    };

    const attackerHealed = healedUnits(result.attacker.losses, healPercent, healExcludedUnits);
    steps.push({ defenderCarried, defenderBefore, result, defenderAfter, healPercent, attackerHealed });
    defenderCarried = defenderAfter;
  }

  return steps;
}

// Per hit: starting provisions plus everything that arrived up to that hit; removals never lower it.
export function provisionBaselines(steps, unitStats) {
  let baseline = 0;
  return steps.map((step, index) => {
    const before = defenderProvisions(step.defenderBefore, unitStats);
    baseline += index === 0 ? before : Math.max(0, before - defenderProvisions(step.defenderCarried, unitStats));
    return baseline;
  });
}

export function summarizeSequence(steps) {
  const attackerLosses = {};
  const attackerHealed = {};
  const defenderLosses = {};
  for (const unit of UNIT_KEYS) {
    attackerLosses[unit] = 0;
    attackerHealed[unit] = 0;
    defenderLosses[unit] = 0;
  }

  for (const step of steps) {
    for (const unit of UNIT_KEYS) {
      attackerLosses[unit] += step.result.attacker.losses[unit];
      attackerHealed[unit] += step.attackerHealed[unit];
      defenderLosses[unit] += step.result.defender.losses[unit];
    }
  }

  const finalWall = steps.length === 0 ? null : steps[steps.length - 1].defenderAfter.wall;

  return { attackerLosses, attackerHealed, defenderLosses, finalWall };
}
