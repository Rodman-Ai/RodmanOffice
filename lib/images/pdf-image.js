// =============================================================
//  Images as PDF pages, for pdfmerge's image sources.
//
//  loadImage(fileOrBlob)  -> { spec, displayWidth, displayHeight, passthrough }
//  layoutImage(img, size) -> a complete mergePdfs() image entry
//  PAGE_SIZES             -> { letter, a4 } in points
//
//  JPEGs are embedded byte-for-byte (DCTDecode) with their EXIF
//  orientation applied by the placement matrix, so phone photos come
//  out upright with no re-compression; CMYK (including Adobe's
//  inverted CMYK) is handled. Every other format the browser can
//  decode is stored losslessly (FlateDecode, plus a soft mask for
//  transparency). Used by FileMerger's PDF packet and the Converter's
//  image -> PDF.
// =============================================================

import { decodeRaster } from './decode.js';

export const PAGE_SIZES = {
  letter: [612, 792],
  a4: [595.28, 841.89],
};

const extOf = (name) => (/\.([^./\\]+)$/.exec(name || '')?.[1] || '').toLowerCase();


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
      w = source.naturalWidth || 1000;
      h = source.naturalHeight || 1000;
    } catch {
      source = null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!source) {
    // TIFF outside Safari, Netpbm, TGA, ...: the suite's own decoders.
    const raster = await decodeRaster(file, file.type || extOf(file.name)).catch(() => null);
    if (!raster) {
      const ext = (extOf(file.name) || file.type.split('/')[1] || 'these').toUpperCase();
      throw new Error(`This browser can't open ${ext} images. Convert it to JPEG or PNG first.`);
    }
    source = await createImageBitmap(new ImageData(raster.data, raster.width, raster.height));
    w = raster.width;
    h = raster.height;
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
  // `file` is a File or Blob; its name (if any) only matters for SVG.
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

const IMAGE_PAGE_MAX = 792; // 11 in

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
 * `pageSize` is 'letter', 'a4' or 'image' (page shaped like the picture:
 * 1 px = 1 pt, scaled down to at most 11 in on the long side). On a paper size the page turns landscape for wide images,
 * and the image is centered inside a half-inch margin without enlarging
 * it past 1 px = 1 pt.
 */
export function layoutImage(img, pageSize) {
  const { displayWidth: dw, displayHeight: dh, spec } = img;
  let pw;
  let ph;
  let scale;
  if (pageSize === 'image') {
    // The page takes the picture's shape. Small images keep 1 px = 1 pt;
    // big ones are capped at 11 in on the long side, so a 4000 px phone
    // photo prints on a normal page instead of a 55-inch one.
    scale = Math.min(1, IMAGE_PAGE_MAX / Math.max(dw, dh));
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

