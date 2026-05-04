# Rodman Word Review

Scope: `word/`.

## Findings

### P1 - Service-worker cache version is out of sync with the app build metadata

The service worker uses `const VERSION = 'rwd-v10'` at `word/sw.js:11`, while the app build metadata still reports `cache: 'rwd-v9'` at `word/app.js:85`. The architecture docs explicitly say to keep these in lock-step at `word/ARCHITECTURE.md:179-181`, and the changelog still lists `rwd-v9` at `word/CHANGELOG.md:7`.

Impact: users can see the wrong cache version in the About dialog, support/debugging becomes misleading, and cache-busting discipline is already drifting.

Recommended fix: update `RW_BUILD.cache`, the changelog, and any docs in the same change as the service-worker version bump.

### P1 - "Fully offline" document import/export claims no longer match shared `/lib/docs` loading

Word bridges the document engines from `../lib/docs/index.js` at `word/index.html:1825-1832`. The service worker states that `/lib/docs` is outside the app scope and cannot be precached at `word/sw.js:12-14`. However, the README still says the editor works fully offline after the first visit at `word/README.md:120-122`.

Impact: the editor shell may load offline, but DOCX/PDF/ODT/EPUB import-export can fail if the shared engines were not already cached by the browser.

Recommended fix: either bring `/lib/docs` into the Word service-worker scope/build output or narrow the offline claim to "app shell and previously cached engines".

### P2 - Word documentation still describes local engine files that no longer exist in the app folder

`word/README.md:62-67` says DOCX, PDF, and interop code live in `docx.js`, `pdfio.js`, and `interop.js` in the Word app. `word/ARCHITECTURE.md:43-46` and `word/ARCHITECTURE.md:231-233` repeat those local-file checks. The current app loads shared `/lib/docs` instead at `word/index.html:1829`.

Recommended fix: update the README and architecture file to document the shared engine bridge and add the correct syntax/test commands.

### P2 - GitHub sync stores personal access tokens in `localStorage`

GitHub sync reads and writes `rodmanword:ghToken` in `localStorage` at `word/app.js:6454-6456` and `word/app.js:6485-6489`. That is convenient for a local static app, but a PAT in browser storage is exposed to XSS, malicious extensions, shared machines, and backups.

Recommended fix: use fine-grained, minimal-scope tokens, warn strongly in the UI/docs, and prefer session-only storage or a user-mediated OAuth flow if this becomes a hosted feature.

### P3 - Iframe embedding uses `allow-scripts` with `allow-same-origin`

Iframe insertion builds sandboxed iframes with `allow-scripts allow-same-origin` at `word/app.js:5011`. That combination can significantly weaken sandboxing for same-origin content.

Recommended fix: remove `allow-same-origin` unless a documented feature specifically requires it.

## Documentation Notes

- `word/README.md:113` references `.github/workflows/deploy.yml`; the suite uses `.github/workflows/pages.yml`.
- `word/README.md:139-152` lists local engine files rather than shared `/lib/docs`.
- `word/ARCHITECTURE.md:222` documents the GitHub PAT key but does not clearly call out the browser-storage risk.

## Verification

Static JavaScript syntax checks passed for Word files. No browser smoke or offline import/export test was run by CI.

