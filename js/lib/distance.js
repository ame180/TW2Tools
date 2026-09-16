// Map is a hex grid stored as offset x/y coordinates (odd rows shifted half a tile),
// so distance is not Euclidean. Mirrors the game's math - see reference/walk-time-equation.md.
export function actualDistance(start, end) {
  let dx = start.x - end.x;
  const dy = start.y - end.y;

  if (dy % 2) {
    dx += start.y % 2 ? 0.5 : -0.5;
  }

  return Math.sqrt(dx * dx + dy * dy * 0.75);
}

// unitSpeed is minutes per tile; the game rounds the per-tile seconds to 2 decimals
// before multiplying by distance.
export function secondsPerTile(unitSpeedMinutes) {
  return +(unitSpeedMinutes * 60).toFixed(2);
}

export function travelTimeSeconds(start, end, unitSpeedMinutes) {
  return Math.round(actualDistance(start, end) * secondsPerTile(unitSpeedMinutes));
}

// Accepts "500|500", "500, 500", "500/ 500", "(500|500)" and similar; returns {x, y} or null.
export function parseCoordinates(rawValue) {
  const match = String(rawValue).match(/(\d+)\D+(\d+)/);
  if (!match) {
    return null;
  }

  return { x: Number(match[1]), y: Number(match[2]) };
}
