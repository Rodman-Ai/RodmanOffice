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

// ---- model → File ----
// Returns a real File object rather than a blob: URL. FileTranscriber accepts
// either, but a File avoids the internal `fetch(blobUrl) → Response →
// arrayBuffer()` round-trip — meaningful on a 1 GB whisper model.
export async function getModelFile(modelId, onProgress) {
  const bytes = await getModel(modelId, onProgress);
  return new File([bytes], `${modelId}.bin`, { type: 'application/octet-stream' });
}

// ---- audio preparation (video extract / optional enhancement) ----
// transcribe.js decodes common audio itself, so for plain audio we pass the
// File straight through. For video, or when the user asks to enhance, we run
// FFmpeg.wasm to a clean 16 kHz mono WAV first.
//
// Enhancement chain (most → least conservative):
//   highpass=f=80  : kill DC / rumble / handling noise (always safe)
//   afftdn=nr=10   : FFT denoise (mild; safe and present in stock ffmpeg)
//   loudnorm       : EBU R128 loudness normalization (safe)
// The `afftdn` filter is widely shipped but if the vendored ffmpeg-core
// doesn't have it, we fall back to high-pass + loudnorm; if that fails too
// we fall back to the safe baseline.
async function tryFfmpegChain(bytes, ext, filters, onProgress) {
  const { runFfmpeg } = await import('../lib/video/ffmpeg.js');
  const inputName = `input.${ext || 'bin'}`;
  const outputName = 'audio.wav';
  const args = [
    '-i', inputName,
    '-vn', // drop any video stream
    ...(filters.length ? ['-af', filters.join(',')] : []),
    '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputName,
  ];
  return runFfmpeg(bytes, { inputName, outputName, args, onProgress });
}

export async function prepareAudio(file, { enhance = false, onProgress, onStage, signal } = {}) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const isVideo = VIDEO_EXTS.has(ext);
  if (!isVideo && !enhance) { onStage?.('audio-passthrough'); onProgress?.(1); return file; }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  onStage?.('audio-read');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chains = enhance
    ? [
        ['highpass=f=80', 'afftdn=nr=10', 'loudnorm=I=-16:TP=-1.5:LRA=11'],
        ['highpass=f=80', 'loudnorm'],
        [], // last resort: just transcode/extract
      ]
    : [[]];

  let lastErr = null;
  for (let i = 0; i < chains.length; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const chain = chains[i];
    onStage?.(i === 0 ? 'ffmpeg-run' : 'ffmpeg-fallback');
    try {
      const out = await tryFfmpegChain(bytes, ext, chain, onProgress);
      onProgress?.(1);
      return new File([out], 'audio.wav', { type: 'audio/wav' });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      lastErr = err;
      // Try the next, less ambitious chain.
    }
  }
  throw lastErr || new Error('Audio preparation failed');
}

// ---- windowing helpers (for long recordings) -------------------------
// A long file decoded whole is one big Float32Array in the WASM heap,
// which overflows it ("Invalid typed array length"). We decode the whole
// source to 16 kHz mono ONCE in JS (cheap, on the JS heap), then feed the
// engine in time windows so the WASM heap only ever holds one window.

// Decode any audio/video File to a 16 kHz mono Float32Array using WebAudio
// (same path transcribe.js uses internally, just done once up front).
async function decodeTo16kMono(file) {
  const AC = self.AudioContext || self.webkitAudioContext;
  if (!AC) throw new Error('Web Audio API unavailable for decoding.');
  const ctx = new AC({ sampleRate: 16000 });
  try {
    const buf = await file.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    if (audio.numberOfChannels <= 1) return audio.getChannelData(0);
    // Downmix to mono by averaging channels.
    const n = audio.length;
    const out = new Float32Array(n);
    for (let c = 0; c < audio.numberOfChannels; c++) {
      const ch = audio.getChannelData(c);
      for (let i = 0; i < n; i++) out[i] += ch[i];
    }
    const inv = 1 / audio.numberOfChannels;
    for (let i = 0; i < n; i++) out[i] *= inv;
    return out;
  } finally {
    try { await ctx.close(); } catch { /* ignore */ }
  }
}

// Wrap a Float32 PCM slice ([-1,1], 16 kHz mono) in a minimal WAV File so
// transcribe.js can decode it through its normal File path.
function floatToWavFile(float32, sampleRate = 16000) {
  const n = float32.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const ws = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE');
  ws(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ws(36, 'data'); view.setUint32(40, n * 2, true);
  let off = 44;
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new File([buffer], 'window.wav', { type: 'audio/wav' });
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
// transcribe.js segments may include per-token probabilities in a few
// shapes across versions: `tokens:[{text,p}]`, `tokens:[{word,p}]`,
// `offsets.tokens:[…]`, or the whisper.cpp `t_dtw` arrays. We accept the
// common ones and degrade gracefully when absent.
function extractTokens(seg) {
  const raw = seg.tokens || seg.offsets?.tokens || seg.words || null;
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const t of raw) {
    if (!t) continue;
    const text = (t.text ?? t.word ?? t.token ?? '').toString();
    const p = typeof t.p === 'number' ? t.p
            : typeof t.prob === 'number' ? t.prob
            : typeof t.probability === 'number' ? t.probability : null;
    // Skip whisper's special tokens (start with "<|" or "[_")
    if (!text || /^(<\||\[_)/.test(text)) continue;
    if (p == null) continue;
    out.push({ text: text.trim(), p: Math.max(0, Math.min(1, p)) });
  }
  return out.length ? out : null;
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
    const text = (seg.text || '').trim();
    const tokens = extractTokens(seg);
    const conf = tokens
      ? tokens.reduce((s, t) => s + t.p, 0) / tokens.length
      : (typeof seg.p === 'number' ? seg.p : null);
    const out = { t0, t1, text };
    if (tokens) out.tokens = tokens;
    if (typeof conf === 'number') out.conf = conf;
    return out;
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

  const signal = o.signal;
  const throwIfAborted = () => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
  throwIfAborted();

  o.onStage?.('loading-engine');
  const { FileTranscriber, createModule } = await loadEngine();
  o.onStage?.('engine-loaded');
  throwIfAborted();
  const modelId = o.modelId || DEFAULT_MODEL_ID;
  o.onStage?.('downloading-model');
  const modelFile = await getModelFile(modelId, o.onModel);
  o.onStage?.('model-loaded');
  throwIfAborted();

  // ---- decide on windowing --------------------------------------------
  // Long audio decoded whole overflows the WASM heap. If we know the
  // duration and it's long, we decode to 16 kHz mono once in JS and feed
  // the engine in windows. WINDOW_SEC keeps each window's Float32 small
  // (~19 MB at 5 min); the model stays resident across windows.
  const WINDOW_SEC = 300;
  const OVERLAP_SEC = 1; // small overlap so a word isn't clipped at a cut
  let windowCount = 1;   // set from the ACTUAL decoded length below

  const live = [];
  // Different transcribe.js builds fire the streaming hook under different
  // names (onSegment / onNewSegment / print_segment); register the same fn
  // under all and dedup by `t0|t1|text-prefix`. In windowed mode the engine
  // reports window-relative times, so we shift by the current window start.
  const seenKeys = new Set();
  let firstSegmentSeen = false;
  let windowStartSec = 0;
  let windowIndex = 0;
  // Progress is reported in AUDIO TIME: how many seconds of the recording
  // have been transcribed (monotonic), out of the total. This is far more
  // accurate than the engine's coarse per-window callback — it advances
  // with every streamed segment (each segment ≈ a line) and naturally
  // accounts for unequal last windows. We report a structured object so
  // the UI can show "window N/M · MM:SS / MM:SS".
  let totalSec = 0;        // set after decode
  let currentWindowSec = 0; // duration of the window being transcribed
  let processedSec = 0;     // max audio-seconds transcribed so far
  const report = (sec) => {
    processedSec = Math.max(processedSec, Math.min(sec, totalSec || sec));
    o.onProgress?.({
      ratio: totalSec ? Math.min(1, processedSec / totalSec) : 0,
      processedSec,
      totalSec,
      window: windowIndex + 1,
      windowCount,
    });
  };
  const ingest = (seg) => {
    const [norm] = normalizeSegments([seg]);
    if (!norm) return;
    const shifted = windowStartSec
      ? { ...norm, t0: norm.t0 + windowStartSec, t1: norm.t1 + windowStartSec }
      : norm;
    const key = `${shifted.t0.toFixed(3)}|${shifted.t1.toFixed(3)}|${shifted.text.slice(0, 32)}`;
    if (seenKeys.has(key)) return;
    if (!firstSegmentSeen) { firstSegmentSeen = true; o.onStage?.('first-segment'); }
    seenKeys.add(key);
    live.push(shifted);
    o.onSegment?.(shifted);
    report(shifted.t1); // each segment advances the audio-time progress
  };
  const onSegment = (seg) => { if (!signal?.aborted) ingest(seg); };

  const transcriber = new FileTranscriber({
    createModule,
    model: modelFile,
    // The engine's own progress fraction (0..1 of the current window) is a
    // useful fallback between segments — convert it to audio seconds.
    onProgress: (p) => {
      const frac = typeof p === 'number' ? p / 100 : 0;
      report(windowStartSec + frac * currentWindowSec);
    },
    onSegment,
    onNewSegment: onSegment,
    print_segment: onSegment,
  });

  // If we get aborted while transcribe.js is running, the cleanest thing
  // we can do from JS is tear the transcriber down — transcribe.js
  // doesn't document an abort path.
  const onAbort = () => { try { transcriber.destroy?.(); } catch { /* noop */ } };
  signal?.addEventListener?.('abort', onAbort, { once: true });

  const tOpts = {
    lang: o.language || 'en',
    translate: !!o.translate,
    threads: o.threads || Math.min(navigator.hardwareConcurrency || 4, 8),
    suppress_non_speech: o.suppressNonSpeech !== false, // default ON
    ...(o.audioCtx ? { audio_ctx: o.audioCtx } : {}),
    ...(o.maxTokens ? { max_tokens: o.maxTokens } : {}),
    ...(o.maxLen ? { max_len: o.maxLen } : {}),
  };

  const friendlyOom = (err) => {
    const msg = err?.message || String(err);
    if (/Invalid typed array length|out of memory|RuntimeError/i.test(msg)) {
      const m = /Invalid typed array length:\s*(\d+)/.exec(msg);
      const mins = m ? Math.round(+m[1] / 16000 / 60) : 0; // length = 16 kHz Float32 samples
      return new Error(
        'Ran out of memory while loading the audio into the engine' +
        (mins > 0 ? ` (~${mins} min)` : '') +
        '. Try a shorter clip, a smaller model (medium / base.en), or fewer threads. (' + msg + ')',
      );
    }
    return err;
  };

  // Run one transcribe pass over a (small) File, reconciling its final
  // result into `live` (covers builds that only return at the end).
  const runPass = async (file) => {
    let result;
    try {
      result = await transcriber.transcribe(file, tOpts);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw friendlyOom(err);
    }
    for (const s of normalizeSegments(result)) ingest(s);
  };

  try {
    o.onStage?.('initialising-engine');
    await transcriber.init();
    o.onStage?.('engine-initialised');
    throwIfAborted();

    // ALWAYS decode to 16 kHz mono in JS first (on the JS heap — the same
    // decode transcribe.js does internally, just once up front), then
    // transcribe in windows sized to keep each chunk's Float32 small in the
    // WASM heap. Short clips are simply a single window. The window count
    // comes from the ACTUAL decoded length, so it never depends on a
    // possibly-unknown/zero duration hint — that was why a 26-min file
    // slipped through as "short" and OOM'd.
    o.onStage?.('decoding-audio');
    let pcm;
    try {
      pcm = await decodeTo16kMono(o.file);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new Error(
        'Could not decode the audio. The file may be too large to decode in ' +
        'one piece in this browser, or in an unsupported codec — try converting ' +
        'it to WAV/MP3 first. (' + (err?.message || err) + ')',
      );
    }
    throwIfAborted();
    const sr = 16000;
    const winLen = WINDOW_SEC * sr;
    const overlap = OVERLAP_SEC * sr;
    windowCount = Math.max(1, Math.ceil(pcm.length / winLen));
    totalSec = pcm.length / sr; // drives audio-time progress
    o.onStage?.('audio-ready');

    for (windowIndex = 0; windowIndex < windowCount; windowIndex++) {
      throwIfAborted();
      const startSample = windowIndex * winLen;
      if (startSample >= pcm.length) break;
      windowStartSec = startSample / sr;
      const endSample = Math.min(pcm.length, startSample + winLen + (windowCount > 1 ? overlap : 0));
      // Exclude the look-ahead overlap from the window's "own" duration so
      // progress maps cleanly onto the recording timeline.
      currentWindowSec = Math.min(WINDOW_SEC, totalSec - windowStartSec);
      let winFile = floatToWavFile(pcm.subarray(startSample, endSample), sr);
      if (o.enhance) {
        winFile = await prepareAudio(winFile, { enhance: true, signal, onProgress: o.onPrepare });
      }
      throwIfAborted();
      o.onStage?.(windowCount > 1 ? `transcribing window ${windowIndex + 1}/${windowCount}` : 'transcribing');
      await runPass(winFile);
    }
    windowStartSec = 0;
    throwIfAborted();
    return { segments: live.slice() };
  } finally {
    signal?.removeEventListener?.('abort', onAbort);
    try { transcriber.destroy?.(); } catch { /* noop */ }
  }
}

// ----------------------------------------------------------------------
// Claude (BYOK) proofread — top-10 #8.
// Maps cleaned text back to segments by chunked index so timestamps,
// segment count, and order are preserved. Returns a NEW segments array
// (caller decides accept/revert).
// ----------------------------------------------------------------------
const PROOFREAD_SYSTEM = `You are a careful transcription proofreader.
You receive a list of numbered transcript segments and return the same
list, in the same order, with the same number of items. For each item:
- fix obvious punctuation, capitalization, and spelling slips
- normalize obvious dictation glitches (run-on words, missing spaces)
- DO NOT add, remove, reorder, or rephrase content
- DO NOT translate
- Preserve speaker meaning exactly; if a segment is unclear, leave it.
Return ONLY a JSON array of strings, one per input segment, same length.`;

const PROOFREAD_CHUNK = 30; // segments per Claude call

export async function proofreadWithClaude(segments, { apiKey, model, onProgress, signal } = {}) {
  if (!segments?.length) return segments;
  if (!apiKey) throw new Error('Anthropic API key required for proofreading.');
  const { sendClaudeMessage } = await import('../lib/claude/index.js');
  const out = segments.map((s) => ({ ...s }));
  const total = Math.ceil(segments.length / PROOFREAD_CHUNK);

  for (let chunkIdx = 0; chunkIdx < total; chunkIdx++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const start = chunkIdx * PROOFREAD_CHUNK;
    const slice = segments.slice(start, start + PROOFREAD_CHUNK);
    const listing = slice.map((s, i) => `${i + 1}. ${s.text.replace(/\n/g, ' ')}`).join('\n');
    const { text } = await sendClaudeMessage({
      apiKey,
      model,
      maxTokens: 4096,
      system: PROOFREAD_SYSTEM,
      messages: [{ role: 'user', content: `Proofread the following ${slice.length} segments:\n\n${listing}\n\nReturn a JSON array of ${slice.length} strings.` }],
      signal,
    });
    let cleaned;
    try {
      const m = text.match(/\[[\s\S]*\]/);
      cleaned = m ? JSON.parse(m[0]) : JSON.parse(text);
    } catch {
      // If parsing fails, leave this chunk untouched.
      onProgress?.((chunkIdx + 1) / total);
      continue;
    }
    if (!Array.isArray(cleaned) || cleaned.length !== slice.length) {
      onProgress?.((chunkIdx + 1) / total);
      continue;
    }
    for (let i = 0; i < slice.length; i++) {
      if (typeof cleaned[i] === 'string' && cleaned[i].trim()) {
        out[start + i] = { ...out[start + i], text: cleaned[i].trim(), proofread: true };
      }
    }
    onProgress?.((chunkIdx + 1) / total);
  }
  return out;
}

// ----------------------------------------------------------------------
// Claude (BYOK) translate
// ----------------------------------------------------------------------
const TRANSLATE_SYSTEM = `You are a careful transcript translator.
You receive a numbered list of transcript segments and return a JSON
array of strings, one per input segment, with the same order and the
same number of items. Translate the text into the requested language.
Do NOT add, remove, reorder, or rephrase content. Preserve speaker
meaning exactly. Return ONLY the JSON array.`;

export async function translateWithClaude(segments, { apiKey, model, targetLanguage, onProgress, signal } = {}) {
  if (!segments?.length) return segments;
  if (!apiKey) throw new Error('Anthropic API key required.');
  if (!targetLanguage) throw new Error('Pick a target language.');
  const { sendClaudeMessage } = await import('../lib/claude/index.js');
  const out = segments.map((s) => ({ ...s }));
  const CHUNK = 30;
  const total = Math.ceil(segments.length / CHUNK);
  for (let chunkIdx = 0; chunkIdx < total; chunkIdx++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const start = chunkIdx * CHUNK;
    const slice = segments.slice(start, start + CHUNK);
    const listing = slice.map((s, i) => `${i + 1}. ${s.text.replace(/\n/g, ' ')}`).join('\n');
    const { text } = await sendClaudeMessage({
      apiKey, model, maxTokens: 4096,
      system: TRANSLATE_SYSTEM,
      messages: [{
        role: 'user',
        content: `Translate the following ${slice.length} segments to ${targetLanguage}. Return a JSON array of ${slice.length} strings.\n\n${listing}`,
      }],
      signal,
    });
    let translated;
    try {
      const m = text.match(/\[[\s\S]*\]/);
      translated = m ? JSON.parse(m[0]) : JSON.parse(text);
    } catch { onProgress?.((chunkIdx + 1) / total); continue; }
    if (!Array.isArray(translated) || translated.length !== slice.length) {
      onProgress?.((chunkIdx + 1) / total); continue;
    }
    for (let i = 0; i < slice.length; i++) {
      if (typeof translated[i] === 'string' && translated[i].trim()) {
        out[start + i] = { ...out[start + i], text: translated[i].trim(), translated: true };
      }
    }
    onProgress?.((chunkIdx + 1) / total);
  }
  return out;
}

// ----------------------------------------------------------------------
// Claude (BYOK) summary + chapters
// ----------------------------------------------------------------------
export async function summarizeWithClaude(segments, { apiKey, model, signal } = {}) {
  if (!segments?.length) return { tldr: '', chapters: [] };
  if (!apiKey) throw new Error('Anthropic API key required.');
  const { sendClaudeMessage } = await import('../lib/claude/index.js');
  // Render the transcript with rough HH:MM:SS prefixes so chapter
  // timestamps can be grounded.
  const stamp = (s) => {
    const t = Math.max(0, Math.floor(s));
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return (h ? `${pad(h)}:` : '') + `${pad(m)}:${pad(sec)}`;
  };
  const body = segments.map((s) => `[${stamp(s.t0)}] ${s.text}`).join('\n');
  const { text } = await sendClaudeMessage({
    apiKey, model, maxTokens: 2048,
    system: `Return strict JSON: {"tldr": "<2–4 sentence summary>", "chapters": [{"t":"HH:MM:SS","title":"…"}]}. Pick 3–8 chapter cuts at natural topic shifts. Do not invent content; only describe what's in the transcript.`,
    messages: [{ role: 'user', content: `Transcript:\n${body}\n\nReturn JSON only.` }],
    signal,
  });
  let payload = { tldr: '', chapters: [] };
  try {
    const m = text.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : JSON.parse(text);
    if (typeof parsed.tldr === 'string') payload.tldr = parsed.tldr.trim();
    if (Array.isArray(parsed.chapters)) {
      payload.chapters = parsed.chapters
        .filter((c) => c && typeof c.t === 'string' && typeof c.title === 'string')
        .map((c) => ({ t: c.t.trim(), title: c.title.trim() }));
    }
  } catch { /* return defaults */ }
  return payload;
}

/** Format a segment list to the requested target extension. */
export function formatTranscript(segments, ext) {
  const fmt = FORMATTERS[ext];
  if (!fmt) throw new Error(`Unsupported transcript format: ${ext}`);
  return fmt(segments);
}
