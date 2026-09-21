// Single-engagement battle simulator. Pure function, no DOM. Mechanics notes: reference/battle-equation.md.
//
// simulate(input) → result
//
// input:
//   unitStats       — data.json "units"
//   weaponData      — data.json "weapons"
//   attackerUnits   — { spear: 0, sword: 0, ... } (any subset of UNIT_KEYS)
//   defenderUnits   — same shape
//   attackerWeapon  — { id, level: 1|2|3 } | null
//   defenderWeapons — [{ id, level }] | [] (one per weapon id — see strongestWeapons)
//   wall            — 0–20
//   night           — boolean
//   morale          — 30–100 (%)
//   luck            — -15..+15 (%)
//   faithAttacker   — 50 | 100 | 105 | 110 (%)
//   faithDefender   — 50 | 100 | 105 | 110 (%)
//   ironWall        — 0–20 (wall floor, not the tribe skill level)
//   grandmaster     — boolean
//   weaponMastery   — integer (%, not the tribe skill level)
//
// result:
//   attacker, defender — { quantity: {unit: n}, losses: {unit: n} }
//   attackerModifier, defenderModifier — (%)
//   wallBefore, wallAfterRams, wallAfter

export const UNIT_KEYS = [
  "spear", "sword", "axe", "archer",
  "light_cavalry", "mounted_archer", "heavy_cavalry",
  "ram", "catapult", "berserker", "trebuchet", "nobleman", "knight",
];

const UNIT_ATTACK_TYPE = {
  spear: "attack",        sword: "attack",       axe: "attack",
  ram: "attack",          catapult: "attack",    nobleman: "attack",
  trebuchet: "attack",    berserker: "attack",
  light_cavalry: "attack_cavalry", heavy_cavalry: "attack_cavalry", knight: "attack_cavalry",
  archer: "attack_archer", mounted_archer: "attack_archer",
};

const ATTACK_TYPE_UNITS = {
  attack:          ["spear", "sword", "axe", "ram", "catapult", "nobleman", "trebuchet", "berserker"],
  attack_cavalry:  ["light_cavalry", "heavy_cavalry", "knight"],
  attack_archer:   ["archer", "mounted_archer"],
};

const WALL_HITPOINTS = {
  0: 0,  1: 3,  2: 3,  3: 4,  4: 4,  5: 4,  6: 5,  7: 5,  8: 6,
  9: 6, 10: 7, 11: 8, 12: 9, 13: 9, 14: 10, 15: 11, 16: 13,
  17: 14, 18: 15, 19: 17, 20: 18,
};

const LOSS_EPSILON = 1e-9;

function sumValues(obj) {
  let total = 0;
  for (const key of UNIT_KEYS) total += Math.round(obj[key] || 0);
  return total;
}

function zeroUnitMap() {
  const out = {};
  for (const key of UNIT_KEYS) out[key] = 0;
  return out;
}

function totalFood(units, unitStats, excludeUnit) {
  let total = 0;
  for (const unit of UNIT_KEYS) {
    if (unit === excludeUnit) continue;
    total += unitStats[unit].food * (units[unit] || 0);
  }
  return total;
}

function getAttackStrength(units, unitStats, attackBonuses) {
  const sum = { attack: 0, attack_cavalry: 0, attack_archer: 0 };
  for (const unit of UNIT_KEYS) {
    const count = units[unit] || 0;
    if (count === 0) continue;
    const bonus = attackBonuses[unit] || 0;
    sum[UNIT_ATTACK_TYPE[unit]] += unitStats[unit].attack * count * (1 + bonus / 100);
  }
  return sum;
}

function getAttackFoodByType(units, unitStats) {
  const sum = { attack: 0, attack_cavalry: 0, attack_archer: 0 };
  for (const unit of UNIT_KEYS) {
    const count = units[unit] || 0;
    if (count === 0) continue;
    sum[UNIT_ATTACK_TYPE[unit]] += unitStats[unit].food * count;
  }
  return sum;
}

function getDefendStrength(units, unitStats, defenceBonuses) {
  const sum = { defense: 0, defense_cavalry: 0, defense_archer: 0 };
  for (const unit of UNIT_KEYS) {
    const count = units[unit] || 0;
    if (count === 0) continue;
    const bonus = defenceBonuses[unit] || 0;
    sum.defense         += unitStats[unit].def_inf * count * (1 + bonus / 100);
    sum.defense_cavalry += unitStats[unit].def_cav * count * (1 + bonus / 100);
    sum.defense_archer  += unitStats[unit].def_arc * count * (1 + bonus / 100);
  }
  return sum;
}

// Fraction (≤ 1) of the theoretical wall damage rams can inflict: attacker food (excluding rams)
// vs defender food plus a wall-level food bonus.
function getDemolitionModifier(attackerUnits, defenderUnits, unitStats, wall) {
  const wallFoodBonus = wall === 0 ? 0 : Math.round(Math.pow(1.2515, wall - 1) * 20);
  const attackerFood = totalFood(attackerUnits, unitStats, "ram");
  const defenderFood = wallFoodBonus + totalFood(defenderUnits, unitStats);
  if (defenderFood <= 0) return 1;
  return Math.min(1, attackerFood / defenderFood);
}

function calcWallAfterRams(rams, wall, attackerModifier, demolitionModifier, ramWallBonus, ironWall) {
  if (wall === 0 || rams === 0) return wall;

  const defModifier = WALL_HITPOINTS[wall] * 2;
  const rawAttackPower = rams * (attackerModifier / 100);
  let damage = (demolitionModifier * rawAttackPower) / defModifier;

  if (ramWallBonus > 0) {
    damage *= (1 + ramWallBonus / 100);
  }

  let newWall;
  if (wall - damage < 10) {
    newWall = Math.round(wall - damage);
  } else {
    newWall = Math.ceil(wall - damage);
  }

  // Iron Wall: a wall already at or below the protected level is never reduced.
  if (wall <= ironWall) return wall;
  if (newWall < ironWall) newWall = ironWall;

  return Math.max(0, newWall);
}

function resolveWeaponBonuses(attackerWeapon, defenderWeapons, weaponData) {
  const attackBonuses  = zeroUnitMap();
  const defenceBonuses = zeroUnitMap();
  let ramWallBonus = 0;

  if (attackerWeapon && attackerWeapon.id) {
    const weapon = weaponData[attackerWeapon.id];
    if (weapon) {
      const levelIndex = Math.max(0, (attackerWeapon.level ?? 1) - 1);
      if (weapon.wallBonus) {
        ramWallBonus = weapon.wallBonus[levelIndex] ?? 0;
      } else if (weapon.attackBonus) {
        attackBonuses[weapon.unit] = weapon.attackBonus[levelIndex] ?? 0;
      }
    }
  }

  for (const selection of (defenderWeapons || [])) {
    if (!selection || !selection.id) continue;
    const weapon = weaponData[selection.id];
    if (!weapon) continue;
    const levelIndex = Math.max(0, (selection.level ?? 1) - 1);
    if (weapon.defenceBonus) {
      defenceBonuses[weapon.unit] = weapon.defenceBonus[levelIndex] ?? 0;
    }
  }

  return { attackBonuses, defenceBonuses, ramWallBonus };
}

export function strongestWeapons(selections) {
  const levelById = new Map();
  for (const selection of selections) {
    if (!selection || !selection.id) continue;
    const level = selection.level ?? 1;
    if (level > (levelById.get(selection.id) ?? 0)) levelById.set(selection.id, level);
  }
  return [...levelById].map(([id, level]) => ({ id, level }));
}

export function simulate(input) {
  const {
    unitStats,
    weaponData,
    attackerWeapon  = null,
    defenderWeapons = [],
    wall:     wallInput    = 0,
    night                  = false,
    morale                 = 100,
    luck                   = 0,
    faithAttacker          = 100,
    faithDefender          = 100,
    ironWall:  ironWallInput = 0,
    grandmaster            = false,
    weaponMastery          = 0,
  } = input;

  const wall     = Math.max(0, Math.min(20, wallInput));
  const ironWall = Math.max(0, Math.min(20, ironWallInput));

  const originalAttacker = zeroUnitMap();
  const originalDefender = zeroUnitMap();
  for (const unit of UNIT_KEYS) {
    originalAttacker[unit] = Math.max(0, Math.floor(input.attackerUnits?.[unit] ?? 0));
    originalDefender[unit] = Math.max(0, Math.floor(input.defenderUnits?.[unit] ?? 0));
  }

  const atkUnits = { ...originalAttacker };
  const defUnits = { ...originalDefender };

  // Trebuchets cancel rams 1:1 before anything else happens.
  const lostRams = Math.min(atkUnits.ram, defUnits.trebuchet);
  atkUnits.ram -= lostRams;

  const { attackBonuses, defenceBonuses, ramWallBonus } =
    resolveWeaponBonuses(attackerWeapon, defenderWeapons, weaponData);

  // Berserkers double their attack when the defender fields more than twice the attacker's food.
  const atkFoodTotal = totalFood(atkUnits, unitStats);
  const defFoodTotal = totalFood(defUnits, unitStats);
  if (defFoodTotal > 2 * atkFoodTotal) {
    attackBonuses.berserker = (attackBonuses.berserker || 0) + 100;
  }

  const attackerModifier =
    Math.floor(faithAttacker * morale / 100)
    + luck
    + weaponMastery
    + (grandmaster ? 10 : 0);

  const demolitionModifier = getDemolitionModifier(atkUnits, defUnits, unitStats, wall);
  const wallAfterRams = calcWallAfterRams(
    atkUnits.ram, wall, attackerModifier, demolitionModifier, ramWallBonus, ironWall
  );

  const defenderModifier = Math.floor(faithDefender * (100 + wallAfterRams * 5) / 100) * (night ? 2 : 1);

  const wallFlatDefense = wallAfterRams === 0
    ? 0
    : Math.round(Math.pow(1.25, wallAfterRams) * 20);

  const atkRemaining = { ...atkUnits };
  const defRemaining = { ...defUnits };

  while (sumValues(atkRemaining) >= 1 && sumValues(defRemaining) >= 1) {
    const attackStrength = getAttackStrength(atkRemaining, unitStats, attackBonuses);
    const defendStrength = getDefendStrength(defRemaining, unitStats, defenceBonuses);
    const attackFoodByType = getAttackFoodByType(atkRemaining, unitStats);
    const totalAtkFood = attackFoodByType.attack + attackFoodByType.attack_cavalry + attackFoodByType.attack_archer;

    if (totalAtkFood === 0) break;

    const defSnapshot = { ...defRemaining };

    for (const attackType of ["attack", "attack_cavalry", "attack_archer"]) {
      if (attackStrength[attackType] === 0) continue;

      const ratio = attackFoodByType[attackType] / totalAtkFood;
      const defenseType = attackType.replace("attack", "defense");

      const effectiveDefense =
        defendStrength[defenseType] * ratio * (defenderModifier / 100)
        + wallFlatDefense * ratio;

      const effectiveAttack = attackStrength[attackType] * (attackerModifier / 100);

      if (effectiveDefense <= 0) {
        for (const unit of UNIT_KEYS) {
          defRemaining[unit] -= defSnapshot[unit] * ratio;
        }
        continue;
      }

      const a = effectiveAttack / effectiveDefense;

      if (a < 1) {
        const c = Math.sqrt(a) * a;
        for (const unit of UNIT_KEYS) {
          defRemaining[unit] -= defSnapshot[unit] * c * ratio;
        }
        for (const unit of ATTACK_TYPE_UNITS[attackType]) {
          atkRemaining[unit] = 0;
        }
      } else {
        const c = Math.sqrt(1 / a) / a;
        for (const unit of UNIT_KEYS) {
          defRemaining[unit] -= ratio * defSnapshot[unit];
        }
        for (const unit of ATTACK_TYPE_UNITS[attackType]) {
          atkRemaining[unit] -= c * atkRemaining[unit];
        }
      }
    }
  }

  // Losses are measured against the original counts, so cancelled rams count as lost.
  // Survivors round up; the epsilon keeps float noise (e.g. 1e-14 left) from saving a unit.
  const attackerLosses = zeroUnitMap();
  const defenderLosses = zeroUnitMap();
  for (const unit of UNIT_KEYS) {
    attackerLosses[unit] = Math.floor(originalAttacker[unit] - Math.max(0, atkRemaining[unit] || 0) + LOSS_EPSILON);
    defenderLosses[unit] = Math.floor(originalDefender[unit] - Math.max(0, defRemaining[unit] || 0) + LOSS_EPSILON);
  }

  // Surviving rams hit the wall a second time, with no demolition cap.
  const survivingRams = originalAttacker.ram - attackerLosses.ram;
  const wallAfterFight = calcWallAfterRams(
    survivingRams, wallAfterRams, attackerModifier, 1, ramWallBonus, ironWall
  );

  return {
    attacker: { quantity: { ...originalAttacker }, losses: attackerLosses },
    defender: { quantity: { ...originalDefender }, losses: defenderLosses },
    attackerModifier,
    defenderModifier,
    wallBefore:    wall,
    wallAfterRams,
    wallAfter:     wallAfterFight,
  };
}
