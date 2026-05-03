// Simple localStorage tracker for the last 5 contacts visited.

const KEY = "leocrm.recents";
const MAX = 5;

export interface RecentItem {
  id: string;
  label: string;
  href: string;
}

export function getRecents(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem) {
  if (typeof window === "undefined") return;
  const list = getRecents().filter((r) => r.id !== item.id);
  list.unshift(item);
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  window.dispatchEvent(new Event("leocrm:recents"));
}

export function onRecentsChange(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("leocrm:recents", handler);
  return () => window.removeEventListener("leocrm:recents", handler);
}
