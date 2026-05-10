// Vendored from @ffmpeg/ffmpeg@0.12.10 (MIT) — bundled high-level API.
// Concatenates const.js + errors.js + utils.js + classes.js into one ESM
// file so the vendor folder ships a single import target. The class
// constructor still lazily spawns the worker that lives in
// ffmpeg-worker.mjs (passed as classWorkerURL).

// ---------- const ----------
const MIME_TYPE_JAVASCRIPT = "text/javascript";
const MIME_TYPE_WASM = "application/wasm";
const CORE_VERSION = "0.12.6";
const CORE_URL = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd/ffmpeg-core.js`;
const FFMessageType = Object.freeze({
  LOAD: "LOAD",
  EXEC: "EXEC",
  WRITE_FILE: "WRITE_FILE",
  READ_FILE: "READ_FILE",
  DELETE_FILE: "DELETE_FILE",
  RENAME: "RENAME",
  CREATE_DIR: "CREATE_DIR",
  LIST_DIR: "LIST_DIR",
  DELETE_DIR: "DELETE_DIR",
  ERROR: "ERROR",
  DOWNLOAD: "DOWNLOAD",
  PROGRESS: "PROGRESS",
  LOG: "LOG",
  MOUNT: "MOUNT",
  UNMOUNT: "UNMOUNT",
});

// ---------- errors ----------
const ERROR_UNKNOWN_MESSAGE_TYPE = new Error("unknown message type");
const ERROR_NOT_LOADED = new Error("ffmpeg is not loaded, call `await ffmpeg.load()` first");
const ERROR_TERMINATED = new Error("called FFmpeg.terminate()");
const ERROR_IMPORT_FAILURE = new Error("failed to import ffmpeg-core.js");

// ---------- utils ----------
const getMessageID = (() => {
  let messageID = 0;
  return () => messageID++;
})();

// ---------- FFmpeg class ----------
class FFmpeg {
  #worker = null;
  #resolves = {};
  #rejects = {};
  #logEventCallbacks = [];
  #progressEventCallbacks = [];
  loaded = false;

  #registerHandlers = () => {
    if (!this.#worker) return;
    this.#worker.onmessage = ({ data: { id, type, data } }) => {
      switch (type) {
        case FFMessageType.LOAD:
          this.loaded = true;
          this.#resolves[id]?.(data);
          break;
        case FFMessageType.MOUNT:
        case FFMessageType.UNMOUNT:
        case FFMessageType.EXEC:
        case FFMessageType.WRITE_FILE:
        case FFMessageType.READ_FILE:
        case FFMessageType.DELETE_FILE:
        case FFMessageType.RENAME:
        case FFMessageType.CREATE_DIR:
        case FFMessageType.LIST_DIR:
        case FFMessageType.DELETE_DIR:
          this.#resolves[id]?.(data);
          break;
        case FFMessageType.LOG:
          this.#logEventCallbacks.forEach((f) => f(data));
          break;
        case FFMessageType.PROGRESS:
          this.#progressEventCallbacks.forEach((f) => f(data));
          break;
        case FFMessageType.ERROR:
          this.#rejects[id]?.(data);
          break;
      }
      delete this.#resolves[id];
      delete this.#rejects[id];
    };
  };

  #send = ({ type, data }, trans = [], signal) => {
    if (!this.#worker) return Promise.reject(ERROR_NOT_LOADED);
    return new Promise((resolve, reject) => {
      const id = getMessageID();
      this.#worker && this.#worker.postMessage({ id, type, data }, trans);
      this.#resolves[id] = resolve;
      this.#rejects[id] = reject;
      signal?.addEventListener("abort", () => {
        reject(new DOMException(`Message # ${id} was aborted`, "AbortError"));
      }, { once: true });
    });
  };

  on(event, callback) {
    if (event === "log") this.#logEventCallbacks.push(callback);
    else if (event === "progress") this.#progressEventCallbacks.push(callback);
  }

  off(event, callback) {
    if (event === "log") this.#logEventCallbacks = this.#logEventCallbacks.filter((f) => f !== callback);
    else if (event === "progress") this.#progressEventCallbacks = this.#progressEventCallbacks.filter((f) => f !== callback);
  }

  load = ({ classWorkerURL, ...config } = {}, { signal } = {}) => {
    if (!this.#worker) {
      this.#worker = classWorkerURL
        ? new Worker(new URL(classWorkerURL, import.meta.url), { type: "module" })
        : new Worker(new URL("./ffmpeg-worker.mjs", import.meta.url), { type: "module" });
      this.#registerHandlers();
    }
    return this.#send({ type: FFMessageType.LOAD, data: config }, undefined, signal);
  };

  exec = (args, timeout = -1, { signal } = {}) =>
    this.#send({ type: FFMessageType.EXEC, data: { args, timeout } }, undefined, signal);

  terminate = () => {
    const ids = Object.keys(this.#rejects);
    for (const id of ids) {
      this.#rejects[id](ERROR_TERMINATED);
      delete this.#rejects[id];
      delete this.#resolves[id];
    }
    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
      this.loaded = false;
    }
  };

  writeFile = (path, data, { signal } = {}) => {
    const trans = [];
    if (data instanceof Uint8Array) trans.push(data.buffer);
    return this.#send({ type: FFMessageType.WRITE_FILE, data: { path, data } }, trans, signal);
  };

  mount = (fsType, options, mountPoint) =>
    this.#send({ type: FFMessageType.MOUNT, data: { fsType, options, mountPoint } });
  unmount = (mountPoint) =>
    this.#send({ type: FFMessageType.UNMOUNT, data: { mountPoint } });

  readFile = (path, encoding = "binary", { signal } = {}) =>
    this.#send({ type: FFMessageType.READ_FILE, data: { path, encoding } }, undefined, signal);

  deleteFile = (path, { signal } = {}) =>
    this.#send({ type: FFMessageType.DELETE_FILE, data: { path } }, undefined, signal);

  rename = (oldPath, newPath, { signal } = {}) =>
    this.#send({ type: FFMessageType.RENAME, data: { oldPath, newPath } }, undefined, signal);

  createDir = (path, { signal } = {}) =>
    this.#send({ type: FFMessageType.CREATE_DIR, data: { path } }, undefined, signal);

  listDir = (path, { signal } = {}) =>
    this.#send({ type: FFMessageType.LIST_DIR, data: { path } }, undefined, signal);

  deleteDir = (path, { signal } = {}) =>
    this.#send({ type: FFMessageType.DELETE_DIR, data: { path } }, undefined, signal);
}

const FFFSType = Object.freeze({
  MEMFS: "MEMFS",
  NODEFS: "NODEFS",
  NODERAWFS: "NODERAWFS",
  IDBFS: "IDBFS",
  WORKERFS: "WORKERFS",
  PROXYFS: "PROXYFS",
});

export { FFmpeg, FFMessageType, FFFSType, CORE_URL, CORE_VERSION };
