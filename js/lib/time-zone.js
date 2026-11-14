// Server time (ST) is UK time on every world: GMT in winter, BST in summer.
export const SERVER_TIME_ZONE = "Europe/London";

const formatters = new Map();

// Wall-clock fields of an instant in a time zone; `undefined` = the browser's own zone.
export function wallClockParts(date, timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }));
  }
  const parts = {};
  for (const { type, value } of formatters.get(timeZone).formatToParts(date)) {
    if (type !== "literal") {
      parts[type] = Number(value);
    }
  }
  return parts;
}

function zoneOffsetMs(ms, timeZone) {
  const parts = wallClockParts(new Date(ms), timeZone);
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// Reads a `datetime-local` value as a wall clock in `timeZone`. Returns null for anything else.
export function zonedTimeToMs(value, timeZone) {
  const match = WALL_CLOCK.exec(value ?? "");
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute, second = 0] = match.slice(1).map((part) => Number(part ?? 0));
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(wallAsUtc)) {
    return null;
  }
  // The offset is looked up twice so a wall clock near a DST change uses the offset in force at that moment.
  const guess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  return wallAsUtc - zoneOffsetMs(guess, timeZone);
}

// "UTC+1", "UTC-3:30", "UTC+0" for the zone's offset at that instant.
export function utcOffsetLabel(ms, timeZone) {
  const offsetMinutes = Math.round(zoneOffsetMs(ms, timeZone) / 60000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const hours = Math.floor(Math.abs(offsetMinutes) / 60);
  const minutes = Math.abs(offsetMinutes) % 60;
  return `UTC${sign}${hours}${minutes ? `:${String(minutes).padStart(2, "0")}` : ""}`;
}
