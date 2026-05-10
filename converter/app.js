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
import { targetsForItem } from './matrix.js';
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

// Split a document HTML string at H1 (falling back to H2) to make
// one slide per top-level section. The first slide takes the doc
// title if no H1 is found before the first paragraph.
function htmlToDeck(html, title) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const headingTag = tmp.querySelector('h1') ? 'H1' : (tmp.querySelector('h2') ? 'H2' : null);
  const slidesOut = [];
  let bucket = { title: title || 'Slide', body: '' };
  if (!headingTag) {
    bucket.body = tmp.innerHTML;
    slidesOut.push(bucket);
  } else {
    Array.from(tmp.childNodes).forEach((n) => {
      if (n.nodeType === 1 && n.tagName === headingTag) {
        if (bucket.body || slidesOut.length === 0) slidesOut.push(bucket);
        bucket = { title: n.textContent || 'Slide', body: '' };
      } else {
        bucket.body += n.outerHTML || (n.nodeValue || '');
      }
    });
    if (bucket.body || !slidesOut.length) slidesOut.push(bucket);
  }
  return {
    title,
    slides: slidesOut.map((s) => ({
      elements: [
        {
          id: `t-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'text',
          x: 40, y: 40, w: 1200, h: 80,
          html: `<b>${escapeHtml(s.title)}</b>`,
          role: 'free', fontSize: 36, fontWeight: 700, align: 'left',
          color: null, fontFamily: null,
        },
        {
          id: `b-${Math.random().toString(36).slice(2, 8)}`,
          kind: 'text',
          x: 40, y: 140, w: 1200, h: 540,
          html: s.body || '<p></p>',
          role: 'free', fontSize: 20, fontWeight: 400, align: 'left',
          color: null, fontFamily: null,
        },
      ],
    })),
  };
}

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

async function encodeCanvasToTarget(canvas, target, name) {
  if (target.ext === 'psd') {
    const blob = images.encodePsd(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  if (target.ext === 'pdf') {
    // Photoshop PDF: a single-page PDF wrapping the canvas as a
    // JPEG image. Photoshop, Acrobat and Preview all open it
    // straight back as a flattened image.
    const blob = await images.encodePdfFromCanvas(canvas, { format: 'jpeg', quality: 0.92 });
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
  if (target.ext === 'cbz') {
    const blob = await images.encodeCbzFromCanvas(canvas);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  // PNG / JPEG / WebP — alpha-flatten when targeting JPEG to avoid
  // black backgrounds.
  if (target.mime === 'image/jpeg' && hasAlpha(canvas)) {
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    const blob = await images.canvasToBlob(flat, target.mime, 0.92);
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  const blob = await images.canvasToBlob(canvas, target.mime);
  const buf = await blob.arrayBuffer();
  return { bytes: buf, mime: target.mime };
}

function hasAlpha(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

async function runImage(source, target) {
  const canvas = await decodeImageSourceToCanvas(source);
  return encodeCanvasToTarget(canvas, target, source.name);
}

// ---------- PDF as image (any PDF rasterized to a canvas) ----------
//
// Triggered from the main dispatch when the source is a PDF and the
// chosen target is an image format (PSD/PNG/JPEG/WebP). PDF→PDF is
// out of scope (no-op) and PDF→other-document continues to flow
// through runDoc.

async function runPdfAsImage(source, target, onProgress) {
  // Multi-page bridge: any PDF → CBZ rasterizes every page.
  if (target.ext === 'cbz') {
    const blob = await images.encodeCbzFromPdf(source.bytes, { onProgress });
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  const { canvas } = await images.decodePdfPage(source.bytes, 0);
  if (onProgress) onProgress(1);
  return encodeCanvasToTarget(canvas, target, source.name);
}

function isImageTarget(target) {
  if (!target) return false;
  switch (target.ext) {
    case 'png': case 'jpg': case 'webp': case 'psd':
    case 'bmp': case 'ico': case 'ppm': case 'tga':
    case 'tif': case 'tiff': case 'cbz':
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
  if (target.ext === 'pptx') {
    // Pass-through. The user picked the same format on both sides.
    return { bytes: source.bytes, mime: target.mime };
  }
  const deck = await slides.loadPptx(source.bytes);
  const html = deckToHtml(deck);
  const bytes = await writeDocFromHtml(html, target, source.name);
  return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mime: target.mime };
}

function deckToHtml(deck) {
  let html = '';
  if (deck.title) html += `<h1>${escapeHtml(deck.title)}</h1>`;
  for (const slide of deck.slides || []) {
    let firstText = true;
    for (const el of slide.elements || []) {
      if (el.kind !== 'text') continue;
      if (firstText) {
        // Emit the first text element's first paragraph as the slide
        // title heading, the rest as body.
        const tmp = document.createElement('div');
        tmp.innerHTML = el.html || '';
        const first = tmp.firstChild;
        const titleText = first ? (first.textContent || '').trim() : '';
        if (titleText) html += `<h2>${escapeHtml(titleText)}</h2>`;
        if (first) first.remove();
        html += tmp.innerHTML;
        firstText = false;
      } else {
        html += el.html || '';
      }
    }
  }
  return html || '<p>(empty deck)</p>';
}

// ---------- Video family (FFmpeg.wasm; lazy-loaded) ----------
//
// First call into runVideo dynamically imports lib/video, which in
// turn lazily fetches the ~25 MB FFmpeg.wasm core on the first
// transcode. We keep the import dynamic so the converter shell
// stays small for users who never queue a video.

const VIDEO_IMAGE_TARGETS = new Set(['png', 'jpg', 'webp', 'pdf']);
const AUDIO_TARGETS = new Set(['mp3', 'm4a', 'wav', 'ogg', 'flac', 'opus']);

let _videoEngine = null;
async function getVideoEngine() {
  if (!_videoEngine) _videoEngine = await import('../lib/video/index.js');
  return _videoEngine;
}

async function runVideo(source, target, onProgress) {
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
    return encodeCanvasToTarget(canvas, target, source.name);
  }

  // Audio extraction (drop video stream, encode audio track).
  if (AUDIO_TARGETS.has(target.ext)) {
    const out = await video.transcodeAudio(inputBytes, { from: fromExt, to: target.ext, onProgress });
    const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    return { bytes: buf, mime: target.mime };
  }

  // Container/codec transcode.
  const out = await video.transcode(inputBytes, { from: fromExt, to: target.ext, onProgress });
  const buf = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
  return { bytes: buf, mime: target.mime };
}

// Audio source family → audio target. Reuses the video engine
// (FFmpeg.wasm) since it handles both video and audio streams.
async function runAudio(source, target, onProgress) {
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
  const out = await video.transcodeAudio(inputBytes, { from: fromExt, to: target.ext, onProgress });
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
  const workerCanWrite = target.ext === 'xlsx' || target.ext === 'csv' || target.ext === 'tsv' || target.ext === 'psv';
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

  li.appendChild(nameWrap);
  li.appendChild(select);
  li.appendChild(status);
  li.appendChild(remove);
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
      if (sourceExt === 'pdf' && isImageTarget(item.target)) {
        output = await runPdfAsImage(source, item.target, onProgress);
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
          case 'image':       output = await runImage(source, item.target); break;
          case 'slides':      output = await runSlides(source, item.target); break;
          case 'video': {
            // Surface the wasm download status the very first time
            // any video job runs; the engine memoizes the load so
            // subsequent jobs in the same session won't trigger it.
            if (!_videoEngine) {
              queue.setLoadingMessage(item.id, 'Loading video engine (~25 MB)…');
              scheduleRender();
            }
            output = await runVideo(source, item.target, onProgress);
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
            output = await runAudio(source, item.target, onProgress);
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

render();
