# RodmanConvert

RodmanConvert is a static, browser-based file converter for RodmanOffice.
Files are processed in the browser: spreadsheet conversions run in a Web Worker,
while document and image conversions run on the main thread because they use DOM,
canvas, and parser APIs.

## Supported Formats

| Family | Reads | Writes |
|---|---|---|
| Documents | DOCX, PDF, RTF, ODT, EPUB, Markdown, HTML, TXT | DOCX, PDF, RTF, ODT, EPUB, Markdown, HTML, TXT, AsciiDoc, LaTeX |
| Spreadsheets | XLSX, XLS, CSV | XLSX, CSV, PDF |
| Images | PNG, JPEG, GIF, BMP, WebP, SVG, PSD, PSB, PDF | PNG, JPEG, WebP, PSD, PDF |

Cross-family bridges include CSV-to-PDF, PNG-to-PDF, PDF-to-PNG, and
PDF-to-PSD where the shared engines support the route.

## Shared Engines

The app imports suite-level modules from `../lib/docs/`, `../lib/sheets/`,
and `../lib/images/`. Vendored helpers include `@e965/xlsx`, `ag-psd`, and
PDF.js. See `../lib/images/README.md` for the image dependency inventory.

## Offline And PWA Behavior

`sw.js` caches the Converter app shell under the `converter/` scope, including
the spreadsheet worker. The shared `/lib` engines are outside that scope, so
conversion paths need those assets from the network or the browser HTTP cache.

## Known Gaps

- HTML input is preserved as trusted content for document-style conversions.
- Conversion fixture tests are still needed for common routes, unsupported routes, worker failures, and bulk ZIP output.
- Large files are limited by browser memory and the relevant parser engine.

## Verification

```bash
node --check converter/app.js
node --check converter/bulk.js
node --check converter/detect.js
node --check converter/matrix.js
node --check converter/sw.js
node --check converter/worker.js
```
