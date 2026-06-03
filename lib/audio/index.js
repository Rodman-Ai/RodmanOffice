/**
 * @file Public surface of the audio / speech-to-text engine.
 * Consumed by `/converter/app.js` via a lazy `import('../lib/audio/index.js')`.
 */

import { decodeToWhisperInput } from "./decode.js";
import { transcribeWindow, ensureEngineAvailable } from "./whisper.js";
import { getModel, MODELS, DEFAULT_MODEL_ID } from "./model-store.js";
import { FORMATTERS } from "./formats.js";

export { MODELS, DEFAULT_MODEL_ID, getModel, ensureEngineAvailable, FORMATTERS };

/**
 * End-to-end transcript pipeline:
 *   bytes (audio or video) → FFmpeg PCM → whisper.cpp segments → format.
 *
 * `onProgress` receives stage tags so the converter UI can render a
 * meaningful status string:
 *   { stage: 'engine',   phase: 'instantiating' | 'transcribing' }
 *   { stage: 'model',    loaded, total, fromCache }
 *   { stage: 'decode',   ratio }       // ffmpeg
 *   { stage: 'whisper',  ratio }       // window i / total
 */
export async function transcribe(bytes, opts) {
  const {
    sourceExt,
    targetExt,
    modelId = DEFAULT_MODEL_ID,
    language = "en",
    onProgress,
  } = opts;

  await ensureEngineAvailable();

  onProgress?.({ stage: "model", loaded: 0, total: MODELS[modelId]?.bytes || 0 });
  const modelBytes = await getModel(modelId, (p) => {
    onProgress?.({ stage: "model", ...p });
  });

  const { windows, durationSec } = await decodeToWhisperInput(
    bytes,
    sourceExt,
    (ratio) => onProgress?.({ stage: "decode", ratio }),
  );

  const allSegments = [];
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    onProgress?.({ stage: "whisper", ratio: i / windows.length, durationSec });
    const segs = await transcribeWindow({
      modelKey: modelId,
      modelBytes,
      samples: w.samples,
      language,
      onProgress,
    });
    // Shift relative timestamps back into the original timeline.
    for (const s of segs) allSegments.push({ t0: s.t0 + w.startSec, t1: s.t1 + w.startSec, text: s.text });
  }
  onProgress?.({ stage: "whisper", ratio: 1, durationSec });

  const formatter = FORMATTERS[targetExt];
  if (!formatter) throw new Error(`Unsupported transcript target: .${targetExt}`);
  return formatter(allSegments);
}

/** Output targets the converter exposes for audio + video sources. */
export const TRANSCRIPT_TARGETS = new Set(Object.keys(FORMATTERS));
