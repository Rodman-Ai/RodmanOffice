/* =========================================================
   IO — portable image decode / encode / transform module

   Zero dependencies on the editor's state, ctx, or DOM beyond
   what each function explicitly takes. Drop this file into any
   project that needs to read images from disk and write them
   back as PNG / JPEG / WebP / BMP / ICO.

   Public API on window.IO:
     decodeFile(file)          -> Promise<{canvas,width,height,mime,name}>
     decodeBlob(blob)          -> Promise<{canvas,width,height,mime,name}>
     decodeDataURL(dataURL)    -> Promise<{canvas,width,height,mime,name}>
     decodeURL(url)            -> Promise<{canvas,width,height,mime,name}>

     encodePNG(canvas)                     -> Promise<Blob>
     encodeJPEG(canvas, quality=0.92)      -> Promise<Blob>
     encodeWebP(canvas, quality=0.92)      -> Promise<Blob>
     encodeBMP(canvas)                     -> Blob   (synchronous)
     encodeICO(canvas, sizes=[16,32,48])   -> Promise<Blob>

     to1Bit(imageData, opts?)              -> ImageData (new)
     resize(canvas, scale, opts?)          -> HTMLCanvasElement (new)
     composeSpriteSheet(frames, opts?)     -> HTMLCanvasElement

     triggerDownload(blob, filename)
     suggestFilename(originalName, newExt) -> string
   ========================================================= */
(function (global) {
  'use strict';

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

  function canvasToBlob(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      if (canvas.toBlob) {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('toBlob produced no result for ' + mime));
        }, mime, quality);
      } else {
        // Fallback for very old browsers: decode dataURL into a Blob.
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
  function encodePNG(canvas) { return canvasToBlob(canvas, 'image/png'); }
  function encodeJPEG(canvas, quality) {
    return canvasToBlob(canvas, 'image/jpeg', quality == null ? 0.92 : quality);
  }
  function encodeWebP(canvas, quality) {
    return canvasToBlob(canvas, 'image/webp', quality == null ? 0.92 : quality);
  }

  // BMP — 24-bit BGR, BITMAPINFOHEADER, bottom-up rows, 4-byte aligned.
  // Synchronous because we already have all pixels in memory.
  function encodeBMP(canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    const rowSize = (w * 3 + 3) & ~3;          // pad each row to multiple of 4
    const pixelArraySize = rowSize * h;
    const fileSize = 14 + 40 + pixelArraySize;
    const buf = new ArrayBuffer(fileSize);
    const view = new DataView(buf);
    const u8 = new Uint8Array(buf);

    // BITMAPFILEHEADER (14 bytes)
    view.setUint8(0, 0x42); view.setUint8(1, 0x4d);   // 'BM'
    view.setUint32(2, fileSize, true);
    view.setUint32(6, 0, true);                       // reserved
    view.setUint32(10, 14 + 40, true);                // pixel data offset

    // BITMAPINFOHEADER (40 bytes)
    view.setUint32(14, 40, true);                     // header size
    view.setInt32(18, w, true);
    view.setInt32(22, h, true);                       // positive => bottom-up
    view.setUint16(26, 1, true);                      // planes
    view.setUint16(28, 24, true);                     // bits per pixel
    view.setUint32(30, 0, true);                      // BI_RGB (no compression)
    view.setUint32(34, pixelArraySize, true);
    view.setUint32(38, 2835, true);                   // x ppm (~72 dpi)
    view.setUint32(42, 2835, true);                   // y ppm
    view.setUint32(46, 0, true);                      // colors used
    view.setUint32(50, 0, true);                      // important colors

    let dst = 14 + 40;
    for (let y = h - 1; y >= 0; y--) {
      let src = y * w * 4;
      for (let x = 0; x < w; x++) {
        u8[dst++] = data[src + 2];                    // B
        u8[dst++] = data[src + 1];                    // G
        u8[dst++] = data[src];                        // R
        src += 4;
      }
      // pad row
      const pad = rowSize - w * 3;
      for (let p = 0; p < pad; p++) u8[dst++] = 0;
    }
    return new Blob([buf], { type: 'image/bmp' });
  }

  // ICO — wraps one or more PNG-encoded entries inside an .ico container.
  // PNG-in-ICO is the modern, lossless approach (Vista+); avoids palette
  // quantization and supports alpha cleanly.
  async function encodeICO(canvas, sizes) {
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

    // ICONDIR
    view.setUint16(0, 0, true);                       // reserved
    view.setUint16(2, 1, true);                       // type = 1 (icon)
    view.setUint16(4, entries.length, true);          // image count

    let dataOffset = headerSize + dirEntrySize * entries.length;
    let entryOffset = headerSize;
    for (const e of entries) {
      // ICONDIRENTRY
      view.setUint8(entryOffset + 0, e.size === 256 ? 0 : e.size);   // width
      view.setUint8(entryOffset + 1, e.size === 256 ? 0 : e.size);   // height
      view.setUint8(entryOffset + 2, 0);              // color count (0 = >256)
      view.setUint8(entryOffset + 3, 0);              // reserved
      view.setUint16(entryOffset + 4, 1, true);       // color planes
      view.setUint16(entryOffset + 6, 32, true);      // bits per pixel
      view.setUint32(entryOffset + 8, e.bytes.length, true);   // size
      view.setUint32(entryOffset + 12, dataOffset, true);      // file offset
      // payload
      u8.set(e.bytes, dataOffset);
      dataOffset += e.bytes.length;
      entryOffset += dirEntrySize;
    }
    return new Blob([buf], { type: 'image/x-icon' });
  }

  // ---------- pure transforms ----------

  // Bayer 4x4 ordered-dither matrix (values 0..15).
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

  // Stitches an array of ImageData frames into a single canvas. Layout
  // 'vertical' stacks them top-to-bottom; 'horizontal' lays them left-to-
  // right; 'grid' arranges into a near-square grid (cols = ceil(sqrt(n))).
  // Frames must all share the same width/height; the first frame's size
  // is used.
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
    // Allow the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function suggestFilename(originalName, newExt) {
    const base = (originalName || 'image').replace(/\.[^.]+$/, '');
    const ext = (newExt || '').replace(/^\.+/, '');
    return ext ? base + '.' + ext : base;
  }

  // ---------- export ----------
  global.IO = {
    decodeFile, decodeBlob, decodeDataURL, decodeURL,
    encodePNG, encodeJPEG, encodeWebP, encodeBMP, encodeICO,
    to1Bit, resize, composeSpriteSheet,
    triggerDownload, suggestFilename
  };
})(window);
