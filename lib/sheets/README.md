# Shared Spreadsheet Engines

`lib/sheets` contains browser-side spreadsheet codecs used by the
Sheets app (`/sheets/`) — via the `@aicell/codecs` TypeScript shim
— and by the Converter app (`/converter/`). The app shells stay
static; this folder owns the format bridges shared across the
suite.

## Public surface

| File | Purpose |
|---|---|
| `index.js` | Re-exports the codec API. |
| `csv.js` | CSV / TSV parse + unparse, plus XLSX read/write via vendored SheetJS. |
| `serializers.js` | TSV / PSV / JSON / NDJSON / YAML / HTML / Markdown / Excel-XML / ODS readers + writers. |
| `vcard.js` | vCard ↔ workbook bridge. |
| `icalendar.js` | iCalendar (.ics) ↔ workbook bridge. |
| `types.js` | Shared Workbook / Sheet / Cell shapes and the `cellKey` helper. |

## Vendored Dependencies

| Dependency | Vendored file(s) | Version | License | Used for |
|---|---|---:|---|---|
| `@e965/xlsx` (SheetJS Community fork) | `vendor/xlsx.mjs` | 0.20.3 | Apache-2.0 | XLSX / XLS read + write (`parseXlsx`, `buildXlsx`, `exportWorkbookAsXLSX`, `exportWorkbookAsXLS`). |

The bundled file is the upstream ESM build, ~1 MB. It's the
single largest dependency in the suite outside of FFmpeg.wasm
and is intentionally shipped over the wire on first Sheets /
Converter visit rather than chunked, because the codec is needed
for the most common spreadsheet path (open .xlsx).

## Update Process

1. Replace `vendor/xlsx.mjs` with a fresh ESM build from
   `npm pack @e965/xlsx@<new>` (or the upstream SheetJS CDN's
   `xlsx.mjs`).
2. Preserve the leading SheetJS copyright comment so the license
   attribution stays in-source.
3. Run `node --check lib/sheets/csv.js` and the Sheets codec
   vitest suite: `cd sheets && pnpm --filter @aicell/codecs test`.
4. Smoke test in the browser: open a .xlsx in `/sheets/`, save
   one out, and round-trip a .xlsx through `/converter/`.
5. Bump the cache key in `sheets/apps/web/public/sw.js` (if
   any) and `converter/sw.js` so installed visitors pick up the
   new bundle.

This dependency is not covered by the root package lockfiles or
npm/pnpm audits, so version review is a manual maintenance step
until automated vendor tracking is added.
