// =============================================================
//  Image I/O — open any browser-decodable image into a canvas;
//  encode a canvas to a Blob in PNG, JPEG or WEBP.
//
//  Browser-native only: relies on the Image() decoder for input
//  (PNG, JPEG, GIF, BMP, WEBP, SVG) and HTMLCanvasElement.toBlob
//  for output. GIF and BMP encoding are not supported by the
//  Canvas API and are intentionally out of scope here.
// =============================================================

const ENCODABLE = new Set(['image/png', 'image/jpeg', 'image/webp']);

async function decodeToCanvas(bytes, mime) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Image decode failed'));
      im.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas, mime, quality) {
  if (!ENCODABLE.has(mime)) {
    return Promise.reject(new Error(`Cannot encode to ${mime} — supported: ${[...ENCODABLE].join(', ')}`));
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Canvas encode failed'))),
      mime,
      quality
    );
  });
}

async function convertImage(bytes, sourceMime, targetMime, opts = {}) {
  const canvas = await decodeToCanvas(bytes, sourceMime);
  if (targetMime === 'image/jpeg' && hasAlpha(canvas)) {
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

function hasAlpha(canvas) {
  const ctx = canvas.getContext('2d');
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) return true;
  }
  return false;
}

export { decodeToCanvas, canvasToBlob, convertImage };
