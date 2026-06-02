# /lib/audio/ — speech-to-text engine (whisper.cpp WASM)

This module wires the converter's "audio / video → transcript" target. The
pipeline is:

```
input bytes  ──► FFmpeg.wasm (shared with /lib/video/)  ──► s16le 16kHz mono PCM
             ──► Int16 → Float32                         ──► whisper.cpp WASM
             ──► segments                                ──► .txt / .srt / .vtt / .json
```

## Public surface

`lib/audio/index.js`:

| Export | Purpose |
| --- | --- |
| `transcribe(bytes, { sourceExt, targetExt, modelId?, language?, onProgress? })` | One-shot pipeline. Returns `Uint8Array` of the chosen format. |
| `getModel(id, onProgress?)` | Resolve a model from IndexedDB or HuggingFace. |
| `ensureEngineAvailable()` | Pre-flight check — throws clearly if the WASM blob isn't vendored. |
| `MODELS` | Catalog map. |
| `DEFAULT_MODEL_ID` | `"base.en-q5_1"`. |
| `FORMATTERS` | `{ txt, srt, vtt, json }`. |
| `TRANSCRIPT_TARGETS` | `Set<"txt"|"srt"|"vtt"|"json">`. |

## Vendor blob

`vendor/whisper/libmain.{js,wasm}` is the whisper.cpp WASM build. Both the
source code (whisper.cpp) and the Whisper model weights (OpenAI) are
MIT-licensed; either may be redistributed alongside this repo.

### Source

- **whisper.cpp**: <https://github.com/ggml-org/whisper.cpp>
- Build target: `examples/whisper.wasm`

### Build invocation

Upstream ships only a pthreaded WASM build that requires
COOP+COEP-isolated browsing contexts. GitHub Pages can't set those
headers, so we build a single-threaded WASM SIMD variant:

```sh
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
emcmake cmake -B build-wasm \
  -DWHISPER_WASM_SINGLE_FILE=OFF \
  -DGGML_OPENMP=OFF \
  -DWHISPER_BUILD_EXAMPLES=ON \
  -DWHISPER_BUILD_TESTS=OFF
cmake --build build-wasm --target libmain
cp build-wasm/bin/libmain.{js,wasm} <repo>/lib/audio/vendor/whisper/
```

Single-threaded WASM SIMD is roughly 2× slower than the pthreaded build,
but it works everywhere a static GitHub Pages deployment can reach.

### "Engine isn't installed" fallback

If `vendor/whisper/libmain.wasm` is missing (e.g. a fresh checkout that
hasn't run the build yet), `ensureEngineAvailable()` throws a clear error
pointing here and the converter surfaces it to the user. Every other
converter family keeps working — there's no top-level dependency on the
audio engine.

## Models

`model-store.js` exposes one entry today:

| id | URL | Size | Notes |
| --- | --- | --- | --- |
| `base.en-q5_1` | huggingface.co/ggerganov/whisper.cpp | ~57 MB | English, q5_1 quantized. ~1.5–2× realtime single-threaded. |

The model file isn't vendored — on first use we stream it from
HuggingFace with a progress bar, then cache in IndexedDB
(`db: rodman-whisper`, store: `models`). Subsequent runs are instant
and offline-safe.

## Why no `crossOriginIsolated` shim?

`coi-serviceworker` would let us run the pthreaded build at ~2× speed,
but it's known to break embeds and complicate debugging. Single-threaded
is shippable; we can revisit if the speed difference proves painful.
