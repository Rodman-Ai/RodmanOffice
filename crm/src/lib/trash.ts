// LocalStorage-backed trash so a delete can be undone within the session.

const KEY = "leocrm.trash";
const MAX = 5;

export interface TrashEntry {
  id: string;
  kind: "contact";
  payload: unknown;
  related?: unknown[];
  at: string;
  label: string;
}

export function pushTrash(entry: Omit<TrashEntry, "at">) {
  if (typeof window === "undefined") return;
  const list = getTrash();
  list.unshift({ ...entry, at: new Date().toISOString() });
  window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}

export function getTrash(): TrashEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as TrashEntry[];
  } catch {
    return [];
  }
}

export function popTrash(id: string): TrashEntry | undefined {
  const list = getTrash();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return undefined;
  const [item] = list.splice(idx, 1);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  }
  return item;
}
