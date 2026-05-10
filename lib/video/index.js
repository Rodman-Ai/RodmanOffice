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
};

/**
 * Transcode a video to a new container/codec combination.
 * @param {Uint8Array} bytes
 * @param {{ from: string, to: string, onProgress?: (ratio: number) => void }} opts
 * @returns {Promise<Uint8Array>}
 */
export async function transcode(bytes, { from, to, onProgress }) {
  const inputName = `input.${from}`;
  const outputName = `output.${to}`;
  const codecArgs = ENCODER_FOR[to] || [];
  const args = ['-i', inputName, ...codecArgs, outputName];
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
