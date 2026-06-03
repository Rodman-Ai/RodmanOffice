/**
 * @file whisper.cpp WASM engine wrapper.
 *
 * Loads the single-threaded WASM build vendored at
 * `./vendor/whisper/libmain.{js,wasm}` (Emscripten Module factory),
 * binds the C `whisper_init_from_buffer` + `whisper_full` API, and
 * returns the segments array.
 *
 * The vendor blob is large enough that we don't even import the JS
 * glue until the first transcribe call.
 *
 * **If the vendor blob is missing**, the loader throws a clear error
 * pointing at `lib/audio/README.md`'s build instructions — the rest
 * of the converter keeps working.
 */

const VENDOR_JS_URL = new URL("./vendor/whisper/libmain.js", import.meta.url);
const VENDOR_WASM_URL = new URL("./vendor/whisper/libmain.wasm", import.meta.url);

let _modulePromise = null;
let _activeContextId = null;
let _activeModelKey = null;

const NOT_INSTALLED = new Error(
  "Transcription engine isn't installed in this build. " +
    "Run the build steps in lib/audio/README.md or commit a known-good " +
    "prebuilt artifact into lib/audio/vendor/whisper/.",
);

async function vendorPresent() {
  try {
    const res = await fetch(VENDOR_WASM_URL, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function loadEmscriptenModule(onProgress) {
  if (_modulePromise) return _modulePromise;
  _modulePromise = (async () => {
    if (!(await vendorPresent())) throw NOT_INSTALLED;
    // The vendor JS is an Emscripten `MODULARIZE=1` factory exposed
    // either as a default export (newer builds) or attached to
    // `globalThis.Module`. Dynamic-import it so it lazy-loads.
    const mod = await import(/* @vite-ignore */ VENDOR_JS_URL.toString());
    const Factory =
      typeof mod === "function"
        ? mod
        : mod?.default || mod?.Module || globalThis.Module;
    if (typeof Factory !== "function") {
      throw new Error("Whisper vendor glue did not expose a Module factory");
    }
    onProgress?.({ stage: "engine", phase: "instantiating" });
    const instance = await Factory({
      locateFile: (name) => {
        if (name.endsWith(".wasm")) return VENDOR_WASM_URL.toString();
        return new URL(`./vendor/whisper/${name}`, import.meta.url).toString();
      },
      print: () => {}, // swallow stdout chatter
      printErr: () => {}, // swallow stderr chatter
    });
    return instance;
  })();
  try {
    return await _modulePromise;
  } catch (err) {
    _modulePromise = null;
    throw err;
  }
}

/**
 * Ensure the model is resident in the WASM heap. The upstream JS
 * binding shipped with whisper.cpp exposes the model as an Emscripten
 * preloaded file via `FS_createDataFile` — we mirror that pattern.
 *
 * Reuses the previously loaded model if the key matches.
 */
async function ensureModelLoaded(instance, modelKey, modelBytes) {
  if (_activeContextId !== null && _activeModelKey === modelKey) return _activeContextId;

  if (typeof instance.FS_createDataFile === "function") {
    try {
      instance.FS_unlink("/whisper.bin");
    } catch { /* not yet present */ }
    instance.FS_createDataFile("/", "whisper.bin", modelBytes, true, true);
  } else if (instance.FS?.writeFile) {
    instance.FS.writeFile("/whisper.bin", modelBytes);
  } else {
    throw new Error("Whisper vendor glue exposes neither FS_createDataFile nor FS.writeFile");
  }

  // The example whisper.wasm binding exposes `init(path)` that returns
  // an integer context id; pass our virtual-FS path.
  const init = instance.init || instance._init || instance.cwrap?.("init", "number", ["string"]);
  if (typeof init !== "function") {
    throw new Error("Whisper vendor glue did not expose an init(path) entrypoint");
  }
  const ctx = init("whisper.bin");
  if (!ctx || ctx < 0) throw new Error("whisper_init_from_file failed");
  _activeContextId = ctx;
  _activeModelKey = modelKey;
  return ctx;
}

/**
 * Read the segments produced by the most recent `full_default` call.
 * Returns `[{ t0, t1, text }]` with timestamps in seconds.
 *
 * Different vendor builds expose this differently; we try the
 * canonical names in order.
 */
function drainSegments(instance) {
  const segs = [];
  const nseg = (
    instance.full_n_segments ||
    instance._full_n_segments ||
    instance.cwrap?.("full_n_segments", "number", ["number"])
  );
  const getStart = (
    instance.full_get_segment_t0 ||
    instance.cwrap?.("full_get_segment_t0", "number", ["number", "number"])
  );
  const getEnd = (
    instance.full_get_segment_t1 ||
    instance.cwrap?.("full_get_segment_t1", "number", ["number", "number"])
  );
  const getText = (
    instance.full_get_segment_text ||
    instance.cwrap?.("full_get_segment_text", "string", ["number", "number"])
  );
  if (![nseg, getStart, getEnd, getText].every((f) => typeof f === "function")) {
    return segs; // binding doesn't expose them — caller will fall back to a single chunk of plain text
  }
  const n = nseg(_activeContextId);
  for (let i = 0; i < n; i++) {
    // whisper.cpp returns timestamps in 10 ms units (cs).
    segs.push({
      t0: getStart(_activeContextId, i) / 100,
      t1: getEnd(_activeContextId, i) / 100,
      text: getText(_activeContextId, i),
    });
  }
  return segs;
}

/**
 * Transcribe a single window of audio.
 *
 * @param {object} opts
 * @param {string} opts.modelKey         For change-detection across runs.
 * @param {Uint8Array} opts.modelBytes
 * @param {Float32Array} opts.samples    Mono 16 kHz, in [-1, 1].
 * @param {string} [opts.language]       "en" | "auto" | ISO-639-1 code.
 * @param {(p: any) => void} [opts.onProgress]
 * @returns {Promise<Array<{t0:number, t1:number, text:string}>>}
 */
export async function transcribeWindow(opts) {
  const instance = await loadEmscriptenModule(opts.onProgress);
  await ensureModelLoaded(instance, opts.modelKey, opts.modelBytes);

  // The upstream whisper.wasm example exposes `full_default(ctx, samplesPtr,
  // nSamples, lang, translate, threads)`. We wrap it via cwrap if the high-
  // level binding isn't already pre-wrapped on the Module.
  const fullDefault =
    instance.full_default ||
    instance.cwrap?.("full_default", "number", [
      "number",
      "number",
      "number",
      "string",
      "number",
      "number",
    ]);
  if (typeof fullDefault !== "function") {
    throw new Error("Whisper vendor glue did not expose full_default()");
  }

  // Copy samples into the WASM heap.
  const bytes = opts.samples.byteLength;
  const ptr = instance._malloc(bytes);
  try {
    instance.HEAPF32.set(opts.samples, ptr >> 2);
    opts.onProgress?.({ stage: "engine", phase: "transcribing" });
    const rc = fullDefault(
      _activeContextId,
      ptr,
      opts.samples.length,
      opts.language || "en",
      0, // translate = false
      1, // n_threads (single-threaded build, anything >1 is ignored)
    );
    if (rc !== 0) throw new Error(`whisper_full failed (rc=${rc})`);
    return drainSegments(instance);
  } finally {
    instance._free(ptr);
  }
}

/**
 * Quick pre-flight that surfaces a clear error from the converter's
 * dispatch before any FFmpeg work happens.
 */
export async function ensureEngineAvailable() {
  if (!(await vendorPresent())) throw NOT_INSTALLED;
}
