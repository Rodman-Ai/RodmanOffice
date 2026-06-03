/**
 * Shared window-level drag-and-drop dropzone helper for the suite's
 * browser apps (Word, Slides, Vision, Image — anywhere a user can drop
 * a file onto the page to open it).
 *
 * Handles four subtleties that every previous bespoke implementation
 * either got wrong or had to invent from scratch:
 *
 *   1. **dragenter/dragover must preventDefault** for `'Files'` drags
 *      or the `drop` event never fires.
 *   2. **Internal drags** (text selections, sortable rows, app-specific
 *      MIME types) must not trigger the dropzone — gated on
 *      `dataTransfer.types.includes('Files')`.
 *   3. **Highlight flicker** — every descendant the cursor crosses
 *      fires its own dragenter/dragleave. A depth counter
 *      (++ on enter, -- on leave, reset on drop) keeps the overlay
 *      steady.
 *   4. **pointer-events on the overlay must be `none`** so the overlay
 *      can't become its own drag target — that's the caller's
 *      responsibility, documented here.
 *
 * Usage (from a classic-script app):
 *
 *     import { mountWindowDropzone } from '../lib/ui/dropzone.js';
 *     mountWindowDropzone({
 *       overlayId: 'dropOverlay',
 *       onFiles: (files, e) => {
 *         for (const f of files) loadFileIntoNewTab(f);
 *       },
 *     });
 *
 * The CSS toggle is `.is-active` on the overlay element.
 *
 * @param {object} opts
 * @param {string} [opts.overlayId='dropOverlay']
 *   Element id of the highlight overlay. Optional — pass null to skip.
 * @param {(files: FileList, event: DragEvent) => void} opts.onFiles
 *   Called once per drop, with the dropped FileList and the original
 *   event (so the caller can inspect drop coordinates / target).
 * @returns {() => void} A detach function that removes all listeners.
 */
export function mountWindowDropzone(opts) {
  const { overlayId = 'dropOverlay', onFiles } = opts;
  const overlay = overlayId ? document.getElementById(overlayId) : null;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');

  let depth = 0;
  const show = () => overlay?.classList.add('is-active');
  const hide = () => { depth = 0; overlay?.classList.remove('is-active'); };

  const onEnter = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    show();
  };
  const onOver = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };
  const onLeave = (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) overlay?.classList.remove('is-active');
  };
  const onDrop = (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    const files = e.dataTransfer.files;
    if (!files || !files.length) return;
    onFiles(files, e);
  };

  document.addEventListener('dragenter', onEnter);
  document.addEventListener('dragover', onOver);
  document.addEventListener('dragleave', onLeave);
  document.addEventListener('drop', onDrop);

  return () => {
    document.removeEventListener('dragenter', onEnter);
    document.removeEventListener('dragover', onOver);
    document.removeEventListener('dragleave', onLeave);
    document.removeEventListener('drop', onDrop);
    hide();
  };
}
