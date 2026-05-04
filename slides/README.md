# RodmanSlides

RodmanSlides is a static, browser-based presentation editor for the
RodmanOffice suite. It uses vanilla HTML/CSS/JavaScript, stores the current
deck in browser storage, and runs from GitHub Pages with no app-specific build
step.

## Supported Workflows

- Create, duplicate, reorder, and delete slides.
- Edit text, shapes, images, videos, tables, notes, themes, transitions, and simple animations.
- Save/open the native `.json` deck format.
- Import/export `.pptx` through the shared `../lib/slides/` engine.
- Export PDF through the browser print path.
- Present from the start or current slide.

## Storage

Autosave writes the current deck to `localStorage` under `slides.deck.v1`.
Use native `.json` export for backups and handoff between browsers.

## Offline And PWA Behavior

`sw.js` caches the Slides app shell under the `slides/` scope. PPTX import/export
depends on `../lib/slides/`, which is outside that service-worker scope, so
PPTX workflows need those shared assets from the network or the browser HTTP
cache.

## Known Gaps

- Undo and redo buttons are intentionally disabled until document history is implemented.
- Native browser alerts/confirms remain in several destructive and import/export flows.
- Imported deck text HTML is sanitized before render/save, but broader file validation and fixture tests still need coverage.

## Verification

```bash
node --check slides/app.js
node --check slides/deck.js
node --check slides/render.js
node --check slides/present.js
node --check slides/sw.js
```
