# Rodman Converter Review

Scope: `converter/`.

## Findings

### P1 - Offline conversion claims do not match shared-library loading

The app says it is an installable PWA that works offline once loaded at `converter/index.html:79`. The app imports shared document and image engines at `converter/app.js:14-15`, imports shared Sheets on the main thread at `converter/app.js:191`, imports shared Sheets in the worker at `converter/worker.js:16`, and uses `lib/docs` ZIP helpers in `converter/bulk.js:7`.

`converter/sw.js:4-19` precaches only local app shell files. Because `/lib` sits outside the converter service-worker scope, document/image/spreadsheet engines are not reliably available offline.

Recommended fix: either cache the shared engines from a root scope or adjust UI/docs to say conversion engines may require network unless already cached.

### P1 - Spreadsheet worker failures can leave conversions hanging

`ensureWorker()` creates a module worker at `converter/app.js:37-39`. `runOnWorker()` tracks pending requests at `converter/app.js:51-52`, but the code only handles worker messages. There is no `worker.onerror` or `worker.onmessageerror` path to reject pending jobs.

Impact: if the module worker fails to import `../lib/sheets/index.js` while offline, or throws before posting a response, the UI can remain stuck in a converting state.

Recommended fix: attach error/messageerror handlers and reject all pending jobs with a clear user-facing error.

### P2 - HTML conversions preserve raw untrusted HTML

HTML input is decoded directly at `converter/app.js:72`, and HTML output wraps the current body at `converter/app.js:91` through `wrapHtml` at `converter/app.js:259`. There is no sanitization step for user-supplied HTML.

Impact: converting untrusted HTML can preserve scripts or event handlers into generated HTML/EPUB-like outputs. This is less severe than a hosted XSS because files are local, but it is still a trust-boundary issue for downloaded/opened output.

Recommended fix: sanitize HTML input before conversion or clearly label raw HTML conversion as unsafe/trusted-input only.

### P2 - App-specific documentation is missing

There is no `converter/README.md`. The only user-facing documentation is the About modal in `converter/index.html`.

Recommended fix: add a README covering supported format matrix, offline limitations, worker architecture, security notes for HTML, and known unsupported conversions.

### P3 - No automated conversion fixture tests

The converter touches all shared engines but has no fixture tests for common conversions, unsupported conversions, worker fallback, or bulk ZIP output.

Recommended fix: add small input fixtures and assert output MIME/ext plus basic parseability.

## Verification

Static JavaScript syntax checks passed for Converter files. No worker/offline browser smoke test was present.

