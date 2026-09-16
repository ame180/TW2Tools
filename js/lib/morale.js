const MORALE_BASE = 0.27;
const POINT_RATIO_FACTOR = 3;

// Empirical formula reverse-engineered from observed in-game values (server-side,
// not present in client code). See reference/morale-equation.md.
export function calculateMoralePercent(attackerPoints, defenderPoints) {
  if (attackerPoints <= 0) {
    return 100;
  }

  const morale = MORALE_BASE + (defenderPoints / attackerPoints) * POINT_RATIO_FACTOR;
  return Math.min(100, morale * 100);
}
