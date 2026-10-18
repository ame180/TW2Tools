import { formatNumber } from "../lib/format.js";
import { CUSTOM_LIMIT, limitChoice, readLimit } from "../lib/provision-limit.js";
import { loadSettings, saveSettings } from "../lib/settings.js";

const els = {};

let tribeSkills = {};
let provisionLimits = [];
let faithLevels = [];

export const settingsTool = {
  id: "settings",
  title: "Settings",
  nav: false,
  init
};

function init(data) {
  tribeSkills = data.tribeSkills || {};
  provisionLimits = data.provisionLimits || [];
  faithLevels = data.faithLevels || [];

  els.section = document.getElementById("view-settings");
  els.attackerFaith = document.getElementById("settings-attacker-faith");
  els.defenderFaith = document.getElementById("settings-defender-faith");
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
  populateFaithSelect(els.attackerFaith);
  populateFaithSelect(els.defenderFaith);

  const { battle } = loadSettings(tribeSkills, faithLevels);
  els.attackerFaith.value = String(battle.attackerFaith);
  els.defenderFaith.value = String(battle.defenderFaith);
  els.weaponMastery.value = String(battle.weaponMasteryLevel);
  els.ironWall.value = String(battle.ironWallLevel);
  els.grandmaster.checked = battle.grandmaster;
  els.medic.checked = battle.medic;
  els.medicus.checked = battle.medicus;
  const choice = limitChoice(battle.provisionLimit, provisionLimits);
  els.provisionLimit.value = choice;
  els.provisionLimitCustom.hidden = choice !== CUSTOM_LIMIT;
  els.provisionLimitCustom.value = choice === CUSTOM_LIMIT ? String(battle.provisionLimit) : "";

  // Runs before the section saves, so switching to Custom keeps the current limit.
  els.provisionLimit.addEventListener("change", () => {
    const isCustom = els.provisionLimit.value === CUSTOM_LIMIT;
    els.provisionLimitCustom.hidden = !isCustom;
    if (!isCustom) return;
    els.provisionLimitCustom.value = String(loadSettings(tribeSkills, faithLevels).battle.provisionLimit ?? "");
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

function populateFaithSelect(select) {
  for (const faith of faithLevels) {
    select.appendChild(new Option(`${faith}%`, String(faith)));
  }
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
      provisionLimit: readLimit(els.provisionLimit.value, els.provisionLimitCustom.value),
      attackerFaith: Number(els.attackerFaith.value),
      defenderFaith: Number(els.defenderFaith.value)
    }
  });
}
