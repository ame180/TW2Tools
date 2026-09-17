import { formatNumber, formatDuration, toNumber, toNonNegativeInt, clamp } from "../lib/format.js";
import { calculateCrowns } from "../lib/crowns.js";

const els = {};

let buildings = {};
let instantFinish = {};

export const buildingTool = {
  id: "building",
  title: "Building Calculator",
  init
};

function init(data) {
  buildings = data.buildings || {};
  instantFinish = data.instantFinish || {};

  els.buildingSelect = document.getElementById("building-select");
  els.currentLevel = document.getElementById("current-level");
  els.targetLevel = document.getElementById("target-level");
  els.buildingRange = document.getElementById("building-range");
  els.buildingError = document.getElementById("building-error");
  els.resultWood = document.getElementById("result-wood");
  els.resultClay = document.getElementById("result-clay");
  els.resultIron = document.getElementById("result-iron");
  els.resultFood = document.getElementById("result-food");
  els.resultTime = document.getElementById("result-time");
  els.resultBuildingCrowns = document.getElementById("result-building-crowns");

  els.buildingSelect.addEventListener("change", () => {
    updateLevelBounds();
    recalculate();
  });
  els.currentLevel.addEventListener("input", recalculate);
  els.targetLevel.addEventListener("input", recalculate);
  els.currentLevel.addEventListener("change", normalizeLevelInputs);
  els.targetLevel.addEventListener("change", normalizeLevelInputs);

  populateBuildingSelect();
  updateLevelBounds();
  recalculate();
}

function populateBuildingSelect() {
  const entries = Object.entries(buildings).sort(([, a], [, b]) => {
    return String(a.name || a.key || "").localeCompare(String(b.name || b.key || ""));
  });

  els.buildingSelect.innerHTML = "";

  for (const [buildingId, building] of entries) {
    const option = document.createElement("option");
    option.value = buildingId;
    option.textContent = building.name || formatBuildingName(buildingId);
    els.buildingSelect.appendChild(option);
  }
}

function updateLevelBounds() {
  const building = getSelectedBuilding();
  if (!building) {
    return;
  }

  const minLevel = toNonNegativeInt(building.minLevel, 1);
  const maxLevel = toNonNegativeInt(building.maxLevel, 30);

  els.currentLevel.min = String(minLevel);
  els.currentLevel.max = String(maxLevel);
  els.targetLevel.min = String(minLevel);
  els.targetLevel.max = String(maxLevel);

  els.buildingRange.textContent = `Allowed range: level ${minLevel} to ${maxLevel}`;

  normalizeLevelInputs();
}

function readLevels(building) {
  const minLevel = toNonNegativeInt(building.minLevel, 1);
  const maxLevel = toNonNegativeInt(building.maxLevel, 30);

  const currentLevel = clamp(
    toNonNegativeInt(els.currentLevel.value, minLevel),
    minLevel,
    maxLevel
  );
  const targetLevel = clamp(
    toNonNegativeInt(els.targetLevel.value, currentLevel),
    minLevel,
    maxLevel
  );

  return { currentLevel, targetLevel };
}

function normalizeLevelInputs() {
  const building = getSelectedBuilding();
  if (!building) {
    return;
  }

  const { currentLevel, targetLevel } = readLevels(building);

  els.currentLevel.value = String(currentLevel);
  els.targetLevel.value = String(Math.max(currentLevel, targetLevel));
  recalculate();
}

function recalculate() {
  const building = getSelectedBuilding();
  if (!building) {
    return;
  }

  const { currentLevel, targetLevel } = readLevels(building);

  if (targetLevel < currentLevel) {
    els.buildingError.textContent = "Target level must be greater than or equal to current level.";
    setResults({ wood: 0, clay: 0, iron: 0, provisions: 0, buildTime: 0, crowns: 0 });
    return;
  }

  els.buildingError.textContent = "";

  const totals = { wood: 0, clay: 0, iron: 0, provisions: 0, buildTime: 0, crowns: 0 };
  const levelCosts = building.levelCosts || {};

  for (let level = currentLevel + 1; level <= targetLevel; level += 1) {
    const row = levelCosts[String(level)];
    if (!row) {
      continue;
    }

    totals.wood += toNumber(row.wood);
    totals.clay += toNumber(row.clay);
    totals.iron += toNumber(row.iron);
    totals.provisions += toNumber(row.provisions);
    totals.buildTime += toNumber(row.buildTime);
    totals.crowns += calculateCrowns(toNumber(row.buildTime), instantFinish);
  }

  setResults(totals);
}

function setResults(totals) {
  els.resultWood.textContent = formatNumber(totals.wood);
  els.resultClay.textContent = formatNumber(totals.clay);
  els.resultIron.textContent = formatNumber(totals.iron);
  els.resultFood.textContent = formatNumber(totals.provisions);
  els.resultTime.textContent = formatDuration(totals.buildTime);
  els.resultBuildingCrowns.textContent = formatNumber(totals.crowns);
}

function getSelectedBuilding() {
  return buildings[els.buildingSelect.value];
}

function formatBuildingName(buildingId) {
  return buildingId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
