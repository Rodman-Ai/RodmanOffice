// FileMerger: turns non-PDF files into sources for the PDF packet.
//
// Images become one page each (lib/images/pdf-image.js): JPEG bytes
// pass straight through with their EXIF orientation applied, and other
// formats are stored losslessly.
//
// Documents, spreadsheets and slides go through the suite's own engines
// (lib/docs, lib/sheets, lib/slides) to HTML and then lib/docs' savePdf.
// That writer uses the built-in PDF fonts, so the result keeps text,
// headings, lists and tables, but not embedded images or exact layout,
// and characters outside Latin-1 become '?'. The UI says so per file.
// The engines load on first use.

// Browser-decoded formats, plus the ones lib/images/decode.js reads.
const IMAGE_EXT = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'cur', 'svg', 'heic', 'heif',
  'tif', 'tiff', 'ppm', 'pgm', 'pbm', 'pam', 'pnm', 'tga', 'pcx', 'sgi', 'rgb', 'ras', 'ff', 'wbmp', 'xbm', 'xpm', 'hdr', 'icns'];
const DOC_EXT = ['docx', 'doc', 'rtf', 'odt', 'epub', 'txt', 'md', 'markdown', 'html', 'htm'];
const SHEET_EXT = ['xlsx', 'xls', 'csv', 'tsv'];
const SLIDE_EXT = ['pptx'];

export const ACCEPT = ['application/pdf', 'image/*', ...['pdf', ...IMAGE_EXT, ...DOC_EXT, ...SHEET_EXT, ...SLIDE_EXT].map((e) => `.${e}`)].join(',');

import { PAGE_SIZES } from '../lib/images/pdf-image.js';

export { PAGE_SIZES };

// '' when the name has no extension (files shared from some apps and
// browsers arrive as just "scan" or "image"), so the MIME type decides.
const extOf = (name) => (/\.([^./\\]+)$/.exec(name)?.[1] || '').toLowerCase();

/** 'pdf' | 'image' | 'document' | 'sheet' | 'slides' | null */
export function kindOf(file) {
  const ext = extOf(file.name);
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext)) return 'image';
  if (DOC_EXT.includes(ext)) return 'document';
  if (SHEET_EXT.includes(ext)) return 'sheet';
  if (SLIDE_EXT.includes(ext)) return 'slides';
  if (!ext) {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'text/plain' || file.type === 'text/markdown' || file.type === 'text/html') return 'document';
    if (file.type === 'text/csv') return 'sheet';
  }
  return null;
}

/** Short label for the file list, e.g. "JPEG image" or "DOCX, converted". */
export function describe(file, kind) {
  const ext = (extOf(file.name) || file.type.split('/')[1] || '').toUpperCase();
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return `${ext === 'JPG' || ext === 'JPE' || ext === 'JFIF' ? 'JPEG' : ext} image`;
  return `${ext}, converted`;
}

// ---------- images ----------
// The embedding and layout code is shared with the Converter's
// image -> PDF path, in lib/images/pdf-image.js.
export { loadImage, layoutImage } from '../lib/images/pdf-image.js';

// ---------- documents, spreadsheets, slides ----------

const TXT_DEC = new TextDecoder('utf-8');

function decodeText(bytes) {
  if (bytes.length >= 2 && ((bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0xff && bytes[1] === 0xfe))) {
    const le = bytes[0] === 0xff;
    return new TextDecoder(le ? 'utf-16le' : 'utf-16be').decode(bytes.subarray(2));
  }
  const text = TXT_DEC.decode(bytes);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Same small converters the Converter app uses (converter/app.js).
function textToHtml(txt) {
  return txt.split(/\r?\n\r?\n+/).map((p) => `<p>${escapeHtml(p).replace(/\r?\n/g, '<br>')}</p>`).join('');
}

function mdToHtml(md) {
  return md.split(/\r?\n\r?\n+/).map((block) => {
    const m = block.match(/^(#{1,6})\s+(.+)$/);
    if (m) return `<h${m[1].length}>${escapeHtml(m[2].trim())}</h${m[1].length}>`;
    return `<p>${escapeHtml(block).replace(/\r?\n/g, '<br>')}</p>`;
  }).join('');
}

// Drops active content from untrusted HTML before it reaches the writer.
function sanitizeHtml(html) {
  const tmp = document.createElement('template');
  tmp.innerHTML = String(html || '');
  tmp.content.querySelectorAll('script, style, iframe, object, embed, link, meta, base, form').forEach((el) => el.remove());
  for (const el of tmp.content.querySelectorAll('*')) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.toLowerCase().startsWith('on')) el.removeAttribute(attr.name);
    }
  }
  return tmp.innerHTML;
}

function workbookToHtml(wb) {
  let out = '';
  for (const sheet of wb.sheets) {
    if (wb.sheets.length > 1) out += `<h2>${escapeHtml(sheet.name)}</h2>`;
    out += '<table class="bordered">';
    let maxRow = -1;
    let maxCol = -1;
    for (const k of Object.keys(sheet.cells)) {
      const [r, c] = k.split(',').map(Number);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
    for (let r = 0; r <= maxRow; r++) {
      out += '<tr>';
      for (let c = 0; c <= maxCol; c++) out += `<td>${escapeHtml(sheet.cells[`${r},${c}`]?.raw ?? '')}</td>`;
      out += '</tr>';
    }
    out += '</table>';
  }
  return out;
}

let docsLib;
const loadDocs = () => (docsLib ??= import('../lib/docs/index.js'));

/** True for formats whose pictures and layout don't survive conversion. */
export function isRich(file) {
  return !['txt', 'md', 'markdown', 'csv', 'tsv'].includes(extOf(file.name));
}

/**
 * True when the text has characters the built-in PDF fonts can't draw
 * (they cover Latin-1; savePdf maps a few typographic ones and prints the
 * rest as '?').
 */
export function hasUnsupportedChars(html) {
  const tmp = document.createElement('template');
  tmp.innerHTML = html;
  return /[^\u0000-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u2022]/u.test(tmp.content.textContent || '');
}

/** Converts a document, spreadsheet or PPTX file to HTML. */
export async function toHtml(file, kind) {
  const ext = extOf(file.name) || { 'text/html': 'html', 'text/markdown': 'md', 'text/csv': 'csv' }[file.type] || '';
  const bytes = new Uint8Array(await file.arrayBuffer());
  const buf = bytes.buffer;
  if (kind === 'sheet') {
    const sheets = await import('../lib/sheets/index.js');
    const name = extOf(file.name) ? file.name : `${file.name}.${ext}`; // importSpreadsheet picks its parser by name
    const wb = ext === 'tsv' ? sheets.parseTsvWorkbook(decodeText(bytes), name) : sheets.importSpreadsheet(bytes, name);
    return workbookToHtml(wb);
  }
  if (kind === 'slides') {
    const slides = await import('../lib/slides/index.js');
    return sanitizeHtml(slides.deckToHtml(await slides.loadPptx(buf)));
  }
  const docs = await loadDocs();
  switch (ext) {
    case 'docx': return sanitizeHtml(await docs.loadDocx(buf));
    case 'doc': return sanitizeHtml(await docs.docImport(buf));
    case 'rtf': return sanitizeHtml(docs.rtfImport(decodeText(bytes)));
    case 'odt': return sanitizeHtml(await docs.odtImport(buf));
    case 'epub': return sanitizeHtml(await docs.epubImport(buf));
    case 'html':
    case 'htm': return sanitizeHtml(decodeText(bytes));
    case 'md':
    case 'markdown': return mdToHtml(decodeText(bytes));
    default: return textToHtml(decodeText(bytes));
  }
}

/** Renders converted HTML to PDF bytes at the packet's paper size. */
export async function htmlToPdf(html, title, pageSize) {
  const docs = await loadDocs();
  const [pageW, pageH] = PAGE_SIZES[pageSize] || PAGE_SIZES.letter;
  const blob = docs.savePdf(html, { title, pageW, pageH });
  return new Uint8Array(await blob.arrayBuffer());
}
