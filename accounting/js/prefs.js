// Lightweight, browser-only preferences store. Separate from the main store
// so it doesn't bloat the data export.

const RECENT_KEY = "rodbooks:recent";
const VIEWS_KEY = "rodbooks:views:deals";
const DENSITY_KEY = "rodbooks:density";

// ---- Recently viewed ----
export function pushRecent(item) {
  // item: { kind, label, path }
  if (!item || !item.path) return;
  const list = getRecent().filter((r) => r.path !== item.path);
  list.unshift({ ...item, ts: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
}
export function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
}
export function clearRecent() { localStorage.removeItem(RECENT_KEY); }

// ---- Saved deal-list views ----
export function getSavedViews() {
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY)) || []; } catch { return []; }
}
export function saveView(name, filters) {
  const list = getSavedViews().filter((v) => v.name !== name);
  list.unshift({ name, filters, ts: Date.now() });
  localStorage.setItem(VIEWS_KEY, JSON.stringify(list.slice(0, 12)));
}
export function deleteView(name) {
  const list = getSavedViews().filter((v) => v.name !== name);
  localStorage.setItem(VIEWS_KEY, JSON.stringify(list));
}

// ---- Density ----
export function getDensity() {
  return localStorage.getItem(DENSITY_KEY) || "comfortable"; // | "compact"
}
export function setDensity(d) {
  localStorage.setItem(DENSITY_KEY, d);
  document.documentElement.setAttribute("data-density", d);
}
export function applyDensity() {
  document.documentElement.setAttribute("data-density", getDensity());
}
export function toggleDensity() {
  const next = getDensity() === "compact" ? "comfortable" : "compact";
  setDensity(next);
  return next;
}
