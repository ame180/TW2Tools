import { formatNumber, toNonNegativeInt } from "../lib/format.js";
import { calculateCrowns } from "../lib/crowns.js";

const els = {};

let instantFinish = {};

export const crownsTool = {
  id: "crowns",
  title: "Crown Calculator",
  init
};

function init(data) {
  instantFinish = data.instantFinish || {};

  els.durationDays = document.getElementById("duration-days");
  els.durationHours = document.getElementById("duration-hours");
  els.durationMinutes = document.getElementById("duration-minutes");
  els.durationSeconds = document.getElementById("duration-seconds");
  els.durationTotalSeconds = document.getElementById("duration-total-seconds");
  els.resultCrowns = document.getElementById("result-crowns");

  els.durationDays.addEventListener("input", recalculate);
  els.durationHours.addEventListener("input", recalculate);
  els.durationMinutes.addEventListener("input", recalculate);
  els.durationSeconds.addEventListener("input", recalculate);

  recalculate();
}

function recalculate() {
  const days = toNonNegativeInt(els.durationDays.value, 0);
  const hours = toNonNegativeInt(els.durationHours.value, 0);
  const minutes = toNonNegativeInt(els.durationMinutes.value, 0);
  const seconds = toNonNegativeInt(els.durationSeconds.value, 0);

  els.durationDays.value = String(days);
  els.durationHours.value = String(hours);
  els.durationMinutes.value = String(minutes);
  els.durationSeconds.value = String(seconds);

  const totalSeconds = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  els.durationTotalSeconds.textContent = formatNumber(totalSeconds);
  els.resultCrowns.textContent = formatNumber(calculateCrowns(totalSeconds, instantFinish));
}
