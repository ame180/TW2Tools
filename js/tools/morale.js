import { toNonNegativeInt } from "../lib/format.js";
import { calculateMoralePercent } from "../lib/morale.js";

const els = {};

export const moraleTool = {
  id: "morale",
  title: "Morale Calculator",
  init
};

function init() {
  els.moraleYourPoints = document.getElementById("morale-your-points");
  els.moraleEnemyPoints = document.getElementById("morale-enemy-points");
  els.moraleAttacking = document.getElementById("morale-attacking");
  els.moraleDefending = document.getElementById("morale-defending");

  els.moraleYourPoints.addEventListener("input", recalculate);
  els.moraleEnemyPoints.addEventListener("input", recalculate);

  recalculate();
}

function recalculate() {
  const yourPoints = toNonNegativeInt(els.moraleYourPoints.value, 0);
  const enemyPoints = toNonNegativeInt(els.moraleEnemyPoints.value, 0);

  els.moraleAttacking.textContent = formatMorale(calculateMoralePercent(yourPoints, enemyPoints));
  els.moraleDefending.textContent = formatMorale(calculateMoralePercent(enemyPoints, yourPoints));
}

function formatMorale(percent) {
  return `${Math.round(percent)}%`;
}
