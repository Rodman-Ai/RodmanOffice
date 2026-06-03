// Thin wrapper around transcribe.js (whisper.cpp WASM) for RodmanTranscribe.
//
// transcribe.js (@transcribe/transcriber + @transcribe/shout, MIT) is the
// prebuilt, multi-threaded whisper.cpp build. The bare-module specifiers
// below resolve through the import map in index.html (pinned to jsdelivr).
// Loading is deferred so the app shell renders even before the ~MB engine
// arrives, and so a CDN hiccup surfaces as a clear error instead of a
// blank page.
//
// Reuses the suite's shared engines:
//   - ../lib/audio/model-store.js  : model catalog + streaming download + cache
//   - ../lib/audio/formats.js      : segment[] → txt/srt/vtt/json/md
//   - ../lib/video/ffmpeg.js       : FFmpeg.wasm for video audio-extraction + enhance

import {
  MODELS, DEFAULT_MODEL_ID, getModel, isModelCached, deleteModel,
} from '../lib/audio/model-store.js';
import { FORMATTERS } from '../lib/audio/formats.js';

export { MODELS, DEFAULT_MODEL_ID, isModelCached, deleteModel, FORMATTERS };

const VIDEO_EXTS = new Set([
  'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'mpg', 'mpeg', 'wmv', 'flv', '3gp', 'ts',
]);

export function isCrossOriginIsolated() {
  return typeof self !== 'undefined' && self.crossOriginIsolated === true;
}

// ---- transcribe.js module loading (memoized) ----
let _enginePromise = null;
async function loadEngine() {
  if (_enginePromise) return _enginePromise;
  _enginePromise = (async () => {
    const [{ FileTranscriber }, shoutMod] = await Promise.all([
      import('@transcribe/transcriber'),
      import('@transcribe/shout'),
    ]);
    const createModule = shoutMod.default || shoutMod;
    return { FileTranscriber, createModule };
  })().catch((err) => {
    _enginePromise = null;
    throw new Error(
      'Could not load the transcription engine (transcribe.js). ' +
      'Check your network — the engine streams from a CDN on first use. ' +
      '(' + (err?.message || err) + ')',
    );
  });
  return _enginePromise;
}

// ---- model → blob URL ----
export async function getModelBlobUrl(modelId, onProgress) {
  const bytes = await getModel(modelId, onProgress);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  return URL.createObjectURL(blob);
}

// ---- audio preparation (video extract / optional enhancement) ----
// transcribe.js decodes common audio itself, so for plain audio we pass the
// File straight through. For video, or when the user asks to enhance, we run
// FFmpeg.wasm to a clean 16 kHz mono WAV first.
export async function prepareAudio(file, { enhance = false, onProgress } = {}) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isVideo = VIDEO_EXTS.has(ext);
  if (!isVideo && !enhance) return file;

  const { runFfmpeg } = await import('../lib/video/ffmpeg.js');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inputName = `input.${ext || 'bin'}`;
  const outputName = 'audio.wav';
  // -vn drops any video; 16 kHz mono pcm_s16le is whisper's native rate.
  // When enhancing: high-pass below 80 Hz to kill rumble, then loudnorm.
  const filters = enhance ? ['-af', 'highpass=f=80,loudnorm'] : [];
  const args = [
    '-i', inputName, '-vn', ...filters,
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputName,
  ];
  const out = await runFfmpeg(bytes, { inputName, outputName, args, onProgress });
  return new File([out], 'audio.wav', { type: 'audio/wav' });
}

// ---- segment normalization ----
// transcribe.js returns segments with millisecond `offsets` and/or
// "HH:MM:SS,mmm" `from`/`to`. Normalize to the seconds-based shape that
// lib/audio/formats.js consumes: { t0, t1, text }.
function parseClock(s) {
  // "HH:MM:SS,mmm" or "HH:MM:SS.mmm"
  const m = /^(\d+):(\d+):(\d+)[.,](\d+)$/.exec(String(s || '').trim());
  if (!m) return 0;
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000;
}
function normalizeSegments(raw) {
  const arr = Array.isArray(raw) ? raw : (raw?.transcription || []);
  return arr.map((seg) => {
    let t0, t1;
    if (seg.offsets && typeof seg.offsets.from === 'number') {
      t0 = seg.offsets.from / 1000;
      t1 = seg.offsets.to / 1000;
    } else {
      t0 = parseClock(seg.from);
      t1 = parseClock(seg.to);
    }
    return { t0, t1, text: (seg.text || '').trim() };
  }).filter((s) => s.text);
}

/**
 * Run a full transcription.
 *
 * @param {object} o
 * @param {File}     o.file
 * @param {string}   [o.modelId]
 * @param {string}   [o.language='en']     'en' | 'auto' | ISO code
 * @param {boolean}  [o.translate=false]   translate to English
 * @param {number}   [o.threads]
 * @param {number}   [o.maxLen=0]          max chars per segment (0 = off)
 * @param {boolean}  [o.enhance=false]
 * @param {(p:{loaded:number,total:number,stage:string})=>void} [o.onModel]
 * @param {(ratio:number)=>void} [o.onPrepare]
 * @param {(seg:{t0:number,t1:number,text:string})=>void} [o.onSegment]
 * @param {(ratio:number)=>void} [o.onProgress]
 * @returns {Promise<{ segments: Array<{t0,t1,text}> }>}
 */
export async function transcribe(o) {
  if (!isCrossOriginIsolated()) {
    throw new Error(
      'This browser tab is not cross-origin isolated, so multi-threaded ' +
      'WebAssembly is unavailable. Reload the page; if it persists, your ' +
      'browser may not support the required isolation.',
    );
  }

  const { FileTranscriber, createModule } = await loadEngine();
  const modelId = o.modelId || DEFAULT_MODEL_ID;
  const modelUrl = await getModelBlobUrl(modelId, o.onModel);

  const audioFile = await prepareAudio(o.file, {
    enhance: !!o.enhance,
    onProgress: o.onPrepare,
  });

  const live = [];
  const onSegment = (seg) => {
    const [norm] = normalizeSegments([seg]);
    if (norm) { live.push(norm); o.onSegment?.(norm); }
  };

  const transcriber = new FileTranscriber({
    createModule,
    model: modelUrl,
    onProgress: (p) => o.onProgress?.(typeof p === 'number' ? p / 100 : 0),
    onSegment,
    // transcribe.js has used a few names across versions for the
    // per-segment hook; pass the same fn under the likely aliases so we
    // get live streaming regardless of which one the build calls.
    onNewSegment: onSegment,
    print_segment: onSegment,
  });

  try {
    await transcriber.init();
    const result = await transcriber.transcribe(audioFile, {
      lang: o.language || 'en',
      translate: !!o.translate,
      threads: o.threads || Math.min(navigator.hardwareConcurrency || 4, 8),
      ...(o.maxLen ? { max_len: o.maxLen } : {}),
    });
    // Prefer the engine's final result; fall back to streamed segments.
    let segments = normalizeSegments(result);
    if (!segments.length && live.length) segments = live;
    return { segments };
  } finally {
    try { transcriber.destroy?.(); } catch { /* noop */ }
    URL.revokeObjectURL(modelUrl);
  }
}

/** Format a segment list to the requested target extension. */
export function formatTranscript(segments, ext) {
  const fmt = FORMATTERS[ext];
  if (!fmt) throw new Error(`Unsupported transcript format: ${ext}`);
  return fmt(segments);
}
