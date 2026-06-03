export type ThemeMode = "light" | "dark" | "system";

const KEY = "theme_mode";

export function getThemeMode(): ThemeMode {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

export function setThemeMode(mode: ThemeMode) {
  localStorage.setItem(KEY, mode);
  applyThemeMode(mode);
}

export function applyThemeMode(mode = getThemeMode()) {
  const root = document.documentElement;
  root.dataset.themeMode = mode;
  if (mode === "system") {
    root.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    root.dataset.theme = mode;
  }
}

export function watchSystemTheme() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    if (getThemeMode() === "system") applyThemeMode("system");
  };
  media.addEventListener("change", update);
  return () => media.removeEventListener("change", update);
}
