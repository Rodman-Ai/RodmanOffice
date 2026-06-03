/**
 * @file Whisper model catalog, runtime download from HuggingFace, and
 * IndexedDB cache.
 *
 * Models are addressed by short ids ("base.en-q5_1"). On first use we
 * stream the binary from HF, report bytes-received via `onProgress`,
 * persist to IndexedDB, and return a Uint8Array. Subsequent calls hit
 * the cache and resolve instantly with no network.
 */

const DB_NAME = "rodman-whisper";
const STORE = "models";
const DB_VERSION = 1;

const HF = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

/**
 * Catalog. Adding a model is a one-entry change here — neither the
 * converter nor the transcription app hard-codes model ids.
 *
 * `big: true` routes the blob through the Cache Storage API instead of
 * IndexedDB — browsers handle ~1 GB binaries far better there.
 */
export const MODELS = {
  "base.en-q5_1": {
    url: `${HF}/ggml-base.en-q5_1.bin`,
    bytes: 57_000_000,
    label: "English · base · fast",
    quality: "Good",
  },
  "medium.en-q5_0": {
    url: `${HF}/ggml-medium.en-q5_0.bin`,
    bytes: 539_000_000,
    label: "English · medium",
    quality: "Better",
    big: true,
  },
  "large-v3-turbo-q5_0": {
    url: `${HF}/ggml-large-v3-turbo-q5_0.bin`,
    bytes: 574_000_000,
    label: "English · large-v3 turbo · fast",
    quality: "Near-best",
    big: true,
  },
  "large-v3-q5_0": {
    url: `${HF}/ggml-large-v3-q5_0.bin`,
    bytes: 1_080_000_000,
    label: "English · large-v3 · max quality",
    quality: "Best",
    big: true,
  },
};

// The transcription app defaults to absolute max quality; the converter
// keeps using base.en for its quick inline transcripts.
export const DEFAULT_MODEL_ID = "base.en-q5_1";

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable — model caching disabled"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

async function dbGet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(id, bytes) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bytes, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetch `url` and stream-report bytes-received. Returns a Uint8Array of
 * the full body. The expected size is used only for progress fractions
 * — the actual returned bytes come from Content-Length when available.
 */
async function fetchWithProgress(url, expectedBytes, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Model fetch failed: HTTP ${res.status}`);
  const totalHeader = res.headers.get("Content-Length");
  const total = totalHeader ? Number(totalHeader) : expectedBytes;
  if (!res.body) {
    // Old browser: just buffer the whole thing.
    const buf = new Uint8Array(await res.arrayBuffer());
    onProgress?.({ loaded: buf.byteLength, total });
    return buf;
  }
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total });
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// ---- Cache Storage path (large models) ----
// Big blobs (~0.5–1.1 GB) live in the Cache Storage API rather than
// IndexedDB; the cache key is a synthetic same-origin URL.
const CACHE_NAME = "rodman-whisper-models";
const cacheKey = (id) => new Request(`/__whisper-model__/${id}`);

async function cacheGet(id) {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE_NAME);
  const res = await cache.match(cacheKey(id));
  if (!res) return null;
  return new Uint8Array(await res.arrayBuffer());
}

async function cachePut(id, bytes) {
  if (typeof caches === "undefined") return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(
    cacheKey(id),
    new Response(bytes, { headers: { "Content-Length": String(bytes.byteLength) } }),
  );
}

/**
 * Resolve a model by id. Hits the local cache (Cache Storage for big
 * models, IndexedDB for small) first, then falls back to HuggingFace
 * with a streaming progress callback.
 *
 * @param {string} id           A key in MODELS.
 * @param {(p: {loaded: number, total: number, stage: 'cache'|'download'}) => void} [onProgress]
 * @returns {Promise<Uint8Array>}
 */
export async function getModel(id, onProgress) {
  const meta = MODELS[id];
  if (!meta) throw new Error(`Unknown Whisper model: ${id}`);

  try {
    if (meta.big) {
      const hit = await cacheGet(id);
      if (hit && hit.byteLength) {
        onProgress?.({ loaded: hit.byteLength, total: hit.byteLength, stage: "cache" });
        return hit;
      }
    } else {
      const cached = await dbGet(id);
      if (cached instanceof Uint8Array && cached.byteLength) {
        onProgress?.({ loaded: cached.byteLength, total: cached.byteLength, stage: "cache" });
        return cached;
      }
      if (cached instanceof ArrayBuffer && cached.byteLength) {
        const u8 = new Uint8Array(cached);
        onProgress?.({ loaded: u8.byteLength, total: u8.byteLength, stage: "cache" });
        return u8;
      }
    }
  } catch (err) {
    // Cache lookup failed (private browsing, quota, etc.) — fall through
    // to a fresh download. Don't crash the transcribe path.
    console.warn("[whisper] model cache read failed:", err);
  }

  const bytes = await fetchWithProgress(meta.url, meta.bytes, (p) => {
    onProgress?.({ loaded: p.loaded, total: p.total, stage: "download" });
  });

  try {
    if (meta.big) await cachePut(id, bytes);
    else await dbPut(id, bytes);
  } catch (err) {
    // Cache write failed — log and keep going. The user still gets the
    // transcript, they'll just re-download next time.
    console.warn("[whisper] model cache write failed:", err);
  }

  return bytes;
}

/** Is a model already cached locally? Used by the storage manager UI. */
export async function isModelCached(id) {
  const meta = MODELS[id];
  if (!meta) return false;
  try {
    if (meta.big) return !!(await cacheGet(id));
    const cached = await dbGet(id);
    return !!(cached && cached.byteLength);
  } catch {
    return false;
  }
}

/** Delete a cached model. Returns true if something was removed. */
export async function deleteModel(id) {
  const meta = MODELS[id];
  if (!meta) return false;
  try {
    if (meta.big) {
      if (typeof caches === "undefined") return false;
      const cache = await caches.open(CACHE_NAME);
      return cache.delete(cacheKey(id));
    }
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn("[whisper] model delete failed:", err);
    return false;
  }
}
