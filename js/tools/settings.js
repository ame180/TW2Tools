import { formatNumber } from "../lib/format.js";
import { CUSTOM_LIMIT, limitChoice, readLimit } from "../lib/provision-limit.js";
import { loadSettings, saveSettings } from "../lib/settings.js";

const els = {};

let tribeSkills = {};
let provisionLimits = [];

export const settingsTool = {
  id: "settings",
  title: "Settings",
  nav: false,
  init
};

function init(data) {
  tribeSkills = data.tribeSkills || {};
  provisionLimits = data.provisionLimits || [];

  els.section = document.getElementById("view-settings");
  els.weaponMastery = document.getElementById("settings-weapon-mastery");
  els.ironWall = document.getElementById("settings-iron-wall");
  els.grandmaster = document.getElementById("settings-grandmaster");
  els.medic = document.getElementById("settings-medic");
  els.medicus = document.getElementById("settings-medicus");
  els.provisionLimit = document.getElementById("settings-provision-limit");
  els.provisionLimitCustom = document.getElementById("settings-provision-limit-custom");

  populateSkillSelect(els.weaponMastery, tribeSkills.weaponMastery);
  populateSkillSelect(els.ironWall, tribeSkills.ironWall);
  populateLimitSelect(els.provisionLimit);

  const { battle } = loadSettings(tribeSkills);
  els.weaponMastery.value = String(battle.weaponMasteryLevel);
  els.ironWall.value = String(battle.ironWallLevel);
  els.grandmaster.checked = battle.grandmaster;
  els.medic.checked = battle.medic;
  els.medicus.checked = battle.medicus;
  const limit = limitChoice(battle.provisionLimit, provisionLimits);
  els.provisionLimit.value = limit;
  els.provisionLimitCustom.hidden = limit !== CUSTOM_LIMIT;
  els.provisionLimitCustom.value = limit === CUSTOM_LIMIT ? String(battle.provisionLimit) : "";

  // Runs before the section saves, so switching to Custom keeps the current limit.
  els.provisionLimit.addEventListener("change", () => {
    const isCustom = els.provisionLimit.value === CUSTOM_LIMIT;
    els.provisionLimitCustom.hidden = !isCustom;
    if (!isCustom) return;
    els.provisionLimitCustom.value = String(loadSettings(tribeSkills).battle.provisionLimit ?? "");
    els.provisionLimitCustom.focus();
  });
  els.provisionLimitCustom.addEventListener("change", () => {
    els.provisionLimitCustom.value = String(readLimit(CUSTOM_LIMIT, els.provisionLimitCustom.value) ?? "");
  });
  els.section.addEventListener("change", save);
}

function populateLimitSelect(select) {
  select.appendChild(new Option("No limit", ""));
  for (const { name, provisions } of provisionLimits) {
    select.appendChild(new Option(`${name} - ${formatNumber(provisions)}`, String(provisions)));
  }
  select.appendChild(new Option("Custom…", CUSTOM_LIMIT));
}

function populateSkillSelect(select, values = []) {
  for (let level = 0; level < values.length; level++) {
    select.appendChild(new Option(String(level), String(level)));
  }
}

function save() {
  saveSettings({
    battle: {
      weaponMasteryLevel: Number(els.weaponMastery.value),
      ironWallLevel: Number(els.ironWall.value),
      grandmaster: els.grandmaster.checked,
      medic: els.medic.checked,
      medicus: els.medicus.checked,
      provisionLimit: readLimit(els.provisionLimit.value, els.provisionLimitCustom.value)
    }
  });
}
