# Shared Video Engine

`lib/video` is the FFmpeg.wasm-backed video engine for the suite. The
RodmanConvert app loads it lazily — the ~25 MB wasm binary is only
fetched on the first video conversion of a session.

## Public surface

| File | Purpose |
|---|---|
| `index.js` | High-level operations: `transcode`, `extractFrame`, `extractFrames`, `videoToAnimatedGif`, `loadFfmpeg`. |
| `ffmpeg.js` | Memoized FFmpeg.wasm loader and a generic `runFfmpeg(bytes, { args, ... })` runner. |

## Vendored Dependencies

| Dependency | Vendored file(s) | Version | License | Used for |
|---|---|---:|---|---|
| `@ffmpeg/ffmpeg` | `vendor/ffmpeg/ffmpeg.mjs` (concatenated bundle), `vendor/ffmpeg/ffmpeg-worker.mjs` | 0.12.10 | MIT | High-level FFmpeg.wasm worker driver. |
| `@ffmpeg/core` | `vendor/ffmpeg/ffmpeg-core.js`, `vendor/ffmpeg/ffmpeg-core.wasm` | 0.12.6 | LGPL-2.1 (FFmpeg) + MIT (build glue) | Single-threaded FFmpeg compiled to WebAssembly. |

The `ffmpeg-core.wasm` binary is a build of FFmpeg with `--enable-gpl=no`,
so it ships under the LGPL-2.1. The JavaScript glue is MIT. The single-
threaded build is intentional: the multi-threaded `@ffmpeg/core-mt` build
needs `SharedArrayBuffer`, which requires `COOP: same-origin` /
`COEP: require-corp` headers that GitHub Pages can't set on static files.

## Update Process

1. Replace `vendor/ffmpeg/ffmpeg-core.js` and `ffmpeg-core.wasm` with the
   files from a fresh `npm pack @ffmpeg/core@<new>` (single-threaded ESM
   build, files under `dist/esm/`).
2. Re-bundle `vendor/ffmpeg/ffmpeg.mjs` and `ffmpeg-worker.mjs` from
   `npm pack @ffmpeg/ffmpeg@<new>` if the high-level API changed; the
   originals concatenate `index.js + classes.js + const.js + errors.js +
   utils.js + types.js` into one ESM file.
3. Verify version + license columns in this README match the new package
   metadata.
4. Run `node --check lib/video/*.js` and a browser smoke test:
   - PNG of frame 0 from a 5-second `.mp4` clip.
   - Round-trip `.avi → .mp4` in Chrome.
5. Confirm the converter's service worker still excludes
   `lib/video/vendor/ffmpeg/` from precache (`converter/sw.js`).

## Lazy Load Behavior

`loadFfmpeg()` is the entry point. The first call constructs an `FFmpeg`
instance and downloads `ffmpeg-core.wasm` (~25 MB). The browser HTTP
cache persists the binary across visits, so subsequent loads are
instantaneous. The instance is memoized in module scope for the rest of
the page session.

The converter shows a "Loading video engine…" status on the row that
triggers the first download so the wait isn't silent.
