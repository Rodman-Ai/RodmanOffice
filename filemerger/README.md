# FileMerger

Merge videos into one MP4, or PDFs into one PDF, entirely in the browser.

| File | Purpose |
|---|---|
| `index.html` | Page shell: Videos / PDFs tabs. |
| `app.js` | Tab switching; routes files dropped anywhere on the page to the right tab. |
| `video.js`, `video-merge.js` | Video tab, vendored from [MP4 Merger](https://github.com/Rodman-Ai/mp4merger) (MIT). |
| `pdf.js` | PDF tab UI: page ranges, rotation, reorder, bookmark per file. |
| `sw.js` | Offline app shell (network-first). |

## Videos

`video.js` and `video-merge.js` are upstream's `src/main.ts` and `src/merge.ts`
with the TypeScript types stripped (TypeScript `transpileModule`, ES2022), so no
build step is needed. The only logic change is that drag-and-drop moved to `app.js`.
The `mediabunny` dependency is vendored at
`lib/video/vendor/mediabunny/mediabunny.min.mjs` (MPL-2.0, see `lib/video/README.md`).

To sync with upstream: re-transpile both files, point the `mediabunny` import at
the vendored bundle and `./merge` at `./video-merge.js`, and remove the drop-zone
handlers from `video.js`.

## PDFs

The merge engine is `lib/docs/pdfmerge.js`, hand-rolled like the suite's other
format engines. It copies page objects byte-for-byte, so merging is lossless.
Encrypted files (and any the parser can't read) are rendered with the vendored
pdf.js at about 200 dpi and merged as JPEG pages; the UI flags these files.
