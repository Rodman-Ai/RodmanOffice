// Encrypted-at-rest (#70). Passphrase → PBKDF2 → AES-GCM key.
// Storage format: "enc:v1:" + base64(salt[16] | iv[12] | ciphertext).
// Session unlocks store the derived key in-memory only.

const PREFIX = "enc:v1:";
const ITER = 200_000;
const SALT_LEN = 16;
const IV_LEN = 12;

let _sessionKey = null;
let _salt = null;

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64encode(bytes) {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function b64decode(str) {
  const s = atob(str);
  const arr = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
  return arr;
}

async function deriveKey(passphrase, salt) {
  const baseKey = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false, ["encrypt", "decrypt"],
  );
}

export function isEncrypted(blob) {
  return typeof blob === "string" && blob.startsWith(PREFIX);
}

export function isUnlocked() { return !!_sessionKey; }

export async function unlock(passphrase, blob) {
  if (!isEncrypted(blob)) throw new Error("Not encrypted");
  const buf = b64decode(blob.slice(PREFIX.length));
  const salt = buf.slice(0, SALT_LEN);
  const iv = buf.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ct = buf.slice(SALT_LEN + IV_LEN);
  const key = await deriveKey(passphrase, salt);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  } catch {
    throw new Error("Wrong passphrase");
  }
  _sessionKey = key;
  _salt = salt;
  return dec.decode(plain);
}

export async function enableWithPassphrase(passphrase, plaintext) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const key = await deriveKey(passphrase, salt);
  _sessionKey = key;
  _salt = salt;
  return await encryptCurrent(plaintext);
}

export async function encryptCurrent(plaintext) {
  if (!_sessionKey || !_salt) throw new Error("Vault locked");
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, _sessionKey, enc.encode(plaintext)));
  const buf = new Uint8Array(SALT_LEN + IV_LEN + ct.length);
  buf.set(_salt, 0);
  buf.set(iv, SALT_LEN);
  buf.set(ct, SALT_LEN + IV_LEN);
  return PREFIX + b64encode(buf);
}

export function disable() { _sessionKey = null; _salt = null; }
