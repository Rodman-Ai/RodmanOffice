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
