import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { zerkBonusStatus } from "../js/lib/zerk-bonus.js";
import { simulate } from "../js/lib/battle.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));

function status(attackerFood, defenderFood, berserkers = 920, attackerEmpty = attackerFood === 0) {
  return zerkBonusStatus({
    attackerFood, defenderFood, berserkers, attackerEmpty, maxAttackProvisions: data.maxAttackProvisions, unitStats: data.units,
  });
}

test("bonus off: attacker cut to trigger, defender room to stay safe", () => {
  const { boosted, attacker, defender } = status(22094, 42000);
  assert.equal(boosted, false);
  assert.deepEqual(attacker, { tone: "off", title: "Zerk bonus off", detail: "−1,095 prov to trigger", hint: "≈ 183 Zerk" });
  assert.deepEqual(defender, { tone: "off", title: "Zerk bonus off", detail: "+2,188 prov room", hint: "≈ 2,188 Sw" });
});

test("bonus on: attacker room to keep it, defender cut to cancel", () => {
  const { boosted, attacker, defender } = status(22094, 46000);
  assert.equal(boosted, true);
  assert.deepEqual(attacker, { tone: "on", title: "Zerk bonus on", detail: "+905 prov room", hint: "≈ 150 Zerk" });
  assert.deepEqual(defender, { tone: "on", title: "Zerk bonus on", detail: "−1,812 prov to cancel", hint: "≈ 1,812 Sw" });
});

test("exactly twice the attacker is still off", () => {
  const { boosted, attacker, defender } = status(21000, 42000);
  assert.equal(boosted, false);
  assert.equal(attacker.detail, "−1 prov to trigger");
  assert.equal(defender.detail, "+0 prov room");
  assert.equal(defender.hint, "1 more triggers it");
});

test("one over twice the attacker is on with no attacker room", () => {
  const { attacker, defender } = status(21000, 42001);
  assert.equal(attacker.detail, "+0 prov room");
  assert.equal(attacker.hint, "1 more loses it");
  assert.equal(defender.detail, "−1 prov to cancel");
});

test("empty attacker gives the largest attack that still gets the bonus", () => {
  const { attacker, defender } = status(0, 42000, 0);
  assert.deepEqual(attacker, { tone: "on", title: "Zerk bonus on", detail: "Up to 20,999 prov", hint: "≈ 3,499 Zerk" });
  assert.equal(defender.detail, "vs attacks up to 20,999 prov");
});

test("attack without berserkers is muted", () => {
  const { boosted, attacker, defender } = status(22099, 42000, 0);
  assert.equal(boosted, false);
  assert.equal(attacker.tone, "muted");
  assert.equal(attacker.detail, "No zerks in attack");
  assert.equal(defender.tone, "muted");
});

test("defender over twice the max attack is always on", () => {
  const { boosted, attacker, defender } = status(22094, 57601);
  assert.equal(boosted, true);
  assert.deepEqual(attacker, { tone: "on", title: "Zerk bonus always on", detail: "Defender over 2 × 28,800 max attack" });
  assert.deepEqual(defender, attacker);
  assert.equal(status(22094, 57600).attacker.title, "Zerk bonus on");
  assert.equal(status(22099, 200000, 0).attacker.tone, "muted");
});

test("both sides empty is muted", () => {
  const { attacker } = status(0, 0, 0);
  assert.equal(attacker.tone, "muted");
  assert.equal(attacker.detail, "Add troops to see it");
});

test("engine reports the food it compares, without rams cancelled by trebuchets", () => {
  const result = simulate({
    unitStats: data.units, weaponData: data.weapons,
    attackerUnits: { axe: 100, ram: 30, berserker: 10 }, defenderUnits: { spear: 500, trebuchet: 20 },
  });
  assert.deepEqual(result.berserkerFood, { attacker: 100 + 10 * 5 + 10 * 6, defender: 500 + 20 * 10 });
});

test("attack over the max size falls back to the real comparison", () => {
  const { boosted, attacker } = status(30000, 58000);
  assert.equal(boosted, false);
  assert.equal(attacker.title, "Zerk bonus off");
});

test("rams all cancelled by trebuchets is not an empty attack", () => {
  const { attacker } = status(0, 42000, 0, false);
  assert.equal(attacker.detail, "No zerks in attack");
});

test("room smaller than one berserker drops the zerk hint", () => {
  assert.equal(status(21000, 42005).attacker.hint, "");
});
