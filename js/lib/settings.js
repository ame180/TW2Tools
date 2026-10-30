// Persistent user settings, stored as one versioned localStorage entry.
// Invalid stored fields fall back to their defaults individually.

import { isProvisionLimit } from "./provision-limit.js";
import { DEFAULT_BATTLE_OPTIONS } from "./battle-calc-state.js";

export const SETTINGS_KEY = "tw2tools.settings.v1";
export const THEMES = ["system", "light", "dark"];

export function defaultSettings() {
  return { appearance: { theme: "system" }, battle: { ...DEFAULT_BATTLE_OPTIONS } };
}

function isSkillLevel(level, levels = []) {
  return Number.isInteger(level) && level >= 0 && level < levels.length;
}

export function parseSettings(json, tribeSkills = {}, faithLevels = []) {
  const settings = defaultSettings();

  let stored;
  try {
    stored = JSON.parse(json);
  } catch {
    return settings;
  }

  if (THEMES.includes(stored?.appearance?.theme)) {
    settings.appearance.theme = stored.appearance.theme;
  }

  const battle = stored?.battle;
  if (typeof battle !== "object" || battle === null) {
    return settings;
  }

  if (isSkillLevel(battle.weaponMasteryLevel, tribeSkills.weaponMastery)) {
    settings.battle.weaponMasteryLevel = battle.weaponMasteryLevel;
  }
  if (isSkillLevel(battle.ironWallLevel, tribeSkills.ironWall)) {
    settings.battle.ironWallLevel = battle.ironWallLevel;
  }
  for (const flag of ["grandmaster", "medic", "medicus"]) {
    if (typeof battle[flag] === "boolean") {
      settings.battle[flag] = battle[flag];
    }
  }
  if (isProvisionLimit(battle.provisionLimit)) {
    settings.battle.provisionLimit = battle.provisionLimit;
  }
  for (const field of ["attackerFaith", "defenderFaith"]) {
    if (faithLevels.includes(battle[field])) {
      settings.battle[field] = battle[field];
    }
  }
  return settings;
}

export function loadSettings(tribeSkills, faithLevels) {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY), tribeSkills, faithLevels);
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode, blocked site data); settings stay in effect for this page only.
  }
}
