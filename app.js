const state = {
  dataReady: false,
  buildings: {},
  premiumModels: {}
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindTabButtons();
  bindInputs();
  setActiveTab("building");
  initialize();
});

async function initialize() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status}`);
    }

    const rawData = await response.json();
    state.buildings = rawData.buildings || {};

    state.instantFinish = rawData.instantFinish || {};

    populateBuildingSelect();

    state.dataReady = true;
    els.dataStatus.textContent = "Data loaded successfully.";

    updateBuildingLevelBounds();
    recalculateBuilding();
    recalculateCrowns();
  } catch (error) {
    els.dataStatus.textContent = `Error loading data: ${error.message}`;
  }
}

function cacheElements() {
  els.dataStatus = document.getElementById("data-status");

  els.tabBuilding = document.getElementById("tab-building");
  els.tabCrowns = document.getElementById("tab-crowns");
  els.viewBuilding = document.getElementById("view-building");
  els.viewCrowns = document.getElementById("view-crowns");

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

  els.durationDays = document.getElementById("duration-days");
  els.durationHours = document.getElementById("duration-hours");
  els.durationMinutes = document.getElementById("duration-minutes");
  els.durationSeconds = document.getElementById("duration-seconds");
  els.durationTotalSeconds = document.getElementById("duration-total-seconds");
  els.resultCrowns = document.getElementById("result-crowns");

  els.tabWallbreaker = document.getElementById("tab-wallbreaker");
  els.viewWallbreaker = document.getElementById("view-wallbreaker");
  els.wbProvisions = document.getElementById("wb-provisions");
  els.wbTrebuchets = document.getElementById("wb-trebuchets");
  els.wbError = document.getElementById("wb-error");
  els.wbResultRams = document.getElementById("wb-result-rams");
  els.wbResultEscort = document.getElementById("wb-result-escort");
}

function bindTabButtons() {
  els.tabBuilding.addEventListener("click", () => setActiveTab("building"));
  els.tabCrowns.addEventListener("click", () => setActiveTab("crowns"));
  els.tabWallbreaker.addEventListener("click", () => setActiveTab("wallbreaker"));
}

function bindInputs() {
  els.buildingSelect.addEventListener("change", () => {
    updateBuildingLevelBounds();
    recalculateBuilding();
  });

  els.currentLevel.addEventListener("input", () => {
    updateBuildingLevelBounds();
    recalculateBuilding();
  });

  els.targetLevel.addEventListener("input", () => {
    updateBuildingLevelBounds();
    recalculateBuilding();
  });

  els.durationDays.addEventListener("input", recalculateCrowns);
  els.durationHours.addEventListener("input", recalculateCrowns);
  els.durationMinutes.addEventListener("input", recalculateCrowns);
  els.durationSeconds.addEventListener("input", recalculateCrowns);

  els.wbProvisions.addEventListener("input", recalculateWallbreaker);
  els.wbTrebuchets.addEventListener("input", recalculateWallbreaker);
}

function setActiveTab(tab) {
  els.viewBuilding.classList.toggle("hidden", tab !== "building");
  els.viewCrowns.classList.toggle("hidden", tab !== "crowns");
  els.viewWallbreaker.classList.toggle("hidden", tab !== "wallbreaker");

  setTabStyle(els.tabBuilding, tab === "building");
  setTabStyle(els.tabCrowns, tab === "crowns");
  setTabStyle(els.tabWallbreaker, tab === "wallbreaker");
}

function setTabStyle(button, isActive) {
  button.classList.toggle("bg-slate-900", isActive);
  button.classList.toggle("text-white", isActive);
  button.classList.toggle("border-slate-900", isActive);

  button.classList.toggle("bg-white", !isActive);
  button.classList.toggle("text-slate-900", !isActive);
  button.classList.toggle("border-slate-300", !isActive);
}

function populateBuildingSelect() {
  const entries = Object.entries(state.buildings).sort(([, a], [, b]) => {
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

function updateBuildingLevelBounds() {
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

  els.currentLevel.value = String(currentLevel);
  els.targetLevel.value = String(Math.max(currentLevel, targetLevel));

  els.buildingRange.textContent = `Allowed range: level ${minLevel} to ${maxLevel}`;
}

function recalculateBuilding() {
  if (!state.dataReady) {
    return;
  }

  const building = getSelectedBuilding();
  if (!building) {
    return;
  }

  const currentLevel = toNonNegativeInt(els.currentLevel.value, 1);
  const targetLevel = toNonNegativeInt(els.targetLevel.value, currentLevel);

  if (targetLevel < currentLevel) {
    els.buildingError.textContent = "Target level must be greater than or equal to current level.";
    setBuildingResults({ wood: 0, clay: 0, iron: 0, provisions: 0, buildTime: 0 });
    return;
  }

  els.buildingError.textContent = "";

  const totals = { wood: 0, clay: 0, iron: 0, provisions: 0, buildTime: 0 };
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
  }

  setBuildingResults(totals);
}

function setBuildingResults(totals) {
  els.resultWood.textContent = formatNumber(totals.wood);
  els.resultClay.textContent = formatNumber(totals.clay);
  els.resultIron.textContent = formatNumber(totals.iron);
  els.resultFood.textContent = formatNumber(totals.provisions);
  els.resultTime.textContent = formatDuration(totals.buildTime);
}

function recalculateCrowns() {
  if (!state.dataReady) {
    return;
  }

  const days = toNonNegativeInt(els.durationDays.value, 0);
  const hours = toNonNegativeInt(els.durationHours.value, 0);
  const minutes = toNonNegativeInt(els.durationMinutes.value, 0);
  const seconds = toNonNegativeInt(els.durationSeconds.value, 0);

  els.durationDays.value = String(days);
  els.durationHours.value = String(hours);
  els.durationMinutes.value = String(minutes);
  els.durationSeconds.value = String(seconds);

  const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  els.durationTotalSeconds.textContent = formatNumber(totalSeconds);

  const model = state.instantFinish;
  const crowns = calculateCrowns(totalSeconds, model);
  els.resultCrowns.textContent = formatNumber(crowns);
}

function calculateCrowns(totalSeconds, model) {
  if (!model) {
    return 0;
  }

  const fixedTime = toNumber(model.fixedTime);
  const fixedCrowns = toNumber(model.fixedCrowns);

  if (totalSeconds <= fixedTime) {
    return Math.ceil(fixedCrowns);
  }

  const timeRange = (model.timeRange || []).map(toNumber);
  const crownRange = (model.crownRange || []).map(toNumber);

  if (!timeRange.length || !crownRange.length || timeRange.length !== crownRange.length) {
    return Math.ceil(fixedCrowns);
  }

  if (timeRange.length === 1) {
    return Math.ceil(crownRange[0]);
  }

  if (totalSeconds <= timeRange[0]) {
    return Math.ceil(crownRange[0]);
  }

  for (let i = 1; i < timeRange.length; i += 1) {
    if (totalSeconds <= timeRange[i]) {
      return interpolateCrowns(
        totalSeconds,
        timeRange[i - 1],
        timeRange[i],
        crownRange[i - 1],
        crownRange[i]
      );
    }
  }

  const last = timeRange.length - 1;
  return interpolateCrowns(
    totalSeconds,
    timeRange[last - 1],
    timeRange[last],
    crownRange[last - 1],
    crownRange[last]
  );
}

function interpolateCrowns(remainingSeconds, startTime, endTime, startPrice, endPrice) {
  const timeDelta = endTime - startTime;
  if (timeDelta <= 0) {
    return Math.ceil(endPrice);
  }

  const crowns =
    Math.ceil(
      ((remainingSeconds + 1 - startTime) * (endPrice - startPrice)) /
        timeDelta
    ) +
    startPrice -
    1;

  return Math.max(0, crowns);
}

function recalculateWallbreaker() {
  const provisions = toNonNegativeInt(els.wbProvisions.value, 0);
  const trebuchets = toNonNegativeInt(els.wbTrebuchets.value, 0);

  const trebProvisionCost = 5 * trebuchets;
  if (trebProvisionCost > provisions) {
    els.wbError.textContent = "Trebuchets exceed available provisions.";
    els.wbResultRams.textContent = "0";
    els.wbResultEscort.textContent = "0";
    return;
  }

  els.wbError.textContent = "";
  const rams = Math.floor((provisions - trebProvisionCost) / 2 / 5) + trebuchets;
  const escortProvisions = provisions - rams * 5;

  els.wbResultRams.textContent = formatNumber(rams);
  els.wbResultEscort.textContent = formatNumber(escortProvisions);
}

function getSelectedBuilding() {
  return state.buildings[els.buildingSelect.value];
}

function formatBuildingName(buildingId) {
  return buildingId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}

function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [days, hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function toNonNegativeInt(value, fallback = 0) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return numeric;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
