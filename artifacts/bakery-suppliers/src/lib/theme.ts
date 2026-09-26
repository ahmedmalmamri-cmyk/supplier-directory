export type Theme = "light" | "dark";

// A fresh preference key prevents an old dark-mode selection from overriding
// the new light-first palette on the first visit after this redesign.
const THEME_STORAGE_KEY = "bakery-theme-v2";

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "dark" ? "only dark" : "only light";
}

export function chooseTheme(theme: Theme) {
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The toggle still works for this page when storage is unavailable.
  }
}