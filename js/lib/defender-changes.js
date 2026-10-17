// Defender changes between two hits: support arriving or leaving, wall rebuilt, faith or night changed, paladins
// arriving, leaving or swapping weapons. Paladins carry a uid that changes refer to; otherwise a paladin is any object
// ({ weapon, level } in form terms, { id, level } in engine terms), never inspected here. Changes to a paladin that is
// not present (died earlier, or the hits were reordered) are kept but have no effect.

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
  const paladins = defender.paladins
    .filter((paladin) => !removed.includes(paladin.uid))
    .map((paladin) => ({ ...(swaps[paladin.uid] ?? paladin), uid: paladin.uid }));
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

// One set of changes equal to applying first, then second. Clamping makes unit sums inexact only when a removal
// exceeds what is present.
export function mergeChanges(first, second) {
  const units = { ...first.units };
  for (const [unit, delta] of Object.entries(second.units)) {
    units[unit] = (units[unit] || 0) + delta;
    if (units[unit] === 0) delete units[unit];
  }

  const isFirstArrival = (uid) => first.paladins.arriving.some((paladin) => paladin.uid === uid);
  const removed = [...first.paladins.removed];
  const swaps = { ...first.paladins.swaps };
  for (const uid of second.paladins.removed) {
    if (isFirstArrival(uid)) continue;
    if (!removed.includes(uid)) removed.push(uid);
    delete swaps[uid];
  }
  for (const [uid, paladin] of Object.entries(second.paladins.swaps)) {
    if (!isFirstArrival(Number(uid))) swaps[uid] = { ...paladin };
  }

  const arriving = first.paladins.arriving
    .filter((paladin) => !second.paladins.removed.includes(paladin.uid))
    .map((paladin) => ({ ...(second.paladins.swaps[paladin.uid] ?? paladin), uid: paladin.uid }));

  return {
    units,
    wall: second.wall ?? first.wall,
    faith: second.faith ?? first.faith,
    night: second.night ?? first.night,
    paladins: {
      removed,
      swaps,
      arriving: [...arriving, ...second.paladins.arriving.map((paladin) => ({ ...paladin }))]
    }
  };
}
