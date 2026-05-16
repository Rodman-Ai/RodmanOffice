// SVG writer.
//
// Vector SVG generation from a raster canvas isn't well-defined (would
// require trace + path detection). Instead this writer emits an SVG
// document that wraps the canvas's PNG as an `<image>` element with a
// base64 data URI — semantically lossless and openable in every browser
// + every vector-aware editor. The encoder is exposed as
// `encodeSVG(canvas)` and returns a Blob the same way every other
// `lib/images/*.js` encoder does.

export async function encodeSVG(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const dataUrl = canvas.toDataURL('image/png');
  const svg =
    '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `xmlns:xlink="http://www.w3.org/1999/xlink" ` +
    `width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    `  <image href="${dataUrl}" width="${w}" height="${h}" ` +
    `preserveAspectRatio="none"/>\n` +
    '</svg>\n';
  return new Blob([svg], { type: 'image/svg+xml' });
}
