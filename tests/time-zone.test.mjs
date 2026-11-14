import test from "node:test";
import assert from "node:assert/strict";
import { SERVER_TIME_ZONE, wallClockParts, zonedTimeToMs, utcOffsetLabel } from "../js/lib/time-zone.js";
import { formatDateTime } from "../js/lib/format.js";

test("zonedTimeToMs reads server time as GMT in winter and BST in summer", () => {
  assert.equal(zonedTimeToMs("2026-11-14T20:00:00", SERVER_TIME_ZONE), Date.UTC(2026, 10, 14, 20, 0, 0));
  assert.equal(zonedTimeToMs("2026-07-01T20:00:00", SERVER_TIME_ZONE), Date.UTC(2026, 6, 1, 19, 0, 0));
});

test("zonedTimeToMs accepts a value without seconds", () => {
  assert.equal(zonedTimeToMs("2026-11-14T20:05", SERVER_TIME_ZONE), Date.UTC(2026, 10, 14, 20, 5, 0));
});

test("zonedTimeToMs uses the offset in force on each side of a DST change", () => {
  // UK clocks go forward at 01:00 GMT on 29.03.2026 and back at 01:00 GMT on 25.10.2026.
  assert.equal(zonedTimeToMs("2026-03-29T00:59:59", SERVER_TIME_ZONE), Date.UTC(2026, 2, 29, 0, 59, 59));
  assert.equal(zonedTimeToMs("2026-03-29T02:00:00", SERVER_TIME_ZONE), Date.UTC(2026, 2, 29, 1, 0, 0));
  assert.equal(zonedTimeToMs("2026-10-25T00:30:00", SERVER_TIME_ZONE), Date.UTC(2026, 9, 24, 23, 30, 0));
  assert.equal(zonedTimeToMs("2026-10-25T02:00:00", SERVER_TIME_ZONE), Date.UTC(2026, 9, 25, 2, 0, 0));
});

test("zonedTimeToMs works for other zones", () => {
  assert.equal(zonedTimeToMs("2026-11-14T21:00:00", "Europe/Warsaw"), Date.UTC(2026, 10, 14, 20, 0, 0));
  assert.equal(zonedTimeToMs("2026-11-14T15:00:00", "America/New_York"), Date.UTC(2026, 10, 14, 20, 0, 0));
});

test("zonedTimeToMs rejects anything that is not a datetime-local value", () => {
  for (const value of ["", "tomorrow", "2026-11-14", "2026-11-14 20:00", null, undefined]) {
    assert.equal(zonedTimeToMs(value, SERVER_TIME_ZONE), null, String(value));
  }
});

test("wallClockParts gives 24-hour fields in the zone", () => {
  assert.deepEqual(wallClockParts(new Date(Date.UTC(2026, 10, 14, 23, 30, 5)), "Europe/Warsaw"),
    { year: 2026, month: 11, day: 15, hour: 0, minute: 30, second: 5 });
});

test("formatDateTime renders the wall clock of the given zone", () => {
  const ms = Date.UTC(2026, 10, 14, 23, 0, 0);
  assert.equal(formatDateTime(new Date(ms), SERVER_TIME_ZONE), "14.11 23:00:00");
  assert.equal(formatDateTime(new Date(ms), "Europe/Warsaw"), "15.11 00:00:00");
});

test("utcOffsetLabel names the zone offset at that instant", () => {
  assert.equal(utcOffsetLabel(Date.UTC(2026, 10, 14), SERVER_TIME_ZONE), "UTC+0");
  assert.equal(utcOffsetLabel(Date.UTC(2026, 6, 1), SERVER_TIME_ZONE), "UTC+1");
  assert.equal(utcOffsetLabel(Date.UTC(2026, 10, 14), "Asia/Kolkata"), "UTC+5:30");
  assert.equal(utcOffsetLabel(Date.UTC(2026, 10, 14), "America/St_Johns"), "UTC-3:30");
});
