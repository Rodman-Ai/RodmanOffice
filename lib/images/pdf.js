// =============================================================
//  PDF helpers for image flows.
//
//  decodePdfPage  — rasterize one page of any PDF into a canvas
//                   (uses the vendored PDF.js).
//  pdfPageCount   — return the number of pages in a PDF.
//  encodePdfFromCanvas — emit a single-page PDF whose body is the
//                   rasterized canvas, encoded as JPEG (default,
//                   lossy) or PNG (lossless). Hand-rolled PDF —
//                   Photoshop, Acrobat, Preview and Chrome all
//                   open the result as a flat image.
// =============================================================

import * as pdfjs from './vendor/pdfjs/pdf.mjs';

// Point PDF.js at its vendored worker (resolved relative to this
// module, so it works regardless of where /lib/ is mounted).
const _workerUrl = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).toString();
pdfjs.GlobalWorkerOptions.workerSrc = _workerUrl;

function toUint8(bytes) {
  // PDF.js transfers the input ArrayBuffer to its worker, which
  // detaches the caller's buffer. Always hand the worker a private
  // copy so callers can reuse `bytes` for later calls.
  if (bytes instanceof Uint8Array) return new Uint8Array(bytes);
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes.slice(0));
  if (bytes && bytes.buffer) {
    return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }
  return new Uint8Array(bytes);
}

/**
 * Rasterize a single page of a PDF into a canvas.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {number} [pageIndex=0] — zero-based page index.
 * @param {{ scale?: number }} [opts]
 * @returns {Promise<{ canvas: HTMLCanvasElement, width: number, height: number, totalPages: number }>}
 */
export async function decodePdfPage(bytes, pageIndex = 0, opts = {}) {
  const data = toUint8(bytes);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const totalPages = pdf.numPages;
  const target = Math.max(1, Math.min(totalPages, pageIndex + 1));
  const page = await pdf.getPage(target);
  const scale = opts.scale != null ? opts.scale : 2;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  await pdf.cleanup().catch(() => {});
  return { canvas, width: canvas.width, height: canvas.height, totalPages };
}

/**
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {Promise<number>}
 */
export async function pdfPageCount(bytes) {
  const data = toUint8(bytes);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const count = pdf.numPages;
  await pdf.cleanup().catch(() => {});
  return count;
}

// ---------- Hand-rolled single-image PDF writer ----------
//
// Layout (PDF 1.4):
//   %PDF-1.4
//   1 0 obj  /Catalog              -> /Pages 2 0 R
//   2 0 obj  /Pages                -> /Kids [3 0 R] /Count 1
//   3 0 obj  /Page                 -> /MediaBox + /Resources + /Contents 4 0 R
//   4 0 obj  content stream        -> "q W 0 0 H 0 0 cm /Im0 Do Q"
//   5 0 obj  Image XObject         -> /Subtype /Image + image stream
//   xref + trailer
//
// JPEG goes in raw with /Filter /DCTDecode (no zlib needed).
// PNG is harder to embed natively in PDF (PDF wants raw deflated
// pixels with a PNG predictor), so the PNG path uses CompressionStream
// to deflate raw RGB bytes pulled from the canvas.

function utf8(s) { return new TextEncoder().encode(s); }

function concatBytes(parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function canvasToJpegBytes(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => b ? b.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject) : reject(new Error('JPEG encode failed')),
      'image/jpeg',
      quality != null ? quality : 0.92,
    );
  });
}

async function deflateBytes(input) {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([input]).stream().pipeThrough(cs);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function rgbStreamFromCanvas(canvas) {
  const w = canvas.width, h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  // Strip alpha — PDF /DeviceRGB images carry no alpha channel.
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i]; rgb[j + 1] = data[i + 1]; rgb[j + 2] = data[i + 2];
  }
  return deflateBytes(rgb);
}

/**
 * Encode a canvas as a single-page PDF Blob whose body is the image.
 * Photoshop opens this as a flattened "Photoshop PDF".
 * @param {HTMLCanvasElement} canvas
 * @param {{ format?: 'jpeg' | 'png', quality?: number }} [opts]
 * @returns {Promise<Blob>}
 */
export async function encodePdfFromCanvas(canvas, opts = {}) {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) throw new Error('Canvas is empty');
  const format = opts.format === 'png' ? 'png' : 'jpeg';

  let imgBytes, filter;
  if (format === 'jpeg') {
    imgBytes = await canvasToJpegBytes(canvas, opts.quality);
    filter = '/DCTDecode';
  } else {
    imgBytes = await rgbStreamFromCanvas(canvas);
    filter = '/FlateDecode';
  }

  // PDF page in points (1 pt = 1/72 inch). Use the canvas pixel
  // dimensions verbatim — keeps round-trips exact.
  const pageW = w;
  const pageH = h;

  // Object 1: Catalog
  const obj1 = utf8('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  // Object 2: Pages
  const obj2 = utf8('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');
  // Object 3: Page
  const obj3 = utf8(
    '3 0 obj\n<< /Type /Page /Parent 2 0 R ' +
    `/MediaBox [0 0 ${pageW} ${pageH}] ` +
    '/Resources << /XObject << /Im0 5 0 R >> /ProcSet [/PDF /ImageC] >> ' +
    '/Contents 4 0 R >>\nendobj\n'
  );
  // Object 4: Content stream — draw Im0 at full page size.
  const contentStr = `q\n${pageW} 0 0 ${pageH} 0 0 cm\n/Im0 Do\nQ\n`;
  const contentBytes = utf8(contentStr);
  const obj4Header = utf8(`4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  const obj4Footer = utf8('\nendstream\nendobj\n');
  // Object 5: Image XObject
  const obj5Header = utf8(
    '5 0 obj\n<< /Type /XObject /Subtype /Image ' +
    `/Width ${w} /Height ${h} ` +
    '/ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
    `/Filter ${filter} /Length ${imgBytes.length} >>\nstream\n`
  );
  const obj5Footer = utf8('\nendstream\nendobj\n');

  // Assemble body and track byte offsets for xref.
  const header = utf8('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = [0]; // index 0 is the free entry
  let cursor = header.length;
  function take(part) {
    offsets.push(cursor);
    cursor += part.length;
    return part;
  }
  function follow(part) {
    cursor += part.length;
    return part;
  }

  const parts = [header];
  parts.push(take(obj1));
  parts.push(take(obj2));
  parts.push(take(obj3));
  // obj4 (stream)
  parts.push(take(obj4Header));
  parts.push(follow(contentBytes));
  parts.push(follow(obj4Footer));
  // obj5 (image stream)
  parts.push(take(obj5Header));
  parts.push(follow(imgBytes));
  parts.push(follow(obj5Footer));

  const xrefOffset = cursor;
  let xref = `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(utf8(xref));

  return new Blob([concatBytes(parts)], { type: 'application/pdf' });
}

// =============================================================
//  Compress an existing PDF by rasterizing every page at a target
//  scale and re-encoding it as a JPEG image. Optionally overlays
//  the original page's text in invisible-rendering mode so search
//  / text-select still works in PDF viewers.
//
//  Levels (Acrobat-style 5-step ladder):
//    minimum: q=0.95 s=1.00   — barely-touched, large file.
//    low:     q=0.85 s=0.95
//    medium:  q=0.70 s=0.80
//    high:    q=0.55 s=0.65
//    maximum: q=0.40 s=0.50   — small file, blurry pages.
// =============================================================

const COMPRESS_LEVELS = {
  minimum: { quality: 0.95, scale: 1.00 },
  low:     { quality: 0.85, scale: 0.95 },
  medium:  { quality: 0.70, scale: 0.80 },
  high:    { quality: 0.55, scale: 0.65 },
  maximum: { quality: 0.40, scale: 0.50 },
};

function escPdfString(s) {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

async function extractPdfPageText(bytes, pageIndex) {
  // Small wrapper around pdf.js getTextContent. Returns
  // { items: [{ str, x, y, fontSize }] } in PDF user-space units
  // (origin bottom-left). Used for the invisible-text overlay.
  const data = toUint8(bytes);
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    const page = await pdf.getPage(pageIndex + 1);
    const viewport = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.map((it) => {
      const t = it.transform; // [a, b, c, d, e, f]
      return {
        str: it.str,
        x: t[4],
        // Convert top-left baseline to PDF bottom-left coords.
        y: viewport.height - t[5],
        fontSize: Math.hypot(t[0], t[1]) || 1,
      };
    }).filter((it) => it.str && it.str.trim().length > 0);
    return { width: viewport.width, height: viewport.height, items };
  } finally {
    await pdf.cleanup().catch(() => {});
  }
}

/**
 * Compress a PDF by rasterizing each page to JPEG at a level-driven
 * quality + scale. When `preserveText` is true (default), each page
 * also gets an invisible text overlay so Cmd-F / text-select keep
 * working.
 *
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {{
 *   level?: 'minimum' | 'low' | 'medium' | 'high' | 'maximum',
 *   preserveText?: boolean,
 *   onProgress?: (ratio: number) => void,
 * }} [opts]
 * @returns {Promise<Blob>}
 */
export async function compressPdf(bytes, opts = {}) {
  const level = COMPRESS_LEVELS[opts.level] ? opts.level : 'medium';
  const { quality, scale } = COMPRESS_LEVELS[level];
  const preserveText = opts.preserveText !== false;
  const total = await pdfPageCount(bytes);
  if (total <= 0) throw new Error('PDF has no pages');

  const pages = [];
  for (let i = 0; i < total; i++) {
    // Render at the chosen scale relative to the PDF user space
    // (1pt = 1px at scale=1). This is what shrinks the file.
    const { canvas } = await decodePdfPage(bytes, i, { scale: scale * 2 });
    const jpeg = await canvasToJpegBytes(canvas, quality);
    let textOverlay = null;
    if (preserveText) {
      try { textOverlay = await extractPdfPageText(bytes, i); }
      catch { textOverlay = null; }
    }
    pages.push({
      width: canvas.width,
      height: canvas.height,
      jpeg,
      textOverlay,
    });
    if (opts.onProgress) opts.onProgress((i + 1) / total);
  }

  return assembleMultipagePdf(pages);
}

function buildContentStream(page) {
  // Page coordinate system: lower-left origin, +Y up, units = points.
  // Image is drawn full-page; `cm` (current matrix) scales unit
  // square (1x1) to MediaBox.
  let stream = `q\n${page.width} 0 0 ${page.height} 0 0 cm\n/Im0 Do\nQ\n`;
  if (page.textOverlay && page.textOverlay.items.length) {
    // Use Helvetica from /F1 = built-in Type1, plus 3 = invisible
    // text rendering mode (no fill, no stroke, but still hit-testable).
    // Scale factor maps the overlay's user-space coords (PDF points)
    // onto our pixel-sized MediaBox.
    const sx = page.width / page.textOverlay.width;
    const sy = page.height / page.textOverlay.height;
    stream += '\nBT\n3 Tr\n/F1 1 Tf\n';
    for (const it of page.textOverlay.items) {
      const fs = Math.max(1, it.fontSize * Math.min(sx, sy));
      const x = it.x * sx;
      const y = it.y * sy;
      stream += `${fs.toFixed(2)} 0 0 ${fs.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} Tm `;
      stream += `(${escPdfString(it.str)}) Tj\n`;
    }
    stream += 'ET\n';
  }
  return stream;
}

function assembleMultipagePdf(pages) {
  const header = utf8('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const offsets = [0];
  let cursor = header.length;
  const parts = [header];

  function take(part) {
    offsets.push(cursor);
    cursor += part.length;
    parts.push(part);
  }
  function follow(part) {
    cursor += part.length;
    parts.push(part);
  }

  // We allocate object IDs as:
  //   1: Catalog
  //   2: Pages
  //   3: F1 (Helvetica) — only emitted if any page has a text overlay
  //   then per-page: Page, Content, Image (3 objs each)
  const hasText = pages.some((p) => p.textOverlay && p.textOverlay.items.length);
  const fontObjId = hasText ? 3 : null;
  const firstPageObj = hasText ? 4 : 3;
  const objsPerPage = 3;
  const pageIds = pages.map((_, i) => firstPageObj + i * objsPerPage);

  // Catalog
  take(utf8('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  // Pages
  const kids = pageIds.map((id) => `${id} 0 R`).join(' ');
  take(utf8(
    `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>\nendobj\n`
  ));
  // F1 font (only when needed)
  if (hasText) {
    take(utf8(
      `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`
    ));
  }

  // Per-page objects
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageObjId = pageIds[i];
    const contentObjId = pageObjId + 1;
    const imageObjId = pageObjId + 2;

    const fontDict = hasText ? `/Font << /F1 ${fontObjId} 0 R >>` : '';
    take(utf8(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R ` +
      `/MediaBox [0 0 ${page.width} ${page.height}] ` +
      `/Resources << /XObject << /Im0 ${imageObjId} 0 R >> ${fontDict} /ProcSet [/PDF /ImageC /Text] >> ` +
      `/Contents ${contentObjId} 0 R >>\nendobj\n`
    ));

    const stream = buildContentStream(page);
    const streamBytes = utf8(stream);
    take(utf8(`${contentObjId} 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`));
    follow(streamBytes);
    follow(utf8('\nendstream\nendobj\n'));

    take(utf8(
      `${imageObjId} 0 obj\n<< /Type /XObject /Subtype /Image ` +
      `/Width ${page.width} /Height ${page.height} ` +
      `/ColorSpace /DeviceRGB /BitsPerComponent 8 ` +
      `/Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`
    ));
    follow(page.jpeg);
    follow(utf8('\nendstream\nendobj\n'));
  }

  const totalObjs = offsets.length - 1; // 0 is the "free" placeholder
  const xrefOffset = cursor;
  let xref = `xref\n0 ${totalObjs + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= totalObjs; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${totalObjs + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  parts.push(utf8(xref));

  return new Blob([concatBytes(parts)], { type: 'application/pdf' });
}
