# RodmanOffice — orientation for Claude

A static, browser-first office suite (Word + Sheets + Slides + Image
editor + Converter + Accounting + CRM) that runs from GitHub Pages
with no app-specific build step for most surfaces. Every file format
the suite speaks is implemented from scratch under `/lib/`.

## Layout

```
/word/        Vanilla HTML + ESM word processor
/slides/      Vanilla HTML + ESM presentation editor
/image/       Vanilla HTML + ESM image editor (RetroPaint inside)
/converter/   Vanilla HTML + ESM batch file converter
/accounting/  Vanilla HTML + ESM bookkeeping app
/crm/         Vanilla HTML + ESM contacts / deals app
/sheets/      pnpm React + Vite monorepo (the only non-vanilla app)

/lib/         Shared engines. Every app imports from these:
  /lib/docs/      DOCX, PDF, RTF, ODT, EPUB, MD, HTML, …
  /lib/sheets/    CSV, TSV, XLSX, JSON, NDJSON, YAML, vCard, iCal …
  /lib/slides/    PPTX read/write + the deckToHtml ↔ htmlToDeck bridge
  /lib/images/    Canvas encoders for ~25 image formats + PDF + PSD
  /lib/video/     FFmpeg.wasm wrapper for video / audio transcoding
  /lib/claude/    Anthropic API client used by every "Ask Claude" panel

/index.html   Top-level launcher tile grid
/sw.js        Suite-level service worker (offline shell)
```

## Format authority

Two files are the canonical source of truth for "which formats does
the suite support":

- **`converter/matrix.js`** — every write target, grouped by family.
  `DOC_OUTPUTS`, `SHEET_OUTPUTS`, `IMAGE_OUTPUTS`, `SLIDES_OUTPUTS`,
  `VIDEO_OUTPUTS`, `AUDIO_OUTPUTS`, `SUBTITLE_OUTPUTS`. Each entry is
  `{ ext, mime, label, [outputExt] }`.
- **`converter/detect.js`** — every input format we can identify by
  extension, plus a `magicSniff()` for byte-prefix tiebreaking.

When you add a new format, update both. The converter's About panel
(`converter/index.html`) colors each token in the format matrix red
(read-only), white (write-only), or blue (both).

## Cross-app engine reuse pattern

Every shared engine has an `index.js` (or `index.ts` for sheets) that
re-exports the engine's public surface. Example:
`lib/docs/index.js` re-exports `saveDocx`, `loadDocx`, `savePdf`,
`loadPdf`, `mdExport`, `odtExport`, etc.

The vanilla apps consume engines via small `<script type="module">`
shims at the top of their HTML files (look for
`window.RodmanDocx = ...` and friends in `word/index.html`,
`slides/index.html`, `image/index.html`). The classic non-module
`app.js` reads those window globals.

The Sheets monorepo wraps the same engines through TypeScript shims
in `sheets/packages/codecs/`. Each codec file uses
`// @ts-expect-error` immediately before importing `.js` files from
`/lib/sheets/` — the lib is plain JS with JSDoc.

## Branch / merge convention

- Feature work lives on `claude/...` branches.
- Merges to `main` are via GitHub PR; direct push to `main` returns
  HTTP 403 (branch protection).
- Use the GitHub MCP tools (`mcp__github__*`) to open PRs — auth via
  `mcp__github__authenticate` if the tools aren't connected.

## Dev servers

- Vanilla apps: `python3 -m http.server` from the repo root.
- Sheets monorepo: `cd sheets && pnpm install && pnpm dev:web` (Vite
  on port 5173). `pnpm dev` also starts the API service on port 3000.

## Vendor inventory

`pnpm` is only used inside `/sheets/`. The rest of the suite vendors
its dependencies directly under `lib/<engine>/vendor/`:

- `lib/images/vendor/pdfjs/` — Mozilla pdf.js, used for PDF reading +
  text extraction (Compress PDF, PDF→image).
- `lib/sheets/vendor/xlsx.mjs` — `@e965/xlsx` ESM bundle.
- `lib/video/vendor/ffmpeg/` — `@ffmpeg/ffmpeg` + `@ffmpeg/core`
  WASM build (~25 MB, lazy-loaded on first video conversion).

When updating vendor blobs, document the source + license in the
engine's `README.md` if one exists.

## Code style for this repo

- ESM everywhere. No transpile step for the vanilla apps.
- Hand-rolled byte-level encoders are preferred over npm packages.
  Look at `lib/images/image-io.js` (15+ image encoders), `lib/docs/pdfio.js`
  (PDF writer with built-in Type-1 fonts), and `lib/docs/docx.js`
  (OOXML + ZIP writer) for the pattern.
- Tests are minimal — the `sheets/packages/codecs` package has a
  vitest suite. Most engines are validated by `node --check` for
  syntax plus manual round-trip in a browser.
- `python3 -m http.server` from the repo root is the canonical dev
  loop. Open `http://localhost:8000/converter/` etc.
