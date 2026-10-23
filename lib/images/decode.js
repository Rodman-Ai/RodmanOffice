// =============================================================
//  Hand-rolled image decoders for formats browsers can't open.
//
//  decodeRaster(bytes, hint) -> Promise<{ width, height, data } | null>
//    `data` is RGBA (Uint8ClampedArray). `hint` is a MIME type or file
//    extension; magic bytes win when they're unambiguous. Returns null
//    for formats this module doesn't know, so callers can fall through.
//
//  These mirror the encoders in image-io.js, so everything the suite
//  writes it can also read back:
//    TIFF  baseline: none / PackBits / LZW / Deflate, predictor 2,
//          1-16 bit gray, RGB(A), palette, CMYK; strips or tiles
//    Netpbm P1-P7 (PBM, PGM, PPM, PAM), 8 or 16 bit
//    TGA   types 1, 2, 3 and their RLE forms; 8/15/16/24/32 bit
//    PCX   1-bit, 4-plane EGA, 8-bit palette, 24/32-bit planar
//    Sun raster, SGI (verbatim + RLE), Farbfeld, WBMP, XBM, XPM,
//    Radiance HDR (RGBE), ICNS (embedded PNG entries)
//  Browsers still handle PNG/JPEG/GIF/WebP/BMP/ICO/SVG/AVIF; image-io's
//  decodeToCanvas tries the browser first and falls back to this.
// =============================================================

const td = new TextDecoder('latin1');

// Allocates the RGBA output after checking the claimed size against the
// file: no format here compresses better than deflate's ~1032:1, so a
// header claiming more pixels than that is corrupt (a few flipped bytes
// in a 38-byte file once asked for 196 million pixels).
// Decoders call this right after reading the header, before any buffer
// sized from it is allocated.
function checkSize(w, h, file) {
  if (!(w > 0 && h > 0) || w * h > 268e6) throw new Error(`Unsupported image size ${w}×${h}`);
  if (file && w * h * 4 > Math.max(file.length * 1100, 4 << 20)) throw new Error(`Corrupt image: ${w}×${h} can't fit in ${file.length} bytes`);
}

function rgba(w, h, file) {
  checkSize(w, h, file);
  return new Uint8ClampedArray(w * h * 4);
}

function sniff(b, hint) {
  const h = String(hint || '').toLowerCase();
  const s4 = td.decode(b.subarray(0, 4));
  if ((b[0] === 0x49 && b[1] === 0x49 && b[2] === 42 && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && b[3] === 42)) return 'tiff';
  if (s4 === 'icns') return 'icns';
  if (td.decode(b.subarray(0, 8)) === 'farbfeld') return 'ff';
  if (b[0] === 0x59 && b[1] === 0xa6 && b[2] === 0x6a && b[3] === 0x95) return 'ras';
  if (b[0] === 0x01 && b[1] === 0xda) return 'sgi';
  if (td.decode(b.subarray(0, 2)) === '#?') return 'hdr';
  if (b[0] === 0x50 && b[1] >= 0x31 && b[1] <= 0x37) return 'pnm';
  if (td.decode(b.subarray(0, 9)) === '/* XPM */' || /xpm/.test(h)) return 'xpm';
  if (b[0] === 0x0a && b[2] === 1 && b.length > 128) return 'pcx';
  if (/xbm|x-xbitmap/.test(h) || /^#define\s+\S+_width/.test(td.decode(b.subarray(0, 200)))) return 'xbm';
  if (/wbmp/.test(h)) return 'wbmp';
  if (/tga|targa/.test(h)) return 'tga';
  if (/pcx/.test(h)) return 'pcx';
  return null;
}

export async function decodeRaster(input, hint) {
  const b = input instanceof Uint8Array ? input : new Uint8Array(input instanceof ArrayBuffer ? input : await new Response(input).arrayBuffer());
  switch (sniff(b, hint)) {
    case 'tiff': return decodeTiff(b);
    case 'pnm': return decodePnm(b);
    case 'tga': return decodeTga(b);
    case 'pcx': return decodePcx(b);
    case 'ras': return decodeRas(b);
    case 'sgi': return decodeSgi(b);
    case 'ff': return decodeFarbfeld(b);
    case 'wbmp': return decodeWbmp(b);
    case 'xbm': return decodeXbm(b);
    case 'xpm': return decodeXpm(b);
    case 'hdr': return decodeHdr(b);
    case 'icns': return decodeIcns(b);
    default: return null;
  }
}

// ---------- TIFF ----------

async function inflate(data) {
  const out = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate')));
  return new Uint8Array(await out.arrayBuffer());
}

function unpackBits(src, expected) {
  const out = new Uint8Array(expected);
  let i = 0, o = 0;
  while (i < src.length && o < expected) {
    const n = (src[i++] << 24) >> 24;
    if (n >= 0) { for (let k = 0; k <= n && o < expected; k++) out[o++] = src[i++]; }
    else if (n !== -128) { const v = src[i++]; for (let k = 0; k < 1 - n && o < expected; k++) out[o++] = v; }
  }
  return out;
}

function lzwDecode(src, expected) {
  const out = new Uint8Array(expected);
  const prefix = new Int32Array(4096), suffix = new Uint8Array(4096), len = new Uint16Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; len[i] = 1; }
  let next = 258, width = 9, bitPos = 0, o = 0, prev = -1;
  const read = () => {
    let v = 0;
    for (let k = 0; k < width; k++) {
      const byte = src[(bitPos >> 3)];
      if (byte === undefined) return 257;
      v = (v << 1) | ((byte >> (7 - (bitPos & 7))) & 1);
      bitPos++;
    }
    return v;
  };
  const emit = (code) => {
    const l = len[code];
    let p = o + l - 1, c = code;
    while (c >= 0) { if (p < expected) out[p] = suffix[c]; p--; c = prefix[c]; }
    o += l;
    let f = code; while (prefix[f] >= 0) f = prefix[f];
    return suffix[f];
  };
  for (;;) {
    const code = read();
    if (code === 257 || o >= expected) break;
    if (code === 256) { next = 258; width = 9; prev = -1; continue; }
    if (prev < 0) { emit(code); prev = code; continue; }
    let first;
    if (code < next) {
      first = emit(code);
      prefix[next] = prev; suffix[next] = first; len[next] = len[prev] + 1;
    } else {
      // KwKwK: the code being defined is prev + first(prev).
      let f = prev; while (prefix[f] >= 0) f = prefix[f];
      prefix[next] = prev; suffix[next] = suffix[f]; len[next] = len[prev] + 1;
      emit(next);
    }
    next++;
    // TIFF LZW switches width one code early.
    if (next + 1 >= (1 << width) && width < 12) width++;
    prev = code;
  }
  return out;
}

async function decodeTiff(b) {
  const le = b[0] === 0x49;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
  const ifd = u32(4);
  const tags = {};
  const n = u16(ifd);
  const size = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > b.length) break; // entry count runs past the file
    const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    const bytes = (size[type] || 1) * count;
    const at = bytes <= 4 ? e + 8 : u32(e + 8);
    // Values must lie inside the file; corrupt entries can claim millions.
    if (!size[type] || at + bytes > b.length) continue;
    const vals = [];
    for (let k = 0; k < count; k++) {
      if (type === 3) vals.push(u16(at + k * 2));
      else if (type === 4) vals.push(u32(at + k * 4));
      else if (type === 5) vals.push(u32(at + k * 8) / (u32(at + k * 8 + 4) || 1));
      else vals.push(b[at + k]);
    }
    tags[tag] = vals;
  }
  const w = tags[256]?.[0], h = tags[257]?.[0];
  const bps = tags[258] || [1];
  const comp = tags[259]?.[0] || 1;
  const photo = tags[262]?.[0] ?? 1;
  const spp = tags[277]?.[0] || 1;
  const planar = tags[284]?.[0] || 1;
  const predictor = tags[317]?.[0] || 1;
  const extra = tags[338] || [];
  const bits = bps[0];
  if (![1, 2, 4, 8, 16].includes(bits)) throw new Error(`TIFF with ${bits}-bit samples isn't supported`);
  if (![1, 5, 8, 32946, 32773].includes(comp)) throw new Error(`TIFF compression ${comp} isn't supported (JPEG-in-TIFF, CCITT fax)`);
  if (planar !== 1 && spp > 1) throw new Error('Planar (separate-plane) TIFF isn\'t supported');

  const tiled = !!tags[322];
  const tw = tiled ? tags[322][0] : w;
  // RowsPerStrip is often 2^32-1 ("one strip"); never more than the image.
  const th = tiled ? tags[323][0] : Math.min(tags[278]?.[0] || h, h);
  if (tiled) checkSize(tw, th, b);
  const offsets = tiled ? tags[324] : tags[273];
  const counts = tiled ? tags[325] : tags[279];
  if (!offsets || !counts) throw new Error('TIFF has no image data offsets');
  const rowBytes = Math.ceil((tw * spp * bits) / 8);
  const across = tiled ? Math.ceil(w / tw) : 1;

  const out = rgba(w, h, b);
  const cmap = tags[320];
  const maxv = (1 << bits) - 1;
  const sample = (row, i) => {
    if (bits === 8) return row[i];
    if (bits === 16) return (le ? row[i * 2] | (row[i * 2 + 1] << 8) : (row[i * 2] << 8) | row[i * 2 + 1]) >> 8;
    const bit = i * bits;
    return ((row[bit >> 3] >> (8 - bits - (bit & 7))) & maxv) * 255 / maxv;
  };
  const raw = (row, i) => (bits === 8 ? row[i] : bits === 16 ? (le ? row[i * 2] | (row[i * 2 + 1] << 8) : (row[i * 2] << 8) | row[i * 2 + 1]) : (row[(i * bits) >> 3] >> (8 - bits - ((i * bits) & 7))) & maxv);
  const hasAlpha = spp > (photo === 2 ? 3 : photo === 5 ? 4 : 1) && extra.length;
  const premul = extra[0] === 1;

  for (let s = 0; s < offsets.length; s++) {
    const tx = tiled ? (s % across) * tw : 0;
    const ty = tiled ? Math.floor(s / across) * th : s * th;
    const rows = Math.min(th, h - ty);
    if (rows <= 0) continue;
    const expected = rowBytes * th;
    let data = b.subarray(offsets[s], offsets[s] + counts[s]);
    if (comp === 32773) data = unpackBits(data, expected);
    else if (comp === 5) data = lzwDecode(data, expected);
    else if (comp === 8 || comp === 32946) data = await inflate(data);
    if (predictor === 2) {
      const bpp = spp * (bits / 8);
      for (let r = 0; r < th; r++) {
        const base = r * rowBytes;
        if (bits === 8) for (let i = bpp; i < rowBytes; i++) data[base + i] = (data[base + i] + data[base + i - bpp]) & 255;
        else if (bits === 16) {
          for (let i = spp; i < tw * spp; i++) {
            const p = base + i * 2, q = base + (i - spp) * 2;
            const v = ((le ? data[p] | (data[p + 1] << 8) : (data[p] << 8) | data[p + 1]) + (le ? data[q] | (data[q + 1] << 8) : (data[q] << 8) | data[q + 1])) & 0xffff;
            if (le) { data[p] = v & 255; data[p + 1] = v >> 8; } else { data[p] = v >> 8; data[p + 1] = v & 255; }
          }
        }
      }
    }
    for (let r = 0; r < rows; r++) {
      const row = data.subarray(r * rowBytes, (r + 1) * rowBytes);
      const y = ty + r;
      for (let x = 0; x < tw && tx + x < w; x++) {
        const o = (y * w + tx + x) * 4;
        const i = x * spp;
        let R, G, B, A = 255;
        if (photo === 2) { R = sample(row, i); G = sample(row, i + 1); B = sample(row, i + 2); if (hasAlpha) A = sample(row, i + 3); }
        else if (photo === 3) {
          const k = raw(row, i), m = cmap.length / 3;
          R = cmap[k] >> 8; G = cmap[m + k] >> 8; B = cmap[2 * m + k] >> 8;
        } else if (photo === 5) {
          const C = sample(row, i), M = sample(row, i + 1), Y = sample(row, i + 2), K = sample(row, i + 3);
          R = 255 - Math.min(255, C + K); G = 255 - Math.min(255, M + K); B = 255 - Math.min(255, Y + K);
        } else if (photo === 0 || photo === 1) {
          const v = sample(row, i);
          R = G = B = photo === 0 ? 255 - v : v;
          if (hasAlpha) A = sample(row, i + 1);
        } else throw new Error(`TIFF colour model ${photo} isn't supported`);
        if (premul && A && A < 255) { R = R * 255 / A; G = G * 255 / A; B = B * 255 / A; }
        out[o] = R; out[o + 1] = G; out[o + 2] = B; out[o + 3] = A;
      }
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- Netpbm ----------

function decodePnm(b) {
  const kind = b[1] - 48;
  let p = 2;
  const token = () => {
    for (;;) {
      while (p < b.length && /\s/.test(String.fromCharCode(b[p]))) p++;
      if (b[p] === 35) { while (p < b.length && b[p] !== 10) p++; continue; }
      break;
    }
    const s = p;
    while (p < b.length && !/\s/.test(String.fromCharCode(b[p]))) p++;
    return td.decode(b.subarray(s, p));
  };
  let w, h, depth, maxval = 1;
  if (kind === 7) {
    const head = {};
    for (;;) {
      const key = token();
      if (key === 'ENDHDR' || !key) break;
      head[key] = token();
    }
    p++;
    w = +head.WIDTH; h = +head.HEIGHT; depth = +head.DEPTH; maxval = +head.MAXVAL;
  } else {
    w = +token(); h = +token();
    if (kind !== 1 && kind !== 4) maxval = +token();
    depth = kind === 3 || kind === 6 ? 3 : 1;
    if (kind >= 4) p++;
  }
  const out = rgba(w, h, b);
  const ascii = kind <= 3;
  const wide = maxval > 255;
  const scale = 255 / maxval;
  const read = () => {
    if (ascii) return +token();
    const v = wide ? (b[p] << 8) | b[p + 1] : b[p];
    p += wide ? 2 : 1;
    return v;
  };
  for (let y = 0; y < h; y++) {
    if (kind === 4) {
      const rowStart = p;
      for (let x = 0; x < w; x++) {
        const bit = (b[rowStart + (x >> 3)] >> (7 - (x & 7))) & 1;
        const o = (y * w + x) * 4;
        out[o] = out[o + 1] = out[o + 2] = bit ? 0 : 255; out[o + 3] = 255;
      }
      p = rowStart + Math.ceil(w / 8);
      continue;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (kind === 1) { const v = read(); out[o] = out[o + 1] = out[o + 2] = v ? 0 : 255; out[o + 3] = 255; continue; }
      const c = [];
      for (let d = 0; d < depth; d++) c.push(read() * scale);
      if (depth >= 3) { out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = depth === 4 ? c[3] : 255; }
      else { out[o] = out[o + 1] = out[o + 2] = c[0]; out[o + 3] = depth === 2 ? c[1] : 255; }
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- TGA ----------

function decodeTga(b) {
  const idLen = b[0], cmapType = b[1], type = b[2];
  const cmapFirst = b[3] | (b[4] << 8), cmapLen = b[5] | (b[6] << 8), cmapDepth = b[7];
  const w = b[12] | (b[13] << 8), h = b[14] | (b[15] << 8), depth = b[16], desc = b[17];
  if (![1, 2, 3, 9, 10, 11].includes(type)) throw new Error(`TGA type ${type} isn't supported`);
  checkSize(w, h, b);
  let p = 18 + idLen;
  const px = (q, d) => {
    if (d === 8) return [b[q], b[q], b[q], 255];
    if (d === 15 || d === 16) { const v = b[q] | (b[q + 1] << 8); return [((v >> 10) & 31) * 255 / 31, ((v >> 5) & 31) * 255 / 31, (v & 31) * 255 / 31, d === 16 && !(v & 0x8000) && (desc & 15) ? 0 : 255]; }
    if (d === 24) return [b[q + 2], b[q + 1], b[q], 255];
    return [b[q + 2], b[q + 1], b[q], (desc & 15) ? b[q + 3] : 255];
  };
  let cmap = null;
  const cbytes = Math.ceil(cmapDepth / 8);
  if (cmapType === 1) { cmap = []; for (let i = 0; i < cmapLen; i++) cmap.push(px(p + i * cbytes, cmapDepth)); p += cmapLen * cbytes; }
  const bpp = Math.ceil(depth / 8);
  const total = w * h;
  const pixels = new Array(total);
  const read = (q) => (type === 1 || type === 9) ? (cmap[(bpp === 2 ? b[q] | (b[q + 1] << 8) : b[q]) - cmapFirst] || [0, 0, 0, 255]) : px(q, depth);
  if (type < 9) for (let i = 0; i < total; i++) pixels[i] = read(p + i * bpp);
  else {
    let i = 0;
    while (i < total && p < b.length) {
      const hdr = b[p++], count = (hdr & 127) + 1;
      if (hdr & 128) { const v = read(p); p += bpp; for (let k = 0; k < count && i < total; k++) pixels[i++] = v; }
      else for (let k = 0; k < count && i < total; k++) { pixels[i++] = read(p); p += bpp; }
    }
  }
  const out = rgba(w, h, b);
  const top = desc & 0x20, right = desc & 0x10;
  for (let i = 0; i < total; i++) {
    const sx = i % w, sy = Math.floor(i / w);
    const x = right ? w - 1 - sx : sx, y = top ? sy : h - 1 - sy;
    const v = pixels[i] || [0, 0, 0, 255], o = (y * w + x) * 4;
    out[o] = v[0]; out[o + 1] = v[1]; out[o + 2] = v[2]; out[o + 3] = v[3];
  }
  return { width: w, height: h, data: out };
}

// ---------- PCX ----------

function decodePcx(b) {
  const bits = b[3];
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint16(8, true) - dv.getUint16(4, true) + 1;
  const h = dv.getUint16(10, true) - dv.getUint16(6, true) + 1;
  const planes = b[65], bpl = dv.getUint16(66, true);
  checkSize(w, h, b);
  const line = planes * bpl;
  const raw = new Uint8Array(line * h);
  let p = 128, o = 0;
  while (o < raw.length && p < b.length) {
    const v = b[p++];
    if ((v & 0xc0) === 0xc0) { const n = v & 0x3f, d = b[p++]; for (let k = 0; k < n && o < raw.length; k++) raw[o++] = d; }
    else raw[o++] = v;
  }
  let pal256 = null;
  if (bits === 8 && planes === 1 && b[b.length - 769] === 0x0c) pal256 = b.subarray(b.length - 768);
  const out = rgba(w, h, b);
  for (let y = 0; y < h; y++) {
    const row = raw.subarray(y * line, (y + 1) * line);
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      let R, G, B, A = 255;
      if (bits === 8 && planes >= 3) { R = row[x]; G = row[bpl + x]; B = row[2 * bpl + x]; if (planes === 4) A = row[3 * bpl + x]; }
      else if (bits === 8) { const k = row[x]; if (pal256) { R = pal256[k * 3]; G = pal256[k * 3 + 1]; B = pal256[k * 3 + 2]; } else R = G = B = k; }
      else if (bits === 1) {
        let k = 0;
        for (let pl = 0; pl < planes; pl++) k |= ((row[pl * bpl + (x >> 3)] >> (7 - (x & 7))) & 1) << pl;
        if (planes === 1) R = G = B = k ? 255 : 0;
        else { R = b[16 + k * 3]; G = b[17 + k * 3]; B = b[18 + k * 3]; }
      } else throw new Error(`PCX with ${bits}-bit × ${planes} planes isn't supported`);
      out[q] = R; out[q + 1] = G; out[q + 2] = B; out[q + 3] = A;
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- Sun raster ----------

function decodeRas(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(4), h = dv.getUint32(8), depth = dv.getUint32(12), type = dv.getUint32(20), mapType = dv.getUint32(24), mapLen = dv.getUint32(28);
  checkSize(w, h, b);
  let p = 32;
  const map = mapType === 1 && mapLen ? b.subarray(p, p + mapLen) : null;
  p += mapLen;
  let data = b.subarray(p);
  const rowBytes = Math.ceil((w * depth) / 8 / 2) * 2;
  if (type === 2) {
    const out = new Uint8Array(rowBytes * h);
    let i = 0, o = 0;
    while (o < out.length && i < data.length) {
      const v = data[i++];
      if (v !== 0x80) { out[o++] = v; continue; }
      const n = data[i++];
      if (n === 0) { out[o++] = 0x80; continue; }
      const c = data[i++];
      for (let k = 0; k <= n && o < out.length; k++) out[o++] = c;
    }
    data = out;
  }
  const out = rgba(w, h, b);
  const n = map ? map.length / 3 : 0;
  for (let y = 0; y < h; y++) {
    const row = data.subarray(y * rowBytes);
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4;
      let R, G, B;
      if (depth === 1) { const bit = (row[x >> 3] >> (7 - (x & 7))) & 1; R = G = B = bit ? 0 : 255; }
      else if (depth === 8) { const k = row[x]; if (map) { R = map[k]; G = map[n + k]; B = map[2 * n + k]; } else R = G = B = k; }
      else if (depth === 24) { const i = x * 3; [R, G, B] = type === 3 ? [row[i], row[i + 1], row[i + 2]] : [row[i + 2], row[i + 1], row[i]]; }
      else if (depth === 32) { const i = x * 4; [R, G, B] = type === 3 ? [row[i + 1], row[i + 2], row[i + 3]] : [row[i + 3], row[i + 2], row[i + 1]]; }
      else throw new Error(`Sun raster depth ${depth} isn't supported`);
      out[q] = R; out[q + 1] = G; out[q + 2] = B; out[q + 3] = 255;
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- SGI ----------

function decodeSgi(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const rle = b[2] === 1, bpc = b[3];
  const w = dv.getUint16(6), h = dv.getUint16(8), z = Math.max(1, dv.getUint16(10));
  if (bpc !== 1 && rle) throw new Error('16-bit RLE SGI isn\'t supported');
  checkSize(w, h, b);
  const chan = Array.from({ length: z }, () => new Uint8Array(w * h));
  for (let c = 0; c < z; c++) {
    for (let y = 0; y < h; y++) {
      const dst = chan[c].subarray(y * w, (y + 1) * w);
      if (!rle) {
        const base = 512 + ((c * h + y) * w) * bpc;
        for (let x = 0; x < w; x++) dst[x] = bpc === 2 ? b[base + x * 2] : b[base + x];
        continue;
      }
      let p = dv.getUint32(512 + (c * h + y) * 4), o = 0;
      for (;;) {
        const v = b[p++], n = v & 127;
        if (!n || p > b.length) break;
        if (v & 128) for (let k = 0; k < n && o < w; k++) dst[o++] = b[p++];
        else { const d = b[p++]; for (let k = 0; k < n && o < w; k++) dst[o++] = d; }
      }
    }
  }
  const out = rgba(w, h, b);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (h - 1 - y) * w + x, q = (y * w + x) * 4;
      out[q] = chan[0][s];
      out[q + 1] = z >= 3 ? chan[1][s] : chan[0][s];
      out[q + 2] = z >= 3 ? chan[2][s] : chan[0][s];
      out[q + 3] = z === 4 ? chan[3][s] : z === 2 ? chan[1][s] : 255;
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- Farbfeld, WBMP ----------

function decodeFarbfeld(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(8), h = dv.getUint32(12);
  const out = rgba(w, h, b);
  for (let i = 0; i < w * h * 4; i++) out[i] = b[16 + i * 2];
  return { width: w, height: h, data: out };
}

function decodeWbmp(b) {
  let p = 0;
  const uintvar = () => { let v = 0, c; do { c = b[p++]; v = (v << 7) | (c & 127); } while (c & 128); return v; };
  if (uintvar() !== 0) throw new Error('Only type-0 WBMP is supported');
  p++;
  const w = uintvar(), h = uintvar();
  const out = rgba(w, h, b);
  const rb = Math.ceil(w / 8);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (b[p + y * rb + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0, q = (y * w + x) * 4;
    out[q] = out[q + 1] = out[q + 2] = v; out[q + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

// ---------- XBM, XPM ----------

function decodeXbm(b) {
  const s = td.decode(b);
  const w = +(/_width\s+(\d+)/.exec(s) || [])[1], h = +(/_height\s+(\d+)/.exec(s) || [])[1];
  const body = s.slice(s.indexOf('{'));
  const bytes = (body.match(/0x[0-9a-fA-F]+|\b\d+\b/g) || []).map((v) => parseInt(v, v.startsWith('0x') ? 16 : 10));
  const out = rgba(w, h, b);
  const rb = Math.ceil(w / 8);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = (bytes[y * rb + (x >> 3)] >> (x & 7)) & 1 ? 0 : 255, q = (y * w + x) * 4;
    out[q] = out[q + 1] = out[q + 2] = v; out[q + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

function cssColor(name) {
  if (/^none$/i.test(name)) return [0, 0, 0, 0];
  let m = /^#([0-9a-f]+)$/i.exec(name);
  if (m) {
    const hex = m[1], n = hex.length / 3;
    return [0, 1, 2].map((i) => parseInt(hex.substr(i * n, n), 16) * 255 / (16 ** n - 1)).concat(255);
  }
  // Named X11 colour: let the browser resolve it.
  if (typeof document === 'undefined') return [0, 0, 0, 255];
  const c = document.createElement('canvas').getContext('2d');
  c.fillStyle = '#000'; c.fillStyle = name.replace(/\s+/g, '');
  m = /^#([0-9a-f]{6})$/i.exec(c.fillStyle);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].substr(i, 2), 16)).concat(255) : [0, 0, 0, 255];
}

function decodeXpm(b) {
  const strings = [...td.decode(b).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  const [w, h, ncolors, cpp] = strings[0].trim().split(/\s+/).map(Number);
  const colors = new Map();
  for (let i = 1; i <= ncolors; i++) {
    const line = strings[i];
    const key = line.slice(0, cpp);
    const parts = line.slice(cpp).trim().split(/\s+/);
    let value = null;
    for (let k = 0; k < parts.length - 1; k++) if (parts[k] === 'c') { value = parts.slice(k + 1).join(' ').split(/\s+(?:m|s|g4|g)\s+/)[0]; break; }
    if (value == null) value = parts[parts.length - 1];
    colors.set(key, cssColor(value));
  }
  const out = rgba(w, h, b);
  for (let y = 0; y < h; y++) {
    const row = strings[1 + ncolors + y] || '';
    for (let x = 0; x < w; x++) {
      const v = colors.get(row.substr(x * cpp, cpp)) || [0, 0, 0, 0], q = (y * w + x) * 4;
      out[q] = v[0]; out[q + 1] = v[1]; out[q + 2] = v[2]; out[q + 3] = v[3];
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- Radiance HDR ----------

function decodeHdr(b) {
  let p = 0;
  const line = () => { const s = p; while (p < b.length && b[p] !== 10) p++; return td.decode(b.subarray(s, p++)); };
  while (p < b.length && line() !== '');
  const m = /([-+])Y\s+(\d+)\s+([-+])X\s+(\d+)/.exec(line());
  if (!m) throw new Error('Unsupported HDR orientation');
  const h = +m[2], w = +m[4];
  checkSize(w, h, b);
  const rgbe = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const row = rgbe.subarray(y * w * 4, (y + 1) * w * 4);
    if (w >= 8 && w < 32768 && b[p] === 2 && b[p + 1] === 2 && ((b[p + 2] << 8) | b[p + 3]) === w) {
      p += 4;
      for (let c = 0; c < 4; c++) {
        let x = 0;
        while (x < w) {
          let n = b[p++];
          const run = n > 128;
          if (run) n -= 128;
          // A zero count or one past the row end means corrupt data;
          // without this check the loop never advances.
          if (!n || x + n > w || p > b.length) throw new Error('Corrupt HDR scanline');
          if (run) { const v = b[p++]; while (n--) row[(x++) * 4 + c] = v; }
          else while (n--) row[(x++) * 4 + c] = b[p++];
        }
      }
    } else { row.set(b.subarray(p, p + w * 4)); p += w * 4; }
  }
  const f = new Float32Array(w * h * 3);
  let max = 0;
  for (let i = 0, j = 0; i < rgbe.length; i += 4, j += 3) {
    const e = rgbe[i + 3];
    const s = e ? Math.pow(2, e - 136) : 0;
    f[j] = rgbe[i] * s; f[j + 1] = rgbe[i + 1] * s; f[j + 2] = rgbe[i + 2] * s;
    max = Math.max(max, f[j], f[j + 1], f[j + 2]);
  }
  // Values within 0..1 are display values (what the suite writes);
  // brighter true-HDR data gets a simple tone map and gamma.
  const ldr = max <= 1.001;
  const out = rgba(w, h, b);
  for (let i = 0, j = 0; i < out.length; i += 4, j += 3) {
    for (let c = 0; c < 3; c++) {
      const v = f[j + c];
      out[i + c] = ldr ? v * 255 + 0.5 : Math.pow(v / (1 + v), 1 / 2.2) * 255;
    }
    out[i + 3] = 255;
  }
  if (m[1] === '+') { // bottom-up rows
    const rb = w * 4, tmp = new Uint8ClampedArray(rb);
    for (let y = 0; y < h >> 1; y++) {
      const a = y * rb, z = (h - 1 - y) * rb;
      tmp.set(out.subarray(a, a + rb)); out.copyWithin(a, z, z + rb); out.set(tmp, z);
    }
  }
  return { width: w, height: h, data: out };
}

// ---------- ICNS ----------

async function decodeIcns(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let best = null;
  for (let p = 8; p + 8 <= b.length;) {
    const len = dv.getUint32(p + 4);
    if (len < 8) break;
    const data = b.subarray(p + 8, p + len);
    if (data[0] === 0x89 && data[1] === 0x50 && (!best || data.length > best.length)) best = data;
    p += len;
  }
  if (!best) throw new Error('This ICNS has no PNG images (only legacy icon data)');
  const bmp = await createImageBitmap(new Blob([best], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  c.getContext('2d').drawImage(bmp, 0, 0);
  const { data } = c.getContext('2d').getImageData(0, 0, bmp.width, bmp.height);
  return { width: bmp.width, height: bmp.height, data };
}
