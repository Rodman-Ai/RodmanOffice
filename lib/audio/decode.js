/**
 * @file Audio decoding helpers for whisper.cpp.
 *
 * Reuses the FFmpeg.wasm singleton from `/lib/video/` to decode any
 * audio or video file to `s16le 16kHz mono` PCM, then converts to
 * `Float32Array` in `[-1, 1]` — the format whisper.cpp wants directly.
 *
 * Long inputs are split into overlapping windows so a multi-hour
 * recording doesn't blow the 4 GB WASM heap.
 */

import { runFfmpeg } from "../video/ffmpeg.js";

const SAMPLE_RATE = 16000;
const CHANNELS = 1;

// Whisper internally chunks at 30 s. We pre-window at 10 minutes with
// a 10 s overlap so the engine can still resolve sentence boundaries
// across our cuts. Anything shorter than the threshold runs as one
// piece — the typical podcast / meeting case.
const WINDOW_SECONDS = 600;
const OVERLAP_SECONDS = 10;
const CHUNK_THRESHOLD_SECONDS = 20 * 60;

/**
 * Run FFmpeg to decode the source to a raw `s16le 16 kHz mono` PCM
 * stream. Returns the raw little-endian bytes.
 */
async function extractPcmS16le(bytes, sourceExt, onProgress) {
  const inputName = `input.${sourceExt}`;
  const outputName = "audio.raw";
  const args = [
    "-i", inputName,
    "-vn",
    "-ar", String(SAMPLE_RATE),
    "-ac", String(CHANNELS),
    "-c:a", "pcm_s16le",
    "-f", "s16le",
    outputName,
  ];
  return runFfmpeg(bytes, { inputName, outputName, args, onProgress });
}

/**
 * Convert raw `s16le` bytes to a `Float32Array` in [-1, 1].
 * Whisper wants this exact shape — no header, no metadata.
 */
function pcmS16leToFloat32(s16leBytes) {
  // The Uint8Array view may be unaligned at byte 0 if the buffer came
  // from FFmpeg with an offset. Copy into a fresh aligned buffer so we
  // can take an Int16Array view safely.
  const aligned = new Uint8Array(s16leBytes.byteLength);
  aligned.set(s16leBytes);
  const i16 = new Int16Array(aligned.buffer);
  const f32 = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) {
    f32[i] = i16[i] / 32768;
  }
  return f32;
}

/**
 * Decode a source file (audio or video) all the way to whisper-ready
 * Float32 samples. If the result is long, returns an array of
 * overlapping windows so the caller can transcribe in chunks; otherwise
 * returns a single-element array.
 *
 * @returns {Promise<{ windows: Array<{ samples: Float32Array, startSec: number }>, durationSec: number }>}
 */
export async function decodeToWhisperInput(bytes, sourceExt, onProgress) {
  const raw = await extractPcmS16le(bytes, sourceExt, onProgress);
  const samples = pcmS16leToFloat32(raw);
  const durationSec = samples.length / SAMPLE_RATE;

  if (durationSec <= CHUNK_THRESHOLD_SECONDS) {
    return { windows: [{ samples, startSec: 0 }], durationSec };
  }

  const windowSamples = WINDOW_SECONDS * SAMPLE_RATE;
  const stride = (WINDOW_SECONDS - OVERLAP_SECONDS) * SAMPLE_RATE;
  const windows = [];
  for (let start = 0; start < samples.length; start += stride) {
    const end = Math.min(start + windowSamples, samples.length);
    windows.push({
      samples: samples.subarray(start, end),
      startSec: start / SAMPLE_RATE,
    });
    if (end === samples.length) break;
  }
  return { windows, durationSec };
}

export const WHISPER_SAMPLE_RATE = SAMPLE_RATE;
