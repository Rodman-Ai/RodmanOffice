# RodmanWord

A Microsoft Word–style document editor that runs entirely in the
browser. No backend, no build step, no framework. Drop the static
HTML / CSS / JS files on any static host and it works — including
GitHub Pages.

After ~250 features, RodmanWord covers the day-to-day Word feel
(File / Home / Insert / Design / Layout / References / Mailings /
Review / View / Help ribbon tabs, threaded comments, track changes,
headers and footers, citations and bibliography, equations, charts,
multi-format save / load) plus a
handful of things modern competitors offer: WebRTC peer-to-peer
collaboration, GitHub-Gist cloud sync, smart-compose ghost text,
cover pages, a brand kit, dark / sepia / high-contrast themes, and
offline support via a service worker.

> **Live demo:** auto-deploys to GitHub Pages from `main` /
> the active feature branch.
> **Version**: see About RodmanWord — pulled from
> `RW_BUILD` in `app.js`.

## Documentation

| File | What it covers |
|---|---|
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Runtime model, module graph, state tiers, plug-in API, service-worker strategy. |
| [`FEATURES.md`](./FEATURES.md) | Per-tab catalogue of every shipped feature with source-line anchors. |
| [`BACKLOG.md`](./BACKLOG.md) | Microsoft Word ribbon parity gaps from the reference screenshots that are not exposed as live controls yet. |
| [`CHANGELOG.md`](./CHANGELOG.md) | Date-grouped history of releases. |
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | Branch convention, syntax checks, conventions for adding a feature. |

## Highlights, by ribbon tab

| Tab | What's in it |
|---|---|
| **File** | Backstage with Home / New / Open / Save & Save As / Print / Share / Cloud sync / Export / Info / Tools / About sections, a search box, recent docs. |
| **Home** | Clipboard / Font (with colour swatches + recent colours) / Paragraph (lists, alignment, indent, line spacing) / Styles / Editing (Undo, Redo, Find) / Voice (Dictate). |
| **Insert** | Pages, Tables (incl. Text↔Table), Illustrations (Picture / Gallery / Carousel / Linked / Shapes / Chart), Media (Online Video / Audio / Iframe / QR / Barcode), Links, Comments, Header & Footer, Text (Word art / Drop cap / Pull quote / Code block / Quick parts / Tab stop / Lorem / Date / HR), Symbols, Forms. |
| **Design** | Document themes, paragraph spacing presets, watermark. |
| **Layout** | Page size, orientation, margins, columns, line numbers, hyphenation, widow / orphan, heading-numbering schemes, restart numbering. |
| **References** | TOC, list of figures, footnotes, captions, cross-refs, citations + bibliography (APA / MLA / Chicago / IEEE / Harvard / Vancouver), DOI / ISBN / BibTeX lookup, back-of-book index. |
| **Mailings** | Mail merge modal for CSV plus `{{Field}}` placeholders. |
| **Review** | Spell + grammar, Read aloud, comments (threaded with @-mentions), track changes (with markup filter, reviewer filter, reviewing pane, accept / reject), compare / side-by-side / 3-way merge, mark final / inspect, language picker / translate. |
| **View** | Zoom (+ / − / fit / 100 %), theme picker, show panes (ruler / nav / comments / grammar), modes (Focus / Reading / Full-screen + dropdown for Outline-edit / Two-page / Side-by-side / Mobile preview / Dyslexia preset), writing aids (spell / auto-correct / Smart Compose), macros, markup toggles, document properties. |
| **Help** | Keyboard shortcuts and About RodmanWord. |

Full per-feature catalogue: [`FEATURES.md`](./FEATURES.md).

## Format support

| Format | Save / export | Open / import |
|---|---|---|
| `.rwd` (native JSON) | ✓ | ✓ |
| `.rwd.enc` (AES-GCM) | ✓ | ✓ |
| `.docx` (OOXML) | ✓ | ✓ |
| `.pdf` | ✓ | ✓ (text only) |
| `.html` / `.htm` | ✓ | ✓ |
| `.md` | ✓ (with optional YAML frontmatter) | ✓ |
| `.txt` | ✓ | ✓ |
| `.odt` | ✓ | ✓ |
| `.rtf` | ✓ | ✓ |
| `.epub` | ✓ | ✓ (chapters as one body) |
| `.adoc` (AsciiDoc) | ✓ | — |
| `.tex` (LaTeX) | ✓ | — |

DOCX, PDF, RTF, ODT, EPUB, Markdown, AsciiDoc, LaTeX, HTML, and text
import/export are bridged from the suite-level `../lib/docs/index.js`
module. That shared module exposes the historical `window.RodmanDocx`,
`window.RodmanPdf`, and `window.RodmanInterop` globals for the editor.
Because those engines live outside the `word/` service-worker scope,
offline import/export needs the shared `/lib/docs` assets to be available
from browser cache or the network.

## Keyboard shortcuts

| Action | Shortcut |
|---|---|
| Bold / Italic / Underline | Ctrl+B / Ctrl+I / Ctrl+U |
| Save document | Ctrl+S |
| Open file | Ctrl+O |
| New document | Ctrl+N |
| Print / PDF | Ctrl+P |
| Find & replace | Ctrl+F |
| Insert link | Ctrl+K |
| Align left / centre / right / justify | Ctrl+L / Ctrl+E / Ctrl+R / Ctrl+J |
| Clear formatting | Ctrl+Shift+L |
| Insert page break | Ctrl+Enter |
| Cycle heading style | Ctrl+Shift+H |
| Duplicate line / paragraph | Ctrl+D |
| Toggle HTML comment | Ctrl+/ |
| Invert selection | Ctrl+Shift+I |
| Expand selection | Ctrl+Shift+W |
| Select all matching headings | Ctrl+Shift+H |
| Repeat last command | Ctrl+Alt+Y |
| Command palette | Ctrl+Shift+P |
| Zoom in / out / 100 % | Ctrl+= / Ctrl+- / Ctrl+0 |
| Move paragraph up / down | Alt+↑ / Alt+↓ |
| Focus mode | F11 |
| Keyboard cheatsheet | ? |
| Close dialog | Esc |
| Tab character | Tab |

## Run locally

```bash
# any static server works
python3 -m http.server 8000
# or
npx serve .
```

Then visit http://localhost:8000/.

## Deploy to GitHub Pages

1. Push to GitHub.
2. **Settings → Pages → Source = GitHub Actions**.
3. In RodmanOffice, `.github/workflows/pages.yml` publishes the suite
   on every push to `main`.

## PWA / offline

- A web manifest (`manifest.webmanifest`) makes RodmanWord installable.
- A service worker (`sw.js`) runs **network-first** for every same-
  origin GET, with the cache as an offline fallback. The editor shell
  works offline after first load; shared `/lib/docs` import/export
  engines must also be available from browser cache or the network.
  Cache version is bumped in lock-step with `RW_BUILD.cache` in `app.js`.

## Browser support

Tested on the latest desktop and mobile Chrome / Edge / Safari /
Firefox. Hard requirements: `contenteditable`, modern CSS
(custom properties, flex / grid, `:has()`), `crypto.subtle`,
`SubtleCrypto.deriveKey` (for `.rwd.enc`), `DecompressionStream`
(for DOCX import). Optional: WebRTC (collab), File System Access
API (Save to file…), Web Speech API (read-aloud + dictation).

## Project layout

```
.
├── index.html              # App shell, ribbon, modals, page
├── app.js                  # ~10.7k lines; section index at top
├── styles.css              # Themes, ribbon, modals, mobile, print
├── sw.js                   # Network-first service worker
├── manifest.webmanifest
├── icon.svg
├── 404.html                # Pages SPA fallback
├── README.md
├── ARCHITECTURE.md
├── FEATURES.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── ../lib/docs/            # Shared document import/export engines
└── ../.github/workflows/pages.yml
```

## License

MIT.
