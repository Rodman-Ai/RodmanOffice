// RodmanConvert — main thread UI controller.
//
// Routing:
//   spreadsheet jobs → Web Worker (worker.js + /lib/sheets/)
//   document jobs    → main thread (DOM-dependent engines)
//   image jobs       → main thread (Canvas APIs)
//
// Cross-family jobs (e.g. spreadsheet → PDF, image → PDF) run
// the relevant translation step on the main thread.

import { detect } from './detect.js';
import { targetsForItem, ready as matrixReady } from './matrix.js';
import { createQueue, downloadBlob, emitZip } from './bulk.js';
import * as docs from '../lib/docs/index.js';
import * as images from '../lib/images/index.js';
import * as sheets from '../lib/sheets/index.js';
import * as slides from '../lib/slides/index.js';
// lib/video pulls in the FFmpeg.wasm vendor blob (~25 MB) the
// first time any of its functions are called. We deliberately
// import it lazily inside runVideo() so the converter shell
// doesn't pay that cost when no video work is queued.

const dropZone           = document.getElementById('dropZone');
const fileInput          = document.getElementById('fileInput');
const pickBtn            = document.getElementById('pickBtn');
const queueSec           = document.getElementById('queueSection');
const queueList          = document.getElementById('queueList');
const convertBtn         = document.getElementById('convertBtn');
const clearBtn           = document.getElementById('clearBtn');
const zipToggle          = document.getElementById('zipToggle');
const queueOverall       = document.getElementById('queueOverall');
const queueOverallText   = document.getElementById('queueOverallText');
const queueOverallFill   = document.getElementById('queueOverallFill');

const queue = createQueue();
let isConverting = false;

const TXT_DEC = new TextDecoder('utf-8');
const TXT_ENC = new TextEncoder();
const MAX_QUEUE_FILES = 100;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_INPUT_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_INPUT_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_FILES = 25;

// ---------- Worker dispatch (spreadsheets only) ----------

let worker = null;
let jobSeq = 0;
const pending = new Map();

let workerFailed = false;

function rejectWorkerJobs(error) {
  const err = error instanceof Error ? error : new Error(String(error || 'Spreadsheet worker failed'));
  pending.forEach((slot) => slot.reject(err));
  pending.clear();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerFailed = true;
}

function ensureWorker() {
  if (worker) return worker;
  workerFailed = false;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e) => {
    const { id, ok, output, error } = e.data;
    const slot = pending.get(id);
    if (!slot) return;
    pending.delete(id);
    if (ok) slot.resolve(output);
    else slot.reject(new Error(error));
  });
  worker.addEventListener('error', (e) => {
    rejectWorkerJobs(new Error(e.message || 'Spreadsheet worker failed to load'));
  });
  worker.addEventListener('messageerror', () => {
    rejectWorkerJobs(new Error('Spreadsheet worker returned an unreadable response'));
  });
  return worker;
}

function runOnWorker(source, target) {
  ensureWorker();
  const id = ++jobSeq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, source, target }, [source.bytes]);
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}

// ---------- Document family (main thread) ----------

async function readDocToHtml(source) {
  const ext = (source.name.split('.').pop() || '').toLowerCase();
  const buf = source.bytes;
  switch (ext) {
    case 'docx': return docs.loadDocx(buf);
    case 'doc':  return docs.docImport(buf);
    case 'pdf':  return docs.loadPdf(buf);
    case 'rtf':  return docs.rtfImport(decodeText(buf));
    case 'odt':  return sanitizeHtml(await docs.odtImport(buf));
    case 'epub': return sanitizeHtml(await docs.epubImport(buf));
    case 'html':
    case 'htm':  return sanitizeHtml(decodeText(buf));
    case 'txt':  return textToHtml(decodeText(buf));
    case 'md':
    case 'markdown': return mdToHtml(decodeText(buf));
    default: throw new Error(`Unsupported document input: .${ext}`);
  }
}

async function writeDocFromHtml(html, target, name) {
  const title = (name || 'document').replace(/\.[^.]+$/, '');
  switch (target.ext) {
    case 'docx': return blobToBytes(docs.saveDocx(html, { title }));
    case 'pdf':  return blobToBytes(docs.savePdf(html, { title }));
    case 'rtf':  return TXT_ENC.encode(docs.rtfExport(html, title));
    case 'odt':  return docs.odtExport(html, title);
    case 'epub': return docs.epubExport(html, title);
    case 'md':   return TXT_ENC.encode(docs.mdExport(html, { title }));
    case 'adoc': return TXT_ENC.encode(docs.asciidocExport(html, title));
    case 'tex':  return TXT_ENC.encode(docs.latexExport(html, title));
    case 'html': return TXT_ENC.encode(wrapHtml(html, title));
    case 'txt':  return TXT_ENC.encode(htmlToText(html));
    case 'json': return TXT_ENC.encode(docs.jsonDocExport(html, title));
    case 'yaml': return TXT_ENC.encode(docs.yamlExport(html, title));
    case 'wiki': return TXT_ENC.encode(docs.mediawikiExport(html, title));
    case 'rst':  return TXT_ENC.encode(docs.rstExport(html, title));
    case 'org':  return TXT_ENC.encode(docs.orgExport(html, title));
    case 'dbk':  return TXT_ENC.encode(docs.docbookExport(html, title));
    case 'fb2':  return TXT_ENC.encode(docs.fb2Export(html, title));
    case 'odp':  return docs.odpExport(html, title);
    case 'pptx': {
      const blob = slides.savePptx(htmlToDeck(html, title));
      return blobToBytes(blob);
    }
    default: throw new Error(`Unsupported document output: .${target.ext}`);
  }
}

// htmlToDeck / deckToHtml live in lib/slides/html-bridge.js so the
// Word and Slides apps can reuse the same implementation.
const { htmlToDeck, deckToHtml } = slides;

// Decode bytes as UTF-8 and strip a leading BOM. UTF-16 BOMs get a
// friendly error so the user knows to re-save the file as UTF-8 —
// trying to decode UTF-16 with the UTF-8 decoder is what produces
// the classic "every other character is null" mojibake.
function decodeText(buf) {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (view.length >= 2 && ((view[0] === 0xFE && view[1] === 0xFF) || (view[0] === 0xFF && view[1] === 0xFE))) {
    throw new Error('UTF-16 file detected. Save the file as UTF-8 and try again.');
  }
  let text = TXT_DEC.decode(view);
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  return text;
}

// Strip clearly-active markup and javascript: / data: URLs from
// untrusted HTML before we feed it to the rest of the pipeline.
// The Word/HTML/EPUB/ODT writers all accept HTML innerHTML, so any
// surviving <script>, <iframe>, or on*= attributes would round-trip
// straight into the output file.
function sanitizeHtml(html) {
  if (!html) return '';
  const tmp = document.createElement('template');
  tmp.innerHTML = String(html);
  const drop = tmp.content.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form');
  drop.forEach((el) => el.remove());
  const all = tmp.content.querySelectorAll('*');
  all.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const value = String(attr.value || '').trim();
      if (name.startsWith('on')) { el.removeAttribute(attr.name); continue; }
      if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
          /^\s*(javascript|data|vbscript):/i.test(value)) {
        el.removeAttribute(attr.name);
      }
    }
  });
  return tmp.innerHTML;
}

async function runDoc(source, target) {
  const html = await readDocToHtml(source);
  const bytes = await writeDocFromHtml(html, target, source.name);
  return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: target.mime };
}

// ---------- Image family (main thread) ----------
//
// Pipeline: source bytes → canvas → encode to target.
// Decoding routes by source ext (PSD via decodePsd; everything else
// via decodeToCanvas, which uses the browser Image API). Encoding
// routes by target ext (PSD via encodePsd; PDF via the dedicated
// single-image PDF writer; PNG/JPEG/WebP via canvasToBlob).

async function decodeImageSourceToCanvas(source) {
  const ext = (source.name.split('.').pop() || '').toLowerCase();
  if (ext === 'psd' || ext === 'psb') {
    const { canvas } = await images.decodePsd(source.bytes);
    return canvas;
  }
  return images.decodeToCanvas(source.bytes, source.mime);
}

async function encodeCanvasToTarget(canvas, target, name, options) {
  // Apply user-driven pre-passes once, here, so every encoder
  // branch downstream sees the resized + palette-reduced canvas.
  canvas = applyImagePrepasses(canvas, options);
  const quality = (options && typeof options.quality === 'number') ? options.quality : 0.92;
  if (target.ext === 'psd') {
    const blob = images.encodePsd(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'pdf') {
    // Photoshop PDF: a single-page PDF wrapping the canvas as a
    // JPEG image. Photoshop, Acrobat and Preview all open it
    // straight back as a flattened image.
    const blob = await images.encodePdfFromCanvas(canvas, { format: 'jpeg', quality });
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'bmp') {
    const buf = await images.encodeBMP(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'ico') {
    const blob = await images.encodeICO(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'ppm') {
    const buf = await images.encodePPM(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'tga') {
    const buf = await images.encodeTGA(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'tif' || target.ext === 'tiff') {
    const buf = await images.encodeTIFF(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'tif-multi') {
    // Single-canvas fallback: delegate to encodeMultiTIFF, which
    // collapses to encodeTIFF when given exactly one page.
    const buf = await images.encodeMultiTIFF([canvas]).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'cbz') {
    const blob = await images.encodeCbzFromCanvas(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  // ----- Part 10: synchronous byte-level encoders (one Blob) -----
  if (target.ext === 'pgm') {
    const buf = await images.encodePGM(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'pbm') {
    const buf = await images.encodePBM(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'pam') {
    const buf = await images.encodePAM(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'xbm') {
    const stem = (name || 'image').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_') || 'image';
    const buf = await images.encodeXBM(canvas, stem).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'xpm') {
    const stem = (name || 'image').replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_') || 'image';
    const buf = await images.encodeXPM(canvas, stem).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'pcx') {
    const buf = await images.encodePCX(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'hdr') {
    const buf = await images.encodeHDR(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'wbmp') {
    const buf = await images.encodeWBMP(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'sgi') {
    const buf = await images.encodeSGI(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'ras') {
    const buf = await images.encodeRAS(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'ff') {
    const buf = await images.encodeFarbfeld(canvas).arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'gif') {
    const blob = await images.encodeGIF(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'svg') {
    const blob = await images.encodeSVG(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  // Container-style encoders that wrap PNG entries — both async.
  if (target.ext === 'icns') {
    const blob = await images.encodeICNS(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'cur') {
    const blob = await images.encodeCUR(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  // AVIF rides the existing canvas.toBlob path because 'image/avif'
  // is now in the ENCODABLE set; the matrix only surfaces it when
  // isAvifEncodeSupported() resolves true at boot, so this branch
  // is reached only on browsers that can encode it.
  // PNG / JPEG / WebP / AVIF — alpha-flatten when targeting JPEG to
  // avoid black backgrounds; pass user quality through for the lossy
  // formats. PNG ignores the quality arg.
  if (target.mime === 'image/jpeg' && hasAlpha(canvas)) {
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    const blob = await images.canvasToBlob(flat, target.mime, quality);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  const useQuality = (target.mime === 'image/jpeg'
    || target.mime === 'image/webp'
    || target.mime === 'image/avif');
  const blob = await images.canvasToBlob(canvas, target.mime, useQuality ? quality : undefined);
  const buf = await blob.arrayBuffer();
  return { bytes: buf, mime: target.mime };
}

// Pre-pass that runs before any encoder: optional resize and
// palette quantization. Both are user-driven via the queue row's
// Options panel. Returns a NEW canvas if either pass modifies it,
// or the original canvas otherwise.
function applyImagePrepasses(canvas, options) {
  if (!options) return canvas;
  let out = canvas;
  if (typeof options.scale === 'number' && options.scale > 0 && options.scale < 1) {
    out = images.resize(out, options.scale, { smoothing: true });
  }
  if (options.colors) {
    out = images.quantizeCanvas(out, options.colors);
  }
  return out;
}

function hasAlpha(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

async function runImage(source, target, options) {
  const canvas = await decodeImageSourceToCanvas(source);
  return encodeCanvasToTarget(canvas, target, source.name, options);
}

// ---------- PDF as image (any PDF rasterized to a canvas) ----------
//
// Triggered from the main dispatch when the source is a PDF and the
// chosen target is an image format (PSD/PNG/JPEG/WebP). PDF→PDF is
// out of scope (no-op) and PDF→other-document continues to flow
// through runDoc.

async function runPdfAsImage(source, target, onProgress, options) {
  // Multi-page bridge: any PDF → CBZ rasterizes every page.
  if (target.ext === 'cbz') {
    const blob = await images.encodeCbzFromPdf(source.bytes, { onProgress });
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  // Multi-page TIFF: every PDF page becomes one IFD in a single .tif.
  if (target.ext === 'tif-multi') {
    const canvases = await images.pdfPagesToCanvases(source.bytes, { onProgress });
    const blob = images.encodeMultiTIFF(canvases);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  const { canvas } = await images.decodePdfPage(source.bytes, 0);
  if (onProgress) onProgress(1);
  return encodeCanvasToTarget(canvas, target, source.name, options);
}

// PDF → PDF compression. Rasterizes every page at the level's
// quality + scale and re-assembles. When `options.pdfPreserveText`
// is true (default), invisible-text overlay keeps Cmd-F working.
async function runCompressPdf(source, target, onProgress, options) {
  const level = (options && options.pdfLevel) || 'medium';
  const preserveText = !options || options.pdfPreserveText !== false;
  const blob = await images.compressPdf(source.bytes, {
    level,
    preserveText,
    onProgress,
  });
  const buf = await blob.arrayBuffer();
  return { bytes: buf, mime: target.mime };
}

function isImageTarget(target) {
  if (!target) return false;
  switch (target.ext) {
    case 'png': case 'jpg': case 'webp': case 'psd':
    case 'bmp': case 'ico': case 'ppm': case 'tga':
    case 'tif': case 'tiff': case 'cbz':
    // ----- Part 10 image targets -----
    case 'pgm': case 'pbm': case 'pam':
    case 'xbm': case 'xpm': case 'pcx': case 'hdr':
    case 'wbmp': case 'sgi': case 'ras': case 'ff':
    case 'icns': case 'cur': case 'tif-multi': case 'avif':
      return true;
    default: return false;
  }
}

function isSpreadsheetTarget(target) {
  if (!target) return false;
  switch (target.ext) {
    case 'xlsx': case 'csv': case 'tsv': case 'psv':
    case 'json': case 'ndjson': case 'ods':
    case 'vcf': case 'ics':
      return true;
    default: return false;
  }
}

// ---------- Slides family (PPTX read; document targets via HTML) ----------
//
// PPTX → document family: walk the imported deck, concat each text
// element's html into a flat HTML body with <h2> slide titles, and
// hand it to the existing document writer. This means PPTX → DOCX,
// PDF, MD, HTML, TXT all work without any new writers.
// PPTX → PPTX is a no-op pass-through.

async function runSlides(source, target) {
  const sourceExt = (source.name.split('.').pop() || '').toLowerCase();
  if (sourceExt === 'ppt') {
    // Legacy PowerPoint binary — best-effort text extraction. We
    // can't re-emit a valid .ppt, so wrap the recovered text as a
    // single-section document and route through the existing doc /
    // slide writers. The user picks any compatible target.
    const html = docs.pptImport(source.bytes);
    if (target.ext === 'pptx') {
      const deck = htmlToDeck(html, (source.name || 'imported').replace(/\.[^.]+$/, ''));
      const blob = slides.savePptx(deck);
      const bytes = await blobToBytes(blob);
      return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: target.mime };
    }
    const bytes = await writeDocFromHtml(html, target, source.name);
    return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: target.mime };
  }
  if (target.ext === 'pptx') {
    // Pass-through. The user picked the same format on both sides.
    return { bytes: source.bytes, mime: target.mime };
  }
  const deck = await slides.loadPptx(source.bytes);
  const html = deckToHtml(deck);
  const bytes = await writeDocFromHtml(html, target, source.name);
  return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: target.mime };
}

// deckToHtml is imported from lib/slides/html-bridge.js (see above).

// ---------- Video family (FFmpeg.wasm; lazy-loaded) ----------
//
// First call into runVideo dynamically imports lib/video, which in
// turn lazily fetches the ~25 MB FFmpeg.wasm core on the first
// transcode. We keep the import dynamic so the converter shell
// stays small for users who never queue a video.

const VIDEO_IMAGE_TARGETS = new Set(['png', 'jpg', 'webp', 'pdf']);
// Mirror of AUDIO_ENCODER_FOR keys in lib/video/index.js. Kept as
// a static Set so the dispatch in runVideo / runAudio doesn't have
// to await the lazy video-engine import just to decide where to
// route a target. Update when AUDIO_ENCODER_FOR grows.
const AUDIO_TARGETS = new Set([
  // Originals.
  'mp3', 'm4a', 'wav', 'ogg', 'flac', 'opus',
  // Part 7 specialised audio.
  'ac3', 'eac3', 'aiff', 'caf', 'amr', 'mp2', 'wma', 'au', 'tta', 'wv', 'spx', 'gsm',
  // Part 8 codec variants.
  'alac', 'm4a_heaacv2', 'wav_mulaw', 'wav_alaw', 'wav_pcm24', 'wav_float32', 'wav_adpcm', 'amrwb',
]);
const SEQUENCE_TARGETS = new Set(['png_seq', 'dpx_seq']);

let _videoEngine = null;
async function getVideoEngine() {
  if (!_videoEngine) _videoEngine = await import('../lib/video/index.js');
  return _videoEngine;
}

async function runVideo(source, target, onProgress, options) {
  const sourceExt = (source.name.split('.').pop() || '').toLowerCase();
  const fromExt = sourceExt === 'mpeg' ? 'mpg' : sourceExt;
  const inputBytes = source.bytes instanceof Uint8Array
    ? source.bytes
    : new Uint8Array(source.bytes);

  const video = await getVideoEngine();

  // Animated GIF: dedicated palettegen pipeline produces much better
  // colors than a naive `-i in -t 5 out.gif` would.
  if (target.ext === 'gif') {
    const out = await video.videoToAnimatedGif(inputBytes, { ext: fromExt, fps: 12, onProgress });
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    return { bytes: buf, mime: target.mime };
  }

  // Frame-sequence CBZ: pull N frames spread across the clip and ZIP
  // them as a comic-style archive.
  if (target.ext === 'cbz') {
    const canvases = await video.extractFrames(inputBytes, { ext: fromExt, count: 24, onProgress });
    const blob = await images.encodeCbzFromCanvases(canvases);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }

  // Single-frame still image targets — extract first frame, then
  // route through the existing image encoder switch.
  if (VIDEO_IMAGE_TARGETS.has(target.ext)) {
    const canvas = await video.extractFrame(inputBytes, { ext: fromExt, timestamp: 0 });
    if (onProgress) onProgress(1);
    return encodeCanvasToTarget(canvas, target, source.name, options);
  }

  // Audio extraction (drop video stream, encode audio track).
  if (AUDIO_TARGETS.has(target.ext)) {
    const out = await video.transcodeAudio(inputBytes, { from: fromExt, to: target.ext, onProgress, options });
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    return { bytes: buf, mime: target.mime };
  }

  // Image-sequence ZIP (PNG / DPX per-frame).
  if (SEQUENCE_TARGETS.has(target.ext)) {
    const out = await video.transcodeImageSequence(inputBytes, { from: fromExt, to: target.ext, onProgress });
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    return { bytes: buf, mime: target.mime };
  }

  // Container/codec transcode.
  const out = await video.transcode(inputBytes, { from: fromExt, to: target.ext, onProgress, options });
  const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return { bytes: buf, mime: target.mime };
}

// Audio source family → audio target. Reuses the video engine
// (FFmpeg.wasm) since it handles both video and audio streams.
async function runAudio(source, target, onProgress, options) {
  if (!AUDIO_TARGETS.has(target.ext)) {
    throw new Error(`Unsupported audio output: .${target.ext}`);
  }
  const sourceExt = (source.name.split('.').pop() || '').toLowerCase();
  // Normalise a few common aliases that share a format with their
  // primary extension.
  const fromExt = (
    sourceExt === 'oga' ? 'ogg' :
    sourceExt === 'aif' ? 'aiff' :
    sourceExt === 'snd' ? 'au' :
    sourceExt
  );
  const inputBytes = source.bytes instanceof Uint8Array
    ? source.bytes
    : new Uint8Array(source.bytes);
  const video = await getVideoEngine();
  const out = await video.transcodeAudio(inputBytes, { from: fromExt, to: target.ext, onProgress, options });
  const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return { bytes: buf, mime: target.mime };
}

// Subtitle source family → subtitle target. FFmpeg auto-selects the
// codec from input + output filename extensions.
async function runSubtitle(source, target, onProgress) {
  const sourceExt = (source.name.split('.').pop() || '').toLowerCase();
  const inputBytes = source.bytes instanceof Uint8Array
    ? source.bytes
    : new Uint8Array(source.bytes);
  const video = await getVideoEngine();
  const out = await video.transcodeSubtitle(inputBytes, { from: sourceExt, to: target.ext, onProgress });
  const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return { bytes: buf, mime: target.mime };
}

// ---------- Spreadsheet family (worker for native; main thread for PDF) ----------

async function runSheet(source, target) {
  const sourceExt = (source.name.split('.').pop() || '').toLowerCase();
  // The worker only knows how to parse XLSX/XLS/CSV, so it can take
  // any of those as input as long as the output is also a delimited
  // text or XLSX format. Everything else (TSV/JSON inputs, or any
  // structured output) runs on the main thread.
  const workerCanRead = sourceExt === 'xlsx' || sourceExt === 'xls' || sourceExt === 'csv';
  const workerCanWrite = target.ext === 'xlsx' || target.ext === 'xls' || target.ext === 'csv' || target.ext === 'tsv' || target.ext === 'psv';
  if (workerCanRead && workerCanWrite) {
    return runOnWorker(source, target);
  }
  const wb = importSpreadsheetAny(source);
  if (target.ext === 'pdf') {
    const html = workbookToHtml(wb);
    const blob = docs.savePdf(html, { title: wb.name });
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  let bytes;
  switch (target.ext) {
    case 'xlsx':   bytes = sheets.exportWorkbookAsXLSX(wb); break;
    case 'xls':    bytes = sheets.exportWorkbookAsXLS(wb); break;
    case 'csv':    bytes = sheets.exportSheetAsCSV(wb.sheets[0]); break;
    case 'tsv':    bytes = sheets.exportSheetAsTsv(wb.sheets[0]); break;
    case 'psv':    bytes = sheets.exportSheetAsPsv(wb.sheets[0]); break;
    case 'json':   bytes = sheets.exportWorkbookAsJson(wb); break;
    case 'ndjson': bytes = sheets.exportSheetAsNdjson(wb.sheets[0]); break;
    case 'html':   bytes = sheets.exportWorkbookAsHtml(wb); break;
    case 'md':     bytes = sheets.exportWorkbookAsMarkdown(wb); break;
    case 'xml':    bytes = sheets.exportWorkbookAsExcelXml(wb); break;
    case 'ods':    bytes = sheets.exportWorkbookAsOds(wb); break;
    case 'vcf':    bytes = sheets.exportWorkbookAsVcard(wb); break;
    case 'ics':    bytes = sheets.exportWorkbookAsIcal(wb); break;
    default: throw new Error(`Unsupported spreadsheet output: .${target.ext}`);
  }
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return { bytes: buf, mime: target.mime };
}

// Choose the right spreadsheet importer: TSV/JSON/NDJSON/YAML/HTML/MD/
// VCF/ICS inputs need dedicated parsers, anything else flows through
// importSpreadsheet (which handles XLSX/CSV by extension).
function importSpreadsheetAny(source) {
  const ext = (source.name.split('.').pop() || '').toLowerCase();
  if (ext === 'tsv') return sheets.parseTsvWorkbook(decodeText(source.bytes), source.name);
  if (ext === 'json') return sheets.parseJsonWorkbook(decodeText(source.bytes), source.name);
  if (ext === 'ndjson' || ext === 'jsonl') return sheets.parseNdjsonWorkbook(decodeText(source.bytes), source.name);
  if (ext === 'yaml' || ext === 'yml') return sheets.parseYamlWorkbook(decodeText(source.bytes), source.name);
  if (ext === 'html' || ext === 'htm') return sheets.parseHtmlTablesWorkbook(decodeText(source.bytes), source.name);
  if (ext === 'md' || ext === 'markdown') return sheets.parseMarkdownTablesWorkbook(decodeText(source.bytes), source.name);
  if (ext === 'vcf') return sheets.parseVcardWorkbook(decodeText(source.bytes), source.name);
  if (ext === 'ics') return sheets.parseIcalWorkbook(decodeText(source.bytes), source.name);
  return sheets.importSpreadsheet(source.bytes, source.name);
}

function workbookToHtml(wb) {
  let out = '';
  for (const sheet of wb.sheets) {
    out += `<h2>${escapeHtml(sheet.name)}</h2>`;
    out += '<table class="bordered">';
    let maxRow = -1, maxCol = -1;
    for (const k of Object.keys(sheet.cells)) {
      const [r, c] = k.split(',').map(Number);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
    for (let r = 0; r <= maxRow; r++) {
      out += '<tr>';
      for (let c = 0; c <= maxCol; c++) {
        const cell = sheet.cells[`${r},${c}`];
        out += `<td>${escapeHtml(cell?.raw ?? '')}</td>`;
      }
      out += '</tr>';
    }
    out += '</table>';
  }
  return out;
}

// ---------- Helpers ----------

async function blobToBytes(blob) {
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function textToHtml(txt) {
  return txt.split(/\r?\n\r?\n+/).map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('');
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function mdToHtml(md) {
  return md.split(/\r?\n\r?\n+/).map((block) => {
    const m = block.match(/^(#{1,6})\s+(.+)$/);
    if (m) return `<h${m[1].length}>${escapeHtml(m[2].trim())}</h${m[1].length}>`;
    return `<p>${escapeHtml(block).replace(/\r?\n/g, '<br>')}</p>`;
  }).join('');
}

function wrapHtml(body, title) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`;
}

// ---------- Queue UI ----------

function render() {
  queueList.innerHTML = '';
  if (queue.items.size === 0) {
    queueSec.hidden = true;
    convertBtn.disabled = true;
    clearBtn.disabled = isConverting;
    return;
  }
  queueSec.hidden = false;
  for (const item of queue.items.values()) queueList.appendChild(renderRow(item));
  convertBtn.disabled = isConverting || queue.pendingWithTargets().length === 0;
  clearBtn.disabled = isConverting;
}

// ---------- Per-row Options panel ----------
//
// The Options disclosure surfaces resolution / quality / palette /
// bitrate / codec / PDF-compression-level controls per queue item.
// Each control writes through queue.setOptions(item.id, {...}); the
// dispatchers above already read from item.options.

const LOSSY_IMAGE_EXTS = new Set(['jpg', 'webp', 'avif', 'pdf']);
const PALETTE_IMAGE_EXTS = new Set(['png', 'bmp', 'ico', 'icns', 'cur', 'tga', 'pcx', 'sgi', 'ras', 'gif']);

function targetWantsImageOptions(target) {
  if (!target) return false;
  switch (target.ext) {
    case 'png': case 'jpg': case 'webp': case 'avif': case 'psd': case 'pdf':
    case 'bmp': case 'ico': case 'ppm': case 'tga': case 'tif': case 'tif-multi': case 'cbz':
    case 'pgm': case 'pbm': case 'pam': case 'xbm': case 'xpm': case 'pcx': case 'hdr':
    case 'wbmp': case 'sgi': case 'ras': case 'ff': case 'icns': case 'cur':
      return true;
  }
  return false;
}

function targetWantsVideoOptions(target) {
  if (!target) return false;
  if (AUDIO_TARGETS.has(target.ext)) return false;          // audio takes the audio panel
  if (VIDEO_IMAGE_TARGETS.has(target.ext)) return true;     // first-frame image: still wants quality
  if (target.ext === 'gif' || target.ext === 'cbz') return false;
  if (SEQUENCE_TARGETS.has(target.ext)) return false;
  // The set of video container/codec targets is large but they all
  // route through video.transcode, which now accepts options.
  return /^(mp4|mov|mkv|webm|avi|wmv|asf|flv|f4v|3gp|3g2|ts|m2ts|vob|ogv|dv|mjpeg|apng|webp_anim|avif_anim|mov_prores|mxf_dnxhr|y4m|m1v|m2v|nut|swf|wtv|ivf|amv|gxf|mp4_h265|mp4_av1|webm_av1|3gp_h263|avi_xvid|webm_vp9|mkv_ffv1|avi_huffyuv|mov_jp2|mov_cinepak|nut_snow|wmv_wmv3|avi_raw)$/.test(target.ext);
}

function targetWantsAudioOptions(target) {
  return target && AUDIO_TARGETS.has(target.ext);
}

function targetWantsPdfCompressOptions(target) {
  return target && target.ext === 'pdf-compress';
}

function targetWantsAnyOptions(target) {
  return targetWantsImageOptions(target)
    || targetWantsVideoOptions(target)
    || targetWantsAudioOptions(target)
    || targetWantsPdfCompressOptions(target);
}

function makeField(label, controlEl) {
  const wrap = document.createElement('label');
  wrap.className = 'queue-option';
  const lab = document.createElement('span');
  lab.className = 'queue-option-label';
  lab.textContent = label;
  wrap.appendChild(lab);
  wrap.appendChild(controlEl);
  return wrap;
}

function makeSelect(value, choices, onChange) {
  const sel = document.createElement('select');
  for (const [v, label] of choices) {
    const opt = document.createElement('option');
    opt.value = String(v);
    opt.textContent = label;
    if (String(v) === String(value)) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function makeRangeWithReadout(value, min, max, step, format, onInput) {
  const wrap = document.createElement('span');
  wrap.className = 'queue-option-range';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min); range.max = String(max); range.step = String(step);
  range.value = String(value);
  const out = document.createElement('span');
  out.className = 'queue-option-value';
  out.textContent = format(value);
  range.addEventListener('input', () => {
    out.textContent = format(parseFloat(range.value));
    onInput(parseFloat(range.value));
  });
  wrap.appendChild(range);
  wrap.appendChild(out);
  return wrap;
}

function makeTextInput(value, placeholder, onChange) {
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = placeholder || '';
  if (value != null) inp.value = String(value);
  inp.addEventListener('change', () => onChange(inp.value || null));
  return inp;
}

function makeCheckbox(label, value, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'queue-option queue-option-check';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = !!value;
  cb.addEventListener('change', () => onChange(cb.checked));
  const lab = document.createElement('span');
  lab.className = 'queue-option-label';
  lab.textContent = label;
  wrap.appendChild(cb);
  wrap.appendChild(lab);
  return wrap;
}

function buildImageOptionFields(item, target, panel) {
  const opts = item.options || {};
  panel.appendChild(makeField('Resolution', makeSelect(opts.scale ?? 1, [
    [1, '100% (original)'],
    [0.75, '75%'],
    [0.5, '50%'],
    [0.25, '25%'],
  ], (v) => queue.setOptions(item.id, { scale: parseFloat(v) }))));

  if (LOSSY_IMAGE_EXTS.has(target.ext)) {
    const q = typeof opts.quality === 'number' ? opts.quality : 0.92;
    panel.appendChild(makeField('Quality',
      makeRangeWithReadout(q, 0.1, 1.0, 0.05,
        (v) => `${Math.round(v * 100)}%`,
        (v) => queue.setOptions(item.id, { quality: v }))));
  }
  if (PALETTE_IMAGE_EXTS.has(target.ext)) {
    panel.appendChild(makeField('Colors', makeSelect(opts.colors ?? '', [
      ['', 'Full colour'],
      [256, '256'],
      [128, '128'],
      [64, '64'],
      [16, '16'],
    ], (v) => queue.setOptions(item.id, { colors: v ? parseInt(v, 10) : null }))));
  }
}

function buildVideoOptionFields(item, panel) {
  const opts = item.options || {};
  panel.appendChild(makeField('Quality', makeSelect(opts.videoPreset ?? 'original', [
    ['original', 'Original'],
    ['low',      'Low (480p, 800k)'],
    ['medium',   'Medium (720p, 2M)'],
    ['high',     'High (1080p, 5M)'],
  ], (v) => queue.setOptions(item.id, { videoPreset: v }))));

  // Advanced sub-disclosure
  const advBtn = document.createElement('button');
  advBtn.type = 'button';
  advBtn.className = 'queue-option-advanced-toggle';
  advBtn.textContent = 'Advanced ▸';
  const advPanel = document.createElement('div');
  advPanel.className = 'queue-option-advanced';
  advPanel.hidden = true;
  advBtn.addEventListener('click', () => {
    const open = advPanel.hidden;
    advPanel.hidden = !open;
    advBtn.textContent = open ? 'Advanced ▾' : 'Advanced ▸';
  });
  advPanel.appendChild(makeField('Resolution', makeSelect(opts.videoResolution ?? 'auto', [
    ['auto', 'Auto'],
    ['1080p', '1080p'],
    ['720p', '720p'],
    ['480p', '480p'],
  ], (v) => queue.setOptions(item.id, { videoResolution: v }))));
  advPanel.appendChild(makeField('Video bitrate',
    makeTextInput(opts.videoBitrate, 'e.g. 1500k',
      (v) => queue.setOptions(item.id, { videoBitrate: v }))));
  advPanel.appendChild(makeField('Audio codec', makeSelect(opts.audioCodec ?? '', [
    ['', 'Default'],
    ['aac', 'AAC'],
    ['mp3', 'MP3'],
    ['opus', 'Opus'],
    ['vorbis', 'Vorbis'],
    ['copy', 'Copy (no re-encode)'],
  ], (v) => queue.setOptions(item.id, { audioCodec: v || null }))));
  advPanel.appendChild(makeField('Audio bitrate', makeSelect(opts.audioBitrate ?? '', [
    ['', 'Default'],
    ['96k', '96k'],
    ['128k', '128k'],
    ['192k', '192k'],
    ['256k', '256k'],
    ['320k', '320k'],
  ], (v) => queue.setOptions(item.id, { audioBitrate: v || null }))));
  panel.appendChild(advBtn);
  panel.appendChild(advPanel);
}

function buildAudioOptionFields(item, panel) {
  const opts = item.options || {};
  panel.appendChild(makeField('Bitrate', makeSelect(opts.audioOnlyBitrate ?? '', [
    ['', 'Default'],
    ['96k', '96k'],
    ['128k', '128k'],
    ['192k', '192k'],
    ['256k', '256k'],
    ['320k', '320k'],
  ], (v) => queue.setOptions(item.id, { audioOnlyBitrate: v || null }))));
}

function buildPdfCompressFields(item, panel) {
  const opts = item.options || {};
  panel.appendChild(makeField('Compression', makeSelect(opts.pdfLevel ?? 'medium', [
    ['minimum', 'Minimum (largest file)'],
    ['low',     'Low'],
    ['medium',  'Medium'],
    ['high',    'High'],
    ['maximum', 'Maximum (smallest file)'],
  ], (v) => queue.setOptions(item.id, { pdfLevel: v }))));
  panel.appendChild(makeCheckbox('Preserve searchable text',
    opts.pdfPreserveText !== false,
    (v) => queue.setOptions(item.id, { pdfPreserveText: v })));
}

function renderRow(item) {
  const li = document.createElement('li');
  li.className = 'queue-row';
  li.dataset.id = String(item.id);

  const nameWrap = document.createElement('div');
  nameWrap.className = 'queue-name';
  const fname = document.createElement('div');
  fname.className = 'queue-filename';
  fname.textContent = item.file.name;
  const meta = document.createElement('div');
  meta.className = 'queue-meta';
  if (item.status === 'error') {
    meta.classList.add('is-error');
    meta.textContent = item.error || 'Error';
  } else if (item.status === 'done') {
    meta.classList.add('is-done');
    meta.textContent = 'Done';
  } else {
    meta.textContent = `${humanSize(item.file.size)} · ${item.detected.family}`;
  }
  nameWrap.appendChild(fname);
  nameWrap.appendChild(meta);

  const select = document.createElement('select');
  select.className = 'queue-target';
  const options = targetsForItem({ family: item.detected.family, ext: item.detected.ext });
  if (options.length === 0) {
    const opt = document.createElement('option');
    opt.textContent = 'Unsupported';
    select.appendChild(opt);
    select.disabled = true;
  } else {
    for (const t of options) {
      const opt = document.createElement('option');
      opt.value = t.ext;
      opt.textContent = t.label;
      if (item.target && item.target.ext === t.ext) opt.selected = true;
      select.appendChild(opt);
    }
    if (!item.target) queue.setTarget(item.id, options[0]);
    select.addEventListener('change', () => {
      const t = options.find((x) => x.ext === select.value);
      queue.setTarget(item.id, t);
      convertBtn.disabled = isConverting || queue.pendingWithTargets().length === 0;
    });
  }
  if (isConverting || item.status === 'converting' || item.status === 'done') select.disabled = true;

  const status = document.createElement('div');
  status.className = 'queue-status';
  if (item.status === 'converting') {
    status.classList.add('is-converting');
    const text = document.createElement('span');
    text.className = 'queue-status-text';
    if (item.loadingMessage) text.textContent = item.loadingMessage;
    else if (typeof item.progress === 'number') text.textContent = `${Math.round(item.progress * 100)}%`;
    else text.textContent = 'Converting…';
    const bar = document.createElement('div');
    bar.className = 'queue-progress';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const fill = document.createElement('div');
    fill.className = 'queue-progress-fill';
    if (typeof item.progress === 'number') {
      const pct = Math.max(0, Math.min(100, Math.round(item.progress * 100)));
      bar.setAttribute('aria-valuenow', String(pct));
      fill.style.width = pct + '%';
    } else {
      bar.dataset.indeterminate = 'true';
    }
    bar.appendChild(fill);
    status.appendChild(text);
    status.appendChild(bar);
  } else if (item.status === 'error') {
    if (item.blocked) {
      status.textContent = 'Blocked';
    } else {
      const retry = document.createElement('button');
      retry.className = 'queue-retry';
      retry.type = 'button';
      retry.title = 'Retry conversion';
      retry.setAttribute('aria-label', `Retry ${item.file.name}`);
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => {
        queue.setStatus(item.id, 'pending', { error: null });
        render();
      });
      status.appendChild(retry);
    }
  }

  const remove = document.createElement('button');
  remove.className = 'queue-remove';
  remove.type = 'button';
  remove.title = 'Remove';
  remove.setAttribute('aria-label', 'Remove from queue');
  remove.textContent = '×';
  remove.addEventListener('click', () => { queue.remove(item.id); render(); });

  // Per-row Options disclosure. Only shown when the chosen target
  // accepts user-tunable options (image / video / audio / pdf-compress).
  let optionsToggle = null;
  let optionsPanel = null;
  if (targetWantsAnyOptions(item.target)
      && !(isConverting || item.status === 'converting' || item.status === 'done')) {
    optionsToggle = document.createElement('button');
    optionsToggle.type = 'button';
    optionsToggle.className = 'queue-options-toggle';
    optionsToggle.textContent = 'Options ▸';
    optionsPanel = document.createElement('div');
    optionsPanel.className = 'queue-options';
    optionsPanel.hidden = true;
    if (targetWantsImageOptions(item.target)) {
      buildImageOptionFields(item, item.target, optionsPanel);
    } else if (targetWantsVideoOptions(item.target)) {
      buildVideoOptionFields(item, optionsPanel);
    } else if (targetWantsAudioOptions(item.target)) {
      buildAudioOptionFields(item, optionsPanel);
    } else if (targetWantsPdfCompressOptions(item.target)) {
      buildPdfCompressFields(item, optionsPanel);
    }
    optionsToggle.addEventListener('click', () => {
      const open = optionsPanel.hidden;
      optionsPanel.hidden = !open;
      optionsToggle.textContent = open ? 'Options ▾' : 'Options ▸';
    });
  }

  li.appendChild(nameWrap);
  li.appendChild(select);
  if (optionsToggle) li.appendChild(optionsToggle);
  li.appendChild(status);
  li.appendChild(remove);
  if (optionsPanel) li.appendChild(optionsPanel);
  return li;
}

function humanSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function queuedInputBytes() {
  let total = 0;
  for (const item of queue.items.values()) {
    if (!item.blocked) total += item.file.size || 0;
  }
  return total;
}

async function detectFile(file) {
  const headBuf = await file.slice(0, 16).arrayBuffer();
  return detect(file.name, new Uint8Array(headBuf));
}

async function readSource(item) {
  if (item.file.size > MAX_FILE_BYTES) {
    throw new Error(`File is larger than the ${humanSize(MAX_FILE_BYTES)} per-file limit.`);
  }
  const buf = await item.file.arrayBuffer();
  return {
    bytes: buf,
    mime: item.detected.mime,
    name: item.file.name,
    family: item.detected.family,
  };
}

// ---------- File intake ----------

async function addFiles(fileList) {
  let total = queuedInputBytes();
  for (const file of fileList) {
    if (queue.items.size >= MAX_QUEUE_FILES) {
      window.alert(`Queue limit reached (${MAX_QUEUE_FILES} files).`);
      break;
    }
    const detected = await detectFile(file);
    const tooLarge = file.size > MAX_FILE_BYTES;
    const wouldExceedTotal = !tooLarge && total + file.size > MAX_TOTAL_INPUT_BYTES;
    const id = queue.add(file, { detected });
    if (!tooLarge && !wouldExceedTotal) total += file.size;
    if (tooLarge || wouldExceedTotal) {
      queue.setStatus(id, 'error', {
        blocked: true,
        error: tooLarge
          ? `File is larger than ${humanSize(MAX_FILE_BYTES)}.`
          : `Adding this file would exceed the ${humanSize(MAX_TOTAL_INPUT_BYTES)} queue limit.`,
      });
    }
  }
  render();
}

// ---------- Conversion runner ----------

// Progress reporter for one queue item. Schedules a single render
// per animation frame so a high-frequency ffmpeg progress callback
// doesn't flood the DOM.
let _renderScheduled = false;
function scheduleRender() {
  if (_renderScheduled) return;
  _renderScheduled = true;
  requestAnimationFrame(() => {
    _renderScheduled = false;
    render();
  });
}

function makeProgress(itemId) {
  return (ratio) => {
    queue.setProgress(itemId, ratio);
    queue.setLoadingMessage(itemId, null);
    scheduleRender();
  };
}

let _overallTotal = 0;
let _overallIndex = 0;
let _overallCurrentProgress = null;

function startOverall(total) {
  _overallTotal = total;
  _overallIndex = 0;
  _overallCurrentProgress = null;
  renderOverall();
}
function tickOverall() {
  _overallIndex += 1;
  _overallCurrentProgress = null;
  renderOverall();
}
function setOverallCurrent(ratio) {
  _overallCurrentProgress = ratio;
  renderOverall();
}
function endOverall() {
  _overallTotal = 0;
  _overallIndex = 0;
  _overallCurrentProgress = null;
  renderOverall();
}
function renderOverall() {
  if (!queueOverall) return;
  if (_overallTotal === 0) {
    queueOverall.hidden = true;
    return;
  }
  queueOverall.hidden = false;
  const completedRatio = _overallIndex / _overallTotal;
  const currentRatio = (_overallCurrentProgress ?? 0) / _overallTotal;
  const overall = Math.max(0, Math.min(1, completedRatio + currentRatio));
  const pct = Math.round(overall * 100);
  const human = _overallCurrentProgress == null
    ? `Converting ${Math.min(_overallIndex + 1, _overallTotal)} of ${_overallTotal}…`
    : `Converting ${Math.min(_overallIndex + 1, _overallTotal)} of ${_overallTotal} — ${pct}%`;
  if (queueOverallText) queueOverallText.textContent = human;
  if (queueOverallFill) queueOverallFill.style.width = pct + '%';
}

async function convertAll() {
  if (isConverting) return;
  const jobs = queue.pendingWithTargets();
  if (jobs.length === 0) return;
  const estimatedInputBytes = jobs.reduce((sum, item) => sum + (item.file.size || 0), 0);
  const bundleZip = zipToggle.checked && jobs.length <= MAX_ZIP_FILES && estimatedInputBytes <= MAX_ZIP_INPUT_BYTES;
  if (zipToggle.checked && !bundleZip) {
    window.alert(`Zip bundling is limited to ${MAX_ZIP_FILES} files and ${humanSize(MAX_ZIP_INPUT_BYTES)} of input. Files will download individually.`);
  }
  const collected = [];
  isConverting = true;
  startOverall(jobs.length);
  render();

  for (const item of jobs) {
    queue.setStatus(item.id, 'converting', { error: null });
    queue.setProgress(item.id, null);
    queue.setLoadingMessage(item.id, null);
    render();
    try {
      const source = await readSource(item);
      let output;
      // Cross-family bridge: PDF source + image target → rasterize.
      const sourceExt = (source.name.split('.').pop() || '').toLowerCase();
      const onProgress = (ratio) => {
        queue.setProgress(item.id, ratio);
        queue.setLoadingMessage(item.id, null);
        setOverallCurrent(ratio);
        scheduleRender();
      };
      if (sourceExt === 'pdf' && item.target.ext === 'pdf-compress') {
        output = await runCompressPdf(source, item.target, onProgress, item.options);
      } else if (sourceExt === 'pdf' && isImageTarget(item.target)) {
        output = await runPdfAsImage(source, item.target, onProgress, item.options);
      } else if (item.detected.family === 'document' &&
                 (sourceExt === 'html' || sourceExt === 'htm' || sourceExt === 'md' || sourceExt === 'markdown') &&
                 isSpreadsheetTarget(item.target)) {
        // Bridge: HTML/MD source carrying tables → spreadsheet target.
        // runSheet → importSpreadsheetAny picks the right table reader.
        output = await runSheet({ ...source, family: 'spreadsheet' }, item.target);
      } else {
        switch (item.detected.family) {
          case 'document':    output = await runDoc(source, item.target); break;
          case 'spreadsheet': output = await runSheet(source, item.target); break;
          case 'image':       output = await runImage(source, item.target, item.options); break;
          case 'slides':      output = await runSlides(source, item.target); break;
          case 'video': {
            // Surface the wasm download status the very first time
            // any video job runs; the engine memoizes the load so
            // subsequent jobs in the same session won't trigger it.
            if (!_videoEngine) {
              queue.setLoadingMessage(item.id, 'Loading video engine (~25 MB)…');
              scheduleRender();
            }
            output = await runVideo(source, item.target, onProgress, item.options);
            break;
          }
          case 'audio': {
            // Audio shares the FFmpeg.wasm engine with video, so the
            // first audio job in a fresh session also pays the
            // ~25 MB engine download.
            if (!_videoEngine) {
              queue.setLoadingMessage(item.id, 'Loading audio engine (~25 MB)…');
              scheduleRender();
            }
            output = await runAudio(source, item.target, onProgress, item.options);
            break;
          }
          case 'subtitle': {
            // Subtitle conversion also runs through FFmpeg.wasm — the
            // first subtitle job triggers the same engine download.
            if (!_videoEngine) {
              queue.setLoadingMessage(item.id, 'Loading subtitle engine (~25 MB)…');
              scheduleRender();
            }
            output = await runSubtitle(source, item.target, onProgress);
            break;
          }
          default: throw new Error('Unknown family: ' + item.detected.family);
        }
      }

      const outName = renameWithExt(item.file.name, item.target.outputExt || item.target.ext);
      if (bundleZip) {
        collected.push({ name: outName, bytes: output.bytes });
      } else {
        downloadBlob(new Blob([output.bytes], { type: output.mime }), outName);
      }
      queue.setStatus(item.id, 'done');
      queue.setProgress(item.id, null);
    } catch (err) {
      queue.setStatus(item.id, 'error', {
        error: err instanceof Error ? err.message : String(err),
      });
      queue.setProgress(item.id, null);
    }
    tickOverall();
    render();
  }

  if (bundleZip && collected.length > 0) {
    try {
      emitZip(collected, `converted-${timestamp()}.zip`);
    } catch (err) {
      console.warn('zip export failed:', err);
    }
  }
  isConverting = false;
  endOverall();
  render();
}

function renameWithExt(name, ext) {
  return name.replace(/\.[^.]+$/, '') + '.' + ext;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// ---------- Wiring ----------

pickBtn.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files.length) addFiles(fileInput.files);
  fileInput.value = '';
});

['dragenter', 'dragover'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add('is-hover'); });
});
['dragleave', 'drop'].forEach((ev) => {
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove('is-hover'); });
});
dropZone.addEventListener('drop', (e) => {
  if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

convertBtn.addEventListener('click', convertAll);
clearBtn.addEventListener('click', () => { queue.clear(); render(); });

// Wait for the AVIF capability probe before the first render so the
// dropdown reflects whether AVIF encode is actually available in
// this browser. The probe times out after ~250ms so this never
// blocks boot meaningfully.
matrixReady.then(render);
