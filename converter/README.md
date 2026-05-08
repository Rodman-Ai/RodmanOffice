# RodmanConvert

RodmanConvert is a static, browser-based file converter for RodmanOffice.
Files are processed in the browser: spreadsheet conversions run in a Web Worker,
while document and image conversions run on the main thread because they use DOM,
canvas, and parser APIs.

## Supported Formats

| Family | Reads | Writes |
|---|---|---|
| Documents | DOCX, PDF, RTF, ODT, EPUB, Markdown, HTML, TXT | DOCX, PDF, RTF, ODT, EPUB, Markdown, HTML, TXT, AsciiDoc, LaTeX, JSON, YAML, MediaWiki, reStructuredText, Org-mode, DocBook, FictionBook |
| Spreadsheets | XLSX, XLS, CSV, TSV, JSON | XLSX, CSV, TSV, PSV, JSON, NDJSON, HTML, Markdown, Excel 2003 XML, ODS, PDF |
| Images | PNG, JPEG, GIF, BMP, WebP, SVG, PSD, PSB, ICO, TIFF (browser-dependent), PDF (any page) | PNG, JPEG, WebP, PSD, BMP, ICO, PPM, TGA, CBZ, PDF (Photoshop-compatible) |

Cross-family bridges:

- Spreadsheet → PDF (rasterized as HTML tables).
- Image source → PDF (single-page, JPEG-wrapped).
- PDF → image: any PDF rasterizes to PNG/JPEG/WebP/PSD/BMP/ICO/PPM/TGA.
- PDF → CBZ: every PDF page rasterizes into a comic-book ZIP archive.

## Shared Engines

The app imports suite-level modules from `../lib/docs/`, `../lib/sheets/`,
and `../lib/images/`. Vendored helpers include `@e965/xlsx`, `ag-psd`, and
PDF.js. See `../lib/images/README.md` for the image dependency inventory.

## Offline And PWA Behavior

`sw.js` caches the Converter app shell under the `converter/` scope, including
the spreadsheet worker. The shared `/lib` engines are outside that scope, so
conversion paths need those assets from the network or the browser HTTP cache.

## Trust Boundaries

- HTML inputs (`.html`, `.htm`, `.epub` body content, `.odt` body content) are
  passed through a small in-browser sanitizer that drops `<script>`, `<style>`,
  `<iframe>`, `<object>`, `<embed>`, `<link>`, `<meta>`, `<base>`, `<form>`,
  every `on*=` handler attribute, and `javascript:` / `data:` / `vbscript:`
  URLs. The sanitizer is conservative — assume any other formatting in the
  input may round-trip into the output.
- Text inputs (`.txt`, `.md`, `.html`, `.htm`) are decoded as UTF-8. A leading
  UTF-8 BOM is stripped silently; UTF-16 BOMs are rejected with a friendly
  error so the user can re-save as UTF-8.

## Known Gaps

- TIFF, AVIF, and HEIC inputs depend on browser native decoding and are not
  guaranteed to load on every browser/version.
- Multi-sheet inputs render to PDF/Markdown/HTML as one section per sheet;
  formulas and cell formatting are not preserved end-to-end.
- Conversion fixture tests are still needed for common routes, unsupported
  routes, worker failures, and bulk ZIP output.

## Verification

```bash
node --check converter/app.js
node --check converter/bulk.js
node --check converter/detect.js
node --check converter/matrix.js
node --check converter/sw.js
node --check converter/worker.js
node --check lib/docs/interop.js
node --check lib/sheets/csv.js
node --check lib/sheets/serializers.js
node --check lib/images/image-io.js
node --check lib/images/cbz.js
```
