# Contributing to RodmanWord

A short guide for adding features or fixing bugs without breaking the
~250-feature single-page app.

## Branches

Active feature branch: **`claude/build-word-clone-cXSXu`**.
GitHub Actions auto-deploys to Pages on push to this branch and to
`main`.

## Local development

No build step. Pure HTML / CSS / JS.

```bash
# any static server works
python3 -m http.server 8000
# or
npx serve .
```

Open <http://localhost:8000/>.

## Syntax checks before committing

```bash
node -e "new Function(require('fs').readFileSync('app.js','utf8'))"
node -e "new Function(require('fs').readFileSync('docx.js','utf8'))"
node -e "new Function(require('fs').readFileSync('pdfio.js','utf8'))"
node -e "new Function(require('fs').readFileSync('interop.js','utf8'))"
node -e "new Function(require('fs').readFileSync('sw.js','utf8'))"
python3 -c "import html.parser; html.parser.HTMLParser().feed(open('index.html').read())"
```

These are also a useful "is the build broken?" guard if you're
hacking on a phone via the GitHub web editor.

## Adding a feature

1. **Pick a banner**. Add either `// FEATURE: <name>` (a brand-new
   capability), `// IMPROVEMENT: <name>` (refines something existing),
   or `// FOUNDATION: <name>` (cross-cutting plumbing). The catalogue
   in `FEATURES.md` and the section index at the top of `app.js`
   both grep for these.
2. **Choose a home**. New ribbon button → drop the markup into the
   correct `<div class="ribbon-panel" data-panel="…">` in
   `index.html` and wire its handler under the matching banner in
   `app.js`. If it lives in the File menu, register it in
   `BACKSTAGE_SECTIONS` (or, for legacy actions, add a wrap to
   `setBackstageView`).
3. **State**. If you persist anything, prefix the localStorage key
   with `rodmanword:` and add the key + purpose to `ARCHITECTURE.md`
   under "localStorage keys". There is no migration framework — make
   schema changes additive.
4. **Live fields**. If your feature should re-render on every edit,
   register a name in the `FIELDS` map and emit a
   `<span data-field="…" contenteditable="false">` token. The engine
   walks them on each `refreshFields()` call.
5. **Modal**. If you need one, follow the existing pattern:
   `<div class="modal" id="…Modal" hidden>` with a `<div class="modal-card">`,
   header, body, footer. Open with `openModal($('#…Modal'))`, close
   with `closeModal(...)` or `data-close-modal`.
6. **Toasts** for ephemeral feedback (`toast('msg', 'success' | 'error' | 'info')`).
   Prefer toasts over `alert()`. (Existing native call sites are
   tracked for migration to `toast()` / `confirmDialog()`.)
7. **Service worker**. If you add a new top-level JS / CSS / image
   file, add it to `APP_SHELL` in `sw.js` so it's pre-cached for
   offline use, and bump `VERSION`.
8. **Versioning**. If your change is user-facing, bump `RW_BUILD` in
   `app.js`:
   ```js
   const RW_BUILD = {
     version: '2.2.0',          // semver
     date: '2026-mm-dd',        // build date
     cache: 'rwd-vN+1',         // bump alongside sw.js
     label: 'RodmanWord 2.2',
   };
   ```
   And bump `VERSION` in `sw.js` to the same `rwd-vN+1`.
9. **Document**. Add a row to `FEATURES.md` and a bullet under the
   current version in `CHANGELOG.md`.
10. **Verify** by running the syntax checks above, then push.

## Patterns to follow

- Use `$('#id')` / `$$('selector')` (defined at the top of `app.js`)
  rather than `document.querySelector` directly.
- Use `restoreSelection()` / `saveSelection()` when an action runs
  outside the editor (e.g. modal click) but needs to act on the
  caret's previous position.
- Run editor mutations through `document.execCommand(...)` where
  possible — the browser handles undo / redo for you. Direct DOM
  mutation needs `queueAutosave()` afterwards.
- For new data-action tiles in the File menu, register the action in
  the appropriate `BACKSTAGE_SECTIONS.<section>.tiles` array. A wrap
  on `setBackstageView` is the legacy escape hatch.
- For new menu dropdowns inside the ribbon, wrap the trigger button
  in `<div class="rwd-menu-host">` and the menu items in
  `<div class="rwd-menu" id="…">`. The single rail handler at the
  top of `app.js` toggles `.open`.

## Patterns to avoid

- `document.write`, `eval`, inline `<script>` blocks.
- New external dependencies. Three rules of thumb:
  1. If it can be done with a built-in browser API
     (`DecompressionStream`, `crypto.subtle`, `SpeechSynthesis`,
     `RTCPeerConnection`), do that.
  2. If a tiny pure-JS implementation works (≤ ~500 lines), include
     it inline in the relevant module.
  3. CDN-loaded libraries are out — they break offline / PWA.
- Native `prompt()` / `alert()` / `confirm()` in new code. Prefer the
  `toast()` / modal / `confirmDialog()` helpers — existing call sites
  are tracked for migration.

## Pull requests

- One feature or fix per commit; commit messages should explain *why*
  and what user-visible change resulted, not just *what*.
- Run the syntax checks above before pushing.
- Update `CHANGELOG.md` and `FEATURES.md` in the same commit if your
  change is user-visible.

## License

MIT.
