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

const dropZone   = document.getElementById('dropZone');
const fileInput  = document.getElementById('fileInput');
const pickBtn    = document.getElementById('pickBtn');
const queueSec   = document.getElementById('queueSection');
const queueList  = document.getElementById('queueList');
const convertBtn = document.getElementById('convertBtn');
const clearBtn   = document.getElementById('clearBtn');
const zipToggle  = document.getElementById('zipToggle');

const queue = createQueue();

const TXT_DEC = new TextDecoder('utf-8');
const TXT_ENC = new TextEncoder();

// ---------- Worker dispatch (spreadsheets only) ----------

let worker = null;
let jobSeq = 0;
const pending = new Map();

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (e) => {
    const { id, ok, output, error } = e.data;
    const slot = pending.get(id);
    if (!slot) return;
    pending.delete(id);
    if (ok) slot.resolve(output);
    else slot.reject(new Error(error));
  });
  return worker;
}

function runOnWorker(source, target) {
  ensureWorker();
  const id = ++jobSeq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, source, target }, [source.bytes]);
  });
}

// ---------- Document family (main thread) ----------

async function readDocToHtml(source) {
  const ext = (source.name.split('.').pop() || '').toLowerCase();
  const buf = source.bytes;
  switch (ext) {
    case 'docx': return docs.loadDocx(buf);
    case 'pdf':  return docs.loadPdf(buf);
    case 'rtf':  return docs.rtfImport(TXT_DEC.decode(buf));
    case 'odt':  return docs.odtImport(buf);
    case 'epub': return docs.epubImport(buf);
    case 'html':
    case 'htm':  return TXT_DEC.decode(buf);
    case 'txt':  return textToHtml(TXT_DEC.decode(buf));
    case 'md':
    case 'markdown': return mdToHtml(TXT_DEC.decode(buf));
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
    default: throw new Error(`Unsupported document output: .${target.ext}`);
  }
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

async function runPdfAsImage(source, target) {
  const { canvas } = await images.decodePdfPage(source.bytes, 0);
  return encodeCanvasToTarget(canvas, target, source.name);
}

function isImageTarget(target) {
  if (!target) return false;
  return target.ext === 'png' || target.ext === 'jpg' || target.ext === 'webp' || target.ext === 'psd';
}

// ---------- Spreadsheet family (worker for native; main thread for PDF) ----------

async function runSheet(source, target) {
  if (target.ext === 'xlsx' || target.ext === 'csv') {
    return runOnWorker(source, target);
  }
  if (target.ext === 'pdf') {
    const sheets = await import('../lib/sheets/index.js');
    const wb = sheets.importSpreadsheet(source.bytes, source.name);
    const html = workbookToHtml(wb);
    const blob = docs.savePdf(html, { title: wb.name });
    const buf = await blob.arrayBuffer();
    return { bytes: buf, mime: target.mime };
  }
  throw new Error(`Unsupported spreadsheet output: .${target.ext}`);
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
  if (queue.items.size === 0) { queueSec.hidden = true; return; }
  queueSec.hidden = false;
  for (const item of queue.items.values()) queueList.appendChild(renderRow(item));
  convertBtn.disabled = queue.pendingWithTargets().length === 0;
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
      convertBtn.disabled = queue.pendingWithTargets().length === 0;
    });
  }
  if (item.status === 'converting' || item.status === 'done') select.disabled = true;

  const status = document.createElement('div');
  status.className = 'queue-status';
  status.textContent = item.status === 'converting' ? 'Converting…' : '';

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

// ---------- File intake ----------

async function addFiles(fileList) {
  for (const file of fileList) {
    const buf = await file.arrayBuffer();
    const headBytes = new Uint8Array(buf, 0, Math.min(16, buf.byteLength));
    const detected = detect(file.name, headBytes);
    const id = queue.add(file);
    const item = queue.items.get(id);
    item.detected = detected;
    item.bytes = buf;
  }
  render();
}

// ---------- Conversion runner ----------

async function convertAll() {
  const bundleZip = zipToggle.checked;
  const collected = [];
  const jobs = queue.pendingWithTargets();
  if (jobs.length === 0) return;
  convertBtn.disabled = true;
  clearBtn.disabled = true;

  for (const item of jobs) {
    queue.setStatus(item.id, 'converting');
    render();
    try {
      const source = {
        bytes: item.bytes.slice(0),
        mime: item.detected.mime,
        name: item.file.name,
        family: item.detected.family,
      };
      let output;
      // Cross-family bridge: PDF source + image target → rasterize.
      const sourceExt = (source.name.split('.').pop() || '').toLowerCase();
      if (sourceExt === 'pdf' && isImageTarget(item.target)) {
        output = await runPdfAsImage(source, item.target);
      } else {
        switch (item.detected.family) {
          case 'document':    output = await runDoc(source, item.target); break;
          case 'spreadsheet': output = await runSheet(source, item.target); break;
          case 'image':       output = await runImage(source, item.target); break;
          default: throw new Error('Unknown family: ' + item.detected.family);
        }
      }

      const outName = renameWithExt(item.file.name, item.target.ext);
      if (bundleZip) {
        collected.push({ name: outName, bytes: output.bytes });
      } else {
        downloadBlob(new Blob([output.bytes], { type: output.mime }), outName);
      }
      queue.setStatus(item.id, 'done');
    } catch (err) {
      queue.setStatus(item.id, 'error', { error: err.message });
    }
    render();
  }

  if (bundleZip && collected.length > 0) {
    emitZip(collected, `converted-${timestamp()}.zip`);
  }
  clearBtn.disabled = false;
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
