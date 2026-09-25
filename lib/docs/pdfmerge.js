// =============================================================
//  Lossless PDF merge: hand-rolled object copier.
//
//  mergePdfs(sources, opts) → Promise<Uint8Array>
//
//  Each source PDF is parsed at the object level (classic xref
//  tables, xref streams, hybrid files, object streams, /Prev
//  chains, and a brute-force "n g obj" rescan for files whose
//  xref is damaged). The chosen pages are then deep-copied into
//  one fresh PDF: content streams are copied byte-for-byte (still
//  compressed), so text stays selectable, vectors stay vectors
//  and images keep their original encoding.
//
//  Page dictionaries get their inherited attributes (/Resources,
//  /MediaBox, /CropBox, /Rotate) pushed down from the source page
//  tree, then hang off one flat /Pages node. Any reference that
//  points at a page (link destinations, annotation /P) is remapped
//  to the copied page, or nulled when that page wasn't included,
//  so the copier never drags a source's whole page tree along.
//
//  Encrypted sources are refused with err.code = 'ENCRYPTED'. The
//  caller can rasterize those (pdf.js handles empty-password
//  encryption) and pass them back as an image source, one page per
//  image (full field list above imagePages()):
//
//    { images: [{ data: Uint8Array, filter?: 'DCTDecode' | 'FlateDecode',
//                 width, height, pageWidth, pageHeight, matrix?, ... }] }
//
//  Photos and scans use the same image source; FileMerger's
//  packet.js builds them (JPEG passed through, other formats stored
//  losslessly) for the PDF packet.
//
//  Other source shape:
//    { bytes: Uint8Array, name?: string, pages?: number[] (0-based;
//      omitted or empty = every page; may repeat or reorder),
//      rotate?: 0 | 90 | 180 | 270 (added to each page's own /Rotate) }
//
//  opts: { bookmarks?: boolean (one outline entry per source,
//          titled with `name`), title?: string,
//          onProgress?: (ratio) => void,
//          contents?: true | { pageSize: [w, h] } (a contents page,
//            or several, at the front: each source's name and first
//            page number, clickable),
//          stamp?: { text(pageIndex, pageCount), position: 'center' |
//            'right' } (text on every page's visual bottom edge, for
//            page numbers or Bates numbers; upright on rotated pages) }
//
//  Text the writer draws itself (the contents page and stamps) uses
//  the built-in Helvetica, so it is limited to WinAnsi (Latin-1 plus
//  common typographic characters). Bookmark titles are full Unicode.
//
//  Internal links (/Dest or a GoTo action) are rewritten to explicit
//  destinations while copying: named destinations are looked up in
//  the source's name tree or /Dests dict, bare page indices become
//  page references, and links whose target page was left out (or
//  can't be resolved) are removed, since viewers send a broken
//  destination to page 1. Pages missing /Resources get an empty one.
//
//  Only pages and what they reference are carried over. Document-
//  level parts of each source are dropped: its outline (bookmarks),
//  name trees, AcroForm, optional-content (layer) settings,
//  structure tree (tagging), attachments and document JavaScript.
//  So form fields keep their appearance but are no longer fillable,
//  and content on layers that the source hid by default can show up.
// =============================================================

// ---------- object model ----------

export class PdfName { constructor(name) { this.name = name; } }
export class PdfString { constructor(bytes, hex = false) { this.bytes = bytes; this.hex = hex; } }
export class PdfRef { constructor(num, gen) { this.num = num; this.gen = gen; } }
export class PdfDict {
  constructor(map = new Map()) { this.map = map; }
  get(k) { return this.map.get(k); }
  set(k, v) { this.map.set(k, v); return this; }
  has(k) { return this.map.has(k); }
  delete(k) { this.map.delete(k); }
}
export class PdfStream { constructor(dict, data) { this.dict = dict; this.data = data; } }

// ---------- lexer / parser ----------

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of '()<>[]{}/%') DELIM[c.charCodeAt(0)] = 1;

const latin1 = new TextDecoder('latin1');
const enc = new TextEncoder();

function isDigit(c) { return c >= 48 && c <= 57; }

class Lexer {
  constructor(bytes, pos = 0) { this.b = bytes; this.pos = pos; }

  skipWs() {
    const b = this.b;
    for (;;) {
      while (this.pos < b.length && WS[b[this.pos]]) this.pos++;
      if (b[this.pos] === 37) { // % comment
        while (this.pos < b.length && b[this.pos] !== 10 && b[this.pos] !== 13) this.pos++;
        continue;
      }
      return;
    }
  }

  // Reads a bare token (number, keyword) without consuming delimiters.
  word() {
    const b = this.b;
    const start = this.pos;
    while (this.pos < b.length && !WS[b[this.pos]] && !DELIM[b[this.pos]]) this.pos++;
    return latin1.decode(b.subarray(start, this.pos));
  }

  // Peeks for "<int> <int> R" after an integer, restoring on miss.
  tryRef(num) {
    const save = this.pos;
    this.skipWs();
    if (isDigit(this.b[this.pos])) {
      const gen = this.word();
      this.skipWs();
      if (/^\d+$/.test(gen) && this.b[this.pos] === 82 /* R */ &&
          (this.pos + 1 >= this.b.length || WS[this.b[this.pos + 1]] || DELIM[this.b[this.pos + 1]])) {
        this.pos++;
        return new PdfRef(num, Number(gen));
      }
    }
    this.pos = save;
    return null;
  }

  value() {
    this.skipWs();
    const b = this.b;
    const c = b[this.pos];
    if (c === undefined) throw new Error('Unexpected end of PDF');
    if (c === 47) return this.name();
    if (c === 40) return this.literalString();
    if (c === 60) {
      if (b[this.pos + 1] === 60) return this.dict();
      return this.hexString();
    }
    if (c === 91) {
      this.pos++;
      const arr = [];
      for (;;) {
        this.skipWs();
        if (b[this.pos] === 93) { this.pos++; return arr; }
        if (this.pos >= b.length) throw new Error('Unterminated array');
        arr.push(this.value());
      }
    }
    if (c === 41 || c === 62 || c === 93 || c === 123 || c === 125) {
      this.pos++; // stray delimiter: skip rather than loop forever
      return null;
    }
    const w = this.word();
    if (w === 'true') return true;
    if (w === 'false') return false;
    if (w === 'null') return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) {
      if (/^\d+$/.test(w)) {
        const ref = this.tryRef(Number(w));
        if (ref) return ref;
      }
      return Number(w);
    }
    // Some producers write malformed numbers like "--5" or "0.0.1".
    const n = parseFloat(w.replace(/^[+-]+/, (m) => (m.length % 2 && m[0] === '-' ? '-' : '')));
    if (w && !Number.isNaN(n)) return n;
    return new Keyword(w);
  }

  name() {
    const b = this.b;
    this.pos++;
    const start = this.pos;
    while (this.pos < b.length && !WS[b[this.pos]] && !DELIM[b[this.pos]]) this.pos++;
    const raw = latin1.decode(b.subarray(start, this.pos));
    return new PdfName(raw.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
  }

  literalString() {
    const b = this.b;
    this.pos++;
    const out = [];
    let depth = 1;
    while (this.pos < b.length) {
      let c = b[this.pos++];
      if (c === 92) { // backslash
        c = b[this.pos++];
        switch (c) {
          case 110: out.push(10); break;
          case 114: out.push(13); break;
          case 116: out.push(9); break;
          case 98: out.push(8); break;
          case 102: out.push(12); break;
          case 13: if (b[this.pos] === 10) this.pos++; break; // line continuation
          case 10: break;
          default:
            if (c >= 48 && c <= 55) {
              let v = c - 48;
              for (let i = 0; i < 2 && b[this.pos] >= 48 && b[this.pos] <= 55; i++) v = v * 8 + b[this.pos++] - 48;
              out.push(v & 255);
            } else {
              out.push(c);
            }
        }
        continue;
      }
      if (c === 40) depth++;
      else if (c === 41 && --depth === 0) break;
      out.push(c);
    }
    return new PdfString(Uint8Array.from(out));
  }

  hexString() {
    const b = this.b;
    this.pos++;
    const digits = [];
    while (this.pos < b.length && b[this.pos] !== 62) {
      const c = b[this.pos++];
      const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
      if (v >= 0) digits.push(v);
    }
    this.pos++;
    if (digits.length % 2) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = (digits[2 * i] << 4) | digits[2 * i + 1];
    return new PdfString(out, true);
  }

  dict() {
    const b = this.b;
    this.pos += 2;
    const d = new PdfDict();
    for (;;) {
      this.skipWs();
      if (b[this.pos] === 62 && b[this.pos + 1] === 62) { this.pos += 2; return d; }
      if (this.pos >= b.length) throw new Error('Unterminated dictionary');
      const key = this.value();
      if (!(key instanceof PdfName)) {
        if (key instanceof Keyword) continue; // junk; resync on the next token
        continue;
      }
      this.skipWs();
      if (b[this.pos] === 62 && b[this.pos + 1] === 62) { d.set(key.name, null); continue; }
      d.set(key.name, this.value());
    }
  }
}

class Keyword { constructor(word) { this.word = word; } }

// Finds `needle` (ASCII) in bytes starting at `from`. Returns -1 if absent.
function indexOf(bytes, needle, from = 0, to = bytes.length) {
  const n = enc.encode(needle);
  const first = n[0];
  const end = Math.min(to, bytes.length) - n.length;
  outer: for (let i = from; i <= end; i++) {
    if (bytes[i] !== first) continue;
    for (let j = 1; j < n.length; j++) if (bytes[i + j] !== n[j]) continue outer;
    return i;
  }
  return -1;
}

function lastIndexOf(bytes, needle, from = bytes.length) {
  const n = enc.encode(needle);
  for (let i = Math.min(from, bytes.length - n.length); i >= 0; i--) {
    let ok = true;
    for (let j = 0; j < n.length; j++) if (bytes[i + j] !== n[j]) { ok = false; break; }
    if (ok) return i;
  }
  return -1;
}

// ---------- filters (only what xref + object streams need) ----------

async function inflate(data) {
  // FlateDecode is zlib. Read chunk by chunk so a stream with a bad
  // checksum or trailing junk still yields everything that decoded.
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } catch (err) {
    if (!total) throw err;
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

function unpredict(data, parms) {
  const predictor = num(parms?.get('Predictor'), 1);
  if (predictor < 10) return data; // TIFF predictor 2 never appears on xref/object streams in practice
  const colors = num(parms.get('Colors'), 1);
  const bpc = num(parms.get('BitsPerComponent'), 8);
  const columns = num(parms.get('Columns'), 1);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)];
    const src = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const row = out.subarray(r * rowLen, (r + 1) * rowLen);
    for (let i = 0; i < rowLen; i++) {
      const a = i >= bpp ? row[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      switch (type) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
      }
      row[i] = v & 255;
    }
    prev = row;
  }
  return out;
}

// `reader` resolves /Filter and /DecodeParms given as indirect references.
async function decodeStream(stream, reader) {
  const res = (v) => (reader ? reader.resolve(v) : v);
  let filters = await res(stream.dict.get('Filter'));
  let parms = await res(stream.dict.get('DecodeParms'));
  if (!filters) return stream.data;
  if (!Array.isArray(filters)) { filters = [filters]; parms = [parms]; }
  if (!Array.isArray(parms)) parms = [parms];
  let data = stream.data;
  for (let i = 0; i < filters.length; i++) {
    const f = (await res(filters[i]))?.name;
    const parm = await res(parms[i]);
    if (f === 'FlateDecode' || f === 'Fl') data = unpredict(await inflate(data), parm instanceof PdfDict ? parm : null);
    else throw new Error(`Unsupported filter ${f} on an internal stream`);
  }
  return data;
}

function num(v, fallback = 0) { return typeof v === 'number' ? v : fallback; }

// ---------- document reader ----------

export class PdfReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.xref = new Map(); // num -> { type: 1, offset } | { type: 2, stm, idx }
    this.cache = new Map();
    this.objStms = new Map();
    this.trailer = null;
    this.scanned = null;
  }

  static async load(bytes) {
    const r = new PdfReader(bytes);
    try {
      await r.readXrefChain();
    } catch {
      r.xref.clear();
      r.trailer = null;
    }
    if (!r.trailer || !(await r.catalogOk())) await r.rebuildFromScan();
    if (r.trailer.get('Encrypt')) {
      const err = new Error('This PDF is encrypted');
      err.code = 'ENCRYPTED';
      throw err;
    }
    return r;
  }

  async catalogOk() {
    try {
      const root = await this.resolve(this.trailer.get('Root'));
      return root instanceof PdfDict && !!(await this.resolve(root.get('Pages')));
    } catch {
      return false;
    }
  }

  async readXrefChain() {
    const b = this.bytes;
    const sx = lastIndexOf(b, 'startxref');
    if (sx < 0) throw new Error('No startxref');
    const lx = new Lexer(b, sx + 9);
    let offset = lx.value();
    const seen = new Set();
    while (typeof offset === 'number' && !seen.has(offset)) {
      seen.add(offset);
      const t = await this.readXrefSection(offset);
      if (!this.trailer) this.trailer = t;
      const stm = t.get('XRefStm');
      if (typeof stm === 'number' && !seen.has(stm)) {
        seen.add(stm);
        await this.readXrefSection(stm).catch(() => {});
      }
      offset = t.get('Prev');
    }
  }

  async readXrefSection(offset) {
    const b = this.bytes;
    const lx = new Lexer(b, offset);
    lx.skipWs();
    if (indexOf(b, 'xref', lx.pos, lx.pos + 4) === lx.pos) {
      lx.pos += 4;
      for (;;) {
        lx.skipWs();
        if (indexOf(b, 'trailer', lx.pos, lx.pos + 7) === lx.pos) {
          lx.pos += 7;
          const t = lx.value();
          if (!(t instanceof PdfDict)) throw new Error('Bad trailer');
          return t;
        }
        const start = Number(lx.word());
        lx.skipWs();
        const count = Number(lx.word());
        if (!Number.isInteger(start) || !Number.isInteger(count)) throw new Error('Bad xref subsection');
        for (let i = 0; i < count; i++) {
          lx.skipWs();
          const off = Number(lx.word());
          lx.skipWs();
          lx.word(); // generation
          lx.skipWs();
          const kind = lx.word();
          const n = start + i;
          // Free entries are skipped rather than recorded, so a hybrid
          // file's /XRefStm can still supply its compressed objects.
          if (kind === 'n' && off > 0 && !this.xref.has(n)) this.xref.set(n, { type: 1, offset: off });
        }
      }
    }
    // Cross-reference stream.
    const obj = this.parseObjectAt(offset);
    if (!(obj instanceof PdfStream) || obj.dict.get('Type')?.name !== 'XRef') throw new Error('Bad xref offset');
    const data = await decodeStream(obj, this);
    const w = obj.dict.get('W').map((x) => num(x));
    const size = num(obj.dict.get('Size'));
    const index = obj.dict.get('Index') || [0, size];
    const rowLen = w[0] + w[1] + w[2];
    let p = 0;
    const field = (width, dflt) => {
      if (!width) return dflt;
      let v = 0;
      for (let i = 0; i < width; i++) v = v * 256 + data[p++];
      return v;
    };
    for (let s = 0; s + 1 < index.length; s += 2) {
      for (let i = 0; i < index[s + 1] && p + rowLen <= data.length; i++) {
        const n = index[s] + i;
        const type = field(w[0], 1);
        const f2 = field(w[1], 0);
        const f3 = field(w[2], 0);
        if (this.xref.has(n)) continue;
        if (type === 1) this.xref.set(n, { type: 1, offset: f2 });
        else if (type === 2) this.xref.set(n, { type: 2, stm: f2, idx: f3 });
      }
    }
    return obj.dict;
  }

  // Parses "n g obj <value> [stream ... endstream] endobj" at a byte offset.
  parseObjectAt(offset, expectNum) {
    const b = this.bytes;
    const lx = new Lexer(b, offset);
    lx.skipWs();
    const n = Number(lx.word());
    lx.skipWs();
    lx.word();
    lx.skipWs();
    if (lx.word() !== 'obj' || (expectNum !== undefined && n !== expectNum)) throw new Error('Object header mismatch');
    const value = lx.value();
    lx.skipWs();
    if (value instanceof PdfDict && indexOf(b, 'stream', lx.pos, lx.pos + 6) === lx.pos) {
      let start = lx.pos + 6;
      if (b[start] === 13) start++;
      if (b[start] === 10) start++;
      let len = value.get('Length');
      if (len instanceof PdfRef) len = this.resolveSync(len);
      let end = typeof len === 'number' ? start + len : -1;
      const check = end >= start ? indexOf(b, 'endstream', end, end + 32) : -1;
      if (check < 0) {
        // /Length missing or wrong: fall back to the endstream keyword.
        end = indexOf(b, 'endstream', start);
        if (end < 0) end = b.length;
        if (b[end - 1] === 10) end--;
        if (b[end - 1] === 13) end--;
      }
      return new PdfStream(value, b.subarray(start, end));
    }
    return value;
  }

  // Synchronous resolve for /Length refs (always plain numbers in type-1 objects).
  resolveSync(ref) {
    const e = this.xref.get(ref.num) || this.scanned?.get(ref.num);
    if (e?.type !== 1) return undefined;
    try { return this.parseObjectAt(e.offset, ref.num); } catch { return undefined; }
  }

  async getObject(n) {
    if (this.cache.has(n)) return this.cache.get(n);
    let v = null;
    const e = this.xref.get(n);
    try {
      if (e?.type === 1) v = this.parseObjectAt(e.offset, n);
      else if (e?.type === 2) v = await this.fromObjStm(e.stm, e.idx, n);
    } catch {
      v = undefined;
    }
    if (v === undefined || (!e && n > 0)) {
      // Missing or broken entry: look for the object by scanning the file.
      if (!this.scanned) this.scan();
      const s = this.scanned.get(n);
      v = null;
      if (s) try { v = this.parseObjectAt(s.offset, n); } catch { v = null; }
    }
    this.cache.set(n, v);
    return v;
  }

  async fromObjStm(stmNum, idx, n) {
    let entry = this.objStms.get(stmNum);
    if (!entry) {
      const stm = await this.getObject(stmNum);
      if (!(stm instanceof PdfStream)) throw new Error('Bad object stream');
      const data = await decodeStream(stm, this);
      const count = num(stm.dict.get('N'));
      const first = num(stm.dict.get('First'));
      const lx = new Lexer(data);
      const offsets = [];
      for (let i = 0; i < count; i++) {
        lx.skipWs(); const on = Number(lx.word());
        lx.skipWs(); const off = Number(lx.word());
        offsets.push([on, off]);
      }
      entry = { data, first, offsets };
      this.objStms.set(stmNum, entry);
    }
    let pair = entry.offsets[idx];
    if (!pair || pair[0] !== n) pair = entry.offsets.find((p) => p[0] === n);
    if (!pair) throw new Error('Object not in stream');
    return new Lexer(entry.data, entry.first + pair[1]).value();
  }

  async resolve(v) {
    const seen = new Set();
    while (v instanceof PdfRef) {
      if (seen.has(v.num)) return null;
      seen.add(v.num);
      v = await this.getObject(v.num);
    }
    return v;
  }

  // Indexes every "n g obj" header in the file. Later definitions win,
  // matching how incremental updates append newer versions.
  scan() {
    const b = this.bytes;
    this.scanned = new Map();
    const re = /(\d+)[ \t\r\n\f\0]+(\d+)[ \t\r\n\f\0]+obj\b/g;
    // Latin-1 decode keeps a 1:1 byte/char mapping, so regex indices are byte offsets.
    const text = latin1.decode(b);
    let m;
    while ((m = re.exec(text))) {
      const prev = m.index > 0 ? text.charCodeAt(m.index - 1) : 32;
      if (prev >= 48 && prev <= 57) continue;
      this.scanned.set(Number(m[1]), { type: 1, offset: m.index });
    }
    return text;
  }

  async rebuildFromScan() {
    const text = this.scan();
    this.cache.clear();
    this.xref = new Map(this.scanned);
    // Objects packed in object streams are only reachable via those streams.
    for (const [n, e] of this.scanned) {
      let obj;
      try { obj = this.parseObjectAt(e.offset, n); } catch { continue; }
      if (obj instanceof PdfStream && obj.dict.get('Type')?.name === 'ObjStm') {
        try {
          const data = await decodeStream(obj, this);
          const lx = new Lexer(data);
          for (let i = 0; i < num(obj.dict.get('N')); i++) {
            lx.skipWs(); const on = Number(lx.word());
            lx.skipWs(); lx.word();
            if (!this.xref.has(on)) this.xref.set(on, { type: 2, stm: n, idx: i });
          }
        } catch { /* unreadable object stream */ }
      }
    }
    // Trailer: the last "trailer" dictionary, else any /Catalog object.
    let trailer = null;
    const ti = text.lastIndexOf('trailer');
    if (ti >= 0) {
      try {
        const t = new Lexer(this.bytes, ti + 7).value();
        if (t instanceof PdfDict) trailer = t;
      } catch { /* ignore */ }
    }
    if (!trailer || !(await this.withTrailer(trailer).catalogOk())) {
      trailer = null;
      for (const n of this.xref.keys()) {
        const o = await this.getObject(n);
        const d = o instanceof PdfStream ? o.dict : o;
        if (d instanceof PdfDict && d.get('Type')?.name === 'XRef' && d.get('Root')) {
          trailer = d;
        } else if (d instanceof PdfDict && d.get('Type')?.name === 'Catalog' && !trailer) {
          trailer = new PdfDict().set('Root', new PdfRef(n, 0));
        }
      }
    }
    if (!trailer) throw new Error('Could not find the PDF catalog');
    this.trailer = trailer;
  }

  withTrailer(t) { this.trailer = t; return this; }

  // Resolves a named destination (a name via the catalog's /Dests dict,
  // or a string via the /Names /Dests name tree) to an explicit array.
  async namedDest(key) {
    const root = await this.resolve(this.trailer.get('Root'));
    if (!(root instanceof PdfDict)) return null;
    let value = null;
    if (key instanceof PdfName) {
      const dests = await this.resolve(root.get('Dests'));
      if (dests instanceof PdfDict) value = dests.get(key.name);
    } else if (key instanceof PdfString) {
      if (!this.nameTree) {
        this.nameTree = new Map();
        const names = await this.resolve(root.get('Names'));
        if (names instanceof PdfDict) await this.flattenNameTree(names.get('Dests'), 0, new Set());
      }
      value = this.nameTree.get(latin1.decode(key.bytes)) ?? null;
    }
    value = await this.resolve(value);
    if (value instanceof PdfDict) value = await this.resolve(value.get('D'));
    return Array.isArray(value) ? value : null;
  }

  async flattenNameTree(nodeRef, depth, seen) {
    if (depth > 32) return;
    if (nodeRef instanceof PdfRef) {
      if (seen.has(nodeRef.num)) return;
      seen.add(nodeRef.num);
    }
    const node = await this.resolve(nodeRef);
    if (!(node instanceof PdfDict)) return;
    const pairs = await this.resolve(node.get('Names'));
    if (Array.isArray(pairs)) {
      for (let i = 0; i + 1 < pairs.length; i += 2) {
        const k = await this.resolve(pairs[i]);
        if (k instanceof PdfString && !this.nameTree.has(latin1.decode(k.bytes))) {
          this.nameTree.set(latin1.decode(k.bytes), pairs[i + 1]);
        }
      }
    }
    const kids = await this.resolve(node.get('Kids'));
    if (Array.isArray(kids)) for (const kid of kids) await this.flattenNameTree(kid, depth + 1, seen);
  }

  // Walks the page tree, returning [{ ref, dict, inherited }] in reading order.
  async pages() {
    const root = await this.resolve(this.trailer.get('Root'));
    const out = [];
    const seen = new Set();
    const walk = async (nodeRef, inherited, depth) => {
      if (depth > 64) return;
      const key = nodeRef instanceof PdfRef ? nodeRef.num : null;
      if (key !== null) {
        if (seen.has(key)) return;
        seen.add(key);
      }
      const node = await this.resolve(nodeRef);
      if (!(node instanceof PdfDict)) return;
      const inh = { ...inherited };
      for (const k of INHERITABLE) if (node.has(k)) inh[k] = node.get(k);
      const kids = await this.resolve(node.get('Kids'));
      const type = node.get('Type')?.name;
      if (type === 'Pages' || (type !== 'Page' && Array.isArray(kids))) {
        for (const kid of kids || []) await walk(kid, inh, depth + 1);
      } else {
        out.push({ ref: nodeRef instanceof PdfRef ? nodeRef : null, dict: node, inherited: inh });
      }
    };
    await walk(root.get('Pages'), {}, 0);
    return out;
  }
}

const INHERITABLE = ['Resources', 'MediaBox', 'CropBox', 'Rotate'];

// ---------- writer ----------

function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  if (!Number.isFinite(n)) return '0';
  let s = n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}

function fmtName(name) {
  let s = '/';
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (c < 33 || c > 126 || c === 35 || DELIM[c]) s += '#' + c.toString(16).padStart(2, '0');
    else s += name[i];
  }
  return s;
}

function fmtString(s) {
  if (s.hex) {
    let h = '<';
    for (const c of s.bytes) h += c.toString(16).padStart(2, '0');
    return h + '>';
  }
  let out = '(';
  for (const c of s.bytes) {
    if (c === 40 || c === 41 || c === 92) out += '\\' + String.fromCharCode(c);
    else if (c === 13) out += '\\r';
    else if (c === 10) out += '\\n';
    else out += String.fromCharCode(c);
  }
  return out + ')';
}

// Serializes a value to a Latin-1 string (each char is one output byte).
function serialize(v) {
  if (v === null || v === undefined) return 'null';
  if (v === true) return 'true';
  if (v === false) return 'false';
  if (typeof v === 'number') return fmtNum(v);
  if (v instanceof PdfName) return fmtName(v.name);
  if (v instanceof PdfString) return fmtString(v);
  if (v instanceof PdfRef) return `${v.num} ${v.gen} R`;
  if (Array.isArray(v)) return '[' + v.map(serialize).join(' ') + ']';
  if (v instanceof PdfDict) {
    let s = '<<';
    for (const [k, val] of v.map) s += fmtName(k) + ' ' + serialize(val);
    return s + '>>';
  }
  if (v instanceof Keyword) return v.word;
  return 'null';
}

function latin1Bytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 255;
  return out;
}

// PDF text string: PDFDocEncoding when ASCII, else UTF-16BE with BOM.
export function textString(str) {
  if (/^[\x20-\x7e]*$/.test(str)) return new PdfString(latin1Bytes(str));
  const out = [0xfe, 0xff];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    out.push(c >> 8, c & 255);
  }
  return new PdfString(Uint8Array.from(out), true);
}

class PdfWriter {
  constructor() {
    this.objects = [null]; // index = object number
  }
  alloc() { this.objects.push(undefined); return this.objects.length - 1; }
  set(n, value) { this.objects[n] = value; }
  add(value) { const n = this.alloc(); this.set(n, value); return new PdfRef(n, 0); }

  build(rootRef, infoRef) {
    const chunks = [];
    let size = 0;
    const push = (u8) => { chunks.push(u8); size += u8.length; };
    push(latin1Bytes('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'));
    const offsets = [0];
    for (let n = 1; n < this.objects.length; n++) {
      offsets[n] = size;
      const v = this.objects[n];
      if (v instanceof PdfStream) {
        v.dict.set('Length', v.data.length);
        push(latin1Bytes(`${n} 0 obj\n${serialize(v.dict)}\nstream\n`));
        push(v.data);
        push(latin1Bytes('\nendstream\nendobj\n'));
      } else {
        push(latin1Bytes(`${n} 0 obj\n${serialize(v ?? null)}\nendobj\n`));
      }
    }
    const xrefAt = size;
    let x = `xref\n0 ${this.objects.length}\n0000000000 65535 f \n`;
    for (let n = 1; n < this.objects.length; n++) x += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    x += `trailer\n<</Size ${this.objects.length}/Root ${rootRef.num} 0 R${infoRef ? `/Info ${infoRef.num} 0 R` : ''}>>\nstartxref\n${xrefAt}\n%%EOF\n`;
    push(latin1Bytes(x));
    const out = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

// Keys dropped from copied page dictionaries: tree plumbing that only
// made sense in the source document.
const PAGE_DROP = ['Parent', 'B', 'StructParents', 'PieceInfo', 'Metadata'];

// Explicit form of an internal link's destination: named destinations are
// looked up (the merged file has no name tree), and a bare page index,
// which some producers write, becomes the page's reference. The page
// reference is then remapped like any other when the link is copied.
async function explicitDest(reader, dest, all) {
  dest = await reader.resolve(dest);
  if (dest instanceof PdfName || dest instanceof PdfString) dest = await reader.namedDest(dest);
  if (!Array.isArray(dest)) return null;
  if (typeof dest[0] === 'number') {
    const ref = all[dest[0]]?.ref;
    return ref ? [ref, ...dest.slice(1)] : null;
  }
  return dest;
}

function withEntry(dict, key, value) {
  const out = new PdfDict(new Map(dict.map));
  return out.set(key, value);
}

// Returns the page's /Annots array with each internal link's destination
// made explicit. Rewritten annotation objects are registered in
// `overrides` so the copier writes them instead of the originals.
async function rewriteLinks(reader, annots, all, overrides) {
  const out = [];
  for (const entry of annots) {
    const annot = await reader.resolve(entry);
    let fixed = null;
    if (annot instanceof PdfDict && annot.get('Subtype')?.name === 'Link') {
      const action = await reader.resolve(annot.get('A'));
      if (annot.has('Dest')) {
        fixed = withEntry(annot, 'Dest', await explicitDest(reader, annot.get('Dest'), all));
      } else if (action instanceof PdfDict && action.get('S')?.name === 'GoTo') {
        fixed = withEntry(annot, 'A', withEntry(action, 'D', await explicitDest(reader, action.get('D'), all)));
      }
    }
    if (fixed && entry instanceof PdfRef) overrides.set(entry.num, fixed);
    out.push(fixed && !(entry instanceof PdfRef) ? fixed : entry);
  }
  return out;
}

// Removes internal links whose target page was not included, or whose
// destination could not be resolved. Left in, viewers treat the broken
// destination as "page 1".
function dropDeadLinks(page, writer) {
  const annots = page.get('Annots');
  if (!Array.isArray(annots)) return;
  const deref = (v) => (v instanceof PdfRef ? writer.objects[v.num] : v);
  const kept = annots.filter((entry) => {
    const annot = deref(entry);
    if (!(annot instanceof PdfDict) || annot.get('Subtype')?.name !== 'Link') return true;
    const action = deref(annot.get('A'));
    let dest;
    if (annot.has('Dest')) dest = deref(annot.get('Dest'));
    else if (action instanceof PdfDict && action.get('S')?.name === 'GoTo') dest = deref(action.get('D'));
    else return true; // URI and other actions are unaffected
    return Array.isArray(dest) && dest[0] instanceof PdfRef;
  });
  if (kept.length !== annots.length) page.set('Annots', kept);
}

async function copyDocumentPages(reader, src, writer, pagesRef, onPage) {
  const all = await reader.pages();
  const wanted = (src.pages && src.pages.length ? src.pages : all.map((_, i) => i)).filter((i) => all[i]);

  // Page objects in this document -> their new refs (null = not included).
  const pageMap = new Map();
  for (const p of all) if (p.ref) pageMap.set(p.ref.num, null);
  const newPageRefs = wanted.map((i) => {
    const ref = new PdfRef(writer.alloc(), 0);
    // A page listed twice keeps its first copy as the link target.
    if (all[i].ref && !pageMap.get(all[i].ref.num)) pageMap.set(all[i].ref.num, ref);
    return ref;
  });

  const copied = new Map(); // src obj num -> new ref
  const overrides = new Map(); // src obj num -> rewritten object to copy instead
  const queue = [];

  const copyValue = async (v) => {
    if (v instanceof PdfRef) {
      if (pageMap.has(v.num)) return pageMap.get(v.num);
      if (copied.has(v.num)) return copied.get(v.num);
      const target = overrides.has(v.num) ? overrides.get(v.num) : await reader.getObject(v.num);
      const td = target instanceof PdfDict ? target : null;
      const t = td?.get('Type')?.name;
      if (t === 'Pages') return pagesRef;
      if (t === 'Page') return null; // a page outside the page tree
      const ref = new PdfRef(writer.alloc(), 0);
      copied.set(v.num, ref);
      queue.push([ref.num, target]);
      return ref;
    }
    if (Array.isArray(v)) {
      const out = [];
      for (const x of v) out.push(await copyValue(x));
      return out;
    }
    if (v instanceof PdfDict) {
      const out = new PdfDict();
      for (const [k, x] of v.map) out.set(k, await copyValue(x));
      return out;
    }
    if (v instanceof PdfStream) {
      const d = await copyValue(v.dict);
      return new PdfStream(d, v.data);
    }
    return v;
  };

  const drain = async () => {
    while (queue.length) {
      const [n, target] = queue.shift();
      writer.set(n, await copyValue(target));
    }
  };

  for (let k = 0; k < wanted.length; k++) {
    const { dict, inherited } = all[wanted[k]];
    const page = new PdfDict();
    for (const [key, val] of dict.map) if (!PAGE_DROP.includes(key)) page.set(key, val);
    for (const key of INHERITABLE) if (!page.has(key) && inherited[key] !== undefined) page.set(key, inherited[key]);
    if (!page.has('MediaBox')) page.set('MediaBox', [0, 0, 612, 792]);
    if (!page.has('Resources')) page.set('Resources', new PdfDict());
    const annots = await reader.resolve(page.get('Annots'));
    if (Array.isArray(annots)) page.set('Annots', await rewriteLinks(reader, annots, all, overrides));
    const copy = await copyValue(page);
    copy.set('Type', new PdfName('Page'));
    copy.set('Parent', pagesRef);
    if (src.rotate) {
      const base = num(await reader.resolve(dict.get('Rotate') ?? inherited.Rotate), 0);
      copy.set('Rotate', (((base + src.rotate) % 360) + 360) % 360);
    }
    writer.set(newPageRefs[k].num, copy);
    await drain();
    dropDeadLinks(copy, writer);
    onPage?.();
  }
  return newPageRefs;
}

// One page per image. Each image is
//   { data (or legacy `jpeg`): Uint8Array, filter?: 'DCTDecode' (default)
//     | 'FlateDecode', width, height, colorSpace?: 'DeviceRGB' (default)
//     | 'DeviceGray' | 'DeviceCMYK', decode?: number[], smask?: Uint8Array
//     (Flate-compressed 8-bit alpha, same width/height), pageWidth,
//     pageHeight, matrix?: [a b c d e f] placing the unit square
//     (default: fill the page) }
function imagePages(src, writer, pagesRef, onPage) {
  const refs = [];
  for (const img of src.images) {
    const dict = new PdfDict()
      .set('Type', new PdfName('XObject'))
      .set('Subtype', new PdfName('Image'))
      .set('Width', img.width)
      .set('Height', img.height)
      .set('ColorSpace', new PdfName(img.colorSpace || 'DeviceRGB'))
      .set('BitsPerComponent', 8)
      .set('Filter', new PdfName(img.filter || 'DCTDecode'));
    if (img.decode) dict.set('Decode', img.decode);
    if (img.smask) {
      dict.set('SMask', writer.add(new PdfStream(new PdfDict()
        .set('Type', new PdfName('XObject'))
        .set('Subtype', new PdfName('Image'))
        .set('Width', img.width)
        .set('Height', img.height)
        .set('ColorSpace', new PdfName('DeviceGray'))
        .set('BitsPerComponent', 8)
        .set('Filter', new PdfName('FlateDecode')), img.smask)));
    }
    const imgRef = writer.add(new PdfStream(dict, img.data || img.jpeg));
    const w = img.pageWidth, h = img.pageHeight;
    const m = img.matrix || [w, 0, 0, h, 0, 0];
    const content = writer.add(new PdfStream(new PdfDict(), latin1Bytes(`q ${m.map(fmtNum).join(' ')} cm /Im0 Do Q`)));
    const page = new PdfDict()
      .set('Type', new PdfName('Page'))
      .set('Parent', pagesRef)
      .set('MediaBox', [0, 0, w, h])
      .set('Resources', new PdfDict().set('XObject', new PdfDict().set('Im0', imgRef)))
      .set('Contents', content);
    if (src.rotate) page.set('Rotate', src.rotate);
    refs.push(writer.add(page));
    onPage?.();
  }
  return refs;
}

// ---------- packet features: contents page and page stamps ----------

// Helvetica advance widths (1/1000 em) for ASCII 32-126, from the
// standard AFM. Anything else is measured as 556.
const HELV = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];

function textWidth(str, size) {
  let w = 0;
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? HELV[c - 32] : 556;
  }
  return (w * size) / 1000;
}

// WinAnsiEncoding bytes for the built-in fonts: Latin-1 plus the common
// typographic characters; anything else becomes '?'.
const WIN_ANSI_EXTRA = { '\u20ac': 0x80, '\u2026': 0x85, '\u2018': 0x91, '\u2019': 0x92, '\u201c': 0x93,
  '\u201d': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u2122': 0x99 };
function winAnsi(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c < 127) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else if (WIN_ANSI_EXTRA[ch]) out.push(WIN_ANSI_EXTRA[ch]);
    else out.push(63);
  }
  return fmtString(new PdfString(Uint8Array.from(out)));
}

// Shortens `str` with an ellipsis so it fits in `max` points.
function fitText(str, size, max) {
  if (textWidth(str, size) <= max) return str;
  let s = str;
  while (s.length > 1 && textWidth(s + '…', size) > max) s = s.slice(0, -1);
  return s + '…';
}

function builtinFont(writer, cache, base) {
  if (!cache[base]) {
    cache[base] = writer.add(new PdfDict()
      .set('Type', new PdfName('Font'))
      .set('Subtype', new PdfName('Type1'))
      .set('BaseFont', new PdfName(base))
      .set('Encoding', new PdfName('WinAnsiEncoding')));
  }
  return cache[base];
}

const TOC_MARGIN = 72;
const TOC_LINE = 20;
function tocLinesPerPage(h) {
  return Math.max(1, Math.floor((h - 2 * TOC_MARGIN - 44) / TOC_LINE));
}

// Builds the contents page(s): a title, then one line per entry with a
// dot leader and its page number, each line a link to that page.
function contentsPages(writer, pagesRef, fonts, entries, size) {
  const [w, h] = size;
  const perPage = tocLinesPerPage(h);
  const regular = builtinFont(writer, fonts, 'Helvetica');
  const bold = builtinFont(writer, fonts, 'Helvetica-Bold');
  const refs = [];
  for (let start = 0; start < entries.length || start === 0; start += perPage) {
    const chunk = entries.slice(start, start + perPage);
    let ops = `BT /F2 20 Tf ${TOC_MARGIN} ${fmtNum(h - TOC_MARGIN - 20)} Td ${winAnsi(start ? 'Contents (continued)' : 'Contents')} Tj ET\n`;
    const annots = [];
    chunk.forEach((e, i) => {
      const y = h - TOC_MARGIN - 44 - i * TOC_LINE;
      const num = String(e.pageNumber);
      const numW = textWidth(num, 12);
      const right = w - TOC_MARGIN;
      const title = fitText(e.title, 12, right - TOC_MARGIN - numW - 40);
      const titleW = textWidth(title, 12);
      const dots = Math.max(0, Math.floor((right - numW - 8 - (TOC_MARGIN + titleW + 8)) / textWidth('.', 12)));
      ops += `BT /F1 12 Tf ${TOC_MARGIN} ${fmtNum(y)} Td ${winAnsi(title)} Tj ET\n`;
      if (dots) ops += `0.6 g BT /F1 12 Tf ${fmtNum(right - numW - 4 - dots * textWidth('.', 12))} ${fmtNum(y)} Td (${'.'.repeat(dots)}) Tj ET 0 g\n`;
      ops += `BT /F1 12 Tf ${fmtNum(right - numW)} ${fmtNum(y)} Td (${num}) Tj ET\n`;
      annots.push(writer.add(new PdfDict()
        .set('Type', new PdfName('Annot'))
        .set('Subtype', new PdfName('Link'))
        .set('Rect', [TOC_MARGIN, y - 5, right, y + 14])
        .set('Border', [0, 0, 0])
        .set('Dest', [e.page, new PdfName('Fit')])));
    });
    const page = new PdfDict()
      .set('Type', new PdfName('Page'))
      .set('Parent', pagesRef)
      .set('MediaBox', [0, 0, w, h])
      .set('Resources', new PdfDict().set('Font', new PdfDict().set('F1', regular).set('F2', bold)))
      .set('Contents', writer.add(new PdfStream(new PdfDict(), latin1Bytes(ops))));
    if (annots.length) page.set('Annots', annots);
    refs.push(writer.add(page));
    if (!entries.length) break;
  }
  return refs;
}

// Draws `text` along the visual bottom edge of a page, upright however
// the page is rotated. The page's own content is wrapped in q/Q so its
// graphics state can't leak into the stamp.
function stampPage(writer, pageRef, text, position, fontRef) {
  const deref = (v) => (v instanceof PdfRef ? writer.objects[v.num] : v);
  const page = writer.objects[pageRef.num];
  const rawBox = deref(page.get('CropBox')) || deref(page.get('MediaBox')) || [0, 0, 612, 792];
  const b = rawBox.map((v) => num(deref(v)));
  const x1 = Math.min(b[0], b[2]), y1 = Math.min(b[1], b[3]);
  const W = Math.abs(b[2] - b[0]), H = Math.abs(b[3] - b[1]);
  const r = ((Math.round(num(deref(page.get('Rotate'))) / 90) * 90) % 360 + 360) % 360;
  const vw = r % 180 ? H : W; // visual width
  const size = 9;
  const tw = textWidth(text, size);
  const edge = Math.min(24, vw / 20);
  const vx = position === 'right' ? vw - edge - tw : (vw - tw) / 2;
  const vy = Math.min(18, (r % 180 ? W : H) / 30);
  // Visual (vx, vy) -> user space, for each clockwise display rotation.
  const m = {
    0: [1, 0, 0, 1, x1 + vx, y1 + vy],
    90: [0, 1, -1, 0, x1 + W - vy, y1 + vx],
    180: [-1, 0, 0, -1, x1 + W - vx, y1 + H - vy],
    270: [0, -1, 1, 0, x1 + vy, y1 + H - vx],
  }[r];

  const res = deref(page.get('Resources'));
  const fonts = res instanceof PdfDict ? deref(res.get('Font')) : null;
  const newFonts = new PdfDict(new Map(fonts instanceof PdfDict ? fonts.map : [])).set('RoFmStamp', fontRef);
  page.set('Resources', new PdfDict(new Map(res instanceof PdfDict ? res.map : [])).set('Font', newFonts));

  const contents = page.get('Contents');
  const list = contents === undefined || contents === null ? [] : Array.isArray(deref(contents)) ? deref(contents) : [contents];
  const open = writer.add(new PdfStream(new PdfDict(), latin1Bytes('q\n')));
  const stamp = writer.add(new PdfStream(new PdfDict(), latin1Bytes(
    `\nQ\nq 0 g BT /RoFmStamp ${size} Tf ${m.map(fmtNum).join(' ')} Tm ${winAnsi(text)} Tj ET Q\n`)));
  page.set('Contents', [open, ...list, stamp]);
}

/** Counts pages and reports encryption without copying anything. */
export async function inspectPdf(bytes) {
  try {
    const reader = await PdfReader.load(bytes);
    return { pageCount: (await reader.pages()).length, encrypted: false };
  } catch (err) {
    if (err.code === 'ENCRYPTED') return { pageCount: 0, encrypted: true };
    throw err;
  }
}

/**
 * Merge PDFs (and rasterized page images) into one PDF.
 * @param {Array<{bytes?: Uint8Array, images?: object[], name?: string, pages?: number[], rotate?: number}>} sources
 * @param {{ bookmarks?: boolean, title?: string, onProgress?: (ratio: number) => void,
 *   contents?: boolean | { pageSize?: [number, number] },
 *   stamp?: { text: (pageIndex: number, pageCount: number) => string, position?: 'center' | 'right' } }} [opts]
 * @returns {Promise<Uint8Array>}
 */
export async function mergePdfs(sources, opts = {}) {
  const writer = new PdfWriter();
  const catalogNum = writer.alloc();
  const pagesRef = new PdfRef(writer.alloc(), 0);

  const readers = [];
  let totalPages = 0;
  for (const src of sources) {
    if (src.images) {
      readers.push(null);
      totalPages += src.images.length;
    } else {
      const r = await PdfReader.load(src.bytes);
      readers.push(r);
      totalPages += src.pages?.length || (await r.pages()).length;
    }
  }

  let done = 0;
  const tick = () => opts.onProgress?.(totalPages ? ++done / totalPages : 1);
  let kids = [];
  const firstPageOf = [];
  const startOf = [];
  for (let i = 0; i < sources.length; i++) {
    const refs = readers[i]
      ? await copyDocumentPages(readers[i], sources[i], writer, pagesRef, tick)
      : imagePages(sources[i], writer, pagesRef, tick);
    firstPageOf.push(refs[0] || null);
    startOf.push(kids.length);
    kids.push(...refs);
  }
  if (!kids.length) throw new Error('No pages to merge');

  const fonts = {};
  let tocRefs = [];
  if (opts.contents) {
    const size = opts.contents.pageSize || [612, 792];
    const items = sources.map((s, i) => ({ title: s.name || `Document ${i + 1}`, page: firstPageOf[i], start: startOf[i] }))
      .filter((x) => x.page);
    const tocCount = Math.max(1, Math.ceil(items.length / tocLinesPerPage(size[1])));
    for (const it of items) it.pageNumber = tocCount + it.start + 1;
    tocRefs = contentsPages(writer, pagesRef, fonts, items, size);
    kids = [...tocRefs, ...kids];
  }
  if (opts.stamp) {
    const font = builtinFont(writer, fonts, 'Helvetica');
    kids.forEach((ref, i) => stampPage(writer, ref, opts.stamp.text(i, kids.length), opts.stamp.position || 'center', font));
  }
  writer.set(pagesRef.num, new PdfDict()
    .set('Type', new PdfName('Pages'))
    .set('Kids', kids)
    .set('Count', kids.length));

  const catalog = new PdfDict().set('Type', new PdfName('Catalog')).set('Pages', pagesRef);
  if (opts.bookmarks) {
    const items = sources
      .map((s, i) => ({ title: s.name || `Document ${i + 1}`, page: firstPageOf[i] }))
      .filter((x) => x.page);
    if (tocRefs.length) items.unshift({ title: 'Contents', page: tocRefs[0] });
    if (items.length) {
      const outlinesNum = writer.alloc();
      const nums = items.map(() => writer.alloc());
      items.forEach((it, i) => {
        const d = new PdfDict()
          .set('Title', textString(it.title))
          .set('Parent', new PdfRef(outlinesNum, 0))
          .set('Dest', [it.page, new PdfName('Fit')]);
        if (i > 0) d.set('Prev', new PdfRef(nums[i - 1], 0));
        if (i < nums.length - 1) d.set('Next', new PdfRef(nums[i + 1], 0));
        writer.set(nums[i], d);
      });
      writer.set(outlinesNum, new PdfDict()
        .set('Type', new PdfName('Outlines'))
        .set('First', new PdfRef(nums[0], 0))
        .set('Last', new PdfRef(nums[nums.length - 1], 0))
        .set('Count', nums.length));
      catalog.set('Outlines', new PdfRef(outlinesNum, 0));
      catalog.set('PageMode', new PdfName('UseOutlines'));
    }
  }
  writer.set(catalogNum, catalog);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `D:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const info = new PdfDict()
    .set('Producer', textString('RodmanOffice FileMerger'))
    .set('CreationDate', new PdfString(latin1Bytes(stamp)));
  if (opts.title) info.set('Title', textString(opts.title));
  const infoRef = writer.add(info);

  return writer.build(new PdfRef(catalogNum, 0), infoRef);
}

/**
 * Parses a page selection like "1-3, 5, 8-" against a page count.
 * Returns 0-based indices, or null when the text is blank (= all pages).
 * Throws on malformed input.
 */
export function parsePageRanges(text, pageCount) {
  const t = String(text || '').trim();
  if (!t) return null;
  const out = [];
  // Join "1 - 3" into "1-3" before splitting, so spaces around a dash don't
  // turn a range into two pages plus a bare "-".
  for (const part of t.replace(/\s*[-–]\s*/g, '-').split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d*)-(\d*)$/.exec(part) || /^(\d+)$/.exec(part);
    if (!m || part === '-') throw new Error(`"${part}" is not a page or range`);
    let a, b;
    if (m.length === 2) { a = b = Number(m[1]); }
    else { a = m[1] ? Number(m[1]) : 1; b = m[2] ? Number(m[2]) : pageCount; }
    const bad = [a, b].find((p) => p < 1 || p > pageCount);
    if (bad !== undefined) throw new Error(`Page ${bad} is out of range (1-${pageCount})`);
    const step = a <= b ? 1 : -1;
    for (let p = a; ; p += step) { out.push(p - 1); if (p === b) break; }
  }
  return out;
}
