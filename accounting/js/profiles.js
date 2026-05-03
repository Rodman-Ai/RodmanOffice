// Multi-entity / profile namespacing (#69). Each profile gets its own data blob
// at localStorage["rodbooks:v1:" + profileId]. Profile metadata lives at
// "rodbooks:profiles" and the active id at "rodbooks:activeProfile".

const PROFILES_KEY = "rodbooks:profiles";
const ACTIVE_KEY = "rodbooks:activeProfile";
const LEGACY_KEY = "rodbooks:v1";

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function listProfiles() {
  try {
    const list = JSON.parse(localStorage.getItem(PROFILES_KEY)) || [];
    if (list.length) return list;
  } catch {}
  // Bootstrap: if a legacy single-vault exists, register it as "default".
  const def = { id: "default", name: "Default", createdAt: Date.now() };
  localStorage.setItem(PROFILES_KEY, JSON.stringify([def]));
  return [def];
}

export function getActiveProfileId() {
  let id = localStorage.getItem(ACTIVE_KEY);
  if (!id) {
    const list = listProfiles();
    id = list[0].id;
    localStorage.setItem(ACTIVE_KEY, id);
  }
  return id;
}

export function getActiveProfile() {
  const id = getActiveProfileId();
  return listProfiles().find((p) => p.id === id) || listProfiles()[0];
}

export function setActiveProfile(id) {
  if (!listProfiles().find((p) => p.id === id)) throw new Error("Unknown profile");
  localStorage.setItem(ACTIVE_KEY, id);
}

/**
 * Switch the active profile and reload. Tears down the crypto-vault session
 * key and clears the in-memory store cache so the next read comes fresh
 * from the new profile's localStorage key. Combined with the
 * dispatch-time key capture in `store.write()`, this prevents in-flight
 * async encrypts from writing into the wrong profile's blob.
 *
 * @param {string} id Target profile id.
 */
export async function activateProfile(id) {
  try {
    const { disable } = await import("./cryptoVault.js");
    disable();
  } catch {}
  try {
    const { resetCache } = await import("./store.js");
    resetCache();
  } catch {}
  setActiveProfile(id);
  location.reload();
}

export function dataKeyFor(id) {
  // Backward compat: the "default" profile keeps the legacy key.
  if (id === "default") return LEGACY_KEY;
  return LEGACY_KEY + ":" + id;
}

export function createProfile(name) {
  const list = listProfiles();
  const p = { id: uid(), name: name.trim() || "Untitled", createdAt: Date.now() };
  list.push(p);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
  return p;
}

export function renameProfile(id, name) {
  const list = listProfiles();
  const i = list.findIndex((p) => p.id === id);
  if (i < 0) return;
  list[i].name = name.trim() || list[i].name;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}

export function deleteProfile(id) {
  const list = listProfiles();
  if (list.length <= 1) throw new Error("Can't delete the only profile");
  const remaining = list.filter((p) => p.id !== id);
  localStorage.setItem(PROFILES_KEY, JSON.stringify(remaining));
  localStorage.removeItem(dataKeyFor(id));
  if (getActiveProfileId() === id) localStorage.setItem(ACTIVE_KEY, remaining[0].id);
}
