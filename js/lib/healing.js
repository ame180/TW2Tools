export function healPercent({ medic, medicus }, healing = {}) {
  return (medic ? healing.medic ?? 0 : 0) + (medicus ? healing.medicus ?? 0 : 0);
}

export function healedUnits(losses, percent, excludedUnits = []) {
  const healed = {};
  for (const [unit, count] of Object.entries(losses)) {
    healed[unit] = excludedUnits.includes(unit) ? 0 : Math.floor(count * percent / 100);
  }
  return healed;
}

export function subtractUnits(losses, healed) {
  const remaining = {};
  for (const [unit, count] of Object.entries(losses)) {
    remaining[unit] = count - (healed[unit] ?? 0);
  }
  return remaining;
}
