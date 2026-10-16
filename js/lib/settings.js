// Persistent user settings, stored as one versioned localStorage entry.
// Invalid stored fields fall back to their defaults individually.

export const SETTINGS_KEY = "tw2tools.settings.v1";

export function defaultSettings() {
  return {
    battle: {
      weaponMasteryLevel: 0,
      ironWallLevel: 0,
      grandmaster: false,
      medic: false,
      medicus: false
    }
  };
}

function isSkillLevel(level, levels = []) {
  return Number.isInteger(level) && level >= 0 && level < levels.length;
}

export function parseSettings(json, tribeSkills = {}) {
  const settings = defaultSettings();

  let stored;
  try {
    stored = JSON.parse(json);
  } catch {
    return settings;
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
  return settings;
}

export function loadSettings(tribeSkills) {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY), tribeSkills);
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
