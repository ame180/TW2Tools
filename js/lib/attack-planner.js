import { actualDistance, travelTimeSeconds } from "./distance.js";

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
