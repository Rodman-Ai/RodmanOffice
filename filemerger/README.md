# FileMerger

Merge videos into one MP4, or PDFs, images and documents into one PDF packet, entirely in the browser.

| File | Purpose |
|---|---|
| `index.html` | Page shell: Videos / PDFs tabs. |
| `app.js` | Tab switching; routes files dropped anywhere on the page to the right tab. |
| `video.js`, `video-merge.js` | Video tab, vendored from [MP4 Merger](https://github.com/Rodman-Ai/mp4merger) (MIT). |
| `pdf.js` | PDF tab UI ("PDFs & documents"): page ranges, rotation, reorder, packet options. |
| `packet.js` | Turns images, documents, spreadsheets and slides into merge sources. |
| `sw.js` | Network-first cache: precaches the app shell and caches the `/lib` engines on first use. |

## Videos

`video.js` and `video-merge.js` are upstream's `src/main.ts` and `src/merge.ts`
with the TypeScript types stripped (TypeScript `transpileModule`, ES2022), so no
build step is needed. Local logic changes: drag-and-drop moved to `app.js`, and
Sort and Clear are disabled while a merge runs (upstream leaves them enabled, and
Clear then disposes the inputs the merge is reading, which crashes it).
The `mediabunny` dependency is vendored at
`lib/video/vendor/mediabunny/mediabunny.min.mjs` (MPL-2.0, see `lib/video/README.md`).

MP4 Merger is MIT licensed, Copyright (c) 2026 Leo Rodman. The vendored files
carry that license; see the upstream repository's `LICENSE`.

To sync with upstream: re-transpile both files, point the `mediabunny` import at
the vendored bundle and `./merge` at `./video-merge.js`, and remove the drop-zone
handlers from `video.js`.

## PDFs & documents (PDF packet)

Drop any mix of these, in any order:

| Input | How it becomes pages |
|---|---|
| PDF | Pages copied losslessly (below). |
| JPEG | Embedded byte-for-byte; the EXIF orientation is applied by the page's placement, so phone photos come out upright with no re-compression. |
| PNG, WebP, GIF, BMP, AVIF, SVG, HEIC (Safari only) | Decoded by the browser and stored losslessly, keeping transparency. SVG is rasterized at 2400 px on its long edge. |
| Word (DOCX, DOC), RTF, ODT, EPUB, HTML, text, Markdown | Converted with the suite's own engines (`lib/docs` to HTML, then `savePdf`). |
| Excel (XLSX, XLS), CSV, TSV | Each sheet becomes a table (`lib/sheets`). |
| PowerPoint (PPTX) | Slide titles and text as an outline (`lib/slides`). |

Converted files keep their text, headings, lists and tables, but not pictures
or exact layout, because `savePdf` draws with the built-in PDF fonts. For the
same reason, characters outside Latin-1 (other scripts, emoji) print as "?";
the list warns about both per file. For a faithful copy, save the file as PDF
from its own app and drop that in instead.

Packet options (remembered per browser under `filemerger.packet`):

- **Paper size** for images and converted files: Letter, A4, or "Match each
  image". The default follows the browser's locale. Images are centered in a
  half-inch margin, turned landscape when wide, and never enlarged beyond
  1 px = 1 pt. Changing it re-converts documents. PDFs keep their own sizes.
- **Page numbers**: "Page 1 of N" (bottom center) or Bates numbers (a prefix and
  a 6-digit number from a chosen start, bottom right). Stamped on every page,
  upright even on rotated pages.
- **Contents page**: one or more pages at the front listing each file and the
  page it starts on, each line a link.
- **Bookmarks**: one per file (plus one for the contents page).

### PDF merging

The merge engine is `lib/docs/pdfmerge.js`, hand-rolled like the suite's other
format engines. It copies page objects byte-for-byte, so merging is lossless.
Encrypted files (and any the parser can't read) are rendered with the vendored
pdf.js at about 200 dpi and merged as JPEG pages; the UI flags these files.

Internal links keep working: named destinations are converted to direct page
links during the copy, and links to pages you left out are removed (viewers
would otherwise send them to page 1). Web links are untouched.

What does not carry over from the source files: each source's own bookmarks,
form-field interactivity (fields keep their appearance but can't be filled),
layer visibility settings, accessibility tagging, attachments and document
JavaScript. The full list is in the header of `lib/docs/pdfmerge.js`.

Page ranges accept `1-3, 5, 8-` (open-ended), `5-1` (reverse order) and repeats;
spaces around the dash are fine.
