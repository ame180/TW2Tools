// The inline script in index.html does the same before first paint.

const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
let currentTheme = "system";

export function applyTheme(theme) {
  currentTheme = theme;
  const isDark = theme === "dark" || (theme !== "light" && systemDark.matches);
  document.documentElement.classList.toggle("dark", isDark);
}

systemDark.addEventListener("change", () => applyTheme(currentTheme));
