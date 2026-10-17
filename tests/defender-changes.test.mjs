import test from "node:test";
import assert from "node:assert/strict";
import { emptyChanges, hasChanges, applyChanges, mergeChanges } from "../js/lib/defender-changes.js";

const HALBERD = { uid: 1, id: "halberd", level: 3 };
const LONGSWORD = { uid: 2, id: "longsword", level: 3 };
const BOW = { uid: 3, id: "bow", level: 2 };
const AXE = { uid: 4, id: "axe", level: 1 };
const AXE_SWAP = { id: "axe", level: 1 };

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

test("paladins are swapped and removed by uid, arrivals join at the end", () => {
  const after = applyChanges(
    defender({ paladins: [HALBERD, LONGSWORD, BOW] }),
    changes({ paladins: { removed: [2], swaps: { 1: AXE_SWAP }, arriving: [AXE] } })
  );
  assert.deepEqual(after.paladins, [{ ...AXE_SWAP, uid: 1 }, BOW, AXE]);
});

test("paladin changes for paladins that are not present have no effect", () => {
  const after = applyChanges(
    defender({ paladins: [HALBERD] }),
    changes({ paladins: { removed: [3], swaps: { 2: AXE_SWAP }, arriving: [] } })
  );
  assert.deepEqual(after.paladins, [HALBERD]);
});

test("any unit delta, override or paladin change counts as a change", () => {
  assert.equal(hasChanges(changes({ units: { spear: 0 } })), false);
  assert.equal(hasChanges(changes({ units: { spear: -1 } })), true);
  assert.equal(hasChanges(changes({ wall: 0 })), true);
  assert.equal(hasChanges(changes({ night: false })), true);
  assert.equal(hasChanges(changes({ paladins: { arriving: [BOW] } })), true);
  assert.equal(hasChanges(changes({ paladins: { swaps: { 1: AXE_SWAP } } })), true);
  assert.equal(hasChanges(changes({ paladins: { removed: [1] } })), true);
});

test("applying does not mutate its inputs", () => {
  const before = defender({ paladins: [HALBERD] });
  const gap = changes({ units: { spear: 5 }, paladins: { swaps: { 1: AXE_SWAP }, arriving: [BOW] } });
  const beforeCopy = structuredClone(before);
  const gapCopy = structuredClone(gap);
  applyChanges(before, gap);
  assert.deepEqual(before, beforeCopy);
  assert.deepEqual(gap, gapCopy);
});

test("merged unit deltas sum and later overrides win", () => {
  const merged = mergeChanges(
    changes({ units: { spear: 500, sword: -100 }, wall: 15, faith: 50 }),
    changes({ units: { spear: -500, axe: 20 }, wall: 10, night: true })
  );
  assert.deepEqual(merged.units, { sword: -100, axe: 20 });
  assert.equal(merged.wall, 10);
  assert.equal(merged.faith, 50);
  assert.equal(merged.night, true);
});

test("merging equals applying both in order", () => {
  const start = defender({ paladins: [HALBERD, LONGSWORD] });
  const cases = [
    [
      changes({ paladins: { removed: [1], swaps: { 2: AXE_SWAP }, arriving: [BOW] } }),
      changes({ paladins: { removed: [2], swaps: { 3: AXE_SWAP }, arriving: [AXE] } })
    ],
    [
      changes({ paladins: { arriving: [AXE, BOW] } }),
      changes({ paladins: { removed: [4, 1], swaps: { 3: { id: "halberd", level: 1 } } } })
    ],
    [
      changes({ paladins: { swaps: { 2: AXE_SWAP } } }),
      changes({ paladins: { removed: [2], swaps: { 1: AXE_SWAP } } })
    ],
    [
      changes({ units: { spear: 100 }, wall: 3 }),
      changes({ paladins: { removed: [1, 2] } })
    ]
  ];

  for (const [first, second] of cases) {
    const merged = mergeChanges(first, second);
    assert.deepEqual(applyChanges(start, merged), applyChanges(applyChanges(start, first), second));
  }
});

test("merging keeps changes to paladins that are not present", () => {
  const merged = mergeChanges(
    changes({ paladins: { removed: [7] } }),
    changes({ paladins: { swaps: { 8: AXE_SWAP } } })
  );
  assert.deepEqual(merged.paladins.removed, [7]);
  assert.deepEqual(merged.paladins.swaps, { 8: AXE_SWAP });
});
