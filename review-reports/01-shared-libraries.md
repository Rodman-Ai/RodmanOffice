# Shared Libraries Review

Scope: `lib/docs`, `lib/images`, `lib/sheets`, `lib/slides`, and the top-level `lib/index.js`.

## Findings

### P1 - Shared library ownership comments are stale and hide real consumers

`lib/index.js:4` still says the shared libraries are "Currently consumed only by /converter" and that originating apps keep their own copies. That is no longer true. The shared engines are loaded by:

- Word: `word/index.html:1829`
- Slides: `slides/index.html:365`
- Image: `image/index.html:235`
- Converter: `converter/app.js:14-15`

This creates maintainability risk because contributors will not realize changes in `/lib` affect multiple production apps.

Recommended fix: replace the stale comment with a consumer matrix and add a short compatibility contract for each library entry point.

### P1 - The shared ZIP reader has no archive size, entry count, or decompressed size limits

`lib/docs/docx.js:182` implements `readZip(buffer)`. It walks the central directory, reads each entry, and inflates DEFLATE entries, checking the resulting length against the per-entry uncompressed size at `lib/docs/docx.js:199-226`. It does not cap total input size, total uncompressed output, number of entries, filename length, or compression ratio.

Because the same reader is exported through `lib/docs/index.js:1` and reused by `lib/docs/interop.js:41`, this affects DOCX, ODT, EPUB, and converter workflows. A crafted archive can cause high memory or CPU use in the browser.

Recommended fix: add explicit limits before and during extraction, for example max archive bytes, max entries, max filename bytes, max per-entry uncompressed bytes, max total uncompressed bytes, and a clear user-facing error when exceeded.

### P1 - Shared libraries sit outside app service-worker scopes

The sub-apps load shared engines through `../lib/...`, but app service workers are registered under the app directories. Word and Slides call this out directly: `word/sw.js:12-14` and `slides/sw.js:4-6`. Converter and Image have the same architecture through `converter/app.js:14-15`, `converter/worker.js:16`, `image/index.html:235`, `lib/images/pdf.js:18-19`, and `lib/images/psd.js:7`.

This means "works offline after first load" is only reliable for the local app shell. Shared engines, PDF.js worker files, and vendored libraries may not be available when offline.

Recommended fix: move shared runtime assets under a service-worker-controlled path, add a root service worker, or publish generated app bundles that include the required engines.

### P2 - Vendored browser dependencies lack a central inventory and audit process

`lib/images/psd.js:7` imports vendored `ag-psd`, and `lib/images/pdf.js:14-19` imports vendored PDF.js modules and worker code. These assets are not represented in a root package lock, so regular `npm audit`/`pnpm audit` does not cover them.

Recommended fix: add `lib/VENDOR.md` with package names, versions, licenses, upstream URLs, update process, and last security review date.

### P2 - Shared library tests are uneven

Sheets has package-level tests, but the document, image, and slide shared libraries are only protected by static syntax checks in this review. Given their role in import/export and untrusted file parsing, they need fixture-based tests for malformed files, size limits, and round-trip behavior.

Recommended fix: add root-level fixtures and a small test runner for `lib/docs`, `lib/slides`, and `lib/images`.

## Verification

Static JavaScript syntax checks passed for non-vendored `lib` files. No browser or fixture-based shared-library tests were present in the root workflow.

