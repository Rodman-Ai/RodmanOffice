// FileMerger: turns non-PDF files into sources for the PDF packet.
//
// Images become one page each, embedded without re-encoding where
// possible: JPEG bytes are passed straight through (DCTDecode), with the
// EXIF orientation applied by the page's placement matrix; every other
// format is decoded by the browser and stored losslessly (FlateDecode,
// plus a soft mask when it has transparency).
//
// Documents, spreadsheets and slides go through the suite's own engines
// (lib/docs, lib/sheets, lib/slides) to HTML and then lib/docs' savePdf.
// That writer uses the built-in PDF fonts, so the result keeps text,
// headings, lists and tables, but not embedded images or exact layout,
// and characters outside Latin-1 become '?'. The UI says so per file.
// The engines load on first use.

const IMAGE_EXT = ['jpg', 'jpeg', 'jpe', 'jfif', 'png', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'heic', 'heif', 'tif', 'tiff'];
const DOC_EXT = ['docx', 'doc', 'rtf', 'odt', 'epub', 'txt', 'md', 'markdown', 'html', 'htm'];
const SHEET_EXT = ['xlsx', 'xls', 'csv', 'tsv'];
const SLIDE_EXT = ['pptx'];

export const ACCEPT = ['application/pdf', 'image/*', ...['pdf', ...IMAGE_EXT, ...DOC_EXT, ...SHEET_EXT, ...SLIDE_EXT].map((e) => `.${e}`)].join(',');

export const PAGE_SIZES = {
  letter: [612, 792],
  a4: [595.28, 841.89],
};

const extOf = (name) => (name.split('.').pop() || '').toLowerCase();

/** 'pdf' | 'image' | 'document' | 'sheet' | 'slides' | null */
export function kindOf(file) {
  const ext = extOf(file.name);
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (IMAGE_EXT.includes(ext) || (file.type.startsWith('image/') && !ext)) return 'image';
  if (DOC_EXT.includes(ext)) return 'document';
  if (SHEET_EXT.includes(ext)) return 'sheet';
  if (SLIDE_EXT.includes(ext)) return 'slides';
  return null;
}

/** Short label for the file list, e.g. "JPEG image" or "DOCX, converted". */
export function describe(file, kind) {
  const ext = extOf(file.name).toUpperCase();
  if (kind === 'pdf') return 'PDF';
  if (kind === 'image') return `${ext === 'JPG' || ext === 'JPE' || ext === 'JFIF' ? 'JPEG' : ext} image`;
  return `${ext}, converted`;
}

// ---------- images ----------

// Reads the parts of a JPEG header the PDF needs. Returns null for
// anything a PDF DCTDecode filter can't carry as-is (12-bit samples,
// arithmetic coding, lossless JPEG), which then goes the decode path.
function jpegInfo(b) {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  let orientation = 1;
  let adobe = false;
  let frame = null;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) { p++; continue; }
    const marker = b[p + 1];
    if (marker === 0xff) { p++; continue; }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { p += 2; continue; }
    const len = (b[p + 2] << 8) | b[p + 3];
    const seg = p + 4;
    if (marker === 0xe1 && String.fromCharCode(...b.subarray(seg, seg + 4)) === 'Exif') {
      orientation = exifOrientation(b, seg + 6, seg + len - 2) || 1;
    } else if (marker === 0xee && String.fromCharCode(...b.subarray(seg, seg + 5)) === 'Adobe') {
      adobe = true;
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // Baseline, extended and progressive Huffman only.
      if (![0xc0, 0xc1, 0xc2].includes(marker) || b[seg] !== 8) return null;
      frame = { height: (b[seg + 1] << 8) | b[seg + 2], width: (b[seg + 3] << 8) | b[seg + 4], components: b[seg + 5] };
    } else if (marker === 0xda) {
      break;
    }
    p = seg + len - 2;
  }
  if (!frame || !frame.width || !frame.height || ![1, 3, 4].includes(frame.components)) return null;
  return { ...frame, orientation, adobe };
}

function exifOrientation(b, start, end) {
  const le = b[start] === 0x49; // "II" = little-endian
  const u16 = (o) => (le ? b[o] | (b[o + 1] << 8) : (b[o] << 8) | b[o + 1]);
  const u32 = (o) => (le ? (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)) + b[o + 3] * 0x1000000
    : b[o] * 0x1000000 + ((b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]));
  if (start + 8 > end) return 0;
  const ifd = start + u32(start + 4);
  if (ifd + 2 > end) return 0;
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    if (u16(e) === 0x0112) {
      const v = u16(e + 8);
      return v >= 1 && v <= 8 ? v : 0;
    }
  }
  return 0;
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decodeToCanvas(file) {
  const isSvg = extOf(file.name) === 'svg' || file.type === 'image/svg+xml';
  let source;
  let w;
  let h;
  if (!isSvg) {
    try {
      source = await createImageBitmap(file); // applies EXIF orientation
      w = source.width;
      h = source.height;
    } catch { /* fall through to <img>, which also handles SVG */ }
  }
  if (!source) {
    const url = URL.createObjectURL(file);
    try {
      source = new Image();
      source.src = url;
      await source.decode();
    } catch {
      const ext = extOf(file.name).toUpperCase();
      throw new Error(`This browser can't open ${ext} images. Convert it to JPEG or PNG first.`);
    } finally {
      URL.revokeObjectURL(url);
    }
    w = source.naturalWidth || 1000;
    h = source.naturalHeight || 1000;
  }
  // Vector art is rasterized at a size that stays sharp when printed.
  const scale = isSvg ? Math.max(1, 2400 / Math.max(w, h)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  source.close?.();
  return { canvas, displayWidth: w, displayHeight: h };
}

/**
 * Loads an image file into an embeddable form.
 * Returns { spec, displayWidth, displayHeight, lossless, thumb } where `spec`
 * is the image half of a pdfmerge image entry (page layout is added later
 * by layoutImage, so changing the page size doesn't re-decode).
 */
export async function loadImage(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = jpegInfo(bytes);
  if (info) {
    const swap = info.orientation >= 5;
    const spec = {
      data: bytes,
      filter: 'DCTDecode',
      width: info.width,
      height: info.height,
      colorSpace: info.components === 1 ? 'DeviceGray' : info.components === 4 ? 'DeviceCMYK' : 'DeviceRGB',
      orientation: info.orientation,
    };
    // Photoshop writes Adobe CMYK JPEGs inverted.
    if (info.components === 4 && info.adobe) spec.decode = [1, 0, 1, 0, 1, 0, 1, 0];
    return {
      spec,
      displayWidth: swap ? info.height : info.width,
      displayHeight: swap ? info.width : info.height,
      passthrough: true,
    };
  }
  const { canvas, displayWidth, displayHeight } = await decodeToCanvas(file);
  const { width, height } = canvas;
  const px = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  const alpha = new Uint8Array(width * height);
  let transparent = false;
  for (let i = 0, j = 0, k = 0; i < px.length; i += 4, j += 3, k++) {
    rgb[j] = px[i];
    rgb[j + 1] = px[i + 1];
    rgb[j + 2] = px[i + 2];
    alpha[k] = px[i + 3];
    if (px[i + 3] !== 255) transparent = true;
  }
  canvas.width = canvas.height = 0;
  return {
    spec: {
      data: await deflate(rgb),
      filter: 'FlateDecode',
      width,
      height,
      colorSpace: 'DeviceRGB',
      smask: transparent ? await deflate(alpha) : undefined,
      orientation: 1,
    },
    displayWidth,
    displayHeight,
    passthrough: false,
  };
}

// Unit-square placement for each EXIF orientation, drawn into the box
// (x, y, w, h) that the upright image should fill.
function orientMatrix(o, x, y, w, h) {
  switch (o) {
    case 2: return [-w, 0, 0, h, x + w, y];
    case 3: return [-w, 0, 0, -h, x + w, y + h];
    case 4: return [w, 0, 0, -h, x, y + h];
    case 5: return [0, -h, -w, 0, x + w, y + h];
    case 6: return [0, -h, w, 0, x, y + h];
    case 7: return [0, h, w, 0, x, y];
    case 8: return [0, h, -w, 0, x + w, y];
    default: return [w, 0, 0, h, x, y];
  }
}

/**
 * Completes an image entry for pdfmerge: page size and placement.
 * `pageSize` is 'letter', 'a4' or 'image' (page matches the picture at
 * 1 px = 1 pt). On a paper size the page turns landscape for wide images,
 * and the image is centered inside a half-inch margin without enlarging
 * it past 1 px = 1 pt.
 */
export function layoutImage(img, pageSize) {
  const { displayWidth: dw, displayHeight: dh, spec } = img;
  let pw;
  let ph;
  let scale;
  if (pageSize === 'image') {
    // PDF pages top out at 200 inches (14400 pt) a side.
    scale = Math.min(1, 14400 / Math.max(dw, dh));
    pw = dw * scale;
    ph = dh * scale;
  } else {
    const [a, b] = PAGE_SIZES[pageSize] || PAGE_SIZES.letter;
    [pw, ph] = dw > dh ? [b, a] : [a, b];
    const margin = 36;
    scale = Math.min(1, (pw - 2 * margin) / dw, (ph - 2 * margin) / dh);
  }
  const w = dw * scale;
  const h = dh * scale;
  const x = (pw - w) / 2;
  const y = (ph - h) / 2;
  const { orientation, ...rest } = spec;
  return { ...rest, pageWidth: pw, pageHeight: ph, matrix: orientMatrix(orientation, x, y, w, h) };
}

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
  const ext = extOf(file.name);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const buf = bytes.buffer;
  if (kind === 'sheet') {
    const sheets = await import('../lib/sheets/index.js');
    const wb = ext === 'tsv' ? sheets.parseTsvWorkbook(decodeText(bytes), file.name) : sheets.importSpreadsheet(bytes, file.name);
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
