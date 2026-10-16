import { loadSettings, saveSettings } from "../lib/settings.js";

const els = {};

let tribeSkills = {};

export const settingsTool = {
  id: "settings",
  title: "Settings",
  nav: false,
  init
};

function init(data) {
  tribeSkills = data.tribeSkills || {};

  els.section = document.getElementById("view-settings");
  els.weaponMastery = document.getElementById("settings-weapon-mastery");
  els.ironWall = document.getElementById("settings-iron-wall");
  els.grandmaster = document.getElementById("settings-grandmaster");
  els.medic = document.getElementById("settings-medic");
  els.medicus = document.getElementById("settings-medicus");

  populateSkillSelect(els.weaponMastery, tribeSkills.weaponMastery);
  populateSkillSelect(els.ironWall, tribeSkills.ironWall);

  const { battle } = loadSettings(tribeSkills);
  els.weaponMastery.value = String(battle.weaponMasteryLevel);
  els.ironWall.value = String(battle.ironWallLevel);
  els.grandmaster.checked = battle.grandmaster;
  els.medic.checked = battle.medic;
  els.medicus.checked = battle.medicus;

  els.section.addEventListener("change", save);
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
      medicus: els.medicus.checked
    }
  });
}
