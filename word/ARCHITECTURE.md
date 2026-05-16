# RodmanWord — Architecture

A one-page tour of the runtime model. For a feature-by-feature
catalogue see [`FEATURES.md`](./FEATURES.md).

## Module graph

```
                ┌───────────────────────┐
                │       index.html      │
                │  (ribbon + modals)    │
                └──────────┬────────────┘
                           │
                  loads in order:
                           │
  ┌────────────┬───────────┴──────────┬────────────┐
  │         ../lib/docs/index.js       │
  │  bridges RodmanDocx / RodmanPdf /  │
  │  RodmanInterop onto window         │
  └────────────┴──────────┬───────────┴────────────┘
                          │
                          ▼
                ┌───────────────────────┐
                │        app.js         │
                │  (single IIFE,        │
                │   ~10,700 lines)      │
                │  attaches RW_BUILD    │
                └──────────┬────────────┘
                           │ navigator.serviceWorker.register
                           ▼
                ┌───────────────────────┐
                │        sw.js          │
                │  network-first        │
                │  + offline fallback   │
                └───────────────────────┘
```

In RodmanOffice, `index.html` imports `../lib/docs/index.js` and bridges
the shared document engines onto the historical globals before `app.js`
calls into them:

| Global | Source | Public methods |
|---|---|---|
| `window.RW_BUILD`     | `app.js`     | `version`, `date`, `cache`, `label`. Single source of truth for the About dialog and the SW cache key. |
| `window.RodmanDocx`   | `../lib/docs/index.js` | `saveDocx(html, opts)`, `loadDocx(buffer)`, `__buildZip` and `__readZip` (reused for ODT and EPUB). |
| `window.RodmanPdf`    | `../lib/docs/index.js` | `savePdf(html, opts)`, `loadPdf(buffer)`. |
| `window.RodmanInterop`| `../lib/docs/index.js` | `rtfExport / odtExport / epubExport / mdExport / asciidocExport / latexExport / rtfImport / odtImport / epubImport`. |

`app.js` is a single IIFE under `'use strict'`. Its top contains a
**section index** describing every major region by line range.

## Three-tier document state

```
                 keystroke
                     │
                     ▼
   ┌────────────────────────────────────┐
   │ Tier 1:  live DOM — contentEditable │  (editor, header, footer)
   │          editor.innerHTML +         │
   │          [data-field] tokens that   │
   │          re-render via              │
   │          refreshFields() / 200ms    │
   │          debounce                   │
   └────────────────────────────────────┘
                     │
       composite input listener
       queueAutosave + markDirty +
       refreshEmptyState
                     │
                     ▼
   ┌────────────────────────────────────┐
   │ Tier 2:  localStorage  ~37 keys    │
   │          (see "localStorage keys"  │
   │          below). 400 ms debounce.  │
   └────────────────────────────────────┘
                     │
                     │  user opens the Save dialog and picks a non-native format …
                     ▼
   ┌────────────────────────────────────┐
   │ Tier 3:  on-demand shared engines  │
   │          ../lib/docs/index.js      │
   │          (Docx/Pdf/Interop globals)│
   └────────────────────────────────────┘
```

## Ribbon model

The ribbon is plain HTML inside `<section class="ribbon">`. Each tab
is a `<button class="tab" data-tab="…">` and each panel is a
`<div class="ribbon-panel" data-panel="…">`. `app.js` toggles the
`.active` class on both based on a click. Highlights:

- **Single-click** switches tab and re-expands the ribbon if it was
  collapsed.
- **Double-click** toggles ribbon collapse (Word-style).
- A small inline `<div class="rwd-menu-host">` / `<div class="rwd-menu">`
  pattern provides per-button dropdown menus (used by Insert →
  Pictures and Insert → Shapes).
- Each `.group` wraps one or more `.group-row` elements; on mobile
  the entire panel collapses into a single horizontally-scrolling
  row by setting `display: contents` on `.group-row` and
  `flex-direction: row` on `.group`.

## Backstage (File menu)

Two-pane layout. The left rail is a static `<ul class="backstage-rail">`
of `<button data-section="…">` items (Home / New / Open / Save /
Print / Share / Cloud sync / Info / Tools / About). The right pane
is dynamic. The standalone "Export" section was retired when Save
was unified into a single dialog — every format is now picked
inside the dialog instead of from a separate ribbon tab.

`renderBackstageSection(name)` reads from a `BACKSTAGE_SECTIONS` map
keyed by section name. Each section is `{ title, render?, tiles? }`:

- `render(content)` is called when present (Home and New use it for
  custom layouts).
- Otherwise the default tile-grid renderer walks `tiles` and creates
  a `.backstage-tile` per entry. Each tile fires
  `setBackstageView(action)` with the same `data-action` strings the
  legacy switch already understood, so every wrap installed by
  feature blocks (Sections B, F, L, M of the 100-feature plan)
  continues to fire.

A `<input id="backstageSearch">` filters tiles across every section;
hitting any tile with a label or description matching the query
shows them in a synthetic "Search results" view.

## Live-field engine

The "field" abstraction lets the document hold tokens like
`{page}`, `{pages}`, `{date}`, `{wordCount}`, cross-references,
caption numbers, citation numbers, and live-updating bibliographies.

```
editor change → 200 ms debounce → refreshFields()
               │
               ├── walk editor.querySelectorAll('[data-field]')
               │     and overwrite textContent from FIELDS[name](el)
               ├── renumberCaptions()       (rwd-caption[data-seq])
               ├── refreshCrossRefs()       (rwd-xref[data-target])
               └── refreshCitations()       (rwd-cite[data-cite])
```

`FIELDS` is a small registry: `page` counts `<hr class="page-break">`
+ `.rwd-section-break` elements in document order; `pages` counts the
total; `date` / `time` / `datetime` use `Date`; `docTitle` /
`author` / `wordCount` read from current state.

## WebRTC peer-to-peer collaboration

No signalling server. Two browsers exchange an SDP offer + answer
manually (copy-paste through any chat). After both peers call
`setRemoteDescription`, the data channel opens and they exchange:

- `{ type: 'hello', name, color, id }` — presence
- `{ type: 'doc', title, html, header, footer, at }` — document
  snapshot. Receivers apply only if `at` is newer than what they
  already have (last-writer-wins).
- `{ type: 'bye', id }` on disconnect.

Snapshots broadcast on a 350 ms debounce. A 400 ms suppression
window after applying a remote snapshot prevents echo loops.
Limitations: simultaneous edits in different parts of the document
can be lost; CRDT / OT is future work.

## Service worker

`sw.js` registers on first load. Strategy is **network-first for
everything**:

```
fetch event → try network
            │
            ├── 200? → return + cache (replaces stale entry)
            └── network error → cache.match(req)
                            │
                            └── if navigation: cache.match('./index.html')
```

Versioned via `const VERSION = 'rwd-vN'`. Activate clears every
non-current cache. **Keep `VERSION` in lock-step with
`RW_BUILD.cache` in `app.js`** — the About dialog displays the same
string, and a mismatch makes the version readout misleading.

## localStorage keys (37 in active use)

All keys are prefixed `rodmanword:`. `STORE_*` constants define them
near the top of `app.js`. Schema is whatever JSON the writer
produces — there is no migration framework, so additive changes
only.

| Key | Purpose |
|---|---|
| `doc`            | Last autosaved editor HTML |
| `title`          | Last autosaved document title |
| `header` / `footer` | Last autosaved page header / footer HTML |
| `prefs`          | View prefs: dark mode, ruler, outline pane, zoom, page size, orientation, margins |
| `recent`         | Recent file titles + timestamp + size |
| `recentColors`   | Last 10 colours picked in any swatch popup |
| `findHistory`    | Up to 10 previous find terms |
| `savedSearches`  | Named saved searches with full filter state |
| `defaultFont` / `defaultSize` | Default font preferences |
| `theme`          | Current theme name (`'' / dark / sepia / contrast`) |
| `customCss`      | Raw CSS injected into the editor |
| `styles`         | Custom paragraph styles `{ name → { baseTag, css, parent } }` |
| `listStyles`     | Saved list-style combos |
| `templateHistory`| Order of template applications |
| `userTemplates`  | User-saved templates `{ name → { html, description } }` |
| `brand`          | Brand kit JSON |
| `watermark`      | `{ on, text }` |
| `markedFinal`    | "1" if doc marked final |
| `props`          | Document properties (author, subject, keywords, …) |
| `goal`           | Writing-goal target word count |
| `autocorrect`    | "1" / "0" toggle |
| `spell`          | "1" / "0" toggle |
| `history`        | Auto snapshots (up to 20) |
| `threads`        | Threaded-comments map `{ id → { resolved, replies[] } }` |
| `snippets`       | Quick-parts map |
| `citations`      | Citation database `{ id → { author, year, title, source } }` |
| `citeStyle`      | Active citation style (apa / mla / chicago / ieee / harvard / vancouver) |
| `macros`         | Macro recordings `{ name → steps[] }` |
| `authors`        | Multi-author metadata array |
| `ghToken` / `ghGistId`        | GitHub PAT + last gist id for cloud sync |
| `wdUrl` / `wdUser` / `wdFile` | WebDAV server / user / filename |
| `collabName`     | Last name used in P2P collab session |

## Verification recipes

```bash
# Syntax checks
node -e "new Function(require('fs').readFileSync('app.js','utf8'))"
node -e "new Function(require('fs').readFileSync('../lib/docs/docx.js','utf8'))"
node -e "new Function(require('fs').readFileSync('../lib/docs/pdfio.js','utf8'))"
node -e "new Function(require('fs').readFileSync('../lib/docs/interop.js','utf8'))"
node -e "new Function(require('fs').readFileSync('sw.js','utf8'))"
python3 -c "import html.parser; html.parser.HTMLParser().feed(open('index.html').read())"

# Banner sanity
grep -c "// FEATURE:\|// IMPROVEMENT:\|// FOUNDATION:" app.js   # 98 today

# localStorage key inventory
grep -o "rodmanword:[a-zA-Z]*" app.js | sort -u
```
