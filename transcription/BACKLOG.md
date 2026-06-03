# RodmanTranscribe — competitor analysis and product backlog

Last updated alongside PR #100 (initial app) and the output-quality build.

## Part 1 — Competitor analysis (2026)

### A. Cloud AI transcription

| Product | Standout (output-quality) | Replicable in a static browser app? |
| --- | --- | --- |
| OpenAI `gpt-4o-transcribe` (hosted Whisper successor) | Current raw-WER leader; bundled diarization; still hallucinates on silence | Model: no (hosted). Anti-hallucination tricks: yes. |
| Deepgram Nova-3 | **Keyterm Prompting** (up to 100 domain terms) — the key accuracy lever; real-time | Concept (custom vocabulary) replicable post-hoc as deterministic find-replace. Real-time low-latency: no without backend. |
| Speechmatics Ursa 2 | Strongest accents / multilingual + diarization | No equivalent in-browser for the model; diarization aspirational. |
| AssemblyAI | Robust diarization on overlapping speech; topic/summary "speech intelligence" | Diarization: backlog (heavy ONNX). Summaries: yes (Claude/LLM). |
| Otter / Rev / Descript / Sonix / Trint / Happy Scribe / Fireflies / Notta | Editor-as-transcript, find-replace dictionaries, share/collab, meeting capture | Editor + dictionary + share: yes. Diarization: backlog. Meeting bots: out of scope. |

**Net:** cloud AI's quality edge is mainly **biasing (custom vocab/keyterms), diarization, and editor UX**. Custom vocabulary + editor UX are fully replicable; diarization is the gap.

### B. Local/desktop Whisper

| Product | Standout | Notes |
| --- | --- | --- |
| **MacWhisper** | Polished drag-drop, batch, find-replace dictionaries, large-v3, simple diarization | Direct spiritual peer; the bar for desktop-class UX. |
| **WhisperX** | The quality reference: faster-whisper + **wav2vec2 forced alignment** (±50 ms) + Silero/pyannote VAD + diarization | Forced alignment is the gold standard; aspirational in-browser. VAD is achievable. |
| **Buzz / Vibe / Aiko** | Local, private, SRT/VTT, live dictation | Feature peers; closest comparison to RodmanTranscribe. |

### C. Browser/WebGPU Whisper (direct peers)

| Product | Standout | Our edge |
| --- | --- | --- |
| whisper-web (Xenova / Transformers.js) | **WebGPU** path (87% desktop / 71% mobile coverage as of 2026) | We use **multi-threaded WASM** (no GPU required); our differentiator must be the post-processing pipeline. |
| moonshine-web | Fast live transcription / voice commands | Different niche (commands, not long-form). |
| official whisper.cpp WASM example | Reference implementation | Bare-bones UI; no post-processing. |

### D. Where RodmanTranscribe wins / must catch up

**Wins now:**
- 100% browser-local, **no backend** required for the full headline model (large-v3).
- Multi-threaded WASM via COI service worker → works on plain GitHub Pages.
- Shares engines with the rest of the suite (FFmpeg for video → audio; Claude BYOK; formats).
- Drop-in tile + manifest + offline shell — same delivery model as the other 8 apps.

**Catch-up roadmap** (this PR + backlog):
- *This PR (top 10):* per-token confidence, hallucination/repetition removal, energy-based VAD gating, audio preprocessing chain, custom dictionary, ITN/punctuation/truecasing, subtitle-quality cue shaping, optional Claude proofread, quality presets, paragraphing + quality report.
- *Top backlog fast-follows:* Silero VAD (ONNX), shout fork to expose `initial_prompt` / temperature / thresholds, WebGPU path (Transformers.js fallback), forced alignment, speaker diarization.

---

## Part 2 — Product backlog (100+ items)

Effort key: **S** small (UI/wiring), **M** moderate (new logic), **L** large (new runtime / forked engine / model). Items implemented in this PR are marked **✅ Top-10 (this PR)**.

### 1. Accuracy & decoder

1. **Per-token confidence capture + low-confidence highlighting (M).** ✅ Top-10 (this PR)
2. Fork `@transcribe/shout` to expose `initial_prompt` for context biasing (L). *Top backlog.*
3. Fork shout to expose `temperature` + temperature fallback (L).
4. Fork shout to expose `entropy_thold` / `logprob_thold` / `no_speech_thold` (L).
5. Fork shout to expose `beam_search`/`best_of` for higher-quality decoding (L).
6. Fork shout to expose `condition_on_previous_text` toggle (L).
7. Pass `suppress_non_speech` / `audio_ctx` / `max_tokens` through the wrapper (S). ✅ Top-10
8. Multi-pass ensemble decoding: re-run low-confidence segments with different params (L).
9. WhisperX-style forced alignment (wav2vec2 ONNX) for ±50 ms word timing (L).
10. Per-language decoder defaults (English-tuned vs auto) (M).
11. Long-recording chunk overlap retuning to recover boundary errors (M).
12. Audio-context tuning per quality preset (S).
13. Detect repeated boilerplate inside a chunk and re-decode that span only (M).
14. Token timestamps via shout DTW patch (L).

### 2. Audio preprocessing

15. **Audio preprocessing chain (high-pass → optional denoise → loudnorm) with safe fallbacks (M).** ✅ Top-10
16. Add `afftdn` denoise toggle with feature-detect fallback (M). ✅ Top-10 (folded into #15)
17. RNNoise WASM denoise (standalone, more aggressive) (L).
18. `arnndn` if the vendored ffmpeg-core supports it (M).
19. Auto gain control / dynamic range compression (`acompressor`) (S).
20. Speech-band band-pass filter preset (S).
21. Click/pop suppression (`adeclick`) (S).
22. Per-file calibration of `loudnorm` (two-pass) (M).
23. Optional resample with sox-quality filter (`aresample=resampler=soxr`) (S).
24. De-essing (`deesser`) for sibilant-heavy audio (S).
25. Sample-rate guard: skip preprocessing if already 16 kHz mono (S).

### 3. VAD & chunking

26. **Energy-based VAD gating of silence-only segments (M).** ✅ Top-10
27. Silero VAD via onnxruntime-web (L). *Top backlog.*
28. VAD-guided chunk boundaries (split on silence, never mid-word) (M).
29. Configurable VAD aggressiveness / threshold (S).
30. Visualize VAD regions on the waveform (M).
31. Trim leading/trailing silence before transcription (S).
32. Detect and skip music-only regions (M).

### 4. Hallucination / repetition

33. **Hallucination & repetition removal (M).** ✅ Top-10
34. Compression-ratio proxy for over-repetitive segments (S). ✅ Top-10 (in #33)
35. Boilerplate blocklist (multilingual extension) (S).
36. Looped-n-gram cross-segment detection (M).
37. Drop segments whose timing overlaps prior segment's end by >X% (S).
38. "Repeat-of-prior-segment" detection at chunk boundaries (M).

### 5. Diarization (backlog)

39. Speaker diarization via pyannote ONNX (L).
40. Lightweight 3d-speaker / wespeaker ONNX embeddings + clustering (L).
41. Single-speaker fast path (skip diarization) (S).
42. Manual speaker labels in the editor (S).
43. Speaker color-coding + filter (S).
44. Per-speaker stats (talk time, words/min) (M).

### 6. Formatting · ITN · punctuation · truecasing

45. **Rule-based ITN + truecasing + punctuation polish (M).** ✅ Top-10
46. ONNX punctuation restoration (e.g. distilbert-multilingual-punctuator) (L).
47. Currency/percent/units expansion (M).
48. Date / time / phone-number normalization (M).
49. Sentence-end detection + paragraphing (S). ✅ Top-10 (in #59 / paragraphing)
50. Smart quotes / dashes / ellipsis toggle (S). ✅ Top-10 (in #45)
51. Locale-aware number formatting (S).

### 7. Subtitles & captions

52. **Subtitle-quality cue shaping: CPS, min/max duration, 42-char wrap, 2-line cap (M).** ✅ Top-10
53. SDH (sound effect annotations) toggle (M).
54. WebVTT cue settings (positioning, voice tags) (M).
55. ASS export with style template (M).
56. TTML export (S).
57. Burn-in subtitles to video via FFmpeg (M).
58. Per-cue speaker prefix (depends on diarization) (S).

### 8. Confidence & QA

59. **Quality report (avg confidence, low-conf %, hallucinations removed, etc.) (S).** ✅ Top-10
60. Low-confidence highlighting in the editor (S). ✅ Top-10
61. Confidence-annotated JSON export (S). ✅ Top-10 (in #1)
62. "Audit" mode: only show low-confidence sentences (S).
63. Confidence trend chart over time (S).
64. WER vs reference text (paste/compare) (M).

### 9. Transcript editor UX

65. **Custom dictionary / find-replace with persistence (M).** ✅ Top-10
66. Editor: in-line edit + sync to segment array (S).
67. Editor: undo/redo (M).
68. Editor: keyboard nav (J/K segment, space play/pause) (S).
69. "Play this word" on click (already exists at segment level; add word) (S).
70. Repeat last 5 seconds (W key like Otter) (S).
71. Slow-down playback for hard sections (S).
72. Pinned glossary panel for term review (M).
73. Spell-check toggle (S).
74. Heading insertion in the transcript (S).

### 10. AI proofread & enrichment

75. **Optional Claude (BYOK) proofread pass with accept/revert (M).** ✅ Top-10
76. Summary / TL;DR via Claude (S).
77. Action-items / decisions extraction (M).
78. Chapter generation from topic shifts (M).
79. Auto-tagging / topic tags (M).
80. Translation to a target language (Claude) (S).

### 11. Export & suite integrations

81. Send transcript to RodmanWord as a new document (S).
82. Send slides outline to RodmanSlides (M).
83. Export DOCX with timecodes (S).
84. Export PDF with timecodes via lib/docs (S).
85. Copy formatted excerpt with timestamp link (S).
86. Embed-able media player + transcript widget (M).

### 12. Input & capture

87. System / tab audio capture (`getDisplayMedia({audio:true})`) (M).
88. Multi-file batch transcription (M).
89. URL input (paste YouTube → audio via converter) (M).
90. Pause/resume long jobs (M).
91. Live transcription from mic (continuous streaming) (L).
92. Drag-drop a folder (S).
93. Mobile-friendly recording (M).

### 13. Models & engine

94. WebGPU Whisper via Transformers.js fallback (L).
95. Model integrity check (SHA-256 of cached blob) (S).
96. Per-language model picker (S).
97. Quantization picker (q5_0 vs q8_0) (S).
98. Self-hosted vendor mode for shout WASM (S).
99. Background warmup of the engine while picking a file (S).
100. Cancel/abort in flight (S).

### 14. Performance

101. Persistent FFmpeg worker (avoid re-instantiation) (S).
102. Stream PCM straight from FFmpeg into the engine without WAV header (M).
103. SIMD detection + per-build selection (S).
104. Memory ceiling guard for large-v3 on low-RAM devices (S).

### 15. Privacy, offline, PWA, a11y, i18n

105. Strict "fully offline" mode (block CDN; require self-host) (S).
106. SRI hashes on imported CDN scripts (S).
107. Pin model SHA-256 in catalog (S).
108. ARIA roles, screen-reader transcript navigation (M).
109. High-contrast theme (S).
110. Persistent settings + per-session unlock (S).
111. Multi-language UI strings (M).

### 16. Quality presets

112. **Quality presets: Max / Balanced / Fast (S).** ✅ Top-10

---

## What ships in this PR

Top-10 features above (marked ✅). New `transcription/postprocess.js`
module concentrates the pure logic; `engine.js`, `app.js`, `index.html`,
`styles.css`, and `lib/audio/formats.js` are extended around it. See the
plan file `i-had-chatgpt-5-5-transient-puddle.md` for the implementation
contract and verification steps.
