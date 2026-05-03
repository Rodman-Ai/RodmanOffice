// Offline capture queue (#91). When the receipt OCR / capture flow runs offline,
// queue the data URI in IndexedDB and replay it as a Bills.save when back online.

const DB_NAME = "rodbooks";
const STORE = "offlineQueue";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function enqueue(item) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add({ ...item, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function drain(handler) {
  const items = await listQueue();
  if (!items.length) return 0;
  const db = await openDb();
  let processed = 0;
  for (const item of items) {
    try {
      await handler(item);
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).delete(item.id);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
      processed++;
    } catch (e) {
      console.warn("queue item failed:", e);
    }
  }
  return processed;
}

export async function pendingCount() {
  return (await listQueue()).length;
}
