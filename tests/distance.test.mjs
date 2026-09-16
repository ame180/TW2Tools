import test from "node:test";
import assert from "node:assert/strict";
import { actualDistance, secondsPerTile, travelTimeSeconds, parseCoordinates } from "../js/lib/distance.js";

test("distance is zero for identical coordinates", () => {
  assert.equal(actualDistance({ x: 500, y: 500 }, { x: 500, y: 500 }), 0);
});

test("distance on the same row is plain horizontal distance", () => {
  assert.equal(actualDistance({ x: 500, y: 500 }, { x: 510, y: 500 }), 10);
});

test("neighbouring tile across an odd row is exactly one field away", () => {
  assert.equal(actualDistance({ x: 500, y: 501 }, { x: 500, y: 500 }), 1);
  assert.equal(actualDistance({ x: 500, y: 500 }, { x: 500, y: 501 }), 1);
});

test("even row delta uses no half-tile correction", () => {
  const distance = actualDistance({ x: 500, y: 500 }, { x: 503, y: 504 });
  assert.equal(distance, Math.sqrt(3 * 3 + 4 * 4 * 0.75));
});

test("distance is symmetric", () => {
  const forward = actualDistance({ x: 480, y: 493 }, { x: 512, y: 508 });
  const backward = actualDistance({ x: 512, y: 508 }, { x: 480, y: 493 });
  assert.equal(forward, backward);
});

test("secondsPerTile converts minutes per tile and rounds to 2 decimals", () => {
  assert.equal(secondsPerTile(14), 840);
  assert.equal(secondsPerTile(8), 480);
  assert.equal(secondsPerTile(0.333), 19.98);
});

test("travelTimeSeconds combines distance and per-tile speed", () => {
  const seconds = travelTimeSeconds({ x: 500, y: 500 }, { x: 510, y: 500 }, 14);
  assert.equal(seconds, 8400);
});

test("parseCoordinates accepts common separators", () => {
  assert.deepEqual(parseCoordinates("500|500"), { x: 500, y: 500 });
  assert.deepEqual(parseCoordinates("500, 498"), { x: 500, y: 498 });
  assert.deepEqual(parseCoordinates("  512 507 "), { x: 512, y: 507 });
  assert.deepEqual(parseCoordinates("123 123"), { x: 123, y: 123 });
  assert.deepEqual(parseCoordinates("123, 123"), { x: 123, y: 123 });
  assert.deepEqual(parseCoordinates("123/ 123"), { x: 123, y: 123 });
  assert.deepEqual(parseCoordinates("(123|123)"), { x: 123, y: 123 });
  assert.deepEqual(parseCoordinates("(123 | 123)"), { x: 123, y: 123 });
  assert.deepEqual(parseCoordinates("village (455|521) K55"), { x: 455, y: 521 });
  assert.equal(parseCoordinates("junk"), null);
  assert.equal(parseCoordinates("500"), null);
  assert.equal(parseCoordinates(""), null);
});
