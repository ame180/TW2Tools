import { formatNumber, formatDuration, toNonNegativeInt, clamp } from "../lib/format.js";
import { UNIT_KEYS } from "../lib/battle.js";
import { simulateSequence, summarizeSequence, defenderProvisions, provisionBaselines } from "../lib/battle-sequence.js";
import { hasChanges } from "../lib/defender-changes.js";
import { recruitSummary } from "../lib/recruit.js";
import { subtractUnits } from "../lib/healing.js";
import {
  createInitialState, addHit, deleteHit, moveHit, selectHit, setActiveAttacker, setActiveDefenderChanges,
  toSequenceInput, toFormPaladins, NO_PALADIN, NO_WEAPON, DEFAULT_FAITH, INPUT_UNIT_KEYS
} from "../lib/battle-calc-state.js";
import { loadSettings } from "../lib/settings.js";

const els = {};

const WEAPON_LEVELS = [1, 2, 3];
const DISABLED_INPUT_CLASSES = "disabled:bg-slate-100 disabled:text-slate-500";
const HIT_CHIP_CLASSES = "whitespace-nowrap rounded border px-3 py-1 tabular-nums";
const ACTIVE_HIT_CHIP_CLASSES = `${HIT_CHIP_CLASSES} border-slate-800 bg-slate-800 text-white`;
const INACTIVE_HIT_CHIP_CLASSES = `${HIT_CHIP_CLASSES} border-slate-300 hover:bg-slate-100`;
const CHANGED_ROW_CLASS = "bg-amber-50";
const DEFENDER_ROWS = [["Units", ""], ["Losses", "text-red-700"]];
const ATTACKER_ROWS = [...DEFENDER_ROWS, ["Healed", "text-green-700"]];

let units = {};
let weapons = {};
let faithLevels = [];
let tribeSkills = {};
let recruitModifiers = {};
let healing = {};
let state = createInitialState();
const attackerUnitInputs = new Map();
const defenderUnitInputs = new Map();
const defenderChangeRows = new Map();
// Defender as carried into the active hit (form terms), before its changes; null on hit #1.
let carriedDefender = null;
let latestSteps = [];

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
  recruitModifiers = data.recruitModifiers || {};
  healing = data.healing || {};

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
  els.attackerCost = document.getElementById("battle-attacker-cost");
  els.defenderCost = document.getElementById("battle-defender-cost");
  els.attackerUnits = document.getElementById("battle-attacker-units");
  els.defenderUnits = document.getElementById("battle-defender-units");
  els.defenderUnitsHeader = document.getElementById("battle-defender-units-header");
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
  els.wallArrow = document.getElementById("battle-wall-arrow");
  els.wallOverride = document.getElementById("battle-wall-override");
  els.wallReset = document.getElementById("battle-wall-reset");
  els.wallHint = document.getElementById("battle-wall-hint");
  els.faithReset = document.getElementById("battle-faith-reset");
  els.faithHint = document.getElementById("battle-faith-hint");
  els.nightLabel = document.getElementById("battle-night-label");
  els.nightReset = document.getElementById("battle-night-reset");
  els.nightHint = document.getElementById("battle-night-hint");
  els.weaponMastery = document.getElementById("battle-weapon-mastery");
  els.ironWall = document.getElementById("battle-iron-wall");
  els.grandmaster = document.getElementById("battle-grandmaster");
  els.medic = document.getElementById("battle-medic");
  els.medicus = document.getElementById("battle-medicus");
  els.night = document.getElementById("battle-night");
  els.reset = document.getElementById("battle-reset");

  renderUnitInputs(els.attackerUnits, attackerUnitInputs);
  renderDefenderUnitRows();
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
  els.wallOverride.addEventListener("change", normalizeNumberInputs);
  els.addPaladin.addEventListener("click", () => {
    addDefenderPaladin({ kind: state.activeHit === 0 ? "start" : "arriving", paladin: { weapon: NO_WEAPON, level: 1 } });
    handleFormChange();
  });
  els.wallReset.addEventListener("click", () => {
    els.wallOverride.value = "";
    handleFormChange();
  });
  els.faithReset.addEventListener("click", () => {
    els.defenderFaith.value = String(carriedDefender.faith);
    handleFormChange();
  });
  els.nightReset.addEventListener("click", () => {
    els.night.checked = carriedDefender.night;
    handleFormChange();
  });
  els.addHit.addEventListener("click", () => updateState(addHit(state)));
  els.moveLeft.addEventListener("click", () => updateState(moveHit(state, state.activeHit, -1)));
  els.moveRight.addEventListener("click", () => updateState(moveHit(state, state.activeHit, 1)));
  els.deleteHit.addEventListener("click", () => {
    const carriedPaladinCount = latestSteps[state.activeHit].defenderCarried.paladins.length;
    updateState(deleteHit(state, state.activeHit, carriedPaladinCount));
  });
  els.reset.addEventListener("click", resetHits);

  state = createDefaultState();
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

// Each row: label, start or carried count, signed change (hit 2+), total (hit 2+), over-removal hint.
function renderDefenderUnitRows() {
  for (const unit of INPUT_UNIT_KEYS) {
    const name = units[unit]?.name || unit;
    const row = document.createElement("div");
    row.className = "rounded";

    const label = document.createElement("span");
    label.className = "truncate text-xs font-medium text-slate-600";
    label.textContent = name;
    label.title = name;

    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.min = "0";
    input.value = "0";
    input.setAttribute("aria-label", name);
    input.className = `w-full min-w-0 rounded border border-slate-300 px-2 py-1 ${DISABLED_INPUT_CLASSES}`;
    input.addEventListener("change", normalizeNumberInputs);

    const changeCell = document.createElement("span");
    changeCell.className = "flex min-w-0";
    const sign = document.createElement("button");
    sign.type = "button";
    sign.dataset.sign = "1";
    sign.className = "w-6 shrink-0 rounded-l border border-r-0 border-slate-300 bg-slate-100 font-bold";
    sign.addEventListener("click", () => {
      setSign(sign, -Number(sign.dataset.sign));
      handleFormChange();
    });
    const change = document.createElement("input");
    change.type = "number";
    change.inputMode = "numeric";
    change.min = "0";
    change.placeholder = "0";
    change.setAttribute("aria-label", `${name} change`);
    change.className = "change-input w-full min-w-0 rounded-r border border-slate-300 px-1 py-1 text-right";
    change.addEventListener("change", normalizeNumberInputs);
    changeCell.append(sign, change);

    const total = document.createElement("span");
    total.className = "text-right font-semibold tabular-nums";

    const hint = document.createElement("p");
    hint.className = "col-span-4 text-right text-[11px] text-red-700";
    hint.hidden = true;

    row.append(label, input, changeCell, total, hint);
    els.defenderUnits.appendChild(row);
    defenderUnitInputs.set(unit, input);
    defenderChangeRows.set(unit, { row, changeCell, sign, change, total, hint });
  }
}

// Carried values sit in narrow columns on hit 2+, so they lose most of their padding.
function setCarriedLayout(input, isCarried) {
  input.classList.toggle("px-2", !isCarried);
  input.classList.toggle("px-1", isCarried);
  input.classList.toggle("text-right", isCarried);
}

function setSign(signButton, sign) {
  signButton.dataset.sign = String(sign);
  signButton.textContent = sign < 0 ? "−" : "+";
  signButton.setAttribute("aria-label", sign < 0 ? "Change removes units" : "Change adds units");
}

function renderResultTables() {
  for (const [table, rows] of [[els.attackerResults, ATTACKER_ROWS], [els.defenderResults, DEFENDER_ROWS]]) {
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
    for (const [label, rowClass] of rows) {
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

// kind: "start" (hit #1), "carried" (slot of the carried list, swap or remove), "arriving" (joins before this hit).
function addDefenderPaladin({ kind, paladin, slot = null, removed = false }) {
  const row = document.createElement("div");
  row.dataset.kind = kind;
  if (slot !== null) row.dataset.slot = String(slot);

  const editor = document.createElement("div");
  editor.className = "flex items-center gap-1";
  row.appendChild(editor);

  const weaponSelect = document.createElement("select");
  weaponSelect.className = `min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 ${DISABLED_INPUT_CLASSES}`;
  weaponSelect.setAttribute("aria-label", "Weapon");
  weaponSelect.dataset.role = "weapon";
  populateWeaponSelect(weaponSelect, false);
  weaponSelect.value = paladin.weapon;

  const levelSelect = document.createElement("select");
  levelSelect.className = `rounded border border-slate-300 px-2 py-1 ${DISABLED_INPUT_CLASSES}`;
  levelSelect.dataset.role = "level";
  levelSelect.setAttribute("aria-label", "Weapon level");
  populateLevelSelect(levelSelect);
  levelSelect.value = String(paladin.level);

  if (kind === "arriving") {
    const tag = document.createElement("span");
    tag.className = "shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800";
    tag.textContent = "arriving";
    editor.appendChild(tag);
  }
  editor.append(weaponSelect, levelSelect);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.textContent = "×";
  removeButton.setAttribute("aria-label", "Remove paladin");
  removeButton.className = "rounded px-2 py-1 text-slate-500 hover:bg-slate-200";
  editor.appendChild(removeButton);

  if (kind !== "carried") {
    removeButton.addEventListener("click", () => {
      row.remove();
      handleFormChange();
    });
    els.defenderPaladins.appendChild(row);
    return;
  }

  const hint = document.createElement("p");
  hint.dataset.role = "hint";
  hint.className = "text-[11px] text-slate-500";
  hint.hidden = true;
  row.appendChild(hint);

  const removedView = document.createElement("div");
  removedView.className = "flex items-center gap-2 py-1";
  const removedText = document.createElement("span");
  removedText.className = "min-w-0 flex-1 truncate text-slate-500 line-through";
  removedText.textContent = describePaladin(carriedDefender.paladins[slot]);
  const removedTag = document.createElement("span");
  removedTag.className = "text-[11px] text-red-700";
  removedTag.textContent = "removed";
  const undoButton = document.createElement("button");
  undoButton.type = "button";
  undoButton.className = "text-xs underline";
  undoButton.textContent = "undo";
  removedView.append(removedText, removedTag, undoButton);
  row.appendChild(removedView);

  const setRemoved = (isRemoved) => {
    row.dataset.removed = String(isRemoved);
    editor.classList.toggle("hidden", isRemoved);
    editor.classList.toggle("flex", !isRemoved);
    removedView.classList.toggle("hidden", !isRemoved);
    removedView.classList.toggle("flex", isRemoved);
  };
  removeButton.addEventListener("click", () => {
    setRemoved(true);
    handleFormChange();
  });
  undoButton.addEventListener("click", () => {
    setRemoved(false);
    handleFormChange();
  });
  setRemoved(removed);
  els.defenderPaladins.appendChild(row);
}

function describePaladin(paladin) {
  const weapon = weapons[paladin.weapon];
  return weapon ? `${weapon.name || paladin.weapon} ${paladin.level}` : "No weapon";
}

function renderStartPaladins(paladins) {
  els.defenderPaladins.replaceChildren();
  for (const paladin of paladins) {
    addDefenderPaladin({ kind: "start", paladin });
  }
}

function renderChangedPaladins(changes) {
  els.defenderPaladins.replaceChildren();
  const { removed, swaps, arriving } = changes.paladins;
  carriedDefender.paladins.forEach((paladin, slot) => {
    addDefenderPaladin({ kind: "carried", paladin: swaps[slot] ?? paladin, slot, removed: removed.includes(slot) });
  });
  for (const paladin of arriving) {
    addDefenderPaladin({ kind: "arriving", paladin });
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

function readPaladinRow(row) {
  return {
    weapon: row.querySelector("[data-role=weapon]").value,
    level: Number(row.querySelector("[data-role=level]").value)
  };
}

function readDefenderPaladinRows() {
  return [...els.defenderPaladins.children].map(readPaladinRow);
}

function readPaladinChanges() {
  const removed = [];
  const swaps = {};
  const arriving = [];
  for (const row of els.defenderPaladins.children) {
    const paladin = readPaladinRow(row);
    if (row.dataset.kind === "arriving") {
      arriving.push(paladin);
      continue;
    }
    const slot = Number(row.dataset.slot);
    const carried = carriedDefender.paladins[slot];
    if (row.dataset.removed === "true") {
      removed.push(slot);
    } else if (paladin.weapon !== carried.weapon || paladin.level !== carried.level) {
      swaps[slot] = paladin;
    }
  }
  return { removed, swaps, arriving };
}

// Values equal to the carried ones are no change.
function readDefenderChanges() {
  const unitChanges = {};
  for (const [unit, { sign, change }] of defenderChangeRows) {
    const typed = Number.parseInt(change.value, 10);
    if (typed) unitChanges[unit] = typed * Number(sign.dataset.sign);
  }

  const wallText = els.wallOverride.value.trim();
  const wall = wallText === "" ? null : clamp(toNonNegativeInt(wallText, 0), 0, 20);
  const faith = Number(els.defenderFaith.value) || DEFAULT_FAITH;
  const night = els.night.checked;
  return {
    units: unitChanges,
    wall: wall === carriedDefender.wall ? null : wall,
    faith: faith === carriedDefender.faith ? null : faith,
    night: night === carriedDefender.night ? null : night,
    paladins: readPaladinChanges()
  };
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
    grandmaster: els.grandmaster.checked,
    medic: els.medic.checked,
    medicus: els.medicus.checked
  });

  const defender = { ...state.defender, ironWallLevel: Number(els.ironWall.value) };
  if (state.activeHit === 0) {
    defender.units = readUnitInputs(defenderUnitInputs);
    defender.wall = clamp(toNonNegativeInt(els.wall.value, 0), 0, 20);
    defender.paladins = readDefenderPaladinRows();
    defender.faith = Number(els.defenderFaith.value) || DEFAULT_FAITH;
    defender.night = els.night.checked;
  } else {
    state = setActiveDefenderChanges(state, readDefenderChanges());
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
  els.medic.checked = attacker.medic;
  els.medicus.checked = attacker.medicus;

  els.ironWall.value = String(state.defender.ironWallLevel);
}

// Form values are written only when the active hit changes, so typing is never overwritten. The carried defender
// cannot change while a hit stays active: it depends only on earlier hits and changes.
function renderDefenderPanel(step, includeStartValues) {
  const isFirstHit = state.activeHit === 0;
  if (includeStartValues) {
    carriedDefender = isFirstHit
      ? null
      : { ...step.defenderCarried, paladins: toFormPaladins(step.defenderCarried.paladins) };
    if (isFirstHit) writeStartDefender();
    else writeDefenderChanges(state.defenderChanges[state.activeHit]);
  }
  if (!isFirstHit) renderChangeMarkers(step);
}

function writeStartDefender() {
  const { defender } = state;
  els.defenderSource.textContent = "";
  els.defenderUnitsHeader.classList.add("hidden");
  els.defenderUnitsHeader.classList.remove("defender-change-grid");
  for (const [unit, { row, changeCell, total, hint }] of defenderChangeRows) {
    row.className = "grid grid-cols-2 items-center gap-x-3";
    changeCell.hidden = true;
    total.hidden = true;
    hint.hidden = true;
    defenderUnitInputs.get(unit).disabled = false;
    setCarriedLayout(defenderUnitInputs.get(unit), false);
  }
  writeUnitInputs(defenderUnitInputs, defender.units);

  els.wall.disabled = false;
  setCarriedLayout(els.wall, false);
  els.wall.value = String(defender.wall);
  els.wallArrow.hidden = true;
  els.wallOverride.hidden = true;
  els.wallReset.classList.add("hidden");
  els.wallHint.hidden = true;

  els.defenderFaith.value = String(defender.faith);
  els.defenderFaith.classList.remove(CHANGED_ROW_CLASS);
  els.faithReset.classList.add("hidden");
  els.faithHint.hidden = true;
  els.night.checked = defender.night;
  els.nightLabel.classList.remove(CHANGED_ROW_CLASS);
  els.nightReset.classList.add("hidden");
  els.nightHint.hidden = true;

  renderStartPaladins(defender.paladins);
}

function writeDefenderChanges(changes) {
  els.defenderSource.textContent = ` (from hit #${state.activeHit})`;
  els.defenderUnitsHeader.classList.remove("hidden");
  els.defenderUnitsHeader.classList.add("defender-change-grid");
  for (const [unit, { row, changeCell, sign, change, total }] of defenderChangeRows) {
    const delta = changes.units[unit] ?? 0;
    row.className = "defender-change-grid rounded px-1";
    changeCell.hidden = false;
    total.hidden = false;
    setSign(sign, delta < 0 ? -1 : 1);
    change.value = delta === 0 ? "" : String(Math.abs(delta));
    defenderUnitInputs.get(unit).disabled = true;
    setCarriedLayout(defenderUnitInputs.get(unit), true);
  }
  writeUnitInputs(defenderUnitInputs, carriedDefender.units);

  els.wall.disabled = true;
  setCarriedLayout(els.wall, true);
  els.wall.value = String(carriedDefender.wall);
  els.wallArrow.hidden = false;
  els.wallOverride.hidden = false;
  els.wallOverride.placeholder = String(carriedDefender.wall);
  els.wallOverride.value = changes.wall === null ? "" : String(changes.wall);

  els.defenderFaith.value = String(changes.faith ?? carriedDefender.faith);
  els.night.checked = changes.night ?? carriedDefender.night;

  renderChangedPaladins(changes);
}

// Totals, tints and hints that follow the active hit's changes on every render.
function renderChangeMarkers(step) {
  const changes = state.defenderChanges[state.activeHit];
  for (const [unit, { row, sign, total, hint }] of defenderChangeRows) {
    const delta = changes.units[unit] ?? 0;
    const carried = carriedDefender.units[unit] ?? 0;
    const overRemoved = carried + delta < 0;
    row.classList.toggle(CHANGED_ROW_CLASS, delta !== 0);
    sign.classList.toggle("text-green-700", delta > 0);
    sign.classList.toggle("text-red-700", delta < 0 || Number(sign.dataset.sign) < 0);
    sign.classList.toggle("text-slate-400", delta === 0 && Number(sign.dataset.sign) > 0);
    total.textContent = formatNumber(step.defenderBefore.units[unit]);
    total.classList.toggle("text-red-700", overRemoved);
    hint.hidden = !overRemoved;
    hint.textContent = `only ${formatNumber(carried)} present`;
  }

  const wallChanged = changes.wall !== null;
  els.wallOverride.classList.toggle(CHANGED_ROW_CLASS, wallChanged);
  els.wallReset.classList.toggle("hidden", !wallChanged);
  els.wallHint.hidden = !wallChanged;
  if (wallChanged) {
    els.wallHint.textContent = `${changes.wall > carriedDefender.wall ? "rebuilt" : "reduced"} from ${carriedDefender.wall}`;
  }

  const faithChanged = changes.faith !== null;
  els.defenderFaith.classList.toggle(CHANGED_ROW_CLASS, faithChanged);
  els.faithReset.classList.toggle("hidden", !faithChanged);
  els.faithHint.hidden = !faithChanged;
  els.faithHint.textContent = `was ${carriedDefender.faith}%`;

  const nightChanged = changes.night !== null;
  els.nightLabel.classList.toggle(CHANGED_ROW_CLASS, nightChanged);
  els.nightReset.classList.toggle("hidden", !nightChanged);
  els.nightHint.hidden = !nightChanged;
  els.nightHint.textContent = `was ${carriedDefender.night ? "on" : "off"}`;

  for (const row of els.defenderPaladins.children) {
    if (row.dataset.kind !== "carried") continue;
    const slot = Number(row.dataset.slot);
    const swapped = row.dataset.removed !== "true" && changes.paladins.swaps[slot] !== undefined;
    row.classList.toggle(CHANGED_ROW_CLASS, swapped);
    const hint = row.querySelector("[data-role=hint]");
    hint.hidden = !swapped;
    hint.textContent = `weapon swapped · was ${describePaladin(carriedDefender.paladins[slot])}`;
  }
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
  updateState(createDefaultState());
}

function createDefaultState() {
  return createInitialState(loadSettings(tribeSkills).battle);
}

function render({ includeDefenderStart = false } = {}) {
  const { luck, paladinWeapon } = state.hits[state.activeHit].attacker;
  els.luckValue.textContent = `${luck > 0 ? "+" : ""}${luck}%`;
  els.attackerWeaponLevel.disabled = !weapons[paladinWeapon];

  const steps = simulateSequence(toSequenceInput(state, { units, weapons, tribeSkills, healing }));
  latestSteps = steps;
  const activeStep = steps[state.activeHit];
  const { result } = activeStep;

  els.attackerModifier.textContent = formatModifier(result.attackerModifier);
  els.defenderModifier.textContent = formatModifier(result.defenderModifier);
  renderSide(els.attackerResults, result.attacker, activeStep);
  renderSide(els.defenderResults, result.defender);

  els.wallStages.hidden = result.wallBefore === 0;
  els.wallStages.textContent =
    `Wall: ${result.wallBefore} → ${result.wallAfterRams} → ${result.wallAfter}`;

  renderDefenderPanel(activeStep, includeDefenderStart);
  renderHitStrip(steps);
  renderLossCosts(steps, activeStep);
}

function renderLossCosts(steps, activeStep) {
  const { result } = activeStep;
  const totals = steps.length > 1 ? summarizeSequence(steps) : null;
  renderCostTable(
    els.attackerCost,
    subtractUnits(result.attacker.losses, activeStep.attackerHealed),
    totals && subtractUnits(totals.attackerLosses, totals.attackerHealed)
  );
  renderCostTable(els.defenderCost, result.defender.losses, totals?.defenderLosses);
}

function renderCostTable(table, hitLosses, totalLosses) {
  const summaries = [recruitSummary(hitLosses, units, recruitModifiers)];
  if (totalLosses) summaries.push(recruitSummary(totalLosses, units, recruitModifiers));

  const rows = [];
  if (totalLosses) {
    const headerRow = document.createElement("tr");
    headerRow.appendChild(createCell("th", ""));
    for (const label of ["This hit", "All hits"]) {
      headerRow.appendChild(createCell("th", label, "pl-4 py-1 text-right text-xs font-medium text-slate-500"));
    }
    rows.push(headerRow);
  }

  const lines = [
    ["Wood", "wood", formatNumber],
    ["Clay", "clay", formatNumber],
    ["Iron", "iron", formatNumber],
    ["Provisions", "provisions", formatNumber],
    ["Barracks", "barracksTime", formatDuration],
    ["Hall of Orders", "hallOfOrdersTime", formatDuration],
  ];
  for (const [label, key, format] of lines) {
    const row = document.createElement("tr");
    row.className = key === "barracksTime" ? "border-t border-slate-300" : "border-t border-slate-200";
    row.appendChild(createCell("th", label, "py-1 pr-2 text-left font-medium"));
    for (const summary of summaries) {
      row.appendChild(createCell("td", format(summary[key]), "pl-4 py-1 text-right tabular-nums"));
    }
    rows.push(row);
  }
  table.replaceChildren(...rows);
}

function renderSide(table, side, step) {
  const [unitsRow, lossesRow, healedRow] = table.tBodies[0].rows;
  for (const cell of unitsRow.querySelectorAll("td")) {
    cell.textContent = formatNumber(side.quantity[cell.dataset.unit]);
  }
  for (const cell of lossesRow.querySelectorAll("td")) {
    cell.textContent = formatNumber(side.losses[cell.dataset.unit]);
  }
  if (!healedRow) return;

  healedRow.hidden = step.healPercent === 0;
  for (const cell of healedRow.querySelectorAll("td")) {
    cell.textContent = formatNumber(step.attackerHealed[cell.dataset.unit]);
  }
}

function renderHitStrip(steps) {
  const baselines = provisionBaselines(steps, units);
  const stripHadFocus = els.hits.contains(document.activeElement);

  // Chips are reused while the hit count stays the same: replacing a chip between mousedown and mouseup (a typed
  // value committing on blur) would swallow the click.
  if (els.hits.children.length !== steps.length) {
    els.hits.replaceChildren(...steps.map((_, index) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.addEventListener("click", () => updateState(selectHit(state, index)));
      return chip;
    }));
  }
  const chips = [...els.hits.children];
  steps.forEach((step, index) => {
    const chip = chips[index];
    chip.textContent = describeHit(step, index, baselines[index]);
    if (hasChanges(state.defenderChanges[index])) {
      const badge = document.createElement("span");
      badge.className = "ml-1 rounded bg-amber-300 px-1 text-[10px] font-semibold text-amber-950";
      badge.textContent = "Δ";
      badge.title = "Defender changes before this hit";
      chip.appendChild(badge);
    }
    chip.className = index === state.activeHit ? ACTIVE_HIT_CHIP_CLASSES : INACTIVE_HIT_CHIP_CLASSES;
    chip.setAttribute("aria-pressed", String(index === state.activeHit));
  });
  if (stripHadFocus) {
    chips[state.activeHit].focus();
  }

  els.hitToolbar.classList.toggle("hidden", steps.length <= 1);
  els.hitToolbar.classList.toggle("flex", steps.length > 1);
  els.moveLeft.disabled = state.activeHit === 0;
  els.moveRight.disabled = state.activeHit === steps.length - 1;
}

function describeHit(step, index, baseline) {
  const details = [];
  if (step.result.wallBefore > 0) {
    details.push(`${step.result.wallBefore}→${step.result.wallAfter}`);
  }
  details.push(describeDefenderLeft(step, baseline));
  return `#${index + 1} ${details.join(" · ")}`;
}

// baseline: starting provisions plus everything that arrived so far, so support never pushes it past 100%.
function describeDefenderLeft(step, baseline) {
  if (defenderProvisions(step.defenderBefore, units) === 0) {
    return "empty";
  }
  const provisionsLeft = defenderProvisions(step.defenderAfter, units);
  if (provisionsLeft === 0) {
    return "cleared";
  }
  return `${Math.ceil(provisionsLeft * 100 / baseline)}%`;
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
  for (const { sign, change } of defenderChangeRows.values()) {
    const typed = Number.parseInt(change.value, 10);
    if (typed < 0) setSign(sign, -Number(sign.dataset.sign));
    change.value = typed ? String(Math.abs(typed)) : "";
  }
  if (els.wallOverride.value !== "") {
    els.wallOverride.value = String(clamp(toNonNegativeInt(els.wallOverride.value, 0), 0, 20));
  }
  handleFormChange();
}
