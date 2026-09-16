import { formatDuration, toNumber } from "../lib/format.js";
import { actualDistance, travelTimeSeconds, parseCoordinates } from "../lib/distance.js";

const els = {};

let troops = {};

export const walktimeTool = {
  id: "walktime",
  title: "Walk Time Calculator",
  init
};

function init(data) {
  troops = data.troops || {};

  els.walkSource = document.getElementById("walk-source");
  els.walkTarget = document.getElementById("walk-target");
  els.walkDistance = document.getElementById("walk-distance");
  els.walkError = document.getElementById("walk-error");
  els.walkResults = document.getElementById("walk-results");

  els.walkSource.addEventListener("input", recalculate);
  els.walkTarget.addEventListener("input", recalculate);

  recalculate();
}

function recalculate() {
  const source = parseCoordinates(els.walkSource.value);
  const target = parseCoordinates(els.walkTarget.value);

  if (!source || !target) {
    els.walkDistance.textContent = "";
    els.walkError.textContent = "Enter source and target coordinates as X|Y (e.g. 500|500 or (500|500)).";
    els.walkResults.innerHTML = "";
    return;
  }

  els.walkError.textContent = "";

  const distance = actualDistance(source, target);
  els.walkDistance.textContent = `Distance: ${distance.toFixed(2)} fields`;

  renderResults(groupTroopsByTravelTime(source, target));
}

function groupTroopsByTravelTime(source, target) {
  const namesBySeconds = new Map();

  for (const troop of Object.values(troops)) {
    const speed = toNumber(troop.speed);
    if (speed <= 0) {
      continue;
    }

    const seconds = travelTimeSeconds(source, target, speed);
    if (!namesBySeconds.has(seconds)) {
      namesBySeconds.set(seconds, []);
    }
    namesBySeconds.get(seconds).push(troop.name);
  }

  return [...namesBySeconds.entries()]
    .sort(([a], [b]) => a - b)
    .map(([seconds, names]) => ({ names, seconds }));
}

function renderResults(rows) {
  els.walkResults.innerHTML = "";

  const table = document.createElement("table");
  table.className = "w-full text-sm";

  const head = document.createElement("tr");
  head.className = "border-b border-slate-300 text-left text-xs text-slate-500";
  for (const headerText of ["Units", "Travel Time"]) {
    const th = document.createElement("th");
    th.className = "py-2 pr-4 font-medium";
    th.textContent = headerText;
    head.appendChild(th);
  }
  table.appendChild(head);

  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "border-b border-slate-100";

    const namesCell = document.createElement("td");
    namesCell.className = "py-2 pr-4";
    namesCell.textContent = row.names.join(", ");
    tr.appendChild(namesCell);

    const timeCell = document.createElement("td");
    timeCell.className = "py-2 pr-4 font-semibold whitespace-nowrap";
    timeCell.textContent = formatDuration(row.seconds);
    tr.appendChild(timeCell);

    table.appendChild(tr);
  }

  els.walkResults.appendChild(table);
}
