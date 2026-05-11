// =============================================================
//  Image I/O — portable decode / encode / transform module.
//
//  Originated as RetroPaint's /image/js/io.js (a window-global
//  IIFE). Lifted here as ESM so /converter/ and the image editor
//  share one engine. The image editor still calls these via a
//  thin shim that re-exposes them on window.IO.
//
//  Decoders (read pixels into a canvas):
//    decodeFile(file)        -> { canvas, width, height, mime, name }
//    decodeBlob(blob)        -> same shape
//    decodeDataURL(dataURL)  -> same shape
//    decodeURL(url)          -> same shape
//
//  Encoders (canvas -> Blob):
//    encodePNG(canvas)
//    encodeJPEG(canvas, quality=0.92)
//    encodeWebP(canvas, quality=0.92)
//    encodeBMP(canvas)                       (synchronous)
//    encodeICO(canvas, sizes=[16,32,48])
//
//  Converter convenience layer (bytes-in / Blob-out, with JPEG
//  alpha-flatten):
//    decodeToCanvas(bytes, mime)
//    canvasToBlob(canvas, mime, quality?)
//    convertImage(bytes, srcMime, tgtMime, opts?)
//
//  Pure transforms:
//    to1Bit(imageData, opts?)
//    resize(canvas, scale, opts?)
//    composeSpriteSheet(frames, opts?)
//
//  Helpers:
//    triggerDownload(blob, filename)
//    suggestFilename(originalName, newExt)
// =============================================================

// ---------- internal helpers ----------

function imageToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode image'));
    img.src = src;
  });
}

function _canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('toBlob produced no result for ' + mime));
      }, mime, quality);
    } else {
      try {
        const dataURL = quality !== undefined
          ? canvas.toDataURL(mime, quality)
          : canvas.toDataURL(mime);
        const [head, b64] = dataURL.split(',');
        const m = (head.match(/data:([^;]+)/) || [, mime])[1];
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: m }));
      } catch (e) { reject(e); }
    }
  });
}

// ---------- decoders ----------

async function decodeFile(file) {
  if (!file) throw new Error('No file provided');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const canvas = imageToCanvas(img);
    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      mime: file.type || 'application/octet-stream',
      name: file.name || ''
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function decodeBlob(blob) {
  // A File is a Blob; reuse decodeFile's path.
  return decodeFile(blob);
}

async function decodeDataURL(dataURL) {
  if (!dataURL) throw new Error('No dataURL provided');
  const img = await loadImage(dataURL);
  const canvas = imageToCanvas(img);
  const mime = (dataURL.match(/^data:([^;,]+)/) || [, ''])[1];
  return { canvas, width: canvas.width, height: canvas.height, mime, name: '' };
}

async function decodeURL(url) {
  const img = await loadImage(url);
  const canvas = imageToCanvas(img);
  return { canvas, width: canvas.width, height: canvas.height, mime: '', name: url };
}

// ---------- encoders ----------

function encodePNG(canvas) { return _canvasToBlob(canvas, 'image/png'); }
function encodeJPEG(canvas, quality) {
  return _canvasToBlob(canvas, 'image/jpeg', quality == null ? 0.92 : quality);
}
function encodeWebP(canvas, quality) {
  return _canvasToBlob(canvas, 'image/webp', quality == null ? 0.92 : quality);
}

// BMP — 24-bit BGR, BITMAPINFOHEADER, bottom-up rows, 4-byte aligned.
// Synchronous because we already have all pixels in memory.
function encodeBMP(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const rowSize = (w * 3 + 3) & ~3;
  const pixelArraySize = rowSize * h;
  const fileSize = 14 + 40 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // BITMAPFILEHEADER (14 bytes)
  view.setUint8(0, 0x42); view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, 14 + 40, true);

  // BITMAPINFOHEADER (40 bytes)
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setUint32(38, 2835, true);
  view.setUint32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let dst = 14 + 40;
  for (let y = h - 1; y >= 0; y--) {
    let src = y * w * 4;
    for (let x = 0; x < w; x++) {
      u8[dst++] = data[src + 2];
      u8[dst++] = data[src + 1];
      u8[dst++] = data[src];
      src += 4;
    }
    const pad = rowSize - w * 3;
    for (let p = 0; p < pad; p++) u8[dst++] = 0;
  }
  return new Blob([buf], { type: 'image/bmp' });
}

// PGM (Netpbm P5) — grayscale, header + 1 byte per pixel, top-down.
function encodePGM(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const headerBytes = new TextEncoder().encode(`P5\n${w} ${h}\n255\n`);
  const out = new Uint8Array(headerBytes.length + w * h);
  out.set(headerBytes, 0);
  let dst = headerBytes.length;
  for (let i = 0; i < data.length; i += 4) {
    out[dst++] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return new Blob([out], { type: 'image/x-portable-graymap' });
}

// PBM (Netpbm P4) — 1-bit packed, MSB-first per byte. Reuses the
// existing Bayer-dithered to1Bit helper for the threshold pass.
function encodePBM(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const bw = to1Bit(ctx.getImageData(0, 0, w, h));
  const headerBytes = new TextEncoder().encode(`P4\n${w} ${h}\n`);
  const rowBytes = Math.ceil(w / 8);
  const out = new Uint8Array(headerBytes.length + rowBytes * h);
  out.set(headerBytes, 0);
  let dst = headerBytes.length;
  for (let y = 0; y < h; y++) {
    for (let xb = 0; xb < rowBytes; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        if (x >= w) break;
        // PBM convention: 1 = black, 0 = white (inverse of WBMP / XBM).
        if (bw.data[(y * w + x) * 4] < 128) byte |= (0x80 >> bit);
      }
      out[dst++] = byte;
    }
  }
  return new Blob([out], { type: 'image/x-portable-bitmap' });
}

// PAM (Netpbm P7) — RGBA tuples in plain bytes, alpha-preserving.
function encodePAM(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const headerBytes = new TextEncoder().encode(
    `P7\nWIDTH ${w}\nHEIGHT ${h}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n`
  );
  const out = new Uint8Array(headerBytes.length + data.length);
  out.set(headerBytes, 0);
  out.set(data, headerBytes.length);
  return new Blob([out], { type: 'image/x-portable-arbitrarymap' });
}

// XBM — X11 1-bit bitmap as plain C source code. LSB-first per byte
// (the reverse of PBM).
function encodeXBM(canvas, name = 'image') {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const bw = to1Bit(ctx.getImageData(0, 0, w, h));
  const rowBytes = Math.ceil(w / 8);
  const bytes = new Array(rowBytes * h);
  let p = 0;
  for (let y = 0; y < h; y++) {
    for (let xb = 0; xb < rowBytes; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        if (x >= w) break;
        if (bw.data[(y * w + x) * 4] < 128) byte |= (1 << bit);
      }
      bytes[p++] = byte;
    }
  }
  let text = `#define ${name}_width ${w}\n#define ${name}_height ${h}\nstatic char ${name}_bits[] = {\n`;
  for (let i = 0; i < bytes.length; i += 12) {
    const chunk = bytes.slice(i, i + 12).map((b) => '0x' + b.toString(16).padStart(2, '0')).join(', ');
    text += '  ' + chunk + (i + 12 < bytes.length ? ',' : '') + '\n';
  }
  text += '};\n';
  return new Blob([new TextEncoder().encode(text)], { type: 'image/x-xbitmap' });
}

// XPM — X11 colour pixmap as plain C source. Builds a colour
// palette and emits an ASCII-grid representation.
function encodeXPM(canvas, name = 'image') {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const palette = new Map();
  const colorKey = (i) => {
    if (data[i + 3] < 128) return 'NONE';
    return '#'
      + data[i].toString(16).padStart(2, '0')
      + data[i + 1].toString(16).padStart(2, '0')
      + data[i + 2].toString(16).padStart(2, '0');
  };
  for (let i = 0; i < data.length; i += 4) {
    const k = colorKey(i);
    if (!palette.has(k)) palette.set(k, palette.size);
  }
  const cpp = palette.size <= 64 ? 1 : palette.size <= 4096 ? 2 : 3;
  const ALPHA = ' .:-=+*#%@!$&?_<>0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const charFor = (n) => {
    let s = '';
    let r = n;
    for (let k = 0; k < cpp; k++) {
      s = ALPHA[r % ALPHA.length] + s;
      r = Math.floor(r / ALPHA.length);
    }
    return s;
  };
  let text = `/* XPM */\nstatic char *${name}[] = {\n`;
  text += `"${w} ${h} ${palette.size} ${cpp}",\n`;
  for (const [color, idx] of palette) {
    text += `"${charFor(idx)} c ${color}",\n`;
  }
  for (let y = 0; y < h; y++) {
    let row = '"';
    for (let x = 0; x < w; x++) {
      row += charFor(palette.get(colorKey((y * w + x) * 4)));
    }
    row += '"' + (y < h - 1 ? ',' : '') + '\n';
    text += row;
  }
  text += '};\n';
  return new Blob([new TextEncoder().encode(text)], { type: 'image/x-xpixmap' });
}

// WBMP (WAP Bitmap) — 1-bit telephony-era format. White = 1.
function encodeWBMP(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const bw = to1Bit(ctx.getImageData(0, 0, w, h));
  const wVar = wbmpVarInt(w);
  const hVar = wbmpVarInt(h);
  const rowBytes = Math.ceil(w / 8);
  const out = new Uint8Array(2 + wVar.length + hVar.length + rowBytes * h);
  let off = 0;
  out[off++] = 0;       // type 0 = monochrome
  out[off++] = 0;       // fixed header
  for (const b of wVar) out[off++] = b;
  for (const b of hVar) out[off++] = b;
  for (let y = 0; y < h; y++) {
    for (let xb = 0; xb < rowBytes; xb++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = xb * 8 + bit;
        if (x >= w) break;
        // WBMP: 1 = white, 0 = black (opposite of PBM).
        if (bw.data[(y * w + x) * 4] >= 128) byte |= (0x80 >> bit);
      }
      out[off++] = byte;
    }
  }
  return new Blob([out], { type: 'image/vnd.wap.wbmp' });
}
function wbmpVarInt(n) {
  const bytes = [n & 0x7F];
  n >>>= 7;
  while (n > 0) {
    bytes.unshift((n & 0x7F) | 0x80);
    n >>>= 7;
  }
  return bytes;
}

// SGI image — 512-byte header + per-channel scanlines, bottom-up.
function encodeSGI(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(512 + w * h * 3);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0x01DA, false);    // magic
  view.setUint8(2, 0);                  // verbatim (no RLE)
  view.setUint8(3, 1);                  // 1 byte per channel
  view.setUint16(4, 3, false);          // 3D
  view.setUint16(6, w, false);
  view.setUint16(8, h, false);
  view.setUint16(10, 3, false);         // RGB
  view.setUint32(12, 0, false);         // pixmin
  view.setUint32(16, 255, false);       // pixmax
  view.setUint32(104, 0, false);        // colormap normal
  let dst = 512;
  for (let c = 0; c < 3; c++) {
    for (let y = h - 1; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        out[dst++] = data[(y * w + x) * 4 + c];
      }
    }
  }
  return new Blob([out], { type: 'image/x-sgi' });
}

// Sun Raster — 32-byte header + 24-bit BGR pixels, 16-bit aligned rows.
function encodeRAS(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const rowBytes = w * 3;
  const padded = (rowBytes + 1) & ~1;
  const dataSize = padded * h;
  const out = new Uint8Array(32 + dataSize);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x59A66A95, false); // ras_magic
  view.setUint32(4, w, false);
  view.setUint32(8, h, false);
  view.setUint32(12, 24, false);        // depth
  view.setUint32(16, dataSize, false);
  view.setUint32(20, 1, false);         // RT_STANDARD
  view.setUint32(24, 0, false);         // RMT_NONE
  view.setUint32(28, 0, false);
  let dst = 32;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      out[dst++] = data[i + 2];
      out[dst++] = data[i + 1];
      out[dst++] = data[i];
    }
    if (padded > rowBytes) out[dst++] = 0;
  }
  return new Blob([out], { type: 'image/x-cmu-raster' });
}

// Farbfeld (suckless.org) — magic + W/H big-endian + 16-bit RGBA.
function encodeFarbfeld(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(16 + w * h * 8);
  out.set([0x66, 0x61, 0x72, 0x62, 0x66, 0x65, 0x6C, 0x64], 0); // 'farbfeld'
  const view = new DataView(out.buffer);
  view.setUint32(8, w, false);
  view.setUint32(12, h, false);
  let dst = 16;
  for (let i = 0; i < data.length; i += 4) {
    out[dst++] = data[i];     out[dst++] = data[i];
    out[dst++] = data[i + 1]; out[dst++] = data[i + 1];
    out[dst++] = data[i + 2]; out[dst++] = data[i + 2];
    out[dst++] = data[i + 3]; out[dst++] = data[i + 3];
  }
  return new Blob([out], { type: 'image/x-farbfeld' });
}

// HDR / Radiance RGBE — float-per-pixel HDR format. Plain (non-RLE)
// scanlines so we don't have to implement the new-style RLE encoder
// — every Radiance-aware viewer accepts both layouts.
function encodeHDR(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const headerBytes = new TextEncoder().encode(
    `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`
  );
  const out = new Uint8Array(headerBytes.length + w * h * 4);
  out.set(headerBytes, 0);
  let dst = headerBytes.length;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const max = Math.max(r, g, b);
    if (max < 1e-32) {
      out[dst++] = 0; out[dst++] = 0; out[dst++] = 0; out[dst++] = 0;
    } else {
      // Equivalent to math.h frexp(): produce mantissa in [0.5, 1).
      const exponent = Math.ceil(Math.log2(max));
      const mantissa = max / Math.pow(2, exponent);
      const scale = mantissa * 256 / max;
      out[dst++] = Math.min(255, Math.round(r * scale));
      out[dst++] = Math.min(255, Math.round(g * scale));
      out[dst++] = Math.min(255, Math.round(b * scale));
      out[dst++] = exponent + 128;
    }
  }
  return new Blob([out], { type: 'image/vnd.radiance' });
}

// PCX — ZSoft Paintbrush legacy bitmap with byte-level RLE. We
// emit version 5 (24-bit, 3 colour planes per scanline).
function encodePCX(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const header = new Uint8Array(128);
  const hv = new DataView(header.buffer);
  header[0] = 0x0A;       // ZSoft magic
  header[1] = 5;          // version 5
  header[2] = 1;          // RLE
  header[3] = 8;          // bits per pixel per plane
  hv.setUint16(4, 0, true);
  hv.setUint16(6, 0, true);
  hv.setUint16(8, w - 1, true);
  hv.setUint16(10, h - 1, true);
  hv.setUint16(12, 72, true);
  hv.setUint16(14, 72, true);
  header[64] = 0;
  header[65] = 3;          // 3 colour planes (R, G, B)
  hv.setUint16(66, w, true);
  hv.setUint16(68, 1, true);
  hv.setUint16(70, w, true);
  hv.setUint16(72, h, true);

  const chunks = [header];
  const planeLine = new Uint8Array(w);
  for (let y = 0; y < h; y++) {
    for (let plane = 0; plane < 3; plane++) {
      for (let x = 0; x < w; x++) planeLine[x] = data[(y * w + x) * 4 + plane];
      const rle = [];
      let i = 0;
      while (i < planeLine.length) {
        let runLen = 1;
        while (runLen < 63 && i + runLen < planeLine.length && planeLine[i + runLen] === planeLine[i]) runLen++;
        if (runLen > 1 || (planeLine[i] & 0xC0) === 0xC0) {
          rle.push(0xC0 | runLen, planeLine[i]);
        } else {
          rle.push(planeLine[i]);
        }
        i += runLen;
      }
      chunks.push(new Uint8Array(rle));
    }
  }

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return new Blob([out], { type: 'image/x-pcx' });
}

// PPM (Netpbm P6) — header + raw RGB bytes, top-down.
// Synchronous; the entire pixel array is already in memory.
function encodePPM(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const header = `P6\n${w} ${h}\n255\n`;
  const headerBytes = new TextEncoder().encode(header);
  const out = new Uint8Array(headerBytes.length + w * h * 3);
  out.set(headerBytes, 0);
  let dst = headerBytes.length;
  for (let i = 0; i < data.length; i += 4) {
    out[dst++] = data[i];
    out[dst++] = data[i + 1];
    out[dst++] = data[i + 2];
  }
  return new Blob([out], { type: 'image/x-portable-pixmap' });
}

// TGA (Truevision Targa, 24-bit uncompressed). 18-byte header,
// BGR pixels, bottom-up by default. Round-trips through Photoshop,
// GIMP and ImageMagick.
function encodeTGA(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const headerSize = 18;
  const pixelBytes = w * h * 3;
  const buf = new ArrayBuffer(headerSize + pixelBytes);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  view.setUint8(0, 0);          // ID length
  view.setUint8(1, 0);          // no color map
  view.setUint8(2, 2);          // uncompressed true-color
  view.setUint16(3, 0, true);   // first color-map entry
  view.setUint16(5, 0, true);   // color-map length
  view.setUint8(7, 0);          // color-map entry size
  view.setUint16(8, 0, true);   // x origin
  view.setUint16(10, 0, true);  // y origin
  view.setUint16(12, w, true);
  view.setUint16(14, h, true);
  view.setUint8(16, 24);        // bits per pixel
  view.setUint8(17, 0);         // image descriptor (origin bottom-left)
  let dst = headerSize;
  for (let y = h - 1; y >= 0; y--) {
    let src = y * w * 4;
    for (let x = 0; x < w; x++) {
      u8[dst++] = data[src + 2];
      u8[dst++] = data[src + 1];
      u8[dst++] = data[src];
      src += 4;
    }
  }
  return new Blob([buf], { type: 'image/x-targa' });
}

// TIFF — baseline uncompressed RGB, single strip, top-down.
// Layout: 8-byte header (II*\0 + IFD offset) + raw RGB strip +
// 12 IFD entries + next-IFD pointer. Photometric=2 (RGB),
// Compression=1 (none), PlanarConfiguration=1 (chunky).
function encodeTIFF(canvas) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  const data = ctx.getImageData(0, 0, w, h).data;
  const stripSize = w * h * 3;
  const headerSize = 8;
  const stripOffset = headerSize;
  const ifdOffset = headerSize + stripSize;
  const numEntries = 12;
  // Each IFD entry is 12 bytes. After the entries comes a 4-byte
  // next-IFD pointer (zero). BitsPerSample (3 shorts = 6 bytes) is
  // larger than 4 bytes so it must live outside the entry — append
  // it after the next-IFD pointer.
  const entriesSize = 2 + numEntries * 12 + 4; // count + entries + nextIFD
  const bpsOffset = ifdOffset + entriesSize;
  const bpsSize = 6;
  const totalSize = ifdOffset + entriesSize + bpsSize;
  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  // Header — little-endian.
  view.setUint16(0, 0x4949, true); // 'II'
  view.setUint16(2, 42, true);     // magic
  view.setUint32(4, ifdOffset, true);

  // Strip data: top-down, RGB, no padding.
  let dst = stripOffset;
  for (let i = 0; i < data.length; i += 4) {
    u8[dst++] = data[i];
    u8[dst++] = data[i + 1];
    u8[dst++] = data[i + 2];
  }

  // Helpers for an IFD entry: tag, type, count, valueOrOffset.
  let p = ifdOffset;
  view.setUint16(p, numEntries, true); p += 2;
  function entry(tag, type, count, value) {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    if (type === 3 && count === 1) {
      // SHORT in lower 2 bytes; upper 2 bytes zero.
      view.setUint16(p + 8, value, true);
      view.setUint16(p + 10, 0, true);
    } else {
      view.setUint32(p + 8, value, true);
    }
    p += 12;
  }

  // Tags ordered ascending (TIFF requires it).
  entry(256, 3, 1, w);                  // ImageWidth
  entry(257, 3, 1, h);                  // ImageLength
  entry(258, 3, 3, bpsOffset);          // BitsPerSample → 8,8,8 stored at bpsOffset
  entry(259, 3, 1, 1);                  // Compression: none
  entry(262, 3, 1, 2);                  // PhotometricInterpretation: RGB
  entry(273, 4, 1, stripOffset);        // StripOffsets
  entry(277, 3, 1, 3);                  // SamplesPerPixel
  entry(278, 3, 1, h);                  // RowsPerStrip
  entry(279, 4, 1, stripSize);          // StripByteCounts
  entry(282, 5, 1, 0);                  // XResolution (rational, value=0 placeholder)
  entry(283, 5, 1, 0);                  // YResolution
  entry(284, 3, 1, 1);                  // PlanarConfiguration: chunky

  // Next-IFD pointer (zero = no more IFDs).
  view.setUint32(p, 0, true); p += 4;

  // BitsPerSample storage: three SHORTs.
  view.setUint16(bpsOffset, 8, true);
  view.setUint16(bpsOffset + 2, 8, true);
  view.setUint16(bpsOffset + 4, 8, true);

  return new Blob([buf], { type: 'image/tiff' });
}

// ICO — wraps PNG-encoded entries inside an .ico container.
function encodeICO(canvas, sizes) {
  return _encodeIcoLike(canvas, sizes, /* cursor */ false);
}

// CUR — same container as ICO but the image-type byte at offset 2 is
// 2 (cursor) instead of 1 (icon). The per-entry "color planes" / "bpp"
// fields are repurposed as hotspot X / Y; default (0, 0).
function encodeCUR(canvas, sizes, hotspot) {
  return _encodeIcoLike(canvas, sizes, /* cursor */ true, hotspot || { x: 0, y: 0 });
}

async function _encodeIcoLike(canvas, sizes, cursor, hotspot) {
  hotspot = hotspot || { x: 0, y: 0 };
  sizes = (sizes && sizes.length) ? sizes : [16, 32, 48];
  sizes = sizes.slice().sort((a, b) => a - b);

  const entries = await Promise.all(sizes.map(async (size) => {
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const c2 = off.getContext('2d');
    c2.imageSmoothingEnabled = true;
    c2.imageSmoothingQuality = 'high';
    c2.drawImage(canvas, 0, 0, size, size);
    const blob = await encodePNG(off);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { size, bytes };
  }));

  const headerSize = 6;
  const dirEntrySize = 16;
  const totalSize = headerSize + dirEntrySize * entries.length
    + entries.reduce((sum, e) => sum + e.bytes.length, 0);

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);

  view.setUint16(0, 0, true);
  view.setUint16(2, cursor ? 2 : 1, true);
  view.setUint16(4, entries.length, true);

  let dataOffset = headerSize + dirEntrySize * entries.length;
  let entryOffset = headerSize;
  for (const e of entries) {
    view.setUint8(entryOffset + 0, e.size === 256 ? 0 : e.size);
    view.setUint8(entryOffset + 1, e.size === 256 ? 0 : e.size);
    view.setUint8(entryOffset + 2, 0);
    view.setUint8(entryOffset + 3, 0);
    if (cursor) {
      view.setUint16(entryOffset + 4, hotspot.x, true);
      view.setUint16(entryOffset + 6, hotspot.y, true);
    } else {
      view.setUint16(entryOffset + 4, 1, true);
      view.setUint16(entryOffset + 6, 32, true);
    }
    view.setUint32(entryOffset + 8, e.bytes.length, true);
    view.setUint32(entryOffset + 12, dataOffset, true);
    u8.set(e.bytes, dataOffset);
    dataOffset += e.bytes.length;
    entryOffset += dirEntrySize;
  }
  return new Blob([buf], { type: cursor ? 'image/x-win-bitmap' : 'image/x-icon' });
}

// ICNS — Apple icon container. Magic 'icns' + 4-byte BE total size +
// one entry per resolution. Each entry: 4-byte type tag + 4-byte BE
// length-including-header + raw PNG bytes. macOS Finder/Preview
// accept the modern PNG-bearing icp4/icp5/ic07–ic10 tags.
async function encodeICNS(canvas) {
  const TAGS = [
    { tag: 'icp4', size: 16 },
    { tag: 'icp5', size: 32 },
    { tag: 'ic07', size: 128 },
    { tag: 'ic08', size: 256 },
    { tag: 'ic09', size: 512 },
    { tag: 'ic10', size: 1024 },
  ];
  const entries = [];
  for (const { tag, size } of TAGS) {
    const off = document.createElement('canvas');
    off.width = size; off.height = size;
    const c2 = off.getContext('2d');
    c2.imageSmoothingEnabled = true;
    c2.imageSmoothingQuality = 'high';
    c2.drawImage(canvas, 0, 0, size, size);
    const blob = await encodePNG(off);
    const png = new Uint8Array(await blob.arrayBuffer());
    entries.push({ tag, png });
  }
  let total = 8;
  for (const e of entries) total += 8 + e.png.length;
  const out = new Uint8Array(total);
  out.set([0x69, 0x63, 0x6E, 0x73], 0); // 'icns'
  const view = new DataView(out.buffer);
  view.setUint32(4, total, false);
  let off = 8;
  for (const e of entries) {
    out[off + 0] = e.tag.charCodeAt(0);
    out[off + 1] = e.tag.charCodeAt(1);
    out[off + 2] = e.tag.charCodeAt(2);
    out[off + 3] = e.tag.charCodeAt(3);
    view.setUint32(off + 4, 8 + e.png.length, false);
    out.set(e.png, off + 8);
    off += 8 + e.png.length;
  }
  return new Blob([out], { type: 'image/icns' });
}

// Multi-page TIFF — chains N IFDs. Each page lays out as raw RGB
// strip + 12-entry IFD + BitsPerSample triple, with each IFD's
// "next IFD" pointer set to the next page's IFD offset (0 on the
// final page). Single-canvas input falls back to encodeTIFF.
function encodeMultiTIFF(canvases) {
  if (!canvases || !canvases.length) {
    throw new Error('encodeMultiTIFF needs at least one canvas');
  }
  if (canvases.length === 1) return encodeTIFF(canvases[0]);

  const numEntries = 12;
  const ifdSize = 2 + numEntries * 12 + 4;
  const bpsSize = 6;
  const pages = canvases.map((c) => ({
    w: c.width,
    h: c.height,
    stripSize: c.width * c.height * 3,
  }));

  let total = 8;
  for (const p of pages) total += p.stripSize + ifdSize + bpsSize;

  const buf = new ArrayBuffer(total);
  const view = new DataView(buf);
  const u8 = new Uint8Array(buf);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);

  let cursor = 8;
  let firstIfdOffset = 0;
  let prevNextIfdField = -1;

  for (let i = 0; i < pages.length; i++) {
    const { w, h, stripSize } = pages[i];
    const stripOffset = cursor;
    const ctx = canvases[i].getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    let dst = stripOffset;
    for (let j = 0; j < data.length; j += 4) {
      u8[dst++] = data[j];
      u8[dst++] = data[j + 1];
      u8[dst++] = data[j + 2];
    }
    cursor += stripSize;

    const ifdOffset = cursor;
    const bpsOffset = ifdOffset + ifdSize;
    if (i === 0) firstIfdOffset = ifdOffset;
    if (prevNextIfdField >= 0) view.setUint32(prevNextIfdField, ifdOffset, true);

    let p = ifdOffset;
    view.setUint16(p, numEntries, true); p += 2;
    function entry(tag, type, count, value) {
      view.setUint16(p, tag, true);
      view.setUint16(p + 2, type, true);
      view.setUint32(p + 4, count, true);
      if (type === 3 && count === 1) {
        view.setUint16(p + 8, value, true);
        view.setUint16(p + 10, 0, true);
      } else {
        view.setUint32(p + 8, value, true);
      }
      p += 12;
    }
    entry(256, 3, 1, w);
    entry(257, 3, 1, h);
    entry(258, 3, 3, bpsOffset);
    entry(259, 3, 1, 1);
    entry(262, 3, 1, 2);
    entry(273, 4, 1, stripOffset);
    entry(277, 3, 1, 3);
    entry(278, 3, 1, h);
    entry(279, 4, 1, stripSize);
    entry(282, 5, 1, 0);
    entry(283, 5, 1, 0);
    entry(284, 3, 1, 1);
    prevNextIfdField = p;
    view.setUint32(p, 0, true); p += 4;

    view.setUint16(bpsOffset, 8, true);
    view.setUint16(bpsOffset + 2, 8, true);
    view.setUint16(bpsOffset + 4, 8, true);
    cursor = bpsOffset + bpsSize;
  }

  view.setUint32(4, firstIfdOffset, true);
  return new Blob([buf], { type: 'image/tiff' });
}

// AVIF — browser-native via canvas.toBlob. Not all browsers ship an
// AVIF encoder; isAvifEncodeSupported() probes once at boot so the
// converter UI can hide the option when it would fail.
function encodeAVIF(canvas, quality) {
  return _canvasToBlob(canvas, 'image/avif', quality == null ? 0.85 : quality);
}

let _avifSupportPromise = null;
function isAvifEncodeSupported() {
  if (_avifSupportPromise) return _avifSupportPromise;
  _avifSupportPromise = new Promise((resolve) => {
    try {
      const probe = document.createElement('canvas');
      probe.width = 1; probe.height = 1;
      let settled = false;
      const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
      const timer = setTimeout(() => finish(false), 250);
      if (!probe.toBlob) { clearTimeout(timer); finish(false); return; }
      probe.toBlob((b) => {
        clearTimeout(timer);
        finish(!!(b && b.size > 0));
      }, 'image/avif', 0.5);
    } catch (_) {
      resolve(false);
    }
  });
  return _avifSupportPromise;
}

// ---------- pure transforms ----------

const BAYER4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

function to1Bit(imageData, opts) {
  const o = opts || {};
  const dither = o.dither || 'bayer4';
  const w = imageData.width, h = imageData.height;
  const src = imageData.data;
  const out = new ImageData(w, h);
  const dst = out.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] === 0) {
        dst[i] = dst[i + 1] = dst[i + 2] = 0;
        dst[i + 3] = 0;
        continue;
      }
      const luma = src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
      let threshold;
      if (dither === 'bayer4') threshold = (BAYER4[y & 3][x & 3] + 0.5) * 16;
      else threshold = 128;
      const bw = luma > threshold ? 255 : 0;
      dst[i] = dst[i + 1] = dst[i + 2] = bw;
      dst[i + 3] = 255;
    }
  }
  return out;
}

function resize(canvas, scale, opts) {
  const o = opts || {};
  const smoothing = !!o.smoothing;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(canvas.width * scale));
  off.height = Math.max(1, Math.round(canvas.height * scale));
  const c2 = off.getContext('2d');
  c2.imageSmoothingEnabled = smoothing;
  if (smoothing) c2.imageSmoothingQuality = 'high';
  c2.drawImage(canvas, 0, 0, off.width, off.height);
  return off;
}

function composeSpriteSheet(frames, opts) {
  if (!frames || !frames.length) throw new Error('No frames provided');
  const o = opts || {};
  const layout = o.layout || 'vertical';
  const fw = frames[0].width, fh = frames[0].height;
  let cols, rows;
  if (layout === 'horizontal') { cols = frames.length; rows = 1; }
  else if (layout === 'grid')  { cols = Math.ceil(Math.sqrt(frames.length)); rows = Math.ceil(frames.length / cols); }
  else                          { cols = 1; rows = frames.length; }
  const sheet = document.createElement('canvas');
  sheet.width = cols * fw;
  sheet.height = rows * fh;
  const sctx = sheet.getContext('2d');
  for (let i = 0; i < frames.length; i++) {
    const cx = (i % cols) * fw;
    const cy = Math.floor(i / cols) * fh;
    sctx.putImageData(frames[i], cx, cy);
  }
  return sheet;
}

// ---------- helpers ----------

function triggerDownload(blob, filename) {
  if (!(blob instanceof Blob)) throw new Error('triggerDownload expects a Blob');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function suggestFilename(originalName, newExt) {
  const base = (originalName || 'image').replace(/\.[^.]+$/, '');
  const ext = (newExt || '').replace(/^\.+/, '');
  return ext ? base + '.' + ext : base;
}

// ---------- converter convenience layer ----------

const ENCODABLE = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

async function decodeToCanvas(bytes, mime) {
  const blob = bytes instanceof Blob
    ? bytes
    : new Blob([bytes], { type: mime || 'application/octet-stream' });
  const { canvas } = await decodeBlob(blob);
  return canvas;
}

function canvasToBlob(canvas, mime, quality) {
  if (!ENCODABLE.has(mime)) {
    return Promise.reject(new Error(
      `Cannot encode to ${mime} — supported via canvasToBlob: ${[...ENCODABLE].join(', ')}`
    ));
  }
  return _canvasToBlob(canvas, mime, quality);
}

function _hasAlpha(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

async function convertImage(bytes, sourceMime, targetMime, opts = {}) {
  const canvas = await decodeToCanvas(bytes, sourceMime);
  if (targetMime === 'image/jpeg' && _hasAlpha(canvas)) {
    const flat = document.createElement('canvas');
    flat.width = canvas.width;
    flat.height = canvas.height;
    const ctx = flat.getContext('2d');
    ctx.fillStyle = opts.background || '#ffffff';
    ctx.fillRect(0, 0, flat.width, flat.height);
    ctx.drawImage(canvas, 0, 0);
    return canvasToBlob(flat, targetMime, opts.quality);
  }
  return canvasToBlob(canvas, targetMime, opts.quality);
}

export {
  // Decoders
  decodeFile, decodeBlob, decodeDataURL, decodeURL,
  // Encoders
  encodePNG, encodeJPEG, encodeWebP, encodeBMP, encodeICO, encodePPM, encodeTGA, encodeTIFF,
  encodePGM, encodePBM, encodePAM, encodeXBM, encodeXPM, encodeWBMP,
  encodeSGI, encodeRAS, encodeFarbfeld, encodeHDR, encodePCX,
  encodeICNS, encodeCUR, encodeMultiTIFF, encodeAVIF, isAvifEncodeSupported,
  // Transforms
  to1Bit, resize, composeSpriteSheet,
  // Helpers
  triggerDownload, suggestFilename,
  // Converter convenience layer
  decodeToCanvas, canvasToBlob, convertImage,
};
