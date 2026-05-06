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
    try {
      window.localStorage.setItem(KEY, JSON.stringify(Array.from(pins)));
      window.dispatchEvent(new Event("leocrm:pins"));
    } catch {
      // Pins are convenience UI only; storage failures should not block the click.
    }
  }
  return pinned;
}

export function onPinsChange(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("leocrm:pins", handler);
  return () => window.removeEventListener("leocrm:pins", handler);
}
