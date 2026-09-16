import { formatNumber, toNonNegativeInt } from "../lib/format.js";

const els = {};

export const wallbreakerTool = {
  id: "wallbreaker",
  title: "Wallbreaker Calculator",
  init
};

function init() {
  els.wbProvisions = document.getElementById("wb-provisions");
  els.wbTrebuchets = document.getElementById("wb-trebuchets");
  els.wbError = document.getElementById("wb-error");
  els.wbResultRams = document.getElementById("wb-result-rams");
  els.wbResultEscort = document.getElementById("wb-result-escort");

  els.wbProvisions.addEventListener("input", recalculate);
  els.wbTrebuchets.addEventListener("input", recalculate);

  recalculate();
}

function recalculate() {
  const provisions = toNonNegativeInt(els.wbProvisions.value, 0);
  const trebuchets = toNonNegativeInt(els.wbTrebuchets.value, 0);

  const trebProvisionCost = 5 * trebuchets;
  if (trebProvisionCost > provisions) {
    els.wbError.textContent = "Trebuchets exceed available provisions.";
    els.wbResultRams.textContent = "0";
    els.wbResultEscort.textContent = "0";
    return;
  }

  els.wbError.textContent = "";
  const rams = Math.floor((provisions - trebProvisionCost) / 2 / 5) + trebuchets;
  const escortProvisions = provisions - rams * 5;

  els.wbResultRams.textContent = formatNumber(rams);
  els.wbResultEscort.textContent = formatNumber(escortProvisions);
}
