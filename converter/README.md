# RodmanConvert

RodmanConvert is a static, browser-based file converter for RodmanOffice.
Files are processed in the browser: spreadsheet conversions run in a Web Worker,
while document and image conversions run on the main thread because they use DOM,
canvas, and parser APIs.

## Supported Formats

| Family | Reads | Writes |
|---|---|---|
| Documents | DOCX, PDF, RTF, ODT, EPUB, Markdown, HTML, TXT | DOCX, PDF, RTF, ODT, EPUB, Markdown, HTML, TXT, AsciiDoc, LaTeX, JSON, YAML, MediaWiki, reStructuredText, Org-mode, DocBook, FictionBook, PPTX, ODP |
| Spreadsheets | XLSX, XLS, CSV, TSV, JSON, NDJSON, YAML, HTML tables, Markdown tables, vCard, iCalendar | XLSX, CSV, TSV, PSV, JSON, NDJSON, HTML, Markdown, Excel 2003 XML, ODS, vCard, iCalendar, PDF |
| Slides | PPTX | PPTX, ODP, PDF, DOCX, Markdown, HTML, TXT |
| Images | PNG, JPEG, GIF, BMP, WebP, SVG, PSD, PSB, ICO, TIFF (browser-dependent), PDF (any page) | PNG, JPEG, WebP, PSD, BMP, ICO, PPM, TGA, TIFF, CBZ, PDF (Photoshop-compatible) |
| Video | MP4, MOV, AVI, MPG, MPEG, WebM, MKV, WMV, ASF, FLV, F4V, 3GP, 3G2, TS, M2TS, MTS, VOB, OGV, DV, MJPEG, APNG, M1V, M2V, Y4M, NUT, SWF, WTV, IVF, AMV, GXF, MXF | MP4 (H.264 / H.265 / AV1), MOV (H.264 / ProRes 422 HQ), WebM (VP8 / AV1), MKV, AVI, WMV, FLV, 3GP, MPEG-TS, M2TS, VOB, OGV, DV, MJPEG, APNG, animated WebP, animated AVIF, MXF DNxHR, Y4M, M1V, M2V, NUT, SWF, WTV, IVF, AMV, GXF, animated GIF, PNG/JPEG/WebP (frame), PDF (frame), CBZ (frame sequence), 18 audio extract targets |
| Audio | MP3, M4A, AAC, WAV, OGG, FLAC, OPUS, AC-3, E-AC-3, AIFF, CAF, AMR, MP2, WMA, AU, TTA, WavPack, Speex, GSM | MP3, M4A (AAC), WAV, OGG (Vorbis), FLAC, OPUS, AC-3, E-AC-3, AIFF, CAF, AMR-NB, MP2, WMA, AU, TTA, WavPack, Speex, GSM |
| Subtitles | SRT, WebVTT, ASS, SSA, TTML, LRC | SRT, WebVTT, ASS, SSA, TTML, LRC |

Cross-family bridges:

- Spreadsheet → PDF (rasterized as HTML tables).
- Image source → PDF (single-page, JPEG-wrapped).
- PDF → image: any PDF rasterizes to PNG/JPEG/WebP/PSD/BMP/ICO/PPM/TGA/TIFF.
- PDF → CBZ: every PDF page rasterizes into a comic-book ZIP archive.
- HTML/Markdown source → spreadsheet: tables in the document become
  CSV/TSV/XLSX/JSON/ODS rows.
- Document → PPTX/ODP: H1 (or H2 fallback) splits the document into
  slides; each section becomes one slide with a title and body text frame.
- PPTX → DOCX/PDF/Markdown/HTML/TXT: deck text content is concatenated
  with H2 slide-title separators and run through the document writer.
- Video → image / CBZ / PDF: FFmpeg.wasm extracts the first frame
  (single image), N evenly-spaced frames (CBZ comic archive), or the
  first frame as a PDF.
- Video → animated GIF: FFmpeg.wasm runs a two-pass palettegen +
  paletteuse pipeline so colors stay accurate.
- Video → audio (MP3, M4A/AAC, WAV, OGG, FLAC, OPUS): drops the
  video stream and re-encodes the audio track. Audio inputs feed
  the same path so audio↔audio conversion ("WAV → MP3") works
  without any extra wiring.

## Video Engine

The first time any video conversion runs in a session, the converter
lazy-downloads the FFmpeg.wasm engine (~25 MB binary) from
`/lib/video/vendor/ffmpeg/`. The browser HTTP cache holds it across
visits, so subsequent conversions are immediate. Bytes never leave
the device — FFmpeg runs entirely in-browser. The single-threaded
build is shipped intentionally because `SharedArrayBuffer` (needed
by the multi-threaded core) requires COOP/COEP response headers
that GitHub Pages can't set on static files.

### Codec coverage

The vendored `@ffmpeg/core@0.12.6` build includes the codecs we
target by default. A few notes on the modern ones:

- **H.265 / HEVC** (`MP4 H.265 (.mp4)` target) uses `libx265`. The
  output carries the `hvc1` tag so QuickTime / Safari recognise the
  stream.
- **AV1** (`MP4 AV1` and `WebM AV1` targets) uses `libaom-av1` with
  `-cpu-used 8` for the fastest available preset. AV1 encoding is
  CPU-intensive even with the fastest preset; expect multi-minute
  encodes for short clips.
- **DV** writes 720x480 NTSC by default (`-target ntsc-dv`). Source
  videos are scaled to fit; arbitrary resolutions otherwise fail
  the DV codec's strict frame-size requirements.

If a target codec isn't compiled into the vendored core, the job
will fail with a non-zero exit code. Swap in a different
`@ffmpeg/core` build under `lib/video/vendor/ffmpeg/` to widen
coverage.

### Subtitles

The `subtitle` family converts between SubRip (`.srt`), WebVTT
(`.vtt`), Advanced SubStation (`.ass` / `.ssa`), TTML (`.ttml`),
and LRC (`.lrc`). FFmpeg auto-selects the codec from the input and
output filename extensions. Subtitle conversion is fast — typically
sub-second — but the engine still has to be loaded once per session,
so the first subtitle job may show "Loading subtitle engine
(~25 MB)…" while the wasm binary fetches.

### Specialised audio + video coverage notes

The Part 7 batch (PR #36) widened the engine's coverage substantially.
A few targets require codecs that may or may not be compiled into the
vendored single-threaded `@ffmpeg/core@0.12.6` build:

- **ProRes (`mov_prores`)** — built into mainline FFmpeg as
  `prores_aw`; should work in the default core.
- **DNxHR (`mxf_dnxhr`)** — built into mainline FFmpeg as `dnxhd`.
- **AMR-NB (`amr`)** — needs `libopencore_amrnb`. Usually included.
- **Speex (`spx`)** — needs `libspeex`. Usually included.
- **WavPack (`wv`)** — needs `libwavpack`. Usually included.
- **GSM (`gsm`)** — needs `libgsm`. Usually included.
- **AMV** — strict 128x96 / 160x120 resolution; output is always
  scaled to 160x120 mono 22.05 kHz.

If any of these fail with "Cannot find a valid encoder" at runtime
on a real conversion, the fix is to swap in a wider-build
`ffmpeg-core.wasm` under `lib/video/vendor/ffmpeg/`.

## Shared Engines

The app imports suite-level modules from `../lib/docs/`, `../lib/sheets/`,
and `../lib/images/`. Vendored helpers include `@e965/xlsx`, `ag-psd`, and
PDF.js. See `../lib/images/README.md` for the image dependency inventory.

## Offline And PWA Behavior

`sw.js` caches the Converter app shell under the `converter/` scope, including
the spreadsheet worker. The shared `/lib` engines are outside that scope, so
conversion paths need those assets from the network or the browser HTTP cache.

## Trust Boundaries

- HTML inputs (`.html`, `.htm`, `.epub` body content, `.odt` body content) are
  passed through a small in-browser sanitizer that drops `<script>`, `<style>`,
  `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>`, `<form>`,
  every `on*=` handler attribute, and `javascript:` / `data:` / `vbscript:`
  URLs. The sanitizer is conservative — assume any other formatting in the
  input may round-trip into the output.
- Text inputs (`.txt`, `.md`, `.html`, `.htm`) are decoded as UTF-8. A leading
  UTF-8 BOM is stripped silently; UTF-16 BOMs are rejected with a friendly
  error so the user can re-save as UTF-8.

## Known Gaps

- TIFF, AVIF, and HEIC inputs depend on browser native decoding and are not
  guaranteed to load on every browser/version.
- Multi-sheet inputs render to PDF/Markdown/HTML as one section per sheet;
  formulas and cell formatting are not preserved end-to-end.
- Conversion fixture tests are still needed for common routes, unsupported
  routes, worker failures, and bulk ZIP output.

## Verification

```bash
node --check converter/app.js
node --check converter/bulk.js
node --check converter/detect.js
node --check converter/matrix.js
node --check converter/sw.js
node --check converter/worker.js
node --check lib/docs/interop.js
node --check lib/sheets/csv.js
node --check lib/sheets/serializers.js
node --check lib/sheets/vcard.js
node --check lib/sheets/icalendar.js
node --check lib/images/image-io.js
node --check lib/images/cbz.js
node --check lib/slides/pptx.js
node --check lib/video/index.js
node --check lib/video/ffmpeg.js
```
