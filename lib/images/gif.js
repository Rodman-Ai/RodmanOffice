// GIF writer.
//
// Hand-rolled GIF89a + LZW. Previously lived inline in
// `image/js/app.js` (lines 4977-5052) to drive the animation-export
// tool; moved here so the unified Save dialog and the converter can
// also emit static GIFs without dragging in a vendor library.
//
// Public API:
//   encodeGIF(canvas)       -> Promise<Blob>     // single-frame static
//   encodeGIF89a(frames, delayCs) -> Uint8Array  // raw bytes, multi-frame
//   lzwEncode(indices, minCodeSize) -> Uint8Array
//   quantizeFrameForGif(imageData) -> { indices, palette, w, h }
//
// The animation tool keeps using encodeGIF89a + lzwEncode (multi-frame
// path); encodeGIF is the convenience wrapper for single-frame use.

// LZW compression for GIF (variable-width codes, 12-bit max).
export function lzwEncode(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize;
  const eoi = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let nextCode = eoi + 1;
  const dict = {};
  for (let i = 0; i < clearCode; i++) dict[String.fromCharCode(i)] = i;
  const out = [];
  let buffer = 0;
  let bufferBits = 0;
  const writeCode = (c) => {
    buffer |= c << bufferBits;
    bufferBits += codeSize;
    while (bufferBits >= 8) {
      out.push(buffer & 0xff);
      buffer >>>= 8;
      bufferBits -= 8;
    }
  };
  writeCode(clearCode);
  let prev = String.fromCharCode(indices[0]);
  for (let i = 1; i < indices.length; i++) {
    const cur = String.fromCharCode(indices[i]);
    const combined = prev + cur;
    if (combined in dict) {
      prev = combined;
    } else {
      writeCode(dict[prev]);
      if (nextCode < 4096) {
        dict[combined] = nextCode++;
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      }
      prev = cur;
    }
  }
  writeCode(dict[prev]);
  writeCode(eoi);
  if (bufferBits > 0) out.push(buffer & 0xff);
  return new Uint8Array(out);
}

// GIF89a writer. `frames` is `[{ w, h, indices, palette }, ...]`;
// the global palette comes from the first frame.
export function encodeGIF89a(frames, delayCs) {
  if (!frames.length) return null;
  const w = frames[0].w;
  const h = frames[0].h;
  const out = [];
  const w8 = (n) => out.push(n & 0xff);
  const w16 = (n) => { out.push(n & 0xff); out.push((n >> 8) & 0xff); };
  'GIF89a'.split('').forEach((c) => w8(c.charCodeAt(0)));
  w16(w); w16(h);
  w8(0xf7); // global color table flag + 256 entries
  w8(0); w8(0);
  for (let i = 0; i < 256; i++) {
    const c = frames[0].palette[i] || [0, 0, 0];
    w8(c[0]); w8(c[1]); w8(c[2]);
  }
  // NETSCAPE2.0 loop extension (loop forever).
  w8(0x21); w8(0xff); w8(0x0b);
  'NETSCAPE2.0'.split('').forEach((c) => w8(c.charCodeAt(0)));
  w8(0x03); w8(0x01); w16(0); w8(0);
  for (const f of frames) {
    w8(0x21); w8(0xf9); w8(0x04); w8(0); w16(delayCs); w8(0); w8(0);
    w8(0x2c); w16(0); w16(0); w16(w); w16(h); w8(0);
    w8(8);
    const compressed = lzwEncode(f.indices, 8);
    let p = 0;
    while (p < compressed.length) {
      const len = Math.min(255, compressed.length - p);
      w8(len);
      for (let k = 0; k < len; k++) w8(compressed[p + k]);
      p += len;
    }
    w8(0);
  }
  w8(0x3b);
  return new Uint8Array(out);
}

// 6-3-3 uniform cube quantisation → 256-colour indexed.
export function quantizeFrameForGif(imageData) {
  const palette = [];
  const w = imageData.width;
  const h = imageData.height;
  const indices = new Uint8Array(w * h);
  const map = {};
  let nColors = 0;
  const d = imageData.data;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const r = (d[i] >> 5) << 5;
    const g = (d[i + 1] >> 5) << 5;
    const b = (d[i + 2] >> 6) << 6;
    const key = r * 65536 + g * 256 + b;
    if (!(key in map)) {
      if (nColors >= 256) { map[key] = 0; }
      else { map[key] = nColors; palette.push([r, g, b]); nColors++; }
    }
    indices[j] = map[key];
  }
  while (palette.length < 256) palette.push([0, 0, 0]);
  return { indices, palette, w, h };
}

export async function encodeGIF(canvas) {
  if (!canvas || !canvas.width || !canvas.height) {
    throw new Error('encodeGIF: canvas must be non-empty');
  }
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const frame = quantizeFrameForGif(imageData);
  const bytes = encodeGIF89a([frame], 0);
  return new Blob([bytes], { type: 'image/gif' });
}
