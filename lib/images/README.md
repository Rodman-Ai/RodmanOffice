# Shared Image Engines

`lib/images` contains browser-side image import/export helpers used by the
Image Editor and Converter apps. The app shells stay static; this folder owns
file-format bridges that are shared across the suite.

## Public surface

| File | Purpose |
|---|---|
| `index.js` | Re-exports the shared image API. |
| `image-io.js` | Canvas-based raster decode/encode helpers for PNG, JPEG, WebP, BMP, ICO, SVG, and general image conversion. |
| `psd.js` | PSD/PSB read/write facade around vendored `ag-psd`. |
| `pdf.js` | PDF page rasterization and single-image PDF export using vendored PDF.js. |
| `decode.js` | Hand-rolled decoders for formats browsers can't open: TIFF, Netpbm, TGA, PCX, SGI, Sun raster, Farbfeld, WBMP, XBM, XPM, Radiance HDR, ICNS. `image-io.js` `decodeFile` / `decodeToCanvas` fall back to it, so everything the suite writes it can read back. |
| `pdf-image.js` | Images as PDF pages for `lib/docs/pdfmerge.js`: JPEG passed through byte-for-byte (EXIF orientation applied), other formats lossless; page layout. Used by FileMerger and the Converter's image → PDF. |

## Vendored Dependencies

| Dependency | Vendored file(s) | Version | License | Used for |
|---|---|---:|---|---|
| `ag-psd` | `vendor/ag-psd.mjs` | 30.1.1 | MIT | PSD/PSB read/write. |
| PDF.js | `vendor/pdfjs/pdf.mjs`, `vendor/pdfjs/pdf.worker.mjs` | 4.10.38 | Apache-2.0 | Rasterizing PDF pages to canvas. |

## Update Process

1. Replace the vendored files with the upstream browser/module builds.
2. Preserve the wrapper comments at the top of `vendor/ag-psd.mjs` and confirm the version/license line stays accurate.
3. Verify `pdf.js` still points `GlobalWorkerOptions.workerSrc` at `./vendor/pdfjs/pdf.worker.mjs`.
4. Run syntax checks for `lib/images/*.js`, `image/js/app.js`, `converter/app.js`, and both service workers.
5. Smoke test PSD open/save, PDF-to-image import, image-to-PDF export, and Converter image/PDF paths.

These dependencies are not covered by the root package lockfiles or npm/pnpm
audits, so version review is a manual maintenance step until automated vendor
tracking is added.
