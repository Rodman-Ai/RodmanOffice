# whisper.cpp WASM vendor blob

Drop the single-threaded build's output here:

- `libmain.js`
- `libmain.wasm`
- `LICENSE.txt` (copy of whisper.cpp's MIT LICENSE)

Build instructions are in `lib/audio/README.md`. Until those files land,
`lib/audio/whisper.js#ensureEngineAvailable()` will throw a clear
"Transcription engine isn't installed" error so the rest of the
converter keeps working.
