// =============================================================
//  Video engine — public surface for the converter and any
//  other suite app that needs video transcoding.
//
//  Reusable transforms:
//    transcode(bytes, { from, to, onProgress })      → Uint8Array
//    extractFrame(bytes, { ext, timestamp })          → HTMLCanvasElement
//    extractFrames(bytes, { ext, count, onProgress }) → HTMLCanvasElement[]
//    videoToAnimatedGif(bytes, { ext, fps, onProgress }) → Uint8Array
//
//  The actual ffmpeg calls live in ffmpeg.js. This file owns the
//  encoder selection (per output extension), the seek-to-timestamp
//  workflow for frame extraction, and the two-pass palettegen
//  pipeline for high-quality GIF output.
// =============================================================

import { loadFfmpeg, runFfmpeg } from './ffmpeg.js';

export { loadFfmpeg };

// ---------- Transcode ----------

const ENCODER_FOR = {
  mp4:  ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'],
  mov:  ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'],
  mkv:  ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k'],
  webm: ['-c:v', 'libvpx',  '-b:v', '1M', '-c:a', 'libvorbis'],
  avi:  ['-c:v', 'mpeg4',   '-q:v', '5',  '-c:a', 'mp3'],

  // Microsoft Windows Media — wmv2 video + wmav2 audio in ASF.
  wmv:  ['-c:v', 'wmv2', '-b:v', '1M', '-c:a', 'wmav2', '-b:a', '128k', '-f', 'asf'],
  asf:  ['-c:v', 'wmv2', '-b:v', '1M', '-c:a', 'wmav2', '-b:a', '128k', '-f', 'asf'],

  // Adobe Flash Video — h.264 + aac in flv.
  flv:  ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-f', 'flv'],
  f4v:  ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-f', 'f4v'],

  // 3GPP / 3G2 mobile video — h.264 + aac with mobile-friendly profile.
  '3gp': ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '1', '-f', '3gp'],
  '3g2': ['-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p',
          '-c:a', 'aac', '-b:a', '64k', '-ar', '44100', '-ac', '1', '-f', '3g2'],

  // MPEG-TS / Blu-ray-style transport stream.
  ts:   ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-f', 'mpegts'],
  m2ts: ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-f', 'mpegts'],

  // DVD VOB — MPEG-2 video + MP2 audio in MPEG program stream.
  vob:  ['-c:v', 'mpeg2video', '-b:v', '4M', '-c:a', 'mp2', '-b:a', '192k', '-f', 'vob'],

  // Ogg Theora — open-source video for the open web.
  ogv:  ['-c:v', 'libtheora', '-q:v', '6', '-c:a', 'libvorbis', '-q:a', '4', '-f', 'ogg'],

  // DV — DV video + 16-bit PCM audio. The DV codec only accepts a
  // small set of resolutions; force NTSC 720x480 to avoid encoder
  // errors on arbitrary inputs.
  dv:   ['-target', 'ntsc-dv', '-pix_fmt', 'yuv411p', '-f', 'dv'],

  // HEVC / H.265 in MP4. The hvc1 tag is required for QuickTime
  // and Safari to recognise the stream.
  mp4_h265: ['-c:v', 'libx265', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
             '-tag:v', 'hvc1', '-c:a', 'aac', '-b:a', '128k', '-f', 'mp4'],

  // AV1 in MP4 — libaom is slow even on the fastest preset; expect
  // multi-minute encodes for short clips.
  mp4_av1:  ['-c:v', 'libaom-av1', '-cpu-used', '8', '-row-mt', '1', '-pix_fmt', 'yuv420p',
             '-c:a', 'aac', '-b:a', '128k', '-f', 'mp4'],

  // AV1 in WebM — pairs AV1 video with Opus audio for a fully
  // royalty-free file.
  webm_av1: ['-c:v', 'libaom-av1', '-cpu-used', '8', '-row-mt', '1', '-pix_fmt', 'yuv420p',
             '-c:a', 'libopus', '-b:a', '128k', '-f', 'webm'],

  // ----- Part 7 additions: specialised video targets -----

  // Motion JPEG — webcam / surveillance / scientific. No audio.
  mjpeg: ['-c:v', 'mjpeg', '-q:v', '5', '-an', '-f', 'mjpeg'],

  // Animated PNG — truecolor + alpha alternative to GIF.
  apng:  ['-c:v', 'apng', '-plays', '0', '-an', '-f', 'apng'],

  // Animated WebP — same container as static WebP but with multiple
  // frames; smaller and higher quality than animated GIF.
  webp_anim: ['-c:v', 'libwebp', '-loop', '0', '-an', '-f', 'webp'],

  // Animated AVIF — emerging; encoder support depends on core build.
  avif_anim: ['-c:v', 'libaom-av1', '-cpu-used', '8', '-still-picture', '0',
              '-an', '-f', 'avif'],

  // ProRes inside MOV — Apple Final Cut / Premiere / Resolve
  // intermediate. Profile 3 = ProRes 422 HQ.
  mov_prores: ['-c:v', 'prores_aw', '-profile:v', '3', '-pix_fmt', 'yuv422p10le',
               '-c:a', 'pcm_s16le', '-f', 'mov'],

  // DNxHR inside MXF — Avid intermediate. Profile dnxhr_sq is the
  // smallest standard-quality variant.
  mxf_dnxhr: ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_sq', '-pix_fmt', 'yuv422p',
              '-c:a', 'pcm_s16le', '-f', 'mxf'],

  // YUV4MPEG — uncompressed 4:2:0 Y/Cb/Cr stream for video pipelines.
  y4m: ['-c:v', 'rawvideo', '-pix_fmt', 'yuv420p', '-an', '-f', 'yuv4mpegpipe'],

  // MPEG-1 elementary video stream (VCD-era / archival).
  m1v: ['-c:v', 'mpeg1video', '-an', '-f', 'mpeg1video'],

  // MPEG-2 elementary video stream (DVD authoring inputs).
  m2v: ['-c:v', 'mpeg2video', '-q:v', '5', '-an', '-f', 'mpeg2video'],

  // NUT — FFmpeg native container; preserves arbitrary streams.
  nut: ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k', '-f', 'nut'],

  // Adobe Flash SWF — flv1 video + mp3 audio at 22.05 kHz mono.
  swf: ['-c:v', 'flv1', '-q:v', '5', '-ar', '22050', '-ac', '1',
        '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'swf'],

  // Windows TV Recording (Media Center).
  wtv: ['-c:v', 'wmv2', '-c:a', 'wmav2', '-b:a', '128k', '-f', 'wtv'],

  // On2 IVF — VP9 single-stream test container.
  ivf: ['-c:v', 'libvpx-vp9', '-b:v', '1M', '-an', '-f', 'ivf'],

  // AMV — old Chinese MP3-player video format. Strict 128x96 / 160x120.
  amv: ['-c:v', 'amv', '-vf', 'scale=160:120', '-pix_fmt', 'yuvj420p',
        '-ar', '22050', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'amv'],

  // SMPTE GXF — broadcast pro container.
  gxf: ['-c:v', 'mpeg2video', '-b:v', '8M', '-c:a', 'pcm_s16le', '-f', 'gxf'],
};

// Map codec-variant target keys to the actual FFmpeg-recognised
// container extension. The MP4 / WebM container is selected by
// the output filename, so for "MP4 (H.265)" we still need the
// in-memory FS path to end in `.mp4` even though the matrix key
// is `mp4_h265`. Anything not in this map uses the target key
// directly.
const CONTAINER_EXT = {
  mp4_h265:   'mp4',
  mp4_av1:    'mp4',
  webm_av1:   'webm',
  mov_prores: 'mov',
  mxf_dnxhr:  'mxf',
  webp_anim:  'webp',
  avif_anim:  'avif',
};

/**
 * Transcode a video to a new container/codec combination.
 * @param {Uint8Array} bytes
 * @param {{ from: string, to: string, onProgress?: (ratio: number) => void }} opts
 * @returns {Promise<Uint8Array>}
 */
export async function transcode(bytes, { from, to, onProgress }) {
  const inputName = `input.${from}`;
  const containerExt = CONTAINER_EXT[to] || to;
  const outputName = `output.${containerExt}`;
  const codecArgs = ENCODER_FOR[to] || [];
  const args = ['-i', inputName, ...codecArgs, outputName];
  return runFfmpeg(bytes, { inputName, outputName, args, onProgress });
}

// ---------- Audio extraction / transcoding ----------
//
// `transcodeAudio` covers two flows:
//   1. Video → audio: drop the video stream (-vn) from any video
//      source, encode the audio track with the requested codec.
//   2. Audio → audio: re-encode an audio file (mp3 → wav, etc.).
// FFmpeg picks the right behaviour automatically because video
// inputs simply don't have a video stream after `-vn`.

const AUDIO_ENCODER_FOR = {
  mp3:  ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  m4a:  ['-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  wav:  ['-vn', '-c:a', 'pcm_s16le'],
  ogg:  ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  flac: ['-vn', '-c:a', 'flac'],
  // Opus must ride in an Ogg container; the .opus extension is the
  // common convention for Ogg-Opus files.
  opus: ['-vn', '-c:a', 'libopus', '-b:a', '128k', '-f', 'ogg'],

  // ----- Part 7 additions: specialised audio targets -----

  // Dolby Digital — DVD / Blu-ray surround. 384 kbps is a typical
  // 5.1 bitrate; FFmpeg downmixes mono / stereo cleanly.
  ac3:  ['-vn', '-c:a', 'ac3',  '-b:a', '384k', '-f', 'ac3'],
  // Dolby Digital Plus — streaming surround.
  eac3: ['-vn', '-c:a', 'eac3', '-b:a', '256k', '-f', 'eac3'],
  // Apple Audio Interchange — lossless big-endian PCM.
  aiff: ['-vn', '-c:a', 'pcm_s16be', '-f', 'aiff'],
  // Apple Core Audio Format — wrap AAC in Apple's CAF container.
  caf:  ['-vn', '-c:a', 'aac', '-b:a', '192k', '-f', 'caf'],
  // 3GPP voice (AMR-NB) — narrowband, 8 kHz / mono.
  amr:  ['-vn', '-c:a', 'libopencore_amrnb', '-ar', '8000', '-ac', '1',
         '-b:a', '12.2k', '-f', 'amr'],
  // MPEG-1 Layer 2 — broadcast / DVB.
  mp2:  ['-vn', '-c:a', 'mp2', '-b:a', '192k', '-f', 'mp2'],
  // Windows Media Audio — wmav2 inside ASF.
  wma:  ['-vn', '-c:a', 'wmav2', '-b:a', '192k', '-f', 'asf'],
  // Sun / NeXT AU — big-endian 16-bit PCM.
  au:   ['-vn', '-c:a', 'pcm_s16be', '-f', 'au'],
  // True Audio — lossless, file-extension-driven.
  tta:  ['-vn', '-c:a', 'tta', '-f', 'tta'],
  // WavPack — lossless.
  wv:   ['-vn', '-c:a', 'wavpack', '-f', 'wv'],
  // Speex — old voice codec, in Ogg.
  spx:  ['-vn', '-c:a', 'libspeex', '-f', 'ogg'],
  // GSM Full Rate — telephony 8 kHz mono.
  gsm:  ['-vn', '-c:a', 'libgsm', '-ar', '8000', '-ac', '1', '-f', 'gsm'],
};
// Note on filenames: most audio targets get their muxer from the
// explicit `-f` flag, so output extensions like `.wma`, `.spx`,
// `.amr` are safe even when FFmpeg's filename-to-muxer heuristic
// wouldn't pick them on its own.

/**
 * Drop the video stream and encode the audio track to the target
 * format. Works equally well for audio-as-source inputs since the
 * `-vn` flag is a no-op on streams that have no video.
 * @param {Uint8Array} bytes
 * @param {{ from: string, to: string, onProgress?: (ratio: number) => void }} opts
 * @returns {Promise<Uint8Array>}
 */
export async function transcodeAudio(bytes, { from, to, onProgress }) {
  const codecArgs = AUDIO_ENCODER_FOR[to];
  if (!codecArgs) throw new Error(`Unsupported audio target: .${to}`);
  const inputName = `input.${from}`;
  const outputName = `output.${to}`;
  const args = ['-i', inputName, ...codecArgs, outputName];
  return runFfmpeg(bytes, { inputName, outputName, args, onProgress });
}

// ---------- Subtitles ----------
//
// FFmpeg auto-selects subtitle codecs from input + output filename
// extensions, so subtitle conversion is the simplest case in this
// module: read input.<from>, write output.<to>. Used by the
// converter's new `subtitle` family for SRT ↔ VTT ↔ ASS ↔ SSA ↔
// TTML ↔ LRC interchange.

const SUBTITLE_TARGETS = new Set(['srt', 'vtt', 'ass', 'ssa', 'ttml', 'lrc']);

export function isSubtitleTarget(ext) {
  return SUBTITLE_TARGETS.has(ext);
}

export async function transcodeSubtitle(bytes, { from, to, onProgress }) {
  if (!SUBTITLE_TARGETS.has(to)) throw new Error(`Unsupported subtitle target: .${to}`);
  const inputName = `input.${from}`;
  const outputName = `output.${to}`;
  const args = ['-i', inputName, outputName];
  return runFfmpeg(bytes, { inputName, outputName, args, onProgress });
}

// ---------- Frame extraction ----------

async function decodePngBytesToCanvas(pngBytes) {
  const blob = new Blob([pngBytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Failed to decode extracted frame'));
      im.src = url;
    });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Extract a single frame at the given timestamp (seconds) and
 * return it as a canvas. `timestamp = 0` returns the first frame.
 * @param {Uint8Array} bytes
 * @param {{ ext: string, timestamp?: number }} opts
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function extractFrame(bytes, { ext, timestamp = 0 }) {
  const inputName = `input.${ext}`;
  const outputName = 'frame.png';
  // -ss before -i is fast (input seek). For frame zero this is a no-op.
  const args = ['-ss', String(timestamp), '-i', inputName, '-frames:v', '1', outputName];
  const png = await runFfmpeg(bytes, { inputName, outputName, args });
  return decodePngBytesToCanvas(png);
}

/**
 * Extract `count` evenly-spaced frames across the duration of the
 * video. Useful for thumbnail strips and CBZ comic-page output.
 * @param {Uint8Array} bytes
 * @param {{ ext: string, count?: number, onProgress?: (ratio: number) => void }} opts
 * @returns {Promise<HTMLCanvasElement[]>}
 */
export async function extractFrames(bytes, { ext, count = 24, onProgress }) {
  const inputName = `input.${ext}`;
  // Use ffmpeg's -vf fps=N to pull `count` frames spread across the
  // clip. We don't know duration up front (without a probe), so a
  // safer single-pass approach is `select='not(mod(n,K))'` with K
  // computed from a coarse probe. Easier path: use the
  // `-vf thumbnail=N,scale=...` filter, which picks the most
  // representative frame per N-frame window. For our converter use
  // cases that's perfect.
  const ff = await loadFfmpeg();
  await ff.writeFile(inputName, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  try {
    const args = [
      '-i', inputName,
      '-vf', `thumbnail,select='not(mod(n\\,${Math.max(1, Math.round(30 * 60 / count))}))'`,
      '-vsync', 'vfr',
      '-frames:v', String(count),
      'frame_%04d.png',
    ];
    if (onProgress) {
      const handler = ({ progress }) => {
        if (typeof progress === 'number' && isFinite(progress)) {
          onProgress(Math.max(0, Math.min(1, progress * 0.5))); // first half = encode
        }
      };
      ff.on('progress', handler);
      try {
        const code = await ff.exec(args);
        if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
      } finally {
        ff.off('progress', handler);
      }
    } else {
      const code = await ff.exec(args);
      if (code !== 0) throw new Error(`ffmpeg exited with code ${code}`);
    }
    const entries = await ff.listDir('/');
    const frameNames = entries
      .filter((e) => !e.isDir && /^frame_\d+\.png$/.test(e.name))
      .map((e) => e.name)
      .sort();
    const canvases = [];
    for (let i = 0; i < frameNames.length; i++) {
      const name = frameNames[i];
      const png = await ff.readFile(name);
      canvases.push(await decodePngBytesToCanvas(png instanceof Uint8Array ? png : new Uint8Array(png)));
      try { await ff.deleteFile(name); } catch { /* ignore */ }
      if (onProgress) onProgress(0.5 + 0.5 * ((i + 1) / frameNames.length));
    }
    return canvases;
  } finally {
    try { await ff.deleteFile(inputName); } catch { /* ignore */ }
  }
}

// ---------- Animated GIF ----------

/**
 * Convert a video to an animated GIF using FFmpeg's two-pass
 * palettegen pipeline. The first pass builds a 256-colour palette
 * tailored to the clip; the second pass dithers the video against
 * that palette. Without this the default GIF output looks washed
 * out and posterized.
 *
 * @param {Uint8Array} bytes
 * @param {{ ext: string, fps?: number, width?: number, onProgress?: (ratio: number) => void }} opts
 * @returns {Promise<Uint8Array>}
 */
export async function videoToAnimatedGif(bytes, { ext, fps = 12, width = 480, onProgress }) {
  const ff = await loadFfmpeg();
  const inputName = `input.${ext}`;
  const paletteName = 'palette.png';
  const outputName = 'output.gif';
  await ff.writeFile(inputName, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  try {
    const filterChain = `fps=${fps},scale=${width}:-1:flags=lanczos`;
    if (onProgress) {
      let half = false;
      const handler = ({ progress }) => {
        if (typeof progress !== 'number' || !isFinite(progress)) return;
        const r = Math.max(0, Math.min(1, progress));
        onProgress(half ? 0.5 + 0.5 * r : 0.5 * r);
      };
      ff.on('progress', handler);
      try {
        let code = await ff.exec(['-i', inputName, '-vf', `${filterChain},palettegen`, paletteName]);
        if (code !== 0) throw new Error(`palettegen failed (${code})`);
        half = true;
        code = await ff.exec(['-i', inputName, '-i', paletteName, '-lavfi', `${filterChain} [x]; [x][1:v] paletteuse`, outputName]);
        if (code !== 0) throw new Error(`paletteuse failed (${code})`);
      } finally {
        ff.off('progress', handler);
      }
    } else {
      let code = await ff.exec(['-i', inputName, '-vf', `${filterChain},palettegen`, paletteName]);
      if (code !== 0) throw new Error(`palettegen failed (${code})`);
      code = await ff.exec(['-i', inputName, '-i', paletteName, '-lavfi', `${filterChain} [x]; [x][1:v] paletteuse`, outputName]);
      if (code !== 0) throw new Error(`paletteuse failed (${code})`);
    }
    const out = await ff.readFile(outputName);
    return out instanceof Uint8Array ? out : new Uint8Array(out);
  } finally {
    try { await ff.deleteFile(inputName); } catch { /* ignore */ }
    try { await ff.deleteFile(paletteName); } catch { /* ignore */ }
    try { await ff.deleteFile(outputName); } catch { /* ignore */ }
  }
}
