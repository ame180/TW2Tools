import { buildingTool } from "./tools/building.js";
import { crownsTool } from "./tools/crowns.js";
import { wallbreakerTool } from "./tools/wallbreaker.js";
import { troopsTool } from "./tools/troops.js";
import { moraleTool } from "./tools/morale.js";
import { walktimeTool } from "./tools/walktime.js";

const tools = [buildingTool, crownsTool, wallbreakerTool, troopsTool, moraleTool, walktimeTool];
const DEFAULT_TOOL = tools[0].id;

const els = {};
const navButtons = new Map();

document.addEventListener("DOMContentLoaded", () => {
  els.dataStatus = document.getElementById("data-status");
  els.sidebar = document.getElementById("sidebar");
  els.sidebarNav = document.getElementById("sidebar-nav");
  els.sidebarBackdrop = document.getElementById("sidebar-backdrop");
  els.sidebarToggle = document.getElementById("sidebar-toggle");

  buildSidebarNav();
  bindSidebarToggle();
  bindSelectOnFocus();

  window.addEventListener("hashchange", () => setActiveTool(getToolFromHash()));
  setActiveTool(getToolFromHash());

  initialize();
});

async function initialize() {
  try {
    const response = await fetch("data.json");
    if (!response.ok) {
      throw new Error(`Failed to load data: ${response.status}`);
    }

    const data = await response.json();

    for (const tool of tools) {
      tool.init(data);
    }

    els.dataStatus.textContent = "";
  } catch (error) {
    els.dataStatus.textContent = `Error loading data: ${error.message}`;
  }
}

function buildSidebarNav() {
  for (const tool of tools) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tool = tool.id;
    button.textContent = tool.title;
    button.className =
      "block w-full rounded px-3 py-2 text-left text-sm font-medium hover:bg-slate-200";
    button.addEventListener("click", () => {
      setActiveTool(tool.id);
      closeSidebar();
    });

    els.sidebarNav.appendChild(button);
    navButtons.set(tool.id, button);
  }
}

function bindSidebarToggle() {
  els.sidebarToggle.addEventListener("click", () => {
    const isOpen = !els.sidebar.classList.contains("-translate-x-full");
    if (isOpen) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  els.sidebarBackdrop.addEventListener("click", closeSidebar);
}

function bindSelectOnFocus() {
  document.addEventListener("focusin", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "number") {
      return;
    }

    // Deferred so the mouseup/touchend that focused the input doesn't clear the selection.
    setTimeout(() => input.select(), 0);
  });
}

function openSidebar() {
  els.sidebar.classList.remove("-translate-x-full");
  els.sidebarBackdrop.classList.remove("hidden");
}

function closeSidebar() {
  els.sidebar.classList.add("-translate-x-full");
  els.sidebarBackdrop.classList.add("hidden");
}

function setActiveTool(toolId) {
  for (const tool of tools) {
    const section = document.getElementById(`view-${tool.id}`);
    section.classList.toggle("hidden", tool.id !== toolId);

    const button = navButtons.get(tool.id);
    button.classList.toggle("bg-slate-900", tool.id === toolId);
    button.classList.toggle("text-white", tool.id === toolId);
    button.classList.toggle("hover:bg-slate-200", tool.id !== toolId);
  }

  syncHashToTool(toolId);
}

function getToolFromHash() {
  const rawHash = decodeURIComponent(String(window.location.hash).replace(/^#/, ""));
  return tools.some((tool) => tool.id === rawHash) ? rawHash : DEFAULT_TOOL;
}

function syncHashToTool(toolId) {
  if (window.location.hash === `#${toolId}`) {
    return;
  }

  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${toolId}`);
}
