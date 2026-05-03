// Privacy passcode gate. Hashes the PIN with SHA-256 + salt and stores hash in settings.
// Note: this is a UI privacy gate, not encryption — data still lives in localStorage in plaintext.

import { Settings } from "./store.js";
import { el } from "./utils.js";

const SESSION_KEY = "rodbooks:unlocked";
const SALT = "rodbooks-v1";

async function sha256(str) {
  const buf = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function setPasscode(code) {
  if (!code) {
    Settings.update({ lockHash: "" });
    sessionStorage.removeItem(SESSION_KEY);
    return;
  }
  const hash = await sha256(code + SALT);
  Settings.update({ lockHash: hash });
  sessionStorage.setItem(SESSION_KEY, "1");
}

export function isLockEnabled() {
  return !!(Settings.get().lockHash);
}

export function isUnlocked() {
  return sessionStorage.getItem(SESSION_KEY) === "1";
}

export async function tryUnlock(code) {
  const hash = await sha256(code + SALT);
  const ok = hash === Settings.get().lockHash;
  if (ok) sessionStorage.setItem(SESSION_KEY, "1");
  return ok;
}

export function lock() {
  sessionStorage.removeItem(SESSION_KEY);
  showLockScreen();
}

export function showLockScreen() {
  if (document.getElementById("lock-screen")) return;
  const input = el("input", {
    type: "password", inputmode: "numeric", autocomplete: "off",
    class: "input", style: { fontSize: "20px", textAlign: "center", letterSpacing: "8px", maxWidth: "240px", margin: "0 auto" },
    placeholder: "••••",
  });
  const err = el("div", { class: "small", style: { color: "var(--danger)", height: "16px", marginTop: "8px", textAlign: "center" } });
  const submit = async () => {
    const ok = await tryUnlock(input.value);
    if (ok) { document.getElementById("lock-screen")?.remove(); }
    else { err.textContent = "Incorrect passcode"; input.value = ""; input.focus(); }
  };
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  const overlay = el("div", { id: "lock-screen" },
    el("div", { class: "lock-card" },
      el("div", { class: "logo", style: { width: "44px", height: "44px", margin: "0 auto 16px", fontSize: "16px" } }, "RB"),
      el("div", { style: { fontSize: "18px", fontWeight: 600, textAlign: "center" } }, "RodBooks locked"),
      el("div", { class: "small muted", style: { marginTop: "4px", textAlign: "center" } }, "Enter your passcode to continue."),
      el("div", { style: { marginTop: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" } },
        input,
        el("button", { class: "btn primary", style: { minWidth: "140px" }, onclick: submit }, "Unlock"),
      ),
      err,
    ),
  );
  document.body.append(overlay);
  setTimeout(() => input.focus(), 50);
}
