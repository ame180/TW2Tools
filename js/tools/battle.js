import { formatNumber, toNonNegativeInt, clamp } from "../lib/format.js";
import { simulate, strongestWeapons, UNIT_KEYS } from "../lib/battle.js";

const els = {};

const NO_PALADIN = "";
const NO_WEAPON = "none";
const WEAPON_LEVELS = [1, 2, 3];
const DEFAULT_FAITH = 100;
const INPUT_UNIT_KEYS = UNIT_KEYS.filter((unit) => unit !== "knight");

let units = {};
let weapons = {};
let faithLevels = [];
let tribeSkills = {};
const attackerUnitInputs = new Map();
const defenderUnitInputs = new Map();

export const battleTool = {
  id: "battle",
  title: "Battle Calculator",
  init
};

function init(data) {
  units = data.units || {};
  weapons = data.weapons || {};
  faithLevels = data.faithLevels || [];
  tribeSkills = data.tribeSkills || {};

  els.section = document.getElementById("view-battle");
  els.attackerModifier = document.getElementById("battle-attacker-modifier");
  els.defenderModifier = document.getElementById("battle-defender-modifier");
  els.wallStages = document.getElementById("battle-wall-stages");
  els.attackerResults = document.getElementById("battle-attacker-results");
  els.defenderResults = document.getElementById("battle-defender-results");
  els.attackerUnits = document.getElementById("battle-attacker-units");
  els.defenderUnits = document.getElementById("battle-defender-units");
  els.attackerWeapon = document.getElementById("battle-attacker-weapon");
  els.attackerWeaponLevel = document.getElementById("battle-attacker-weapon-level");
  els.defenderPaladins = document.getElementById("battle-defender-paladins");
  els.addPaladin = document.getElementById("battle-add-paladin");
  els.attackerFaith = document.getElementById("battle-attacker-faith");
  els.defenderFaith = document.getElementById("battle-defender-faith");
  els.morale = document.getElementById("battle-morale");
  els.luck = document.getElementById("battle-luck");
  els.luckValue = document.getElementById("battle-luck-value");
  els.wall = document.getElementById("battle-wall");
  els.weaponMastery = document.getElementById("battle-weapon-mastery");
  els.ironWall = document.getElementById("battle-iron-wall");
  els.grandmaster = document.getElementById("battle-grandmaster");
  els.night = document.getElementById("battle-night");
  els.useSurvivors = document.getElementById("battle-use-survivors");
  els.reset = document.getElementById("battle-reset");

  renderUnitInputs(els.attackerUnits, attackerUnitInputs);
  renderUnitInputs(els.defenderUnits, defenderUnitInputs);
  renderResultTables();
  populateWeaponSelect(els.attackerWeapon, true);
  populateLevelSelect(els.attackerWeaponLevel);
  populateFaithSelect(els.attackerFaith);
  populateFaithSelect(els.defenderFaith);
  populateSkillSelect(els.weaponMastery, tribeSkills.weaponMastery);
  populateSkillSelect(els.ironWall, tribeSkills.ironWall);

  els.section.addEventListener("input", recalculate);
  els.section.addEventListener("change", recalculate);
  els.morale.addEventListener("change", normalizeNumberInputs);
  els.wall.addEventListener("change", normalizeNumberInputs);
  els.addPaladin.addEventListener("click", () => {
    addDefenderPaladin(NO_WEAPON, 1);
    recalculate();
  });
  els.useSurvivors.addEventListener("click", useDefenderSurvivors);
  els.reset.addEventListener("click", resetInputs);

  recalculate();
}

function renderUnitInputs(container, inputs) {
  for (const unit of INPUT_UNIT_KEYS) {
    const label = document.createElement("label");
    label.className = "grid grid-cols-2 items-center gap-x-3";

    const name = document.createElement("span");
    name.className = "text-xs font-medium text-slate-600";
    name.textContent = units[unit]?.name || unit;

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.value = "0";
    input.className = "w-full rounded border border-slate-300 px-2 py-1";
    input.addEventListener("change", normalizeNumberInputs);

    label.append(name, input);
    container.appendChild(label);
    inputs.set(unit, input);
  }
}

function renderResultTables() {
  for (const table of [els.attackerResults, els.defenderResults]) {
    const headerRow = document.createElement("tr");
    headerRow.appendChild(createCell("th", ""));
    for (const unit of UNIT_KEYS) {
      const header = createCell("th", units[unit]?.alias || unit, "px-2 py-1 text-right text-xs font-medium text-slate-500");
      header.title = units[unit]?.name || unit;
      headerRow.appendChild(header);
    }

    const thead = document.createElement("thead");
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const [label, rowClass] of [["Units", ""], ["Losses", "text-red-700"]]) {
      const row = document.createElement("tr");
      row.className = `border-t border-slate-200 ${rowClass}`;
      row.appendChild(createCell("th", label, "py-1 pr-2 text-left font-medium"));
      for (const unit of UNIT_KEYS) {
        const cell = createCell("td", "0", "px-2 py-1 text-right tabular-nums");
        cell.dataset.unit = unit;
        row.appendChild(cell);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
  }
}

function createCell(tag, text, className = "") {
  const cell = document.createElement(tag);
  cell.textContent = text;
  cell.className = className;
  return cell;
}

function populateWeaponSelect(select, allowNoPaladin) {
  if (allowNoPaladin) {
    select.appendChild(new Option("No paladin", NO_PALADIN));
  }
  select.appendChild(new Option("No weapon", NO_WEAPON));
  for (const [id, weapon] of Object.entries(weapons)) {
    select.appendChild(new Option(weapon.name || id, id));
  }
}

function populateLevelSelect(select) {
  for (const level of WEAPON_LEVELS) {
    select.appendChild(new Option(String(level), String(level)));
  }
}

function populateFaithSelect(select) {
  for (const faith of faithLevels) {
    select.appendChild(new Option(`${faith}%`, String(faith)));
  }
  select.value = String(DEFAULT_FAITH);
}

function populateSkillSelect(select, values = []) {
  for (let level = 0; level < values.length; level++) {
    select.appendChild(new Option(String(level), String(level)));
  }
}

function addDefenderPaladin(weaponId, level) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-1";

  const weaponSelect = document.createElement("select");
  weaponSelect.className = "min-w-0 flex-1 rounded border border-slate-300 px-2 py-1";
  weaponSelect.setAttribute("aria-label", "Weapon");
  weaponSelect.dataset.role = "weapon";
  populateWeaponSelect(weaponSelect, false);
  weaponSelect.value = weaponId;

  const levelSelect = document.createElement("select");
  levelSelect.className = "rounded border border-slate-300 px-2 py-1";
  levelSelect.dataset.role = "level";
  levelSelect.setAttribute("aria-label", "Weapon level");
  populateLevelSelect(levelSelect);
  levelSelect.value = String(level);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "×";
  removeButton.setAttribute("aria-label", "Remove paladin");
  removeButton.className = "rounded px-2 py-1 text-slate-500 hover:bg-slate-200";
  removeButton.addEventListener("click", () => {
    row.remove();
    recalculate();
  });

  row.append(weaponSelect, levelSelect, removeButton);
  els.defenderPaladins.appendChild(row);
}

function getDefenderPaladinRows() {
  return [...els.defenderPaladins.children];
}

function readInputs() {
  const attackerUnits = {};
  const defenderUnits = {};
  for (const unit of INPUT_UNIT_KEYS) {
    attackerUnits[unit] = toNonNegativeInt(attackerUnitInputs.get(unit).value, 0);
    defenderUnits[unit] = toNonNegativeInt(defenderUnitInputs.get(unit).value, 0);
  }

  const attackerWeaponId = els.attackerWeapon.value;
  attackerUnits.knight = attackerWeaponId === NO_PALADIN ? 0 : 1;
  const attackerWeapon = weapons[attackerWeaponId]
    ? { id: attackerWeaponId, level: Number(els.attackerWeaponLevel.value) }
    : null;

  const paladinRows = getDefenderPaladinRows();
  defenderUnits.knight = paladinRows.length;
  const defenderWeapons = strongestWeapons(paladinRows.map((row) => {
    const weaponId = row.querySelector("[data-role=weapon]").value;
    if (!weapons[weaponId]) {
      return null;
    }
    return { id: weaponId, level: Number(row.querySelector("[data-role=level]").value) };
  }));

  return {
    unitStats: units,
    weaponData: weapons,
    attackerUnits,
    defenderUnits,
    attackerWeapon,
    defenderWeapons,
    wall: clamp(toNonNegativeInt(els.wall.value, 0), 0, 20),
    night: els.night.checked,
    morale: clamp(toNonNegativeInt(els.morale.value, 100), 25, 100),
    luck: Number(els.luck.value),
    faithAttacker: Number(els.attackerFaith.value) || DEFAULT_FAITH,
    faithDefender: Number(els.defenderFaith.value) || DEFAULT_FAITH,
    ironWall: tribeSkills.ironWall?.[Number(els.ironWall.value)] ?? 0,
    grandmaster: els.grandmaster.checked,
    weaponMastery: tribeSkills.weaponMastery?.[Number(els.weaponMastery.value)] ?? 0
  };
}

function recalculate() {
  const luck = Number(els.luck.value);
  els.luckValue.textContent = `${luck > 0 ? "+" : ""}${luck}%`;
  els.attackerWeaponLevel.disabled = !weapons[els.attackerWeapon.value];

  const result = simulate(readInputs());

  els.attackerModifier.textContent = formatModifier(result.attackerModifier);
  els.defenderModifier.textContent = formatModifier(result.defenderModifier);
  renderSide(els.attackerResults, result.attacker);
  renderSide(els.defenderResults, result.defender);

  els.wallStages.hidden = result.wallBefore === 0;
  els.wallStages.textContent =
    `Wall: ${result.wallBefore} → ${result.wallAfterRams} → ${result.wallAfter}`;
}

function renderSide(table, side) {
  const [unitsRow, lossesRow] = table.tBodies[0].rows;
  for (const cell of unitsRow.querySelectorAll("td")) {
    cell.textContent = formatNumber(side.quantity[cell.dataset.unit]);
  }
  for (const cell of lossesRow.querySelectorAll("td")) {
    cell.textContent = formatNumber(side.losses[cell.dataset.unit]);
  }
}

function formatModifier(value) {
  return `${Number(value.toFixed(2))}%`;
}

function normalizeNumberInputs() {
  for (const input of [...attackerUnitInputs.values(), ...defenderUnitInputs.values()]) {
    input.value = String(toNonNegativeInt(input.value, 0));
  }
  els.morale.value = String(clamp(toNonNegativeInt(els.morale.value, 100), 25, 100));
  els.wall.value = String(clamp(toNonNegativeInt(els.wall.value, 0), 0, 20));
  recalculate();
}

function useDefenderSurvivors() {
  const result = simulate(readInputs());

  for (const unit of INPUT_UNIT_KEYS) {
    const survivors = result.defender.quantity[unit] - result.defender.losses[unit];
    defenderUnitInputs.get(unit).value = String(survivors);
  }

  const survivingPaladins = result.defender.quantity.knight - result.defender.losses.knight;
  const paladinRows = getDefenderPaladinRows();
  for (const row of paladinRows.slice(survivingPaladins)) {
    row.remove();
  }

  els.wall.value = String(result.wallAfter);
  recalculate();
}

function resetInputs() {
  for (const input of [...attackerUnitInputs.values(), ...defenderUnitInputs.values()]) {
    input.value = "0";
  }
  els.attackerWeapon.value = NO_PALADIN;
  els.attackerWeaponLevel.value = "1";
  els.defenderPaladins.replaceChildren();
  els.attackerFaith.value = String(DEFAULT_FAITH);
  els.defenderFaith.value = String(DEFAULT_FAITH);
  els.morale.value = "100";
  els.luck.value = "0";
  els.wall.value = "0";
  els.weaponMastery.value = "0";
  els.ironWall.value = "0";
  els.grandmaster.checked = false;
  els.night.checked = false;
  recalculate();
}
