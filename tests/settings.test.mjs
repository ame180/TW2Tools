import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, parseSettings } from "../js/lib/settings.js";

const tribeSkills = { weaponMastery: [0, 2, 4, 6, 8, 10], ironWall: [0, 1, 2, 3, 4, 5] };

test("missing or corrupt storage yields defaults", () => {
  assert.deepEqual(parseSettings(null, tribeSkills), defaultSettings());
  assert.deepEqual(parseSettings("{not json", tribeSkills), defaultSettings());
  assert.deepEqual(parseSettings("42", tribeSkills), defaultSettings());
  assert.deepEqual(parseSettings('{"battle":"x"}', tribeSkills), defaultSettings());
});

test("valid stored battle settings are kept", () => {
  const stored = {
    battle: { weaponMasteryLevel: 5, ironWallLevel: 3, grandmaster: true, medic: true, medicus: false, provisionLimit: 25600 }
  };
  assert.deepEqual(parseSettings(JSON.stringify(stored), tribeSkills), stored);
});

test("each invalid field falls back to its default, valid fields are kept", () => {
  const stored = {
    battle: { weaponMasteryLevel: 6, ironWallLevel: 2, grandmaster: "yes", medic: 1, medicus: true, provisionLimit: 0 }
  };
  assert.deepEqual(parseSettings(JSON.stringify(stored), tribeSkills), {
    battle: { weaponMasteryLevel: 0, ironWallLevel: 2, grandmaster: false, medic: false, medicus: true, provisionLimit: null }
  });
});

test("levels must be non-negative integers within the tribe skill table", () => {
  for (const level of [-1, 1.5, "3", null]) {
    const stored = { battle: { weaponMasteryLevel: level, ironWallLevel: level } };
    const { battle } = parseSettings(JSON.stringify(stored), tribeSkills);
    assert.equal(battle.weaponMasteryLevel, 0);
    assert.equal(battle.ironWallLevel, 0);
  }
});

test("defaultSettings returns a fresh object each call", () => {
  const settings = defaultSettings();
  settings.battle.grandmaster = true;
  assert.equal(defaultSettings().battle.grandmaster, false);
});

test("settings saved before healing existed load with healing off", () => {
  const stored = { battle: { weaponMasteryLevel: 2, ironWallLevel: 1, grandmaster: true } };
  assert.deepEqual(parseSettings(JSON.stringify(stored), tribeSkills), {
    battle: { ...stored.battle, medic: false, medicus: false, provisionLimit: null }
  });
});

test("provisions limit must be a positive integer, anything else means no limit", () => {
  for (const limit of [-5, 1.5, "23200", true, null]) {
    const { battle } = parseSettings(JSON.stringify({ battle: { provisionLimit: limit } }), tribeSkills);
    assert.equal(battle.provisionLimit, null);
  }
  const { battle } = parseSettings(JSON.stringify({ battle: { provisionLimit: 19000 } }), tribeSkills);
  assert.equal(battle.provisionLimit, 19000);
});
