# RodmanTranscribe (`/transcription/`)

A standalone, browser-only speech-to-text studio built for **maximum
English quality**. Drop audio/video (or record from the mic), and a
whisper.cpp `large-v3` model transcribes it locally — nothing is
uploaded.

## How it works

```
input  ──► (video / "enhance")  FFmpeg.wasm → 16 kHz mono WAV   ┐
       ──► (plain audio, decoded by transcribe.js itself)        ├─► whisper.cpp WASM (transcribe.js)
                                                                 ┘        │
   model (ggml .bin) streamed from HuggingFace, cached locally  ─────────┤
                                                                          ▼
                                                       segments → live transcript
                                                       → TXT / SRT / VTT / MD / JSON
```

## Engine — transcribe.js (prebuilt whisper.cpp WASM)

The transcription engine is the **transcribe.js** project (MIT):

- `@transcribe/transcriber@3.0.1` — high-level `FileTranscriber`.
- `@transcribe/shout@1.0.7` — the multi-threaded whisper.cpp WASM build.

These are loaded at runtime from jsdelivr via the import map in
`index.html` (pinned versions). The `shout` glue resolves its sibling
`.wasm` + pthread worker from the same CDN directory automatically. No
build step; nothing is compiled in this repo.

- Source: <https://github.com/TranscribeJs/transcribe.js>
- Docs: <https://www.transcribejs.dev/docs/>

To self-host instead of CDN, copy the package files under
`transcription/vendor/transcribe/` and repoint the import map at the
local paths.

## Cross-origin isolation

The multi-threaded WASM needs `SharedArrayBuffer`, which requires the
page to be `crossOriginIsolated` (COOP + COEP). GitHub Pages can't set
headers, so `sw.js` synthesizes them with the **coi-serviceworker**
technique (COOP `same-origin` + COEP `credentialless`) and the page
reloads once on first visit to come under the worker. `credentialless`
(rather than `require-corp`) lets the cross-origin model + CDN fetches
load without per-resource CORP headers.

## Models

Defined in `/lib/audio/model-store.js` (shared with the converter):

| id | size | notes |
| --- | --- | --- |
| `large-v3-q5_0` | ~1.08 GB | **default** — max English quality |
| `large-v3-turbo-q5_0` | ~574 MB | near-max, much faster |
| `medium.en-q5_0` | ~539 MB | lighter |
| `base.en-q5_1` | ~57 MB | quick (the converter's default) |

Models stream from `huggingface.co/ggerganov/whisper.cpp` on first use
with a progress bar, and are cached locally (Cache Storage for the big
ones, IndexedDB for `base`). The service worker never precaches them.

## Reused suite engines

- `/lib/audio/model-store.js` — model catalog, streaming download, cache.
- `/lib/audio/formats.js` — `segments[] → txt/srt/vtt/json/md`.
- `/lib/video/ffmpeg.js` — FFmpeg.wasm for video audio-extraction + the
  optional denoise/normalize "enhance" pass.
- `/lib/ui/dropzone.js` — the shared window drag-and-drop helper.

## Caveats

- The 1 GB model under cross-origin isolation is memory-heavy; a desktop
  with 8 GB+ RAM is recommended. The in-app picker offers turbo / medium
  / base for lighter devices.
- Requires a browser that supports `SharedArrayBuffer` once isolated
  (recent Chrome, Edge, Firefox; desktop recommended).
