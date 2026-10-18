import test from "node:test";
import assert from "node:assert/strict";
import { CUSTOM_LIMIT, isProvisionLimit, limitChoice, readLimit } from "../js/lib/provision-limit.js";

const presets = [{ name: "Base", provisions: 23200 }, { name: "BH", provisions: 25600 }];

test("only positive safe integers are limits", () => {
  assert.equal(isProvisionLimit(23200), true);
  for (const value of [0, -1, 1.5, NaN, Infinity, "23200", null, undefined]) {
    assert.equal(isProvisionLimit(value), false);
  }
});

test("limit choice is empty for no limit, the preset value, or custom", () => {
  assert.equal(limitChoice(null, presets), "");
  assert.equal(limitChoice(25600, presets), "25600");
  assert.equal(limitChoice(24000, presets), CUSTOM_LIMIT);
  assert.equal(limitChoice(23200), CUSTOM_LIMIT);
});

test("reading the picker: presets ignore the custom field, custom parses it", () => {
  assert.equal(readLimit("", "500"), null);
  assert.equal(readLimit("23200", "500"), 23200);
  assert.equal(readLimit(CUSTOM_LIMIT, "24000"), 24000);
  assert.equal(readLimit(CUSTOM_LIMIT, " 24000 "), 24000);
  assert.equal(readLimit(CUSTOM_LIMIT, "1e5"), 100000);
});

test("empty, zero or invalid custom value means no limit", () => {
  for (const text of ["", "0", "-100", "12.5", "abc"]) {
    assert.equal(readLimit(CUSTOM_LIMIT, text), null);
  }
});
