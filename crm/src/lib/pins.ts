const KEY = "leocrm.pins";

export function getPins(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function togglePin(id: string): boolean {
  const pins = getPins();
  const pinned = !pins.has(id);
  if (pinned) pins.add(id);
  else pins.delete(id);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(Array.from(pins)));
    window.dispatchEvent(new Event("leocrm:pins"));
  }
  return pinned;
}

export function onPinsChange(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("leocrm:pins", handler);
  return () => window.removeEventListener("leocrm:pins", handler);
}
