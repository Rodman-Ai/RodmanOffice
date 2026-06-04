// RodmanTranscribe — Recent transcripts (IndexedDB).
//
// Each row stores: id, savedAt, sourceName, durationSec, modelId, preset,
// firstSentence (preview), and the full segment array. The transcript
// pane debounces a save during a run so an iOS background-tab kill
// doesn't lose progress.
//
// All public helpers are async and resolve to plain values; callers can
// treat IndexedDB as a black box.

const DB_NAME = 'rodman-transcribe-history';
const STORE = 'transcripts';
const DB_VERSION = 1;
const KEEP = 10;

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        s.createIndex('savedAt', 'savedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(mode) {
  return openDb().then((db) => db.transaction(STORE, mode).objectStore(STORE));
}

function firstSentence(segments) {
  for (const seg of segments) {
    const t = (seg.text || '').trim();
    if (!t) continue;
    const m = t.match(/[^.!?]+[.!?]/);
    return (m ? m[0] : t).slice(0, 140);
  }
  return '';
}

/** Save (or overwrite) a transcript row. Returns the stored id. */
export async function save({
  id, sourceName, durationSec, modelId, preset, segments,
}) {
  if (!segments || !segments.length) return null;
  const store = await tx('readwrite');
  const row = {
    id: id || `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
    sourceName: sourceName || 'untitled',
    durationSec: Number(durationSec) || 0,
    modelId: modelId || '',
    preset: preset || 'balanced',
    firstSentence: firstSentence(segments),
    segments,
  };
  await new Promise((resolve, reject) => {
    const req = store.put(row);
    req.onsuccess = resolve;
    req.onerror = () => reject(req.error);
  });
  // Trim to KEEP newest rows.
  await trim();
  return row.id;
}

/** Most-recent-first list of rows (without segments). */
export async function list() {
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const req = store.index('savedAt').openCursor(null, 'prev');
    const out = [];
    req.onsuccess = (e) => {
      const cur = e.target.result;
      if (!cur) { resolve(out); return; }
      // shallow copy without the heavy `segments` payload
      const { segments, ...meta } = cur.value;
      out.push(meta);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** Load a single row (including segments). */
export async function load(id) {
  const store = await tx('readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

/** Delete one row by id. */
export async function remove(id) {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/** Wipe the entire history. */
export async function clear() {
  const store = await tx('readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function trim() {
  const all = await list();
  if (all.length <= KEEP) return;
  for (const row of all.slice(KEEP)) await remove(row.id);
}
