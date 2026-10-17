// Defender changes between two hits: support arriving or leaving, wall rebuilt, faith or night changed, paladins
// arriving, leaving or swapping weapons. Paladin changes address slots of the carried paladin list; a paladin is any
// object ({ weapon, level } in form terms, { id, level } in engine terms), never inspected here.

export function emptyChanges() {
  return { units: {}, wall: null, faith: null, night: null, paladins: { removed: [], swaps: {}, arriving: [] } };
}

export function hasChanges(changes) {
  const { removed, swaps, arriving } = changes.paladins;
  return Object.values(changes.units).some((delta) => delta !== 0)
    || changes.wall !== null || changes.faith !== null || changes.night !== null
    || removed.length > 0 || Object.keys(swaps).length > 0 || arriving.length > 0;
}

export function applyChanges(defender, changes) {
  const units = { ...defender.units };
  for (const [unit, delta] of Object.entries(changes.units)) {
    units[unit] = Math.max(0, (units[unit] || 0) + delta);
  }

  const { removed, swaps, arriving } = changes.paladins;
  const paladins = [];
  defender.paladins.forEach((paladin, slot) => {
    if (removed.includes(slot)) return;
    paladins.push({ ...(swaps[slot] ?? paladin) });
  });
  for (const paladin of arriving) paladins.push({ ...paladin });

  return {
    ...defender,
    units,
    paladins,
    wall: changes.wall ?? defender.wall,
    faith: changes.faith ?? defender.faith,
    night: changes.night ?? defender.night
  };
}

// One set of changes equal to applying first, then second. Second's slots address the list first produces, so the
// carried paladin count is needed to tell carried slots from first's arrivals. Clamping makes unit sums inexact
// only when a removal exceeds what is present.
export function mergeChanges(first, second, carriedPaladinCount) {
  const units = { ...first.units };
  for (const [unit, delta] of Object.entries(second.units)) {
    units[unit] = (units[unit] || 0) + delta;
    if (units[unit] === 0) delete units[unit];
  }

  const removed = [...first.paladins.removed];
  const swaps = { ...first.paladins.swaps };
  const arriving = first.paladins.arriving.map((paladin) => ({ ...paladin }));
  const removedArrivals = new Set();

  const listAfterFirst = [];
  for (let slot = 0; slot < carriedPaladinCount; slot++) {
    if (!removed.includes(slot)) listAfterFirst.push({ slot });
  }
  arriving.forEach((_, arrival) => listAfterFirst.push({ arrival }));

  for (const [slot, paladin] of Object.entries(second.paladins.swaps)) {
    const entry = listAfterFirst[Number(slot)];
    if (!entry) continue;
    if (entry.slot === undefined) arriving[entry.arrival] = { ...paladin };
    else swaps[entry.slot] = { ...paladin };
  }
  for (const slot of second.paladins.removed) {
    const entry = listAfterFirst[slot];
    if (!entry) continue;
    if (entry.slot === undefined) {
      removedArrivals.add(entry.arrival);
    } else {
      removed.push(entry.slot);
      delete swaps[entry.slot];
    }
  }

  return {
    units,
    wall: second.wall ?? first.wall,
    faith: second.faith ?? first.faith,
    night: second.night ?? first.night,
    paladins: {
      removed,
      swaps,
      arriving: [
        ...arriving.filter((_, arrival) => !removedArrivals.has(arrival)),
        ...second.paladins.arriving.map((paladin) => ({ ...paladin }))
      ]
    }
  };
}
