# lib/diagrams — VSDX read/write + stencil library

Shared engine powering `/diagrams/`. Pure JS with JSDoc types; no
vendor blobs, no npm packages — only `lib/docs/docx.js` is reused
for its hand-rolled `buildZip` / `readZip` (the same primitives the
PPTX engine builds on).

## Surface

```js
import {
  saveVsdx, loadVsdx,         // round-trip native (Visio OOXML/ZIP)
  exportSvg, exportPng, exportPdf,
  STENCILS, CATEGORIES, getStencil, stencilsByCategory,
  THEMES, getTheme, applyThemeToDiagram,
} from '../lib/diagrams/index.js';
```

## File layout

| File              | What it does                                               |
| ----------------- | ---------------------------------------------------------- |
| `vsdx.js`         | VSDX writer + reader (hand-rolled OOXML inside a ZIP).     |
| `stencils.js`     | 52-shape catalog: Basic (12) + Flowchart (18) + BPMN (12) + Network (10). |
| `themes.js`       | 6 palettes (Office, Slate, Marigold, Mist, Tech, Print).   |
| `svg-export.js`   | Diagram → SVG string. Used by the editor canvas *and* the PNG/PDF exporters. |
| `png-export.js`   | Diagram page → PNG via canvas rasterization.               |
| `pdf-export.js`   | Multi-page diagram → PDF via `lib/docs/pdfio.js`.          |
| `types.js`        | JSDoc typedefs + constants (PX_PER_IN, page defaults).     |
| `index.js`        | Re-exports the public surface above.                       |

## Coordinate systems

The in-memory diagram uses page-local pixels (1 px = 1/96 in, origin
top-left, Y grows downward) so it can render straight to SVG.

VSDX uses Visio inches (origin **bottom-left**, Y grows **upward**).
`vsdx.js` flips Y against the page height when writing and reading.

## VSDX fidelity

The writer emits the minimal subset of Visio's schema that opens
cleanly in Microsoft Visio 2013+ and LibreOffice Draw 7+:

- `Shape` elements with `PinX`/`PinY`/`Width`/`Height`/`Angle` cells
- A generic rectangular `Geometry` section per shape (Visio renders
  the bounding rect; the original stencil id is preserved in an XML
  comment so RodmanDiagrams can re-render the exact stencil on
  re-import).
- `Connect` table linking dynamic connectors to their endpoint
  shapes.
- One `Page` per RodmanDiagram page.

Arbitrary 3rd-party VSDX import is **best-effort**: shapes + text +
connectors are recovered; custom geometry sections, master
inheritance, themes, and shape-data are not honoured — they
re-render as plain rectangles preserving the bounding box and label.

Macro-enabled `.vsdm` is read with the macro stream stripped; we
never write `.vsdm`. Legacy binary `.vsd` (Office 97-2003 OLE
compound document) is not supported.

## Adding a new stencil

1. Add an entry to the relevant category map in `stencils.js`. The
   `draw(w, h)` function returns SVG geometry inside the shape's
   bounding box (origin 0,0 → w,h).
2. Optionally pass a `ports` array if the four edge midpoints are
   wrong for the new shape (e.g. a callout where the tail should
   anchor connectors).
3. No matrix/detect change needed — stencils live entirely inside
   the diagram app.
