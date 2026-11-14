import { actualDistance, travelTimeSeconds } from "./distance.js";
import { formatDateTime } from "./format.js";
import { SERVER_TIME_ZONE, utcOffsetLabel, wallClockParts, zonedTimeToMs } from "./time-zone.js";

// Attacks walk at the slowest unit's speed, so units sharing a speed are grouped under one class.
export const SPEED_CLASSES = [
  { id: "lc", label: "LC/MA", unit: "light_cavalry" },
  { id: "hc", label: "HC", unit: "heavy_cavalry" },
  { id: "axe", label: "Axe/Spear/Zerk", unit: "axe" },
  { id: "sword", label: "Sword", unit: "sword" },
  { id: "ram", label: "Ram/Cat", unit: "ram" },
  { id: "noble", label: "Noble", unit: "nobleman" },
  { id: "treb", label: "Treb", unit: "trebuchet" }
];

export const SPEED_LABELS = Object.fromEntries(SPEED_CLASSES.map((speedClass) => [speedClass.id, speedClass.label]));

export function minutesPerTileByClass(units) {
  const speeds = {};
  for (const speedClass of SPEED_CLASSES) {
    speeds[speedClass.id] = Number(units?.[speedClass.unit]?.speed) || 0;
  }
  return speeds;
}

// Coordinates sit at the end of the line, optionally in parentheses and followed by a continent tag:
// "Name (500|500)", "Name 500/500", "500, 500", "Name (500|500) K55". Map coordinates are always 3 digits.
const VILLAGE_LINE = /^(.*?)\(?\s*(?<!\d)(\d{3})\s*[|/,\s]\s*(\d{3})\s*\)?(?:\s*K\d{1,3})?\s*$/i;

export function parseVillageLine(rawLine) {
  const match = String(rawLine).trim().match(VILLAGE_LINE);
  if (!match) {
    return null;
  }

  const x = Number(match[2]);
  const y = Number(match[3]);
  if (!isCoordinate(x) || !isCoordinate(y)) {
    return null;
  }
  const key = `${x}|${y}`;
  const name = match[1].replace(/[\s(]+$/, "").trim();

  return { key, x, y, name: name || key };
}

export function targetsByDistance(source, targets) {
  return targets
    .map((village) => ({ village, distance: actualDistance(source, village) }))
    .sort((a, b) => a.distance - b.distance);
}

export function buildSendPlan({ attacks, sources, targets, landingMs, minutesPerTile }) {
  const sourcesByKey = new Map(sources.map((village) => [village.key, village]));
  const targetsByKey = new Map(targets.map((village) => [village.key, village]));
  const rows = [];

  for (const attack of attacks) {
    const source = sourcesByKey.get(attack.sourceKey);
    const target = targetsByKey.get(attack.targetKey);
    if (!source || !target) {
      continue;
    }

    const travelSeconds = travelTimeSeconds(source, target, minutesPerTile[attack.speedClassId]);
    const landsMs = landingMs + attack.offsetSeconds * 1000;
    rows.push({ attack, source, target, travelSeconds, landsMs, sendMs: landsMs - travelSeconds * 1000 });
  }

  return rows.sort((a, b) => a.sendMs - b.sendMs);
}

export function villageLabel(village) {
  return village.name === village.key ? village.key : `${village.name} (${village.key})`;
}

// Each time column shows server time or the browser's own clock.
export const TIME_ZONES = ["local", "server"];

// The plan's landing is a `datetime-local` value read as server time.
export function landingMsOf(landing) {
  return zonedTimeToMs(landing, SERVER_TIME_ZONE);
}

export function timeZoneOf(zone) {
  return zone === "server" ? SERVER_TIME_ZONE : undefined;
}

// "ST", or "local (UTC+1)" so readers in another zone can convert.
export function zoneLabel(zone, ms) {
  return zone === "server" ? "ST" : `local (${utcOffsetLabel(ms)})`;
}

function sameDay(aMs, bMs, timeZone) {
  const a = wallClockParts(new Date(aMs), timeZone);
  const b = wallClockParts(new Date(bMs), timeZone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

// One line per unsent attack, sorted by send time. Send times on the landing day drop the date.
export function formatPlanText(rows, landingMs, { sendZone, landsZone }) {
  const sendTimeZone = timeZoneOf(sendZone);
  const lines = [
    `Landing: ${formatDateTime(new Date(landingMs), timeZoneOf(landsZone))} ${zoneLabel(landsZone, landingMs)}`,
    `Send times: ${zoneLabel(sendZone, landingMs)}`,
    ""
  ];

  for (const { attack, source, target, sendMs } of rows) {
    if (attack.sent) {
      continue;
    }
    const sendText = formatDateTime(new Date(sendMs), sendTimeZone);
    const sendTime = sameDay(sendMs, landingMs, sendTimeZone) ? sendText.split(" ")[1] : sendText;
    const offset = attack.offsetSeconds ? ` ${attack.offsetSeconds > 0 ? "+" : ""}${attack.offsetSeconds}s` : "";
    const parts = [sendTime, `${villageLabel(source)} → ${villageLabel(target)}`, `${SPEED_LABELS[attack.speedClassId]}${offset}`];
    if (attack.note.trim()) {
      parts.push(attack.note.trim());
    }
    lines.push(parts.join("  "));
  }

  return lines.join("\n");
}

export const PLAN_KEY = "tw2tools.planner.v1";
const PLAN_VERSION = 1;
const DEFAULT_SPEED_CLASS_ID = "axe";

export function emptyPlan() {
  return {
    landing: "",
    sources: [],
    targets: [],
    attacks: [],
    activeSourceKey: null,
    lastSpeedClassId: DEFAULT_SPEED_CLASS_ID,
    lastTargetKey: null,
    nextAttackId: 1,
    sendZone: "local",
    landsZone: "server"
  };
}

// Same shape for localStorage and clipboard export; attack ids are rebuilt on parse.
export function serializePlan(plan) {
  return {
    version: PLAN_VERSION,
    landing: plan.landing,
    sources: plan.sources.map(({ name, x, y }) => ({ name, x, y })),
    targets: plan.targets.map(({ name, x, y }) => ({ name, x, y })),
    attacks: plan.attacks.map(({ sourceKey, targetKey, speedClassId, offsetSeconds, note, sent }) =>
      ({ sourceKey, targetKey, speedClassId, offsetSeconds, note, sent })),
    activeSourceKey: plan.activeSourceKey,
    lastSpeedClassId: plan.lastSpeedClassId,
    lastTargetKey: plan.lastTargetKey,
    sendZone: plan.sendZone,
    landsZone: plan.landsZone
  };
}

function isCoordinate(value) {
  return Number.isInteger(value) && value >= 100 && value <= 999;
}

function parseVillages(stored) {
  const villages = [];
  for (const entry of Array.isArray(stored) ? stored : []) {
    if (!isCoordinate(entry?.x) || !isCoordinate(entry?.y)) {
      continue;
    }
    const key = `${entry.x}|${entry.y}`;
    if (villages.some((village) => village.key === key)) {
      continue;
    }
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.trim() : key;
    villages.push({ key, x: entry.x, y: entry.y, name });
  }
  return villages;
}

// Returns null when the text is not a plan at all; otherwise drops invalid parts field by field.
export function parsePlan(json) {
  let stored;
  try {
    stored = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof stored !== "object" || stored === null || stored.version !== PLAN_VERSION) {
    return null;
  }

  const plan = emptyPlan();
  const speedClassIds = SPEED_CLASSES.map((speedClass) => speedClass.id);
  plan.landing = landingMsOf(stored.landing) === null ? "" : stored.landing;
  plan.sources = parseVillages(stored.sources);
  plan.targets = parseVillages(stored.targets);
  const hasSource = (key) => plan.sources.some((village) => village.key === key);
  const hasTarget = (key) => plan.targets.some((village) => village.key === key);

  for (const entry of Array.isArray(stored.attacks) ? stored.attacks : []) {
    if (!hasSource(entry?.sourceKey) || !hasTarget(entry.targetKey) || !speedClassIds.includes(entry.speedClassId)) {
      continue;
    }
    plan.attacks.push({
      id: plan.nextAttackId++,
      sourceKey: entry.sourceKey,
      targetKey: entry.targetKey,
      speedClassId: entry.speedClassId,
      offsetSeconds: Number.isFinite(entry.offsetSeconds) ? Math.trunc(entry.offsetSeconds) : 0,
      note: typeof entry.note === "string" ? entry.note : "",
      sent: entry.sent === true
    });
  }

  plan.activeSourceKey = hasSource(stored.activeSourceKey) ? stored.activeSourceKey : plan.sources[0]?.key ?? null;
  plan.lastTargetKey = hasTarget(stored.lastTargetKey) ? stored.lastTargetKey : null;
  if (speedClassIds.includes(stored.lastSpeedClassId)) {
    plan.lastSpeedClassId = stored.lastSpeedClassId;
  }
  if (TIME_ZONES.includes(stored.sendZone)) {
    plan.sendZone = stored.sendZone;
  }
  if (TIME_ZONES.includes(stored.landsZone)) {
    plan.landsZone = stored.landsZone;
  }
  return plan;
}

export function loadPlan() {
  try {
    return parsePlan(localStorage.getItem(PLAN_KEY)) ?? emptyPlan();
  } catch {
    return emptyPlan();
  }
}

export function savePlan(plan) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(serializePlan(plan)));
  } catch {
    // Storage unavailable (private mode, blocked site data); the plan stays for this page only.
  }
}
