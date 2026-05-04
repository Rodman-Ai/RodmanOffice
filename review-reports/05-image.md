# Rodman Image Review

Scope: `image/`.

## Findings

### P1 - The service worker precaches a file that does not exist

`image/sw.js:12` includes `./js/io.js` in the precache list. No `image/js/io.js` file exists. The install handler calls `cache.addAll(ASSETS)` at `image/sw.js:18`, so a 404 for that asset rejects the install and prevents the service worker from activating.

Impact: installable/offline behavior is broken despite the README claiming PWA offline support at `image/README.md:145`.

Recommended fix: remove `./js/io.js` from the precache list or restore the file. Add a CI check that every service-worker precache asset exists.

### P1 - "Sandboxed Script-Fu" is not actually sandboxed

The UI section is labeled "sandboxed JS REPL" at `image/js/app.js:4989`, but execution uses `new Function('ctx', 'W', 'H', 'composite', 'state', inp)` at `image/js/app.js:5004`. That code runs in the page context with access to globals, same-origin storage, and app state.

Impact: this is fine as an explicit advanced "run JavaScript" tool for trusted local input, but it should not be called sandboxed. If users paste untrusted snippets, it can access local app data.

Recommended fix: rename the feature to make the trust boundary clear, or run scripts in a real sandboxed iframe/worker with a narrow message API.

### P2 - Offline support does not include shared image engines and vendor workers

`image/index.html:231-235` bridges `../lib/images/index.js`, and `image/js/app.js:1658-1713` dynamically imports shared PSD/PDF modules. PDF.js sets a worker URL under `/lib/images/vendor` at `lib/images/pdf.js:18-19`. None of these assets are in `image/sw.js`.

Recommended fix: bring shared image assets under the controlled cache path or document that PSD/PDF import/export requires network/HTTP-cache availability.

### P2 - README dependency claims are out of date

`image/README.md:9` says "No dependencies", but the app now uses shared `/lib/images`, vendored `ag-psd` at `lib/images/psd.js:7`, and PDF.js at `lib/images/pdf.js:14-19`.

Recommended fix: update the README architecture and dependency sections with shared library and vendor details.

### P2 - Autosave can silently fail on larger canvases

Autosave stores a full PNG data URL in `localStorage` at `image/js/app.js:1730` and swallows storage failures. Backup vault entries also store full PNG data URLs at `image/js/app.js:3117-3119`.

Impact: localStorage quota errors are likely for larger images or repeated backups. Users can believe autosave is active when the browser has rejected writes.

Recommended fix: surface quota failures, reduce backup count/size, or move autosave data to IndexedDB.

## Verification

Static JavaScript syntax checks passed for Image files. The service-worker precache issue was found by file inspection; a browser install/offline test should be added.

