# Current Code Review Findings

Scope: current `main` review pass after the recent Ask Claude and review-issue fixes. Prior reports in this folder remain useful historical context, but the findings below were rechecked against the current source before being recorded here.

## Findings

### Finding 1 [P1] - Public CRM forms break in the Pages demo

Reference: `crm/src/app/f/[slug]/PublicFormClient.tsx:31-50`.

The public form client bypasses the CRM demo API wrapper and calls absolute `/api` routes. In the GitHub Pages static export those API routes do not exist, so `/crm/f/contact-us` can load and then fail fetching or submitting. The forms list also builds links as `/f/slug` without the `/RodmanOffice/crm` base path.

Suggested fix: use a base-path-aware URL helper and route public form reads/submits through the same demo-aware client layer as the rest of CRM.

Status: fixed. Public form reads/submits now use the CRM API client, and form links use a base-path-aware helper.

### Finding 2 [P1] - Service workers delete each other's caches

Reference: `sw.js:35-39`.

Cache Storage is origin-wide, but activation deletes every cache whose name is not the current root service-worker version. Opening or updating one app can wipe the launcher or other app offline caches, making offline support unreliable and causing needless refetching.

Suggested fix: delete only cache names owned by this service worker, using an app-specific cache-name prefix.

Status: fixed. The launcher and app service workers now delete only caches with their own prefixes.

### Finding 3 [P1] - Sheet edits drop cell comments

Reference: `sheets/apps/web/src/useWorkbook.ts:161-168`.

Cell comments live on the same `Cell` object as `raw` and `format`, but value edits rebuild cells with only `raw` and sometimes `format`. Editing a commented cell, or using batch paths that rewrite cells, can silently lose comments.

Suggested fix: preserve the existing cell object when changing values, for example `{ ...existing, raw }`, and ensure row-moving operations move complete `Cell` objects.

Status: fixed. Raw edits preserve existing cell metadata, and sort/dedupe paths move complete cell objects.

### Finding 4 [P1] - Slides click/tap-to-edit text is not wired

References: `slides/app.js:660-726`, with supporting context at `slides/render.js:121`.

Slides text editing only starts from `dblclick`. Normal desktop click-to-edit falls into selection/drag behavior, and mobile/touch has no reliable editing path even though text boxes present a text cursor. The result is a core editing interaction that appears available but cannot be reached on common devices.

Suggested fix: extract the current double-click edit logic into a shared `beginTextEdit` helper, keep double-click working, and add pointer/tap behavior so a selected text box enters edit mode on a second click/tap without movement. Preserve drag behavior with a small movement threshold and keep blur-based sanitized save.

Status: fixed in the follow-up pass by adding pointer/tap edit entry, preserving double-click, and separating click/tap from drag with a movement threshold.

### Finding 5 [P2] - Owner refresh token is returned to the browser

Reference: `crm/src/app/api/owner-credentials/route.ts:17-22`.

This endpoint returns the Google refresh token from the NextAuth JWT as JSON. That turns a long-lived credential that could remain server-side into a routine client-visible response.

Suggested fix: prefer a one-time setup flow with reauth, explicit reveal/copy, short display lifetime, and avoid returning the token from normal settings reads.

Status: fixed. Normal settings reads no longer include the refresh token; the settings UI fetches it only on explicit reveal and hides it after a short display window.

### Finding 6 [P2] - Converter keeps all inputs and outputs in memory

Reference: `converter/app.js:391-424`.

File intake reads every selected file into an `ArrayBuffer` immediately, stores it on the queue, then conversion clones the buffer again before processing. Zip mode also accumulates every output before writing the archive. Large or many files can exhaust browser memory.

Suggested fix: read lazily per job, add size/count limits, avoid copying when not needed, and disable zip bundling above a safe total.

Status: fixed. Converter now detects files from header slices, reads full bytes only per conversion job, enforces count/size limits, avoids the extra input clone, and falls back from zip bundling above safe limits.

### Finding 7 [P2] - PDF text import lacks expansion limits

Reference: `lib/docs/pdfio.js:832-853`.

PDF import converts the whole file to a string, finds every stream, and inflates Flate streams without input, output, stream-count, or cumulative byte caps. A crafted or very large PDF can freeze or exhaust memory during import.

Suggested fix: add PDF size, stream-count, per-stream compressed/decompressed, and total decoded text limits.

Status: fixed. PDF import now caps file size, stream count, compressed stream size, decompressed stream size, cumulative decoded bytes, and extracted text length.

### Finding 8 [P2] - Sheets ships one large startup chunk

Reference: `sheets/apps/web/src/App.tsx:7-13`.

The top-level app eagerly imports charting and modal-heavy features, and the production build previously confirmed a single large startup JavaScript chunk. This raises initial load cost for the GitHub Pages app and lower-powered devices.

Suggested fix: lazy-load charts, audit, find/replace, function picker, conditional formatting, and XLSX paths, or define manual chunks.

Status: fixed. Optional panels, charts, and spreadsheet import/export paths are lazy-loaded, with manual chunking for heavy shared code.

### Finding 9 [P2] - Accounting write failures can be invisible or disruptive

Reference: `accounting/js/store.js:196-213`.

The central store writes directly to `localStorage` without a synchronous `try`/`catch` in plaintext mode, and encrypted write failures only `console.warn`. Quota or storage-denied failures can leave in-memory state ahead of persisted state with no user-facing save failure.

Suggested fix: route writes through one guarded persistence helper that reports save errors in the UI and tracks dirty state.

Status: fixed. Accounting writes now pass through guarded persistence state, and write failures surface as user-facing save-failed toasts.

### Finding 10 [P3] - Formula bar commit controls are no-ops

Reference: `sheets/apps/web/src/App.tsx:498-508`.

The cancel and commit buttons have titles implying Esc and Enter behavior, but only the `fx` button has a handler. Since formula edits already write on every change, these controls are misleading.

Suggested fix: wire them to revert/commit editing state or disable/remove them until formula edit staging exists.

Status: fixed. Formula-bar cancel now restores the value from edit start, while commit blurs/accepts the current value; Esc and Enter are wired to the same actions.

## Sheets Claude Backend Status

The Sheets Claude backend exists in source. `sheets/services/api/src/app.ts` exposes `/ai/cell`, `/ai/chat`, and `/ai/agent`, and `sheets/services/api/src/ai/client.ts:42-52` creates the Anthropic-backed Claude client when `ANTHROPIC_API_KEY` is present. The web client calls those endpoints through `sheets/apps/web/src/api.ts:63-110`.

The backend is not live on GitHub Pages. The Pages workflow builds Sheets with `VITE_API_BASE: ""` at `.github/workflows/pages.yml:64-69`, and the Sheets README documents that this static build is demo mode with persistence and AI disabled. A live Claude deployment requires separate API hosting plus `ANTHROPIC_API_KEY`, origin/auth configuration on the API, and `VITE_API_BASE`/`VITE_API_TOKEN` in the web build.

## No Finding / Residual Risk

The Claude backend status is not recorded as a bug because the current workflow and README intentionally describe GitHub Pages as static demo mode. The follow-up fix pass reran CRM typecheck/build and the Sheets typecheck/test/build matrix.
