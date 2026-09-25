// FileMerger: PDF tab (PDFs, images and documents into one PDF packet).
//
// PDF merging is lossless: lib/docs/pdfmerge.js copies each chosen page's
// objects (content streams, fonts, images) byte-for-byte into one new
// PDF, so text stays selectable and nothing is re-compressed. Images and
// documents are turned into merge sources by packet.js. pdf.js (vendored
// under lib/images/) is only used for thumbnails, and to rasterize
// encrypted files, which the object copier can't read.
import { mergePdfs, inspectPdf, parsePageRanges } from '../lib/docs/pdfmerge.js';
import * as packet from './packet.js';

const $ = (id) => document.getElementById(id);
const list = $('pdf-list');
const listHead = $('pdf-list-head');
const summary = $('pdf-summary');
const fileInput = $('pdf-file-input');
const mergeBtn = $('pdf-merge');
const bookmarksBox = $('pdf-bookmarks');
const nameInput = $('pdf-name');
const progressWrap = $('pdf-progress');
const pct = $('pdf-pct');
const phase = $('pdf-phase');
const barFill = $('pdf-bar-fill');
const bar = $('pdf-bar');
const statusBox = $('pdf-status');
const result = $('pdf-result');
const download = $('pdf-download');
const openLink = $('pdf-open');
const pageSizeSel = $('pdf-page-size');
const contentsBox = $('pdf-contents');
const numberingSel = $('pdf-numbering');
const batesFields = $('pdf-bates');
const batesPrefix = $('pdf-bates-prefix');
const batesStart = $('pdf-bates-start');

let entries = [];
let nextId = 1;
let running = false;
let resultUrl = null;
let dragId = null;

let pdfjsPromise = null;
function loadPdfjs() {
  pdfjsPromise ??= import('../lib/images/vendor/pdfjs/pdf.mjs').then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('../lib/images/vendor/pdfjs/pdf.worker.mjs', import.meta.url).toString();
    return pdfjs;
  });
  return pdfjsPromise;
}

// pdf.js transfers its input buffer to the worker, so always hand it a copy.
async function openWithPdfjs(bytes) {
  const pdfjs = await loadPdfjs();
  return pdfjs.getDocument({ data: bytes.slice() }).promise;
}

function fmtBytes(n) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
}

function showStatus(msg, isError = false) {
  statusBox.textContent = msg;
  statusBox.classList.toggle('error', isError);
  statusBox.hidden = false;
}

// ---------- file list ----------

export async function addFiles(files) {
  const added = [];
  for (const file of files) {
    const kind = packet.kindOf(file);
    if (!kind) continue;
    const entry = { id: nextId++, file, kind, range: '', rotate: 0 };
    entries.push(entry);
    added.push(entry);
  }
  render();
  await Promise.all(added.map(async (entry) => {
    try {
      if (entry.kind === 'pdf') await preparePdf(entry);
      else if (entry.kind === 'image') await prepareImage(entry);
      else await prepareConverted(entry);
    } catch (err) {
      entry.error = err?.name === 'PasswordException'
        ? 'Password-protected; unlock it first'
        : err instanceof Error ? err.message : String(err);
    }
    entry.ready = true;
    render();
  }));
}

async function preparePdf(entry) {
  entry.bytes = new Uint8Array(await entry.file.arrayBuffer());
  const info = await inspectPdf(entry.bytes).catch(() => null);
  entry.encrypted = !!info?.encrypted;
  entry.pageCount = info?.pageCount || 0;
  // The object reader couldn't parse it (or it's encrypted): let pdf.js
  // count pages, and the file will be rasterized at merge time.
  if (!info || info.encrypted) entry.rasterize = true;
  entry.thumb = await thumbnail(entry);
}

async function prepareImage(entry) {
  entry.image = await packet.loadImage(entry.file);
  entry.pageCount = 1;
  entry.thumb = URL.createObjectURL(entry.file);
}

// Documents, spreadsheets and slides: converted to PDF now so the page
// count and thumbnail are real, and again when the paper size changes.
async function prepareConverted(entry) {
  if (entry.html == null) {
    entry.html = await packet.toHtml(entry.file, entry.kind);
    entry.unsupportedChars = packet.hasUnsupportedChars(entry.html);
  }
  entry.bytes = await packet.htmlToPdf(entry.html, baseName(entry.file.name), pageSizeSel.value);
  entry.pageCount = (await inspectPdf(entry.bytes)).pageCount;
  if (entry.pageCount < 2) entry.range = ''; // the range box is hidden
  // Swap thumbnails only once the new one exists: rows re-render while
  // other files convert, and must never point at a revoked URL.
  const old = entry.thumb;
  entry.thumb = await thumbnail(entry);
  if (old) URL.revokeObjectURL(old);
}

const baseName = (name) => name.replace(/\.[^.]+$/, '');

async function thumbnail(entry) {
  let doc;
  try {
    doc = await openWithPdfjs(entry.bytes);
  } catch (err) {
    // Rasterized files need pdf.js; for the rest a missing thumbnail is fine.
    if (entry.rasterize) throw err;
    return '';
  }
  try {
    if (entry.rasterize) entry.pageCount = doc.numPages;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(160 / base.width, 200 / base.height) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    return blob ? URL.createObjectURL(blob) : '';
  } catch {
    return ''; // a missing thumbnail shouldn't block merging
  } finally {
    doc.destroy();
  }
}

function disposeEntry(e) {
  if (e.thumb) URL.revokeObjectURL(e.thumb);
}

function removeEntry(id) {
  const e = entries.find((x) => x.id === id);
  if (e) disposeEntry(e);
  entries = entries.filter((x) => x.id !== id);
  render();
}

function move(id, delta) {
  const i = entries.findIndex((x) => x.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= entries.length) return;
  [entries[i], entries[j]] = [entries[j], entries[i]];
  render();
}

function rangeError(entry) {
  if (!entry.pageCount) return null;
  try {
    const pages = parsePageRanges(entry.range, entry.pageCount);
    return pages && !pages.length ? 'No pages selected' : null;
  } catch (err) {
    return err.message;
  }
}

function selectedPageCount(entry) {
  try {
    return parsePageRanges(entry.range, entry.pageCount)?.length ?? entry.pageCount;
  } catch {
    return 0;
  }
}

// "Pages [1-3, 5]" box for picking part of a multi-page file.
function rangeRow(entry) {
  const row = document.createElement('label');
  row.className = 'range';
  row.append('Pages ');
  const input = document.createElement('input');
  input.type = 'text';
  const n = entry.pageCount;
  input.placeholder = `All, or e.g. 1-${Math.min(3, n)}${n >= 5 ? ', 5' : ''}`;
  input.value = entry.range;
  input.disabled = running;
  input.spellcheck = false;
  const err = rangeError(entry);
  const errSpan = document.createElement('span');
  errSpan.className = 'warn';
  errSpan.textContent = err ? ` ${err}` : '';
  input.classList.toggle('invalid', !!err);
  input.addEventListener('input', () => {
    entry.range = input.value;
    const e = rangeError(entry);
    input.classList.toggle('invalid', !!e);
    errSpan.textContent = e ? ` ${e}` : '';
    updateSummary();
  });
  row.append(input, errSpan);
  return row;
}

function render() {
  // Rebuilding the rows would drop focus from a page-range box the user is
  // typing in (other files finish loading in the background), so note it
  // and restore it afterwards.
  const active = document.activeElement;
  const focused = active instanceof HTMLInputElement && list.contains(active)
    ? { id: active.closest('li')?.dataset.id, start: active.selectionStart, end: active.selectionEnd }
    : null;
  list.replaceChildren(...entries.map((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'clip pdf' + (entry.ready ? '' : ' loading');
    li.draggable = !running;
    li.dataset.id = String(entry.id);

    const index = document.createElement('span');
    index.className = 'index';
    index.textContent = String(idx + 1);

    let thumb;
    if (entry.thumb) {
      thumb = document.createElement('img');
      thumb.src = entry.thumb;
      thumb.alt = '';
      if (entry.rotate) thumb.style.transform = `rotate(${entry.rotate}deg)`;
    } else {
      thumb = document.createElement('div');
    }
    thumb.classList.add('thumb');

    const body = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = entry.file.name;
    const meta = document.createElement('div');
    meta.className = 'meta';
    if (entry.error) {
      const w = document.createElement('span');
      w.className = 'warn';
      w.textContent = entry.error;
      meta.append(w);
    } else if (entry.ready) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      const chipTexts = [packet.describe(entry.file, entry.kind), `${entry.pageCount} page${entry.pageCount === 1 ? '' : 's'}`, fmtBytes(entry.file.size)];
      if (entry.rotate) chipTexts.push(`↻ ${entry.rotate}°`);
      for (const text of chipTexts) {
        const c = document.createElement('span');
        c.className = 'chip';
        c.textContent = text;
        chips.append(c);
      }
      meta.append(chips);
      if (entry.rasterize) {
        const w = document.createElement('span');
        w.className = 'warn';
        w.textContent = entry.encrypted
          ? 'Encrypted: pages will be merged as images'
          : "Couldn't read its structure: pages will be merged as images";
        meta.append(w);
      }
      if (entry.html && packet.isRich(entry.file)) {
        const n = document.createElement('span');
        n.className = 'note';
        n.textContent = 'Converted as text and tables: pictures and exact layout are not kept. For a faithful copy, save it as PDF from its own app first.';
        meta.append(n);
      }
      if (entry.unsupportedChars) {
        const w = document.createElement('span');
        w.className = 'warn';
        w.textContent = 'Has characters the converter can\'t draw (non-Latin scripts, emoji); they will print as "?"';
        meta.append(w);
      }
      if (entry.pageCount > 1) meta.append(rangeRow(entry));
    } else {
      meta.textContent = 'Reading…';
    }
    body.append(name, meta);

    const ctrl = document.createElement('div');
    ctrl.className = 'ctrl';
    const mk = (label, title, fn, disabled = false) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon';
      b.textContent = label;
      b.title = title;
      b.disabled = disabled || running;
      b.onclick = fn;
      return b;
    };
    ctrl.append(
      mk('↻', 'Rotate 90° clockwise', () => { entry.rotate = (entry.rotate + 90) % 360; render(); }, !entry.ready || !!entry.error),
      mk('↑', 'Move up', () => move(entry.id, -1), idx === 0),
      mk('↓', 'Move down', () => move(entry.id, 1), idx === entries.length - 1),
      mk('✕', 'Remove', () => removeEntry(entry.id)),
    );
    li.append(index, thumb, body, ctrl);

    // A draggable row swallows mouse text selection in the range box, so
    // only make the row draggable when the press starts outside the box.
    li.addEventListener('pointerdown', (ev) => {
      li.draggable = !running && !(ev.target instanceof HTMLInputElement);
    });
    li.addEventListener('dragstart', (ev) => {
      dragId = entry.id;
      li.classList.add('dragging');
      ev.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      dragId = null;
      li.classList.remove('dragging');
    });
    li.addEventListener('dragover', (ev) => {
      if (dragId === null || dragId === entry.id) return;
      ev.preventDefault();
      const from = entries.findIndex((x) => x.id === dragId);
      const to = entries.findIndex((x) => x.id === entry.id);
      const [moved] = entries.splice(from, 1);
      entries.splice(to, 0, moved);
      render();
    });
    return li;
  }));
  if (focused) {
    const input = list.querySelector(`li[data-id="${focused.id}"] input`);
    if (input && !input.disabled) {
      input.focus();
      input.setSelectionRange(focused.start, focused.end);
    }
  }
  listHead.hidden = entries.length === 0;
  $('pdf-sort-name').disabled = running;
  $('pdf-clear').disabled = running;
  pageSizeSel.disabled = running;
  updateSummary();
}

function updateSummary() {
  const pages = entries.reduce((s, e) => s + (e.ready && !e.error ? selectedPageCount(e) : 0), 0);
  summary.textContent = `${entries.length} file${entries.length === 1 ? '' : 's'} · ${pages} page${pages === 1 ? '' : 's'} selected`;
  const ok = entries.length > 0 && entries.every((e) => e.ready && !e.error && !rangeError(e));
  mergeBtn.disabled = running || !ok;
}

// ---------- merge ----------

// Renders every selected page of an unreadable/encrypted PDF to JPEG.
async function rasterize(entry, pages, onPage) {
  const doc = await openWithPdfjs(entry.bytes);
  try {
    const images = [];
    for (const i of pages) {
      const page = await doc.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      // ~200 dpi, capped so huge pages don't exhaust canvas memory.
      const scale = Math.min(200 / 72, 5000 / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      images.push({
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        width: canvas.width,
        height: canvas.height,
        // The viewport already applied the page's own /Rotate.
        pageWidth: base.width,
        pageHeight: base.height,
      });
      canvas.width = canvas.height = 0;
      onPage();
    }
    return images;
  } finally {
    doc.destroy();
  }
}

async function startMerge() {
  running = true;
  statusBox.hidden = true;
  result.hidden = true;
  if (resultUrl) {
    URL.revokeObjectURL(resultUrl);
    resultUrl = null;
  }
  progressWrap.hidden = false;
  render();
  const setProgress = (frac, text) => {
    pct.textContent = `${Math.round(frac * 100)}%`;
    barFill.style.width = `${frac * 100}%`;
    bar.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
    phase.textContent = text;
  };
  const started = performance.now();
  // Work from a snapshot: files dropped mid-merge join the list for next time.
  const jobs = entries.slice();
  try {
    const sources = [];
    const rasterJobs = jobs.filter((e) => e.rasterize);
    const rasterTotal = rasterJobs.reduce((s, e) => s + selectedPageCount(e), 0);
    let rasterDone = 0;
    for (const e of jobs) {
      const pages = parsePageRanges(e.range, e.pageCount);
      const src = { name: baseName(e.file.name), rotate: e.rotate };
      if (e.kind === 'image') {
        src.images = [packet.layoutImage(e.image, pageSizeSel.value)];
      } else if (e.rasterize) {
        const all = pages ?? Array.from({ length: e.pageCount }, (_, i) => i);
        src.images = await rasterize(e, all, () => {
          rasterDone++;
          setProgress(0.5 * (rasterDone / rasterTotal), `Rendering ${e.file.name} as images…`);
        });
      } else {
        src.bytes = e.bytes;
        if (pages) src.pages = pages;
      }
      sources.push(src);
    }
    const base = rasterTotal ? 0.5 : 0;
    setProgress(base, 'Copying pages…');
    const out = await mergePdfs(sources, {
      bookmarks: bookmarksBox.checked,
      title: outputName().replace(/\.pdf$/i, ''),
      contents: contentsBox.checked && { pageSize: packet.PAGE_SIZES[pageSizeSel.value] || packet.PAGE_SIZES.letter },
      stamp: stampOption(),
      onProgress: (r) => setProgress(base + (1 - base) * r, 'Copying pages…'),
    });
    const blob = new Blob([out], { type: 'application/pdf' });
    resultUrl = URL.createObjectURL(blob);
    download.href = resultUrl;
    download.download = outputName();
    openLink.href = resultUrl;
    result.hidden = false;
    const pages = sources.reduce((s, src, i) => s + (src.images?.length ?? src.pages?.length ?? jobs[i].pageCount), 0);
    const secs = ((performance.now() - started) / 1000).toFixed(1);
    setProgress(1, 'Done');
    const extra = contentsBox.checked ? ', plus a contents page' : '';
    showStatus(`Merged ${pages} page${pages === 1 ? '' : 's'} from ${sources.length} file${sources.length === 1 ? '' : 's'}${extra} in ${secs}s. Output: ${fmtBytes(blob.size)}.`);
  } catch (err) {
    console.error(err);
    showStatus(`Merge failed: ${err instanceof Error ? err.message : String(err)}`, true);
  } finally {
    running = false;
    render();
  }
}

// Page numbers or Bates numbers, stamped on every page of the packet.
function stampOption() {
  if (numberingSel.value === 'page') {
    return { text: (i, n) => `Page ${i + 1} of ${n}`, position: 'center' };
  }
  if (numberingSel.value === 'bates') {
    const prefix = batesPrefix.value.trim();
    const start = Math.max(0, Math.floor(Number(batesStart.value) || 1));
    return { text: (i) => `${prefix}${String(start + i).padStart(6, '0')}`, position: 'right' };
  }
  return null;
}

// Packet options are remembered per browser.
const OPTIONS_KEY = 'filemerger.packet';
function saveOptions() {
  const o = {
    pageSize: pageSizeSel.value, contents: contentsBox.checked, bookmarks: bookmarksBox.checked,
    numbering: numberingSel.value, batesPrefix: batesPrefix.value, batesStart: batesStart.value,
  };
  try { localStorage.setItem(OPTIONS_KEY, JSON.stringify(o)); } catch { /* storage unavailable */ }
}
function loadOptions() {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(OPTIONS_KEY)); } catch { /* none saved */ }
  // Letter where it's the norm, A4 elsewhere.
  pageSizeSel.value = o?.pageSize || (/^en-(US|CA)$|^es-(MX|US)$|^fr-CA$/.test(navigator.language) ? 'letter' : 'a4');
  if (!pageSizeSel.value) pageSizeSel.value = 'letter';
  if (o) {
    contentsBox.checked = !!o.contents;
    bookmarksBox.checked = o.bookmarks !== false;
    numberingSel.value = o.numbering || 'none';
    batesPrefix.value = o.batesPrefix ?? '';
    batesStart.value = o.batesStart || '1';
  }
  batesFields.hidden = numberingSel.value !== 'bates';
}

function outputName() {
  const n = nameInput.value.trim() || 'merged.pdf';
  return /\.pdf$/i.test(n) ? n : `${n}.pdf`;
}

// ---------- wiring ----------

fileInput.accept = packet.ACCEPT;
fileInput.addEventListener('change', () => {
  if (fileInput.files) addFiles(Array.from(fileInput.files));
  fileInput.value = '';
});
$('pdf-sort-name').addEventListener('click', () => {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  entries.sort((a, b) => collator.compare(a.file.name, b.file.name));
  render();
});
$('pdf-clear').addEventListener('click', () => {
  entries.forEach(disposeEntry);
  entries = [];
  render();
});
mergeBtn.addEventListener('click', startMerge);
for (const el of [contentsBox, bookmarksBox, batesPrefix, batesStart]) el.addEventListener('change', saveOptions);
numberingSel.addEventListener('change', () => {
  batesFields.hidden = numberingSel.value !== 'bates';
  saveOptions();
});
// Converted documents are laid out on the paper size, so re-convert them.
pageSizeSel.addEventListener('change', async () => {
  saveOptions();
  const affected = entries.filter((e) => e.html && !e.error);
  affected.forEach((e) => { e.ready = false; });
  render();
  await Promise.all(affected.map(async (e) => {
    try {
      await prepareConverted(e);
    } catch (err) {
      e.error = err instanceof Error ? err.message : String(err);
    }
    e.ready = true;
    render();
  }));
});
loadOptions();

render();
