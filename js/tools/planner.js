import { formatDuration, formatDateTime } from "../lib/format.js";
import { travelTimeSeconds } from "../lib/distance.js";
import {
  SPEED_CLASSES,
  SPEED_LABELS,
  minutesPerTileByClass,
  parseVillageLine,
  targetsByDistance,
  buildSendPlan,
  villageLabel,
  formatPlanText,
  emptyPlan,
  serializePlan,
  parsePlan,
  loadPlan,
  savePlan
} from "../lib/attack-planner.js";

const KINDS = ["source", "target"];
const FLASH_MS = 1600;
const MAX_INPUT_ROWS = 6;
const CONFIRM_MS = 3000;
const IDLE_CLASSES = ["border-slate-400", "bg-white", "hover:bg-slate-100"];
const ARMED_CLASSES = ["border-red-600", "bg-red-600", "text-white", "hover:bg-red-700"];

const els = {};

const state = {
  ...emptyPlan(),
  minutesPerTile: {}
};
const buttonTimers = new Map();

export const plannerTool = {
  id: "planner",
  title: "Attack Planner",
  init
};

function init(data) {
  state.minutesPerTile = minutesPerTileByClass(data.units);

  els.section = document.getElementById("view-planner");
  els.landing = document.getElementById("planner-landing");
  els.attacks = document.getElementById("planner-attacks");
  els.plan = document.getElementById("planner-plan");
  els.countdown = document.getElementById("planner-countdown");
  for (const kind of KINDS) {
    els[kind] = {
      input: document.getElementById(`planner-${kind}-input`),
      error: document.getElementById(`planner-${kind}-error`),
      list: document.getElementById(`planner-${kind}-list`),
      count: document.getElementById(`planner-${kind}-count`)
    };
    bindVillageInput(kind);
    els[kind].list.addEventListener("click", (event) => handleVillageListClick(kind, event));
  }

  els.landing.addEventListener("input", () => {
    state.landing = els.landing.value;
    commit(renderPlan);
  });
  els.attacks.addEventListener("click", handleAttacksClick);
  els.attacks.addEventListener("change", handleAttacksChange);
  els.attacks.addEventListener("input", handleAttacksInput);
  els.plan.addEventListener("change", handlePlanChange);
  bindPlanActions();

  const plan = loadPlan();
  Object.assign(state, plan);
  els.landing.value = plan.landing;

  scheduleStatusTick();

  renderAll();
}

function villagesOf(kind) {
  return kind === "source" ? state.sources : state.targets;
}

function findVillage(list, key) {
  return list.find((village) => village.key === key);
}

function findAttack(id) {
  return state.attacks.find((attack) => attack.id === Number(id));
}

function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text) {
    node.textContent = text;
  }
  return node;
}

function bindVillageInput(kind) {
  const input = els[kind].input;

  const submit = () => {
    input.value = addVillageLines(kind, input.value.split(/\r?\n/)).join("\n");
    fitInputRows(input);
  };

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }
    event.preventDefault();
    submit();
  });

  input.addEventListener("input", (event) => {
    if (event.inputType === "insertFromPaste" && input.value.includes("\n")) {
      submit();
      return;
    }
    fitInputRows(input);
  });
}

function fitInputRows(input) {
  input.rows = Math.min(input.value.split("\n").length, MAX_INPUT_ROWS);
}

// Returns the lines that could not be parsed so they stay in the input for fixing.
function addVillageLines(kind, lines) {
  const list = villagesOf(kind);
  const rejected = [];
  const duplicates = [];
  const added = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    const village = parseVillageLine(line);
    if (!village) {
      rejected.push(line.trim());
      continue;
    }
    if (findVillage(list, village.key)) {
      duplicates.push(village.key);
      continue;
    }
    list.push(village);
    added.push(village.key);
  }

  const messages = [];
  if (rejected.length) {
    messages.push(`No X|Y coordinates in: ${rejected.join(" · ")}`);
  }
  if (duplicates.length) {
    messages.push(`Already listed: ${duplicates.join(", ")}`);
  }
  els[kind].error.textContent = messages.join(". ");

  if (kind === "source" && !state.activeSourceKey && state.sources.length) {
    state.activeSourceKey = state.sources[0].key;
  }

  commit();
  flashRows(kind, added);
  return rejected;
}

function flashRows(kind, keys) {
  const rows = keys
    .map((key) => els[kind].list.querySelector(`[data-key="${key}"]`))
    .filter(Boolean);
  if (!rows.length) {
    return;
  }

  rows.forEach((row) => row.classList.add("bg-amber-100"));
  rows[rows.length - 1].scrollIntoView({ block: "nearest" });
  setTimeout(() => rows.forEach((row) => row.classList.remove("bg-amber-100")), FLASH_MS);
}

function handleVillageListClick(kind, event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.remove) {
    removeVillage(kind, button.dataset.remove);
    return;
  }

  if (kind === "source" && button.dataset.select) {
    state.activeSourceKey = button.dataset.select;
    commit();
  }
}

function removeVillage(kind, key) {
  if (kind === "source") {
    state.sources = state.sources.filter((village) => village.key !== key);
    state.attacks = state.attacks.filter((attack) => attack.sourceKey !== key);
    if (state.activeSourceKey === key) {
      state.activeSourceKey = state.sources[0]?.key ?? null;
    }
  } else {
    state.targets = state.targets.filter((village) => village.key !== key);
    state.attacks = state.attacks.filter((attack) => attack.targetKey !== key);
    if (state.lastTargetKey === key) {
      state.lastTargetKey = null;
    }
  }
  commit();
}

function addAttack() {
  const targetKey = findVillage(state.targets, state.lastTargetKey) ? state.lastTargetKey : state.targets[0].key;
  state.attacks.push({
    id: state.nextAttackId++,
    sourceKey: state.activeSourceKey,
    targetKey,
    speedClassId: state.lastSpeedClassId,
    offsetSeconds: 0,
    note: "",
    sent: false
  });
  state.lastTargetKey = targetKey;
  commit();
}

function handleAttacksClick(event) {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  if (button.dataset.action === "add-attack") {
    addAttack();
    return;
  }

  if (button.dataset.deleteAttack) {
    state.attacks = state.attacks.filter((attack) => attack.id !== Number(button.dataset.deleteAttack));
    commit();
  }
}

function handleAttacksChange(event) {
  const field = event.target;

  if (field.dataset.speed) {
    findAttack(field.dataset.speed).speedClassId = field.value;
    state.lastSpeedClassId = field.value;
    commit();
    return;
  }

  if (field.dataset.target) {
    findAttack(field.dataset.target).targetKey = field.value;
    state.lastTargetKey = field.value;
    commit();
  }
}

function handleAttacksInput(event) {
  const field = event.target;

  if (field.dataset.offset) {
    const offsetSeconds = Math.trunc(Number(field.value));
    findAttack(field.dataset.offset).offsetSeconds = Number.isFinite(offsetSeconds) ? offsetSeconds : 0;
    commit(renderPlan);
    return;
  }

  if (field.dataset.note) {
    findAttack(field.dataset.note).note = field.value;
    commit(renderPlan);
  }
}

function handlePlanChange(event) {
  const checkbox = event.target;
  if (!checkbox.dataset.sent) {
    return;
  }
  findAttack(checkbox.dataset.sent).sent = checkbox.checked;
  commit(renderPlan);
}

function commit(render = renderAll) {
  render();
  savePlan(state);
}

function applyPlan(plan) {
  Object.assign(state, plan);
  els.landing.value = plan.landing;
  for (const kind of KINDS) {
    els[kind].error.textContent = "";
  }
  commit();
}

function bindPlanActions() {
  els.importBox = document.getElementById("planner-import");
  els.importText = document.getElementById("planner-import-text");
  els.importError = document.getElementById("planner-import-error");

  const exportButton = document.getElementById("planner-export");
  exportButton.addEventListener("click", () =>
    copyText(exportButton, JSON.stringify(serializePlan(state)))
  );

  const copyButton = document.getElementById("planner-copy-text");
  copyButton.addEventListener("click", () => {
    const rows = currentSendPlan();
    if (!rows) {
      flashLabel(copyButton, "Nothing to copy");
      return;
    }
    copyText(copyButton, formatPlanText(rows, landingMs()));
  });

  document.getElementById("planner-import-open").addEventListener("click", () => {
    els.importBox.classList.remove("hidden");
    els.importText.focus();
  });
  document.getElementById("planner-import-cancel").addEventListener("click", closeImport);

  const replaceButton = document.getElementById("planner-import-replace");
  replaceButton.addEventListener("click", () => {
    const plan = parsePlan(els.importText.value);
    if (!plan) {
      els.importError.textContent = "Not an exported plan.";
      return;
    }
    els.importError.textContent = "";
    confirmClick(replaceButton, () => {
      applyPlan(plan);
      closeImport();
    });
  });

  const clearAttacksButton = document.getElementById("planner-clear-attacks");
  clearAttacksButton.addEventListener("click", () => confirmClick(clearAttacksButton, () => {
    state.attacks = [];
    state.nextAttackId = 1;
    commit();
  }));

  const clearPlanButton = document.getElementById("planner-clear-plan");
  clearPlanButton.addEventListener("click", () => confirmClick(clearPlanButton, () => applyPlan(emptyPlan())));
}

function closeImport() {
  els.importBox.classList.add("hidden");
  els.importText.value = "";
  els.importError.textContent = "";
}

function copyText(button, text) {
  navigator.clipboard.writeText(text).then(
    () => flashLabel(button, "Copied"),
    () => flashLabel(button, "Copy failed")
  );
}

function flashLabel(button, text) {
  button.dataset.label ??= button.textContent;
  button.textContent = text;
  clearTimeout(buttonTimers.get(button));
  buttonTimers.set(button, setTimeout(() => {
    button.textContent = button.dataset.label;
    delete button.dataset.label;
  }, FLASH_MS));
}

// Destructive actions run on the second click within CONFIRM_MS.
function confirmClick(button, action) {
  clearTimeout(buttonTimers.get(button));
  if (button.dataset.armed) {
    disarm(button);
    action();
    return;
  }

  button.dataset.armed = button.textContent;
  button.textContent = "Click again to confirm";
  button.classList.remove(...IDLE_CLASSES);
  button.classList.add(...ARMED_CLASSES);
  buttonTimers.set(button, setTimeout(() => disarm(button), CONFIRM_MS));
}

function disarm(button) {
  button.textContent = button.dataset.armed;
  button.classList.remove(...ARMED_CLASSES);
  button.classList.add(...IDLE_CLASSES);
  delete button.dataset.armed;
}

function renderAll() {
  for (const kind of KINDS) {
    renderVillageList(kind);
  }
  renderAttacks();
  renderPlan();
}

function renderVillageList(kind) {
  const list = villagesOf(kind);
  const { list: listEl, count } = els[kind];
  count.textContent = list.length ? `(${list.length})` : "";
  listEl.innerHTML = "";

  if (!list.length) {
    listEl.appendChild(element("li", "text-xs text-slate-500", "No villages yet."));
    return;
  }

  for (const village of list) {
    const attackCount = state.attacks.filter((attack) =>
      (kind === "source" ? attack.sourceKey : attack.targetKey) === village.key
    ).length;
    const isActive = kind === "source" && village.key === state.activeSourceKey;
    const mutedClass = isActive ? "text-slate-300" : "text-slate-500";

    const row = element("li", "flex items-center gap-1 rounded border transition-colors duration-1000");
    row.dataset.key = village.key;
    row.classList.add(...(isActive ? ["border-slate-900", "bg-slate-900", "text-white"] : ["border-slate-200"]));
    if (kind === "source" && !isActive) {
      row.classList.add("hover:bg-slate-100");
    }

    const select = element("button", "flex min-w-0 flex-1 items-baseline gap-2 px-2 py-1 text-left");
    select.type = "button";
    select.dataset.select = village.key;
    select.classList.add(kind === "source" ? "cursor-pointer" : "cursor-default");
    select.appendChild(element("span", "truncate", village.name));
    select.appendChild(element("span", `shrink-0 font-mono text-xs ${mutedClass}`, village.key));
    if (attackCount) {
      select.appendChild(element("span", `ml-auto shrink-0 text-xs ${mutedClass}`, `${attackCount} ${kind === "source" ? "out" : "in"}`));
    }

    const remove = element("button", `px-2 py-1 ${isActive ? "text-slate-300 hover:text-white" : "text-slate-400 hover:text-red-700"}`);
    remove.type = "button";
    remove.dataset.remove = village.key;
    remove.setAttribute("aria-label", `Remove ${village.name}`);
    remove.innerHTML = "&times;";

    row.append(select, remove);
    listEl.appendChild(row);
  }
}

function renderAttacks() {
  els.attacks.innerHTML = "";
  const source = findVillage(state.sources, state.activeSourceKey);
  if (!source) {
    els.attacks.appendChild(element("p", "text-sm text-slate-500", "Add your villages, then pick one to plan its attacks."));
    return;
  }

  const header = element("div", "mb-2 flex flex-wrap items-center justify-between gap-2");
  header.appendChild(element("h3", "font-semibold", `Attacks from ${villageLabel(source)}`));
  const addButton = element("button", "rounded border border-slate-400 bg-white px-3 py-1 text-sm font-medium hover:bg-slate-100 disabled:opacity-40", "+ Attack");
  addButton.type = "button";
  addButton.dataset.action = "add-attack";
  addButton.disabled = !state.targets.length;
  header.appendChild(addButton);
  els.attacks.appendChild(header);

  const attacks = state.attacks.filter((attack) => attack.sourceKey === source.key);
  if (!attacks.length) {
    els.attacks.appendChild(element("p", "text-sm text-slate-500", state.targets.length ? "No attacks yet." : "Add targets first."));
    return;
  }

  const sortedTargets = targetsByDistance(source, state.targets);
  const wrapper = element("div", "overflow-x-auto");
  const table = element("table", "text-sm");
  const head = element("tr", "text-left text-xs text-slate-500");
  for (const headerText of ["Target · Tiles", "Speed — Travel Time", "Offset (s)", "Note", ""]) {
    head.appendChild(element("th", "pb-1 pr-2 font-medium", headerText));
  }
  table.appendChild(head);

  for (const attack of attacks) {
    const target = findVillage(state.targets, attack.targetKey);
    const row = element("tr", "border-b border-slate-200 last:border-0");

    const targetSelect = element("select", "max-w-[16rem] rounded border border-slate-300 bg-white px-2 py-1");
    targetSelect.dataset.target = attack.id;
    for (const { village, distance } of sortedTargets) {
      const option = element("option", "", `${villageLabel(village)} · ${distance.toFixed(1)}`);
      option.value = village.key;
      option.selected = village.key === attack.targetKey;
      targetSelect.appendChild(option);
    }

    const speedSelect = element("select", "rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs");
    speedSelect.dataset.speed = attack.id;
    for (const speedClass of SPEED_CLASSES) {
      const seconds = travelTimeSeconds(source, target, state.minutesPerTile[speedClass.id]);
      const option = element("option", "", `${speedClass.label} — ${formatDuration(seconds)}`);
      option.value = speedClass.id;
      option.selected = speedClass.id === attack.speedClassId;
      speedSelect.appendChild(option);
    }

    const offset = element("input", "w-20 rounded border border-slate-300 px-2 py-1");
    offset.type = "number";
    offset.step = "1";
    offset.value = attack.offsetSeconds;
    offset.dataset.offset = attack.id;
    offset.setAttribute("aria-label", "Landing offset in seconds");

    const note = element("input", "w-40 rounded border border-slate-300 px-2 py-1");
    note.type = "text";
    note.value = attack.note;
    note.placeholder = "full nuke, fake…";
    note.dataset.note = attack.id;

    const remove = element("button", "px-2 text-slate-400 hover:text-red-700");
    remove.type = "button";
    remove.dataset.deleteAttack = attack.id;
    remove.setAttribute("aria-label", "Delete attack");
    remove.innerHTML = "&times;";

    for (const control of [targetSelect, speedSelect, offset, note, remove]) {
      const cell = element("td", "py-1 pr-2");
      cell.appendChild(control);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }

  wrapper.appendChild(table);
  els.attacks.appendChild(wrapper);
}

function landingMs() {
  if (!state.landing) {
    return null;
  }
  const time = new Date(state.landing).getTime();
  return Number.isFinite(time) ? time : null;
}

function currentSendPlan() {
  const landing = landingMs();
  if (landing === null || !state.attacks.length) {
    return null;
  }
  return buildSendPlan({
    attacks: state.attacks,
    sources: state.sources,
    targets: state.targets,
    landingMs: landing,
    minutesPerTile: state.minutesPerTile
  });
}

function renderPlan() {
  els.plan.innerHTML = "";
  const landing = landingMs();

  if (landing === null || !state.attacks.length) {
    const row = element("tr");
    const cell = element("td", "py-3 text-slate-500", landing === null ? "Set a landing time to see when to send." : "No attacks yet.");
    cell.colSpan = 8;
    row.appendChild(cell);
    els.plan.appendChild(row);
    els.countdown.textContent = "";
    return;
  }

  const rows = currentSendPlan();
  for (const { attack, source, target, travelSeconds, landsMs, sendMs } of rows) {
    const row = element("tr", "border-b border-slate-200");
    row.dataset.sendMs = sendMs;
    row.dataset.sent = attack.sent ? "1" : "";
    row.dataset.label = `${source.name} → ${target.name}`;

    const sendCell = element("td", "py-1 pr-3 whitespace-nowrap font-semibold", formatDateTime(new Date(sendMs)));
    const missedBadge = element("span", "ml-1 rounded bg-red-100 px-1 text-xs font-medium", "missed");
    missedBadge.dataset.missed = "";
    sendCell.appendChild(missedBadge);

    const landsCell = element("td", "py-1 pr-3 whitespace-nowrap", formatDateTime(new Date(landsMs)));
    if (attack.offsetSeconds) {
      const sign = attack.offsetSeconds > 0 ? "+" : "";
      landsCell.appendChild(element("span", "ml-1 text-xs text-slate-500", `(${sign}${attack.offsetSeconds}s)`));
    }

    const sentCell = element("td", "py-1");
    const checkbox = element("input", "h-4 w-4");
    checkbox.type = "checkbox";
    checkbox.checked = attack.sent;
    checkbox.dataset.sent = attack.id;
    checkbox.setAttribute("aria-label", "Mark as sent");
    sentCell.appendChild(checkbox);

    row.append(
      sendCell,
      element("td", "py-1 pr-3", villageLabel(source)),
      element("td", "py-1 pr-3", villageLabel(target)),
      element("td", "py-1 pr-3 whitespace-nowrap", SPEED_LABELS[attack.speedClassId]),
      element("td", "py-1 pr-3 whitespace-nowrap font-mono text-xs", formatDuration(travelSeconds)),
      landsCell,
      element("td", "py-1 pr-3", attack.note),
      sentCell
    );
    els.plan.appendChild(row);
  }

  refreshPlanStatus();
}

// Ticks on wall-clock second boundaries: send times are whole seconds, so the countdown never lags.
function scheduleStatusTick() {
  setTimeout(() => {
    if (!els.section.classList.contains("hidden")) {
      refreshPlanStatus();
    }
    scheduleStatusTick();
  }, 1000 - (Date.now() % 1000));
}

// Only toggles classes so clicks on the plan rows are never lost to a re-render.
function refreshPlanStatus() {
  const now = Date.now();
  let next = null;

  for (const row of els.plan.querySelectorAll("tr[data-send-ms]")) {
    const sendMs = Number(row.dataset.sendMs);
    const isSent = Boolean(row.dataset.sent);
    const isMissed = !isSent && sendMs < now;

    row.classList.toggle("text-slate-400", isSent);
    row.classList.toggle("line-through", isSent);
    row.classList.toggle("bg-red-50", isMissed);
    row.classList.toggle("text-red-700", isMissed);
    row.querySelector("[data-missed]").hidden = !isMissed;

    if (!isSent && !isMissed && !next) {
      next = { sendMs, label: row.dataset.label };
    }
  }

  if (!next) {
    els.countdown.textContent = els.plan.querySelector("tr[data-send-ms]") ? "No upcoming sends." : "";
    return;
  }

  els.countdown.textContent = "Next send in ";
  els.countdown.appendChild(element("span", "font-semibold", formatDuration(Math.ceil((next.sendMs - now) / 1000))));
  els.countdown.append(` · ${next.label}`);
}
