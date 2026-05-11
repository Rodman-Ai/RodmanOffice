// =============================================================
//  CBZ (Comic Book ZIP) writer.
//
//  CBZ is just a regular ZIP whose entries are images named in
//  page order — comic readers (Calibre, ComicRack, Simple Comic,
//  Tachiyomi) sort them lexicographically. We reuse the
//  stored-only ZIP writer in /lib/docs/docx.js so this file
//  doesn't pull in another vendor library.
//
//  Two paths:
//    encodeCbzFromCanvas(canvas, opts?)  → single-page CBZ
//    encodeCbzFromPdf(bytes, opts?)      → one PNG per PDF page
// =============================================================

import { buildZip } from '../docs/docx.js';
import { encodePNG } from './image-io.js';
import { decodePdfPage, pdfPageCount } from './pdf.js';

async function canvasToPngBytes(canvas) {
  const blob = await encodePNG(canvas);
  const buf = await blob.arrayBuffer();
  return new Uint8Array(buf);
}

function pageName(i, total) {
  const width = String(total).length;
  return String(i + 1).padStart(Math.max(3, width), '0') + '.png';
}

/**
 * Wrap a single canvas in a one-page CBZ archive.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<Blob>}
 */
export async function encodeCbzFromCanvas(canvas) {
  const png = await canvasToPngBytes(canvas);
  const zip = buildZip([
    { name: '001.png', data: png },
  ]);
  return new Blob([zip], { type: 'application/vnd.comicbook+zip' });
}

/**
 * Pack a sequence of canvases into a CBZ archive. Used by the
 * video → CBZ bridge: every Nth frame from a clip becomes a page.
 * @param {HTMLCanvasElement[]} canvases
 * @param {{ onProgress?: (ratio: number) => void }} [opts]
 * @returns {Promise<Blob>}
 */
export async function encodeCbzFromCanvases(canvases, opts = {}) {
  if (!canvases.length) throw new Error('No canvases supplied for CBZ');
  const entries = [];
  for (let i = 0; i < canvases.length; i++) {
    const png = await canvasToPngBytes(canvases[i]);
    entries.push({ name: pageName(i, canvases.length), data: png });
    if (opts.onProgress) opts.onProgress((i + 1) / canvases.length);
  }
  const zip = buildZip(entries);
  return new Blob([zip], { type: 'application/vnd.comicbook+zip' });
}

/**
 * Rasterize every page of a PDF into an array of canvases. Shared by
 * `encodeCbzFromPdf` and the multi-page TIFF target.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {{ scale?: number, onProgress?: (ratio: number) => void }} [opts]
 * @returns {Promise<HTMLCanvasElement[]>}
 */
export async function pdfPagesToCanvases(bytes, opts = {}) {
  const total = await pdfPageCount(bytes);
  if (total <= 0) throw new Error('PDF has no pages to convert');
  const out = [];
  for (let i = 0; i < total; i++) {
    const { canvas } = await decodePdfPage(bytes, i, { scale: opts.scale ?? 2 });
    out.push(canvas);
    if (opts.onProgress) opts.onProgress((i + 1) / total);
  }
  return out;
}

/**
 * Rasterize every page of a PDF into a CBZ archive.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @param {{ scale?: number, onProgress?: (ratio: number) => void }} [opts]
 * @returns {Promise<Blob>}
 */
export async function encodeCbzFromPdf(bytes, opts = {}) {
  const canvases = await pdfPagesToCanvases(bytes, { scale: opts.scale });
  const total = canvases.length;
  const entries = [];
  for (let i = 0; i < total; i++) {
    const png = await canvasToPngBytes(canvases[i]);
    entries.push({ name: pageName(i, total), data: png });
    if (opts.onProgress) opts.onProgress((i + 1) / total);
  }
  const zip = buildZip(entries);
  return new Blob([zip], { type: 'application/vnd.comicbook+zip' });
}
