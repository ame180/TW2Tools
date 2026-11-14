import { wallClockParts } from "./time-zone.js";

export function formatNumber(value) {
  return Math.round(value).toLocaleString("en-US");
}

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [days, hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function toNonNegativeInt(value, fallback = 0) {
  const numeric = Number.parseInt(value, 10);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return numeric;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// DD.MM HH:MM:SS as the wall clock in `timeZone`; `undefined` = the browser's own zone.
export function formatDateTime(date, timeZone) {
  const parts = wallClockParts(date, timeZone);
  const pad = (part) => String(part).padStart(2, "0");
  return `${pad(parts.day)}.${pad(parts.month)} ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}
