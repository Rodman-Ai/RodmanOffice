// =============================================================
//  PSD (Adobe Photoshop) reader and writer.
//  Wraps the vendored ag-psd library (MIT) and adds a thin
//  canvas-friendly facade that matches /lib/images/'s style.
// =============================================================

import { readPsd, writePsd, initializeCanvas } from './vendor/ag-psd.mjs';

// ag-psd auto-initialises its canvas factory when `document` is
// available, so we don't need to call initializeCanvas() explicitly
// in browsers. Function is kept as a no-op for symmetry with how
// other /lib/ engines surface lifecycle hooks.
function ensureCanvasFactory() { /* no-op in browsers */ }

function isCanvasEmpty(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return true;
  // Sample the centre pixel — cheap probe; full scan would be wasteful
  // and a single non-empty pixel proves we have content.
  const x = Math.floor(canvas.width / 2);
  const y = Math.floor(canvas.height / 2);
  const px = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  return px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 0;
}

function flattenLayers(psd) {
  // Synthesize a composite by drawing each layer onto a blank canvas.
  const canvas = document.createElement('canvas');
  canvas.width = psd.width;
  canvas.height = psd.height;
  const ctx = canvas.getContext('2d');
  const walk = (node) => {
    if (node.canvas) {
      const left = node.left ?? 0;
      const top = node.top ?? 0;
      ctx.drawImage(node.canvas, left, top);
    }
    if (node.children) for (const child of node.children) walk(child);
  };
  if (psd.children) for (const child of psd.children) walk(child);
  return canvas;
}

/**
 * Decode PSD bytes into a flattened canvas.
 * @param {ArrayBuffer | Uint8Array} bytes
 * @returns {Promise<{ canvas: HTMLCanvasElement, width: number, height: number, layers: number }>}
 */
export async function decodePsd(bytes) {
  ensureCanvasFactory();
  const buf = bytes instanceof ArrayBuffer
    ? bytes
    : (bytes && bytes.buffer ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes);
  const psd = readPsd(buf, { useImageData: false });
  // ag-psd: psd.canvas is the composite preview — but if a write
  // produced no preview, fall back to drawing the imageData directly,
  // then to flattening layers.
  let canvas = psd.canvas;
  if (!canvas || isCanvasEmpty(canvas)) {
    if (psd.imageData) {
      const tmp = document.createElement('canvas');
      tmp.width = psd.width; tmp.height = psd.height;
      tmp.getContext('2d').putImageData(psd.imageData, 0, 0);
      canvas = tmp;
    } else {
      canvas = flattenLayers(psd);
    }
  }
  return {
    canvas,
    width: psd.width,
    height: psd.height,
    layers: (psd.children && psd.children.length) || 0,
  };
}

/**
 * Encode a canvas as a PSD Blob. The default writes a single flat
 * "Layer 1" sized to the full document so Photoshop reopens it with
 * pixels intact.
 * @param {HTMLCanvasElement} canvas
 * @param {{ layers?: Array<{ name: string, canvas: HTMLCanvasElement, top?: number, left?: number }> }} opts
 * @returns {Blob}
 */
export function encodePsd(canvas, opts = {}) {
  ensureCanvasFactory();
  const w = canvas.width;
  const h = canvas.height;
  // Important: ag-psd dedupes when the composite and a single layer
  // share the same canvas reference (it can shrink the layer to 1x1
  // to save space). Pass imageData on the layer instead so the
  // per-layer pixels are written explicitly, and clone the canvas
  // for the composite so the two reads stay independent.
  const layerImageData = canvas.getContext('2d').getImageData(0, 0, w, h);
  const composite = document.createElement('canvas');
  composite.width = w;
  composite.height = h;
  composite.getContext('2d').drawImage(canvas, 0, 0);

  // Per ag-psd's recommended minimal pattern: just a top-level canvas
  // (the document composite) plus a single child layer carrying the
  // same pixels. ag-psd auto-derives layer bounds from the layer
  // canvas dimensions.
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = w;
  layerCanvas.height = h;
  layerCanvas.getContext('2d').drawImage(canvas, 0, 0);
  const psd = {
    width: w,
    height: h,
    canvas: composite,
    children: opts.layers && opts.layers.length
      ? opts.layers
      : [{ name: 'Layer 1', canvas: layerCanvas }],
  };
  const bytes = writePsd(psd, { generateThumbnail: false });
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new Blob([u8], { type: 'image/vnd.adobe.photoshop' });
}
