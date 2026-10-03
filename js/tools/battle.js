import { formatNumber, toNonNegativeInt, clamp } from "../lib/format.js";
import { UNIT_KEYS } from "../lib/battle.js";
import { simulateSequence, summarizeSequence, defenderProvisions } from "../lib/battle-sequence.js";
import {
  createInitialState, addHit, deleteHit, moveHit, selectHit, setActiveAttacker, toSequenceInput, toFormPaladins,
  NO_PALADIN, NO_WEAPON, DEFAULT_FAITH, INPUT_UNIT_KEYS
} from "../lib/battle-calc-state.js";

const els = {};

const WEAPON_LEVELS = [1, 2, 3];
const DISABLED_INPUT_CLASSES = "disabled:bg-slate-100 disabled:text-slate-500";
const HIT_CHIP_CLASSES = "whitespace-nowrap rounded border px-3 py-1 tabular-nums";
const ACTIVE_HIT_CHIP_CLASSES = `${HIT_CHIP_CLASSES} border-slate-800 bg-slate-800 text-white`;
const INACTIVE_HIT_CHIP_CLASSES = `${HIT_CHIP_CLASSES} border-slate-300 hover:bg-slate-100`;

let units = {};
let weapons = {};
let faithLevels = [];
let tribeSkills = {};
let state = createInitialState();
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
  els.hits = document.getElementById("battle-hits");
  els.addHit = document.getElementById("battle-add-hit");
  els.hitToolbar = document.getElementById("battle-hit-toolbar");
  els.moveLeft = document.getElementById("battle-move-left");
  els.moveRight = document.getElementById("battle-move-right");
  els.deleteHit = document.getElementById("battle-delete-hit");
  els.attackerModifier = document.getElementById("battle-attacker-modifier");
  els.defenderModifier = document.getElementById("battle-defender-modifier");
  els.wallStages = document.getElementById("battle-wall-stages");
  els.attackerResults = document.getElementById("battle-attacker-results");
  els.defenderResults = document.getElementById("battle-defender-results");
  els.attackerUnits = document.getElementById("battle-attacker-units");
  els.defenderUnits = document.getElementById("battle-defender-units");
  els.defenderSource = document.getElementById("battle-defender-source");
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

  els.section.addEventListener("input", handleFormChange);
  els.section.addEventListener("change", handleFormChange);
  els.morale.addEventListener("change", normalizeNumberInputs);
  els.wall.addEventListener("change", normalizeNumberInputs);
  els.addPaladin.addEventListener("click", () => {
    addDefenderPaladin(NO_WEAPON, 1, false);
    handleFormChange();
  });
  els.addHit.addEventListener("click", () => updateState(addHit(state)));
  els.moveLeft.addEventListener("click", () => updateState(moveHit(state, state.activeHit, -1)));
  els.moveRight.addEventListener("click", () => updateState(moveHit(state, state.activeHit, 1)));
  els.deleteHit.addEventListener("click", () => updateState(deleteHit(state, state.activeHit)));
  els.reset.addEventListener("click", resetHits);

  showActiveHit();
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
    input.className = `w-full rounded border border-slate-300 px-2 py-1 ${DISABLED_INPUT_CLASSES}`;
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

function addDefenderPaladin(weaponId, level, disabled) {
  const row = document.createElement("div");
  row.className = "flex items-center gap-1";

  const weaponSelect = document.createElement("select");
  weaponSelect.className = `min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 ${DISABLED_INPUT_CLASSES}`;
  weaponSelect.setAttribute("aria-label", "Weapon");
  weaponSelect.dataset.role = "weapon";
  populateWeaponSelect(weaponSelect, false);
  weaponSelect.value = weaponId;
  weaponSelect.disabled = disabled;

  const levelSelect = document.createElement("select");
  levelSelect.className = `rounded border border-slate-300 px-2 py-1 ${DISABLED_INPUT_CLASSES}`;
  levelSelect.dataset.role = "level";
  levelSelect.setAttribute("aria-label", "Weapon level");
  populateLevelSelect(levelSelect);
  levelSelect.value = String(level);
  levelSelect.disabled = disabled;

  row.append(weaponSelect, levelSelect);

  if (!disabled) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", "Remove paladin");
    removeButton.className = "rounded px-2 py-1 text-slate-500 hover:bg-slate-200";
    removeButton.addEventListener("click", () => {
      row.remove();
      handleFormChange();
    });
    row.appendChild(removeButton);
  }

  els.defenderPaladins.appendChild(row);
}

function renderDefenderPaladins(paladins, disabled) {
  els.defenderPaladins.replaceChildren();
  for (const paladin of paladins) {
    addDefenderPaladin(paladin.weapon, paladin.level, disabled);
  }
}

function readUnitInputs(inputs) {
  const values = {};
  for (const unit of INPUT_UNIT_KEYS) {
    values[unit] = toNonNegativeInt(inputs.get(unit).value, 0);
  }
  return values;
}

function writeUnitInputs(inputs, values) {
  for (const unit of INPUT_UNIT_KEYS) {
    inputs.get(unit).value = String(values[unit] ?? 0);
  }
}

function readDefenderPaladinRows() {
  return [...els.defenderPaladins.children].map((row) => ({
    weapon: row.querySelector("[data-role=weapon]").value,
    level: Number(row.querySelector("[data-role=level]").value)
  }));
}

function readForm() {
  state = setActiveAttacker(state, {
    units: readUnitInputs(attackerUnitInputs),
    paladinWeapon: els.attackerWeapon.value,
    paladinLevel: Number(els.attackerWeaponLevel.value),
    faith: Number(els.attackerFaith.value) || DEFAULT_FAITH,
    morale: clamp(toNonNegativeInt(els.morale.value, 100), 25, 100),
    luck: Number(els.luck.value),
    weaponMasteryLevel: Number(els.weaponMastery.value),
    grandmaster: els.grandmaster.checked
  });

  const defender = {
    ...state.defender,
    faith: Number(els.defenderFaith.value) || DEFAULT_FAITH,
    night: els.night.checked,
    ironWallLevel: Number(els.ironWall.value)
  };
  if (state.activeHit === 0) {
    defender.units = readUnitInputs(defenderUnitInputs);
    defender.wall = clamp(toNonNegativeInt(els.wall.value, 0), 0, 20);
    defender.paladins = readDefenderPaladinRows();
  }
  state = { ...state, defender };
}

function writeForm() {
  const { attacker } = state.hits[state.activeHit];
  writeUnitInputs(attackerUnitInputs, attacker.units);
  els.attackerWeapon.value = attacker.paladinWeapon;
  els.attackerWeaponLevel.value = String(attacker.paladinLevel);
  els.attackerFaith.value = String(attacker.faith);
  els.morale.value = String(attacker.morale);
  els.luck.value = String(attacker.luck);
  els.weaponMastery.value = String(attacker.weaponMasteryLevel);
  els.grandmaster.checked = attacker.grandmaster;

  const { defender } = state;
  els.defenderFaith.value = String(defender.faith);
  els.night.checked = defender.night;
  els.ironWall.value = String(defender.ironWallLevel);
}

// Starting values are written only when the active hit changes, so typing is never overwritten.
function renderDefenderPanel(step, includeStartValues) {
  const editable = state.activeHit === 0;
  for (const input of defenderUnitInputs.values()) {
    input.disabled = !editable;
  }
  els.wall.disabled = !editable;
  els.addPaladin.hidden = !editable;
  els.defenderSource.textContent = editable ? "" : ` (from hit #${state.activeHit})`;

  if (editable && !includeStartValues) {
    return;
  }
  const shown = editable
    ? state.defender
    : { ...step.defenderBefore, paladins: toFormPaladins(step.defenderBefore.paladins) };
  writeUnitInputs(defenderUnitInputs, shown.units);
  els.wall.value = String(shown.wall);
  renderDefenderPaladins(shown.paladins, !editable);
}

function handleFormChange() {
  readForm();
  render();
}

function updateState(nextState) {
  state = nextState;
  showActiveHit();
}

function showActiveHit() {
  writeForm();
  render({ includeDefenderStart: true });
  scrollActiveChipIntoView();
}

// Horizontal only — scrollIntoView would also move the page vertically (e.g. on Reset).
function scrollActiveChipIntoView() {
  const stripBox = els.hits.getBoundingClientRect();
  const chipBox = els.hits.children[state.activeHit].getBoundingClientRect();
  if (chipBox.left < stripBox.left) {
    els.hits.scrollLeft -= stripBox.left - chipBox.left;
  } else if (chipBox.right > stripBox.right) {
    els.hits.scrollLeft += chipBox.right - stripBox.right;
  }
}

function resetHits() {
  if (state.hits.length > 1 && !window.confirm("Remove all hits and reset the calculator?")) {
    return;
  }
  updateState(createInitialState());
}

function render({ includeDefenderStart = false } = {}) {
  const luck = Number(els.luck.value);
  els.luckValue.textContent = `${luck > 0 ? "+" : ""}${luck}%`;
  els.attackerWeaponLevel.disabled = !weapons[els.attackerWeapon.value];

  const steps = simulateSequence(toSequenceInput(state, { units, weapons, tribeSkills }));
  const activeStep = steps[state.activeHit];
  const { result } = activeStep;

  els.attackerModifier.textContent = formatModifier(result.attackerModifier);
  els.defenderModifier.textContent = formatModifier(result.defenderModifier);
  renderSide(els.attackerResults, result.attacker);
  renderSide(els.defenderResults, result.defender);

  els.wallStages.hidden = result.wallBefore === 0;
  els.wallStages.textContent =
    `Wall: ${result.wallBefore} → ${result.wallAfterRams} → ${result.wallAfter}`;

  renderDefenderPanel(activeStep, includeDefenderStart);
  renderHitStrip(steps);
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

function renderHitStrip(steps) {
  const { clearedAt } = summarizeSequence(steps);
  const startProvisions = defenderProvisions(steps[0].defenderBefore, units);
  const stripHadFocus = els.hits.contains(document.activeElement);

  const chips = steps.map((step, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = describeHit(step, index, clearedAt, startProvisions);
    chip.className = index === state.activeHit ? ACTIVE_HIT_CHIP_CLASSES : INACTIVE_HIT_CHIP_CLASSES;
    chip.setAttribute("aria-pressed", String(index === state.activeHit));
    chip.addEventListener("click", () => updateState(selectHit(state, index)));
    return chip;
  });
  els.hits.replaceChildren(...chips);
  if (stripHadFocus) {
    chips[state.activeHit].focus();
  }

  els.hitToolbar.classList.toggle("hidden", steps.length <= 1);
  els.hitToolbar.classList.toggle("flex", steps.length > 1);
  els.moveLeft.disabled = state.activeHit === 0;
  els.moveRight.disabled = state.activeHit === steps.length - 1;
}

function describeHit(step, index, clearedAt, startProvisions) {
  const details = [];
  if (step.result.wallBefore > 0) {
    details.push(`${step.result.wallBefore}→${step.result.wallAfter}`);
  }
  details.push(describeDefenderLeft(step, index, clearedAt, startProvisions));
  return `#${index + 1} ${details.join(" · ")}`;
}

function describeDefenderLeft(step, index, clearedAt, startProvisions) {
  if (index === clearedAt) {
    return "cleared";
  }
  if (defenderProvisions(step.defenderBefore, units) === 0) {
    return "empty";
  }
  const provisionsLeft = defenderProvisions(step.defenderAfter, units);
  return `${Math.ceil(provisionsLeft / startProvisions * 100)}%`;
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
  handleFormChange();
}
