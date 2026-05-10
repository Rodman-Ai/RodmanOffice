// =============================================================
//  FFmpeg.wasm wrapper.
//
//  Lazy-loads the vendored ffmpeg-core.wasm (~25 MB) on the
//  first call to loadFfmpeg() and caches the FFmpeg instance for
//  the rest of the page session. The browser HTTP cache then
//  holds the wasm binary across visits.
//
//  This file is the only place in the suite that knows about
//  FFmpeg. lib/video/index.js exposes the high-level transcode
//  / extractFrame helpers the converter actually calls.
// =============================================================

import { FFmpeg } from './vendor/ffmpeg/ffmpeg.mjs';

// Resolve vendor URLs relative to this module so they work
// regardless of where /lib/video/ is mounted on the origin.
const CORE_URL   = new URL('./vendor/ffmpeg/ffmpeg-core.js',   import.meta.url).toString();
const WASM_URL   = new URL('./vendor/ffmpeg/ffmpeg-core.wasm', import.meta.url).toString();
const WORKER_URL = new URL('./vendor/ffmpeg/ffmpeg-worker.mjs', import.meta.url).toString();

let _instance = null;
let _loadPromise = null;

/**
 * Return a memoized FFmpeg instance. The first caller pays the
 * one-time wasm download; subsequent callers resolve immediately.
 *
 * @param {{ onLog?: (line: string) => void }} [opts]
 * @returns {Promise<FFmpeg>}
 */
export function loadFfmpeg(opts = {}) {
  if (_instance) return Promise.resolve(_instance);
  if (_loadPromise) return _loadPromise;
  const ff = new FFmpeg();
  if (opts.onLog) ff.on('log', ({ message }) => opts.onLog(message));
  _loadPromise = ff
    .load({
      coreURL: CORE_URL,
      wasmURL: WASM_URL,
      classWorkerURL: WORKER_URL,
    })
    .then(() => { _instance = ff; return ff; })
    .catch((err) => {
      _loadPromise = null;
      throw err;
    });
  return _loadPromise;
}

// Ratio is reported by FFmpeg as a number in [0, 1] with occasional
// values >1 near the end of an encode — clamp to keep the UI sane.
function attachProgress(ff, onProgress) {
  if (!onProgress) return () => {};
  const handler = ({ progress }) => {
    if (typeof progress !== 'number' || !isFinite(progress)) return;
    onProgress(Math.max(0, Math.min(1, progress)));
  };
  ff.on('progress', handler);
  return () => ff.off('progress', handler);
}

/**
 * Run an arbitrary ffmpeg command. The caller writes the input
 * file with `ff.writeFile` first, then this returns the bytes of
 * the named output file. `cleanup` defaults to true and removes
 * both input and output from the in-memory FS so subsequent calls
 * see a clean slate.
 *
 * @param {Uint8Array} bytes
 * @param {{
 *   inputName: string,
 *   outputName: string,
 *   args: string[],
 *   onProgress?: (ratio: number) => void,
 *   cleanup?: boolean,
 * }} opts
 * @returns {Promise<Uint8Array>}
 */
export async function runFfmpeg(bytes, opts) {
  const ff = await loadFfmpeg();
  const detach = attachProgress(ff, opts.onProgress);
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  await ff.writeFile(opts.inputName, input);
  try {
    const code = await ff.exec(opts.args);
    if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    const out = await ff.readFile(opts.outputName);
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  } finally {
    detach();
    if (opts.cleanup !== false) {
      try { await ff.deleteFile(opts.inputName); } catch { /* already gone */ }
      try { await ff.deleteFile(opts.outputName); } catch { /* already gone */ }
    }
  }
}
