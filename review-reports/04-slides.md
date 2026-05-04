# Rodman Slides Review

Scope: `slides/`.

## Findings

### P1 - Imported deck JSON can inject unsanitized HTML into rendered slides

Deck JSON import parses user-controlled JSON at `slides/app.js:1041-1042`. Validation is shallow and only checks the object shape in `slides/deck.js:195-196`. Rendering then assigns element HTML directly with `inner.innerHTML = el.html || ''` at `slides/render.js:77`.

Impact: a malicious `.rodslides` JSON file can include script-capable HTML such as event handlers, which will execute when the deck is rendered. This is especially risky because local document import feels safe to users.

Recommended fix: sanitize imported `el.html`, store text elements as structured text instead of raw HTML, or restrict the renderer to an allowlist of safe tags and attributes.

### P2 - Undo and redo controls are visible but not implemented

The UI exposes undo/redo buttons at `slides/index.html:81-82`, but the command handlers are placeholders at `slides/app.js:969-971`.

Impact: users can lose work because a familiar editing safety net appears to exist but does nothing.

Recommended fix: disable the buttons until implemented, or add a history stack before advertising the commands.

### P2 - PPTX import/export is not reliably offline

Slides bridges the shared PPTX engine from `../lib/slides/index.js` at `slides/index.html:360-365`. The service worker states that `/lib/slides` is outside scope and cannot be precached at `slides/sw.js:4-6`.

Recommended fix: move the PPTX engine under the Slides-controlled cache path, use a root service worker, or clarify the offline limitation.

### P2 - App-specific documentation is missing

There is no `slides/README.md`. The app has import/export, present mode, speaker notes, local storage, service-worker behavior, and unsupported undo/redo commands, but no app-level documentation for users or maintainers.

Recommended fix: add a README covering architecture, supported formats, offline behavior, storage, keyboard shortcuts, and known gaps.

### P3 - Error handling still uses blocking browser dialogs

Examples include JSON import parse failures at `slides/app.js:1049`, PPTX import errors at `slides/app.js:1078`, and destructive reset confirmation at `slides/app.js:961`. This is not a security issue, but it makes the app feel less consistent with the suite's custom UI.

## Verification

Static JavaScript syntax checks passed for Slides files. No browser smoke test or imported-deck security test was present.

