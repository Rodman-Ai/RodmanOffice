# RodmanTranscribe (`/transcription/`)

A browser-only speech-to-text studio with a real **quality
post-processing pipeline** on top of `whisper.cpp` WASM. Drop audio
or video, or record from the mic — nothing is uploaded. The headline
model is `large-v3` on desktop; mobile picks a lighter model
automatically.

## What it does

```
   ┌─ FFmpeg.wasm (video → 16 kHz WAV; optional enhance)
input ─┤                                                          ┌─ TXT
   └─ transcribe.js (whisper.cpp WASM) ──► raw segments ──► [pipeline] ─┼─ SRT (line-wrapped)
                                                                     ├─ VTT (line-wrapped)
   model (ggml .bin) streamed from HuggingFace, cached locally     ├─ MD
                                                                     ├─ JSON
                                                                     └─ JSON (with token confidence)
              ┌──────────────────────────────────────────────────────┐
   pipeline ─►│ hallucination/repetition removal · energy-based VAD │
              │ gating · custom dictionary · ITN + truecase +       │
              │ punctuation · subtitle cue shaping (CPS, wrap)      │
              │ · paragraphing · quality report                     │
              └──────────────────────────────────────────────────────┘
                                            │
                                            ▼ (optional, BYOK)
                            Claude ──► proofread / translate / summary
```

Nothing leaves the device unless you paste an Anthropic key and click
one of the AI actions — and even then only the transcript text goes
out (never the audio).

## Engine — transcribe.js (prebuilt whisper.cpp WASM)

The transcription engine is the **transcribe.js** project (MIT):

- `@transcribe/transcriber@3.0.1` — high-level `FileTranscriber`.
- `@transcribe/shout@1.0.7` — the multi-threaded whisper.cpp WASM build.

These are **self-hosted** under `transcription/vendor/` (transcriber +
shout), wired via the import map in `index.html`. This is mandatory,
not an optimization: under cross-origin isolation the engine spawns its
pthread worker as `new Worker(new URL("shout.wasm.js", import.meta.url))`,
and a **cross-origin** (CDN) worker script throws `SecurityError`. The
`shout` build embeds its `.wasm` inline (base64), so the vendored `.js`
files are the whole engine — no separate binary, no build step.

- Source: <https://github.com/TranscribeJs/transcribe.js>
- Docs: <https://www.transcribejs.dev/docs/>
- Vendored: `@transcribe/transcriber@3.0.1` + `@transcribe/shout@1.0.7`
  (MIT; `LICENSE` kept alongside each under `vendor/`). To update, fetch
  the npm tarballs into `vendor/` and keep the import-map paths.

**What's NOT exposed (backlog):** transcribe.js's wrapper doesn't pass
`initial_prompt` / `temperature` / threshold tuning / beam search
through to whisper.cpp. Custom vocabulary is handled post-hoc via the
in-app dictionary instead.

## Cross-origin isolation

The multi-threaded WASM needs `SharedArrayBuffer`, which requires the
page to be `crossOriginIsolated` (COOP + COEP). GitHub Pages can't set
headers, so `sw.js` synthesizes them with the **coi-serviceworker**
technique (COOP `same-origin` + COEP `credentialless`) and the page
reloads once on first visit to come under the worker.
`credentialless` (rather than `require-corp`) lets the cross-origin
model + CDN fetches load without per-resource CORP headers.

**iOS retry pattern.** Safari is sometimes slow to bring the worker
into control on the first visit. The bootstrap reloads once
automatically; if isolation still isn't acquired, the in-page banner
shows a manual Reload button (with iOS-aware copy). The
`coiReloaded` session flag clears the moment `crossOriginIsolated`
confirms, so a returning user is never trapped.

## Models

Defined in `/lib/audio/model-store.js` (shared with the converter):

| id | size | who gets it by default |
| --- | --- | --- |
| `large-v3-q5_0` | ~1.08 GB | desktop with ≥ 8 GB RAM — **max English quality** |
| `large-v3-turbo-q5_0` | ~574 MB | (manual pick) near-max, faster |
| `medium.en-q5_0` | ~539 MB | (manual pick) lighter |
| `base.en-q5_1` | ~57 MB | **mobile / iOS / `deviceMemory ≤ 4`** — the safe default; also what the file converter uses |

The picker shows the cached state of each model. A one-tap "Use
large-v3 anyway" link is offered on low-RAM devices.

Models stream from `huggingface.co/ggerganov/whisper.cpp` on first
use with a progress bar, and are cached locally — Cache Storage for
the large ones, IndexedDB for `base`. The service worker never
precaches them.

## Features

| | what it does | where to find it in the UI |
| --- | --- | --- |
| **Quality preset** | One control to dial the whole pipeline — Max / Balanced / Fast | Settings → Quality preset |
| **Confidence highlighting** | Tints low-probability words; works at word level when transcribe.js returns tokens, segment level otherwise | Transcript toolbar → Confidence |
| **Hallucination + repetition removal** | Drops whisper's classic "Thanks for watching" silence hallucinations, lone `♪`, character/phrase loops | Always-on in Max/Balanced |
| **Energy-based VAD** | Reuses the waveform's decoded PCM (no second decode) to drop segments over silent audio | Always-on in Max/Balanced |
| **Custom dictionary** | Case-smart find-replace — persisted in `localStorage` — the in-reach substitute for whisper's `initial_prompt` | Settings → 📖 Custom dictionary |
| **ITN + truecasing + punctuation** | `$20 / 25% / 50¢`, small number words, dictated punctuation, sentence-start caps, lone `i → I`, terminal punctuation | Always-on in Max/Balanced |
| **Subtitle quality** | Merge tiny cues, split fast ones at sentence/comma, enforce CPS, wrap to ≤ 42 chars × 2 lines | Reflected in SRT/VTT export |
| **Quality report** | Avg confidence, low-conf %, hallucinations removed, dictionary fixes | Below the transcript |
| **Speaking-density histogram** | 36 px canvas reusing the VAD energy map; click a bar to seek | Below the transcript |
| **Live captions overlay** | Toggleable fixed bottom strip showing the active segment large during playback | Transcript toolbar → Captions |
| **Click-to-seek timestamps** | Click any segment timestamp to seek; active segment highlights during playback | Inline |
| **Find / Replace** | Regex-escape; respects per-segment edits | Transcript toolbar → Find |
| **Editable transcript** | Type into the pane; edits are pulled back into the segment array before any re-render, AI call, or export so they survive | Inline |
| **Recent transcripts** | IndexedDB-backed history of the last 10; streams to disk during a run so an iOS background-tab kill doesn't lose work | Source panel → Recent |
| **Persistent settings** | Preset / model / language / translate / enhance / threads / suppress_non_speech | Auto-saved on change |
| **Hardware-aware defaults** | Mobile / iOS / `deviceMemory ≤ 4` → `base.en-q5_1` with fewer threads; one-tap large-v3 override | Settings (top of the panel) |
| **Cancel a running job** | The Transcribe button doubles as Cancel; streamed segments survive | Settings → Transcribe / Cancel |
| **Audio enhancement** | FFmpeg `highpass=f=80 → afftdn → loudnorm`, with safe fallbacks | Settings → Enhance audio |
| **Recording (mic)** | `MediaRecorder` with iOS-correct mime selection (`audio/mp4` first); robust teardown on errors, track-ended, beforeunload | Source panel → Record mic |
| **Drag-and-drop** | Window-level drop overlay (shared `lib/ui/dropzone.js`) | Anywhere on the page |
| **Send to RodmanWord** | Hand the transcript to `/word/` as a new doc via `localStorage['rodmanword:incoming']` | Transcript toolbar → "→ Word" |
| **Web Share** | Web Share API for text and files; clipboard fallback | Transcript toolbar → Share |
| **AI proofread** (BYOK Claude) | Chunked, strict guardrails ("no add/remove/reorder/rephrase"); accept/revert; cancel mid-call | Transcript toolbar → AI proofread |
| **AI translate** (BYOK Claude) | 9-language picker; preserves segment order/count/timing; accept/revert | Transcript toolbar → AI translate |
| **AI summary** (BYOK Claude) | TL;DR + 3–8 timestamped chapters; chapter clicks seek the player | Transcript toolbar → AI summary |
| **Exports** | TXT / SRT (wrapped) / VTT (wrapped) / MD / JSON / JSON-with-confidence | Transcript toolbar → Export |

## Privacy

- The audio file you transcribe **never leaves your browser**.
- Models stream from HuggingFace on first use and cache locally.
- transcribe.js + its WASM are pinned and self-hosted under vendor/ (same-origin, required for the worker under COI).
- The only outbound network for *transcript* data is the optional
  Claude proofread / translate / summary path, and only when you've
  pasted an Anthropic key into the AI bar.
- The Anthropic key is held in memory for the session — never
  written to disk by this app.

## Reused suite engines

- `/lib/audio/model-store.js` — model catalog, streaming download,
  Cache Storage + IndexedDB cache.
- `/lib/audio/formats.js` — `segments[] → txt / srt / vtt / md /
  json / jsonrich`, plus the shared SRT/VTT line-wrap helper used by
  the converter.
- `/lib/video/ffmpeg.js` — FFmpeg.wasm for video audio-extraction
  and the `enhance` chain.
- `/lib/ui/dropzone.js` — the shared window drag-and-drop helper.
- `/lib/claude/index.js` — BYOK Anthropic client (proofread,
  translate, summary).

## Caveats

- The 1 GB model under cross-origin isolation is memory-heavy; a
  desktop with 8 GB+ RAM is recommended. The hardware-aware default
  picks `base.en-q5_1` on phones and laptops with `deviceMemory ≤ 4`.
- Requires a browser that supports `SharedArrayBuffer` once isolated
  (recent Chrome, Edge, Firefox; iOS Safari with the COI service
  worker).
- AI proofread / translate / summary uses your Anthropic API key.
  Read the guardrail prompts in `engine.js` before relying on them
  for sensitive transcripts.
