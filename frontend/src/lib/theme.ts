export type Theme = "light" | "dark";

// Reset the saved theme once so the light palette is the default after the
// dark-palette correction; users can still opt back into dark mode.
const THEME_STORAGE_KEY = "bakery-theme-v3";

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