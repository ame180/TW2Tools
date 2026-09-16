import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateCrowns } from "../js/lib/crowns.js";

const data = JSON.parse(await readFile(new URL("../data.json", import.meta.url), "utf8"));
const instantFinish = data.instantFinish;

test("returns fixed price at or below fixed time threshold", () => {
  assert.equal(calculateCrowns(0, instantFinish), instantFinish.fixedCrowns);
  assert.equal(calculateCrowns(instantFinish.fixedTime, instantFinish), instantFinish.fixedCrowns);
});

test("matches known in-game price points", () => {
  assert.equal(calculateCrowns(150, instantFinish), 3);
  assert.equal(calculateCrowns(19800, instantFinish), 96);
  assert.equal(calculateCrowns(172800, instantFinish), 250);
});

test("returns exact range prices at range boundaries above the fixed threshold", () => {
  const { timeRange, crownRange, fixedTime } = instantFinish;
  for (let index = 0; index < timeRange.length; index += 1) {
    if (timeRange[index] <= fixedTime) {
      continue;
    }
    assert.equal(calculateCrowns(timeRange[index], instantFinish), crownRange[index]);
  }
});

test("is monotonically non-decreasing over time", () => {
  let previous = 0;
  for (let seconds = 0; seconds <= 300000; seconds += 777) {
    const crowns = calculateCrowns(seconds, instantFinish);
    assert.ok(crowns >= previous, `decreased at ${seconds}s: ${previous} -> ${crowns}`);
    previous = crowns;
  }
});

test("returns 0 without a pricing model", () => {
  assert.equal(calculateCrowns(1000, null), 0);
});
