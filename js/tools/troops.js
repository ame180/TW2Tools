import { formatNumber, formatDuration, toNumber, toNonNegativeInt, clamp } from "../lib/format.js";
import { calculateCrowns } from "../lib/crowns.js";

const els = {};

let troops = {};
let recruitModifiers = {};
let instantFinish = {};
let speedTechInputs = [];

export const troopsTool = {
  id: "troops",
  title: "Troops Calculator",
  init
};

function init(data) {
  troops = data.troops || {};
  recruitModifiers = data.recruitModifiers || {};
  instantFinish = data.instantFinish || {};

  els.troopSelect = document.getElementById("troop-select");
  els.troopCount = document.getElementById("troop-count");
  els.troopSpeedTechs = document.getElementById("troop-speed-techs");
  els.troopSpeedTechsLabel = document.getElementById("troop-speed-techs-label");
  els.troopTribeTech = document.getElementById("troop-tribe-tech");
  els.troopTribeTechLabel = document.getElementById("troop-tribe-tech-label");
  els.troopDomination = document.getElementById("troop-domination");
  els.troopDominationLabel = document.getElementById("troop-domination-label");
  els.troopDominationText = document.getElementById("troop-domination-text");
  els.troopHallLevel = document.getElementById("troop-hall-level");
  els.troopModifiers = document.getElementById("troop-modifiers");
  els.troopNote = document.getElementById("troop-note");
  els.troopError = document.getElementById("troop-error");
  els.troopResultWood = document.getElementById("troop-result-wood");
  els.troopResultClay = document.getElementById("troop-result-clay");
  els.troopResultIron = document.getElementById("troop-result-iron");
  els.troopResultProvisions = document.getElementById("troop-result-provisions");
  els.troopResultTime = document.getElementById("troop-result-time");
  els.troopResultCrowns = document.getElementById("troop-result-crowns");

  els.troopSelect.addEventListener("change", recalculate);
  els.troopCount.addEventListener("input", recalculate);
  els.troopTribeTech.addEventListener("input", recalculate);
  els.troopDomination.addEventListener("change", recalculate);
  els.troopHallLevel.addEventListener("input", recalculate);
  els.troopCount.addEventListener("change", normalizeNumberInputs);
  els.troopTribeTech.addEventListener("change", normalizeNumberInputs);
  els.troopHallLevel.addEventListener("change", normalizeNumberInputs);

  populateTroopSelect();
  renderSpeedTechCheckboxes();
  applyModifierUi();
  recalculate();
}

function populateTroopSelect() {
  const entries = Object.entries(troops).sort(([, a], [, b]) => {
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  els.troopSelect.innerHTML = "";

  for (const [troopId, troop] of entries) {
    const option = document.createElement("option");
    option.value = troopId;
    option.textContent = troop.name || troopId;
    els.troopSelect.appendChild(option);
  }
}

function applyModifierUi() {
  const tribeTech = recruitModifiers.tribeRecruitTech || {};
  const hallOfOrders = recruitModifiers.hallOfOrders || {};
  const domination = recruitModifiers.domination || {};

  els.troopTribeTech.max = String(toNumber(tribeTech.maxLevel));
  els.troopHallLevel.max = String(toNumber(hallOfOrders.maxLevel));
  els.troopDominationText.textContent = domination.label || `${toNumber(domination.percent)}%`;
}

function renderSpeedTechCheckboxes() {
  const techs = recruitModifiers.barracksSpeedTechs || [];

  els.troopSpeedTechs.innerHTML = "";
  speedTechInputs = [];

  for (const tech of techs) {
    const label = document.createElement("label");
    label.className = "flex items-center gap-2";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `troop-tech-${tech.id}`;
    checkbox.addEventListener("change", recalculate);

    const text = document.createElement("span");
    text.textContent = tech.label || `${toNumber(tech.percent)}%`;

    label.appendChild(checkbox);
    label.appendChild(text);
    els.troopSpeedTechs.appendChild(label);

    speedTechInputs.push({ checkbox, percent: toNumber(tech.percent) });
  }
}

function recalculate() {
  const troop = troops[els.troopSelect.value];
  if (!troop) {
    els.troopError.textContent = "No troop data available.";
    els.troopModifiers.textContent = "";
    els.troopNote.textContent = "";
    setResults({ wood: 0, clay: 0, iron: 0, provisions: 0, recruitTime: 0, crowns: 0 });
    return;
  }

  els.troopError.textContent = "";

  const hallOfOrders = recruitModifiers.hallOfOrders || {};
  const { count, tribeLevel, hallLevel } = readNumberInputs();

  const isBarracksUnit = troop.recruitBuilding === "barracks";
  setSpeedInputsEnabled(isBarracksUnit);
  els.troopNote.textContent = isBarracksUnit
    ? ""
    : `Recruit speed bonuses apply to Barracks units only - ignored for ${troop.name}.`;

  const speedDivisor = getRecruitTimeDivisor(isBarracksUnit, tribeLevel);
  const discountPercent = clamp(hallLevel * toNumber(hallOfOrders.percentPerLevel), 0, 100);

  const recruitTime = Math.round(toNumber(troop.recruitTime) * count / speedDivisor);
  const priceMultiplier = 1 - discountPercent / 100;

  const totals = {
    wood: Math.round(toNumber(troop.wood) * count * priceMultiplier),
    clay: Math.round(toNumber(troop.clay) * count * priceMultiplier),
    iron: Math.round(toNumber(troop.iron) * count * priceMultiplier),
    provisions: toNumber(troop.provisions) * count,
    recruitTime: recruitTime,
    crowns: recruitTime > 0 ? calculateCrowns(recruitTime, instantFinish) : 0
  };

  const effectiveSpeedPercent = Math.round((1 - 1 / speedDivisor) * 100);
  els.troopModifiers.textContent =
    `Recruit speed /${speedDivisor.toFixed(2)} (-${effectiveSpeedPercent}%) | Resource cost -${discountPercent}%`;

  setResults(totals);
}

function readNumberInputs() {
  const tribeTech = recruitModifiers.tribeRecruitTech || {};
  const hallOfOrders = recruitModifiers.hallOfOrders || {};

  const count = toNonNegativeInt(els.troopCount.value, 0);
  const tribeLevel = clamp(
    toNonNegativeInt(els.troopTribeTech.value, 0),
    0,
    toNumber(tribeTech.maxLevel)
  );
  const hallLevel = clamp(
    toNonNegativeInt(els.troopHallLevel.value, 0),
    0,
    toNumber(hallOfOrders.maxLevel)
  );

  return { count, tribeLevel, hallLevel };
}

function normalizeNumberInputs() {
  const { count, tribeLevel, hallLevel } = readNumberInputs();

  els.troopCount.value = String(count);
  els.troopTribeTech.value = String(tribeLevel);
  els.troopHallLevel.value = String(hallLevel);
}

function getRecruitTimeDivisor(isBarracksUnit, tribeLevel) {
  if (!isBarracksUnit) {
    return 1;
  }

  let barracksPercent = 0;

  for (const tech of speedTechInputs) {
    if (tech.checkbox.checked) {
      barracksPercent += tech.percent;
    }
  }

  const tribeTech = recruitModifiers.tribeRecruitTech || {};
  const domination = recruitModifiers.domination || {};

  let playerPercent = tribeLevel * toNumber(tribeTech.percentPerLevel);
  if (els.troopDomination.checked) {
    playerPercent += toNumber(domination.percent);
  }

  return (1 + barracksPercent / 100) * (1 + playerPercent / 100);
}

function setSpeedInputsEnabled(isEnabled) {
  for (const tech of speedTechInputs) {
    tech.checkbox.disabled = !isEnabled;
  }

  els.troopTribeTech.disabled = !isEnabled;
  els.troopDomination.disabled = !isEnabled;
  els.troopSpeedTechsLabel.classList.toggle("opacity-50", !isEnabled);
  els.troopTribeTechLabel.classList.toggle("opacity-50", !isEnabled);
  els.troopDominationLabel.classList.toggle("opacity-50", !isEnabled);
}

function setResults(totals) {
  els.troopResultWood.textContent = formatNumber(totals.wood);
  els.troopResultClay.textContent = formatNumber(totals.clay);
  els.troopResultIron.textContent = formatNumber(totals.iron);
  els.troopResultProvisions.textContent = formatNumber(totals.provisions);
  els.troopResultTime.textContent = formatDuration(totals.recruitTime);
  els.troopResultCrowns.textContent = formatNumber(totals.crowns);
}
