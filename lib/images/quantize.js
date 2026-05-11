// =============================================================
//  Median-cut palette quantization.
//
//  Reduces a canvas to N distinct colours. Hand-rolled, no vendor
//  deps. Used by the converter / image-editor "Colors" option to
//  produce smaller PNG / GIF / ICO outputs (and to give the user
//  posterized retro looks on demand).
//
//  Public API:
//    quantizeCanvas(canvas, colors)     -> HTMLCanvasElement
//    quantizeImageData(imageData, colors) -> ImageData
// =============================================================

function bucketStats(pixels, indices) {
  let rMin = 255, gMin = 255, bMin = 255;
  let rMax = 0,   gMax = 0,   bMax = 0;
  let rSum = 0,   gSum = 0,   bSum = 0;
  for (const i of indices) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    rSum += r; gSum += g; bSum += b;
  }
  const n = indices.length || 1;
  return {
    range: [rMax - rMin, gMax - gMin, bMax - bMin],
    avg: [Math.round(rSum / n), Math.round(gSum / n), Math.round(bSum / n)],
  };
}

function splitBucket(pixels, bucket) {
  const stats = bucketStats(pixels, bucket);
  const channel = stats.range.indexOf(Math.max(...stats.range));
  const sorted = bucket.slice().sort((a, b) => pixels[a + channel] - pixels[b + channel]);
  const mid = sorted.length >> 1;
  return [sorted.slice(0, mid), sorted.slice(mid)];
}

export function quantizeImageData(imageData, colors) {
  const target = Math.max(2, Math.min(256, colors | 0));
  const data = imageData.data;
  // Collect indices of opaque pixels only — fully transparent ones
  // stay transparent and don't contribute to the palette.
  const opaque = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) opaque.push(i);
  }
  if (!opaque.length) return imageData;

  let buckets = [opaque];
  while (buckets.length < target) {
    // Split the bucket with the largest single-channel range.
    let bestIdx = -1, bestRange = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      const r = bucketStats(data, buckets[i]).range;
      const m = Math.max(r[0], r[1], r[2]);
      if (m > bestRange) { bestRange = m; bestIdx = i; }
    }
    if (bestIdx < 0) break;
    const [a, b] = splitBucket(data, buckets[bestIdx]);
    if (!a.length || !b.length) break;
    buckets.splice(bestIdx, 1, a, b);
  }

  // One palette entry per bucket = the bucket's average colour.
  const palette = buckets.map((bucket) => bucketStats(data, bucket).avg);

  // Re-map every opaque pixel to its nearest palette entry.
  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < out.length; i += 4) {
    if (out[i + 3] === 0) continue;
    const r = out[i], g = out[i + 1], b = out[i + 2];
    let best = 0, bestDist = Infinity;
    for (let p = 0; p < palette.length; p++) {
      const [pr, pg, pb] = palette[p];
      const dr = r - pr, dg = g - pg, db = b - pb;
      const d = dr * dr + dg * dg + db * db;
      if (d < bestDist) { bestDist = d; best = p; }
    }
    out[i] = palette[best][0];
    out[i + 1] = palette[best][1];
    out[i + 2] = palette[best][2];
  }
  return new ImageData(out, imageData.width, imageData.height);
}

export function quantizeCanvas(canvas, colors) {
  const ctx = canvas.getContext('2d');
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const quant = quantizeImageData(src, colors);
  const out = document.createElement('canvas');
  out.width = canvas.width;
  out.height = canvas.height;
  out.getContext('2d').putImageData(quant, 0, 0);
  return out;
}
