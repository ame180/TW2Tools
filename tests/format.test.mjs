import test from "node:test";
import assert from "node:assert/strict";
import { formatNumber, formatDuration, toNumber, toNonNegativeInt, clamp } from "../js/lib/format.js";

test("formatNumber rounds and groups thousands", () => {
  assert.equal(formatNumber(1234567.6), "1,234,568");
  assert.equal(formatNumber(0), "0");
});

test("formatDuration renders DD:HH:MM:SS", () => {
  assert.equal(formatDuration(0), "00:00:00:00");
  assert.equal(formatDuration(90061), "01:01:01:01");
  assert.equal(formatDuration(-5), "00:00:00:00");
});

test("toNumber falls back to 0 for non-numeric input", () => {
  assert.equal(toNumber("12.5"), 12.5);
  assert.equal(toNumber("abc"), 0);
  assert.equal(toNumber(undefined), 0);
});

test("toNonNegativeInt parses and applies fallback", () => {
  assert.equal(toNonNegativeInt("7"), 7);
  assert.equal(toNonNegativeInt("-3", 1), 1);
  assert.equal(toNonNegativeInt("junk", 4), 4);
});

test("clamp keeps value within bounds", () => {
  assert.equal(clamp(5, 1, 10), 5);
  assert.equal(clamp(-2, 1, 10), 1);
  assert.equal(clamp(99, 1, 10), 10);
});
