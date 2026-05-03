// Theme: dark / light / auto. CSS sets variables based on `data-theme` on root.

import { Settings } from "./store.js";

export function applyTheme() {
  const t = Settings.get().theme || "auto";
  const resolved = t === "auto"
    ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : t;
  document.documentElement.setAttribute("data-theme", resolved);
  // also update theme-color meta for mobile
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "light" ? "#f6f7fb" : "#0b0d10");
}

export function setTheme(t) {
  Settings.update({ theme: t });
  applyTheme();
}

export function toggleTheme() {
  const cur = Settings.get().theme || "auto";
  const next = cur === "dark" ? "light" : cur === "light" ? "auto" : "dark";
  setTheme(next);
  return next;
}

// re-apply if system pref changes & we're in auto mode
matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => {
  if ((Settings.get().theme || "auto") === "auto") applyTheme();
});
