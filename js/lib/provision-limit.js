// Village provisions limit for an attacker: a positive integer, or null for no limit.
// The limit picker is a select of presets plus a custom number field.

export const CUSTOM_LIMIT = "custom";

export function isProvisionLimit(value) {
  return Number.isSafeInteger(value) && value > 0;
}

// Select value for a limit: "" for no limit, the matching preset, or CUSTOM_LIMIT.
export function limitChoice(limit, presets = []) {
  if (limit === null) return "";
  return presets.some((preset) => preset.provisions === limit) ? String(limit) : CUSTOM_LIMIT;
}

// An empty, zero or invalid custom value means no limit.
export function readLimit(choice, customText) {
  const value = choice === CUSTOM_LIMIT ? Number.parseInt(customText, 10) : Number(choice);
  return isProvisionLimit(value) ? value : null;
}
