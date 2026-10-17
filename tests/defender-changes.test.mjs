import test from "node:test";
import assert from "node:assert/strict";
import { emptyChanges, hasChanges, applyChanges, mergeChanges } from "../js/lib/defender-changes.js";

const HALBERD = { id: "halberd", level: 3 };
const LONGSWORD = { id: "longsword", level: 3 };
const BOW = { id: "bow", level: 2 };
const AXE = { id: "axe", level: 1 };

function defender(overrides) {
  return { units: { spear: 1000, sword: 300 }, paladins: [], wall: 12, faith: 100, night: false, ...overrides };
}

function changes(overrides = {}) {
  const base = emptyChanges();
  return { ...base, ...overrides, paladins: { ...base.paladins, ...overrides.paladins } };
}

test("empty changes leave the defender as it is", () => {
  const before = defender({ paladins: [HALBERD] });
  assert.deepEqual(applyChanges(before, emptyChanges()), before);
  assert.equal(hasChanges(emptyChanges()), false);
});

test("unit deltas add and remove, never below zero", () => {
  const after = applyChanges(defender(), changes({ units: { spear: 500, sword: -500, archer: 200 } }));
  assert.deepEqual(after.units, { spear: 1500, sword: 0, archer: 200 });
});

test("wall, faith and night overrides replace the carried values", () => {
  const after = applyChanges(defender(), changes({ wall: 15, faith: 50, night: true }));
  assert.equal(after.wall, 15);
  assert.equal(after.faith, 50);
  assert.equal(after.night, true);

  const lowered = applyChanges(defender({ night: true }), changes({ wall: 3, night: false }));
  assert.equal(lowered.wall, 3);
  assert.equal(lowered.night, false);
});

test("paladins are swapped and removed by slot, arrivals join at the end", () => {
  const after = applyChanges(
    defender({ paladins: [HALBERD, LONGSWORD, BOW] }),
    changes({ paladins: { removed: [1], swaps: { 0: AXE }, arriving: [LONGSWORD] } })
  );
  assert.deepEqual(after.paladins, [AXE, BOW, LONGSWORD]);
});

test("paladin changes for slots that no longer exist are ignored", () => {
  const after = applyChanges(
    defender({ paladins: [HALBERD] }),
    changes({ paladins: { removed: [2], swaps: { 1: AXE }, arriving: [] } })
  );
  assert.deepEqual(after.paladins, [HALBERD]);
});

test("any unit delta, override or paladin change counts as a change", () => {
  assert.equal(hasChanges(changes({ units: { spear: 0 } })), false);
  assert.equal(hasChanges(changes({ units: { spear: -1 } })), true);
  assert.equal(hasChanges(changes({ wall: 0 })), true);
  assert.equal(hasChanges(changes({ night: false })), true);
  assert.equal(hasChanges(changes({ paladins: { arriving: [BOW] } })), true);
  assert.equal(hasChanges(changes({ paladins: { swaps: { 0: BOW } } })), true);
  assert.equal(hasChanges(changes({ paladins: { removed: [0] } })), true);
});

test("applying does not mutate its inputs", () => {
  const before = defender({ paladins: [HALBERD] });
  const gap = changes({ units: { spear: 5 }, paladins: { swaps: { 0: AXE }, arriving: [BOW] } });
  const beforeCopy = structuredClone(before);
  const gapCopy = structuredClone(gap);
  applyChanges(before, gap);
  assert.deepEqual(before, beforeCopy);
  assert.deepEqual(gap, gapCopy);
});

test("merged unit deltas sum and later overrides win", () => {
  const merged = mergeChanges(
    changes({ units: { spear: 500, sword: -100 }, wall: 15, faith: 50 }),
    changes({ units: { spear: -500, axe: 20 }, wall: 10, night: true }),
    0
  );
  assert.deepEqual(merged.units, { sword: -100, axe: 20 });
  assert.equal(merged.wall, 10);
  assert.equal(merged.faith, 50);
  assert.equal(merged.night, true);
});

test("merging equals applying both in order", () => {
  const start = defender({ paladins: [HALBERD, LONGSWORD, BOW] });
  const cases = [
    [
      changes({ paladins: { removed: [0], swaps: { 2: AXE }, arriving: [HALBERD] } }),
      changes({ paladins: { removed: [0], swaps: { 1: BOW, 2: LONGSWORD }, arriving: [AXE] } })
    ],
    [
      changes({ paladins: { arriving: [AXE, BOW] } }),
      changes({ paladins: { removed: [3, 1], swaps: { 4: HALBERD } } })
    ],
    [
      changes({ paladins: { swaps: { 1: AXE } } }),
      changes({ paladins: { removed: [1], swaps: { 1: BOW } } })
    ],
    [
      changes({ units: { spear: 100 }, wall: 3 }),
      changes({ paladins: { removed: [0, 1, 2] } })
    ]
  ];

  for (const [first, second] of cases) {
    const merged = mergeChanges(first, second, start.paladins.length);
    assert.deepEqual(applyChanges(start, merged), applyChanges(applyChanges(start, first), second));
  }
});
