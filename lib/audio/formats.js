/**
 * @file Whisper segment formatters: segments[] → txt / srt / vtt / json.
 *
 * Segment shape:
 *   { t0: number_seconds, t1: number_seconds, text: string }
 *
 * All formatters return a Uint8Array so the converter's download path
 * (which is uniform across binary engines) can write them with no
 * special casing.
 */

const encoder = new TextEncoder();

function pad(n, width = 2) {
  return String(Math.floor(n)).padStart(width, "0");
}

/** SRT timestamp: HH:MM:SS,mmm */
function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/** WebVTT timestamp: HH:MM:SS.mmm */
function vttTime(seconds) {
  return srtTime(seconds).replace(",", ".");
}

/**
 * Plain transcript. Joins all segments and inserts a blank line at long
 * pauses (≥1.5 s) so the output isn't one wall of text.
 */
export function toTxt(segments) {
  const out = [];
  let last = 0;
  for (const seg of segments) {
    const gap = seg.t0 - last;
    if (out.length && gap >= 1.5) out.push("");
    out.push(seg.text.trim());
    last = seg.t1;
  }
  return encoder.encode(out.join("\n").replace(/\n+$/, "") + "\n");
}

/**
 * Wrap caption text to at most `maxLines` lines of at most `maxChars`
 * characters each, on word boundaries. Used by toSrt/toVtt; callers can
 * pre-shape segments separately if they want richer behaviour.
 */
export function wrapCaptionText(text, maxChars = 42, maxLines = 2) {
  const t = String(text || '').trim();
  if (!t) return t;
  const words = t.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if (line.length + 1 + w.length <= maxChars) line += ' ' + w;
    else { lines.push(line); line = w; if (lines.length === maxLines) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines).join('\n');
}

export function toSrt(segments, opts = {}) {
  const wrap = opts.wrap !== false;
  const lines = [];
  segments.forEach((seg, i) => {
    lines.push(String(i + 1));
    lines.push(`${srtTime(seg.t0)} --> ${srtTime(seg.t1)}`);
    const text = wrap
      ? wrapCaptionText(seg.text, opts.maxChars, opts.maxLines)
      : seg.text.trim();
    lines.push(text);
    lines.push("");
  });
  return encoder.encode(lines.join("\n"));
}

export function toVtt(segments, opts = {}) {
  const wrap = opts.wrap !== false;
  const lines = ["WEBVTT", ""];
  for (const seg of segments) {
    lines.push(`${vttTime(seg.t0)} --> ${vttTime(seg.t1)}`);
    const text = wrap
      ? wrapCaptionText(seg.text, opts.maxChars, opts.maxLines)
      : seg.text.trim();
    lines.push(text);
    lines.push("");
  }
  return encoder.encode(lines.join("\n"));
}

export function toJson(segments) {
  const compact = segments.map((s) => ({
    t0: Number(s.t0.toFixed(3)),
    t1: Number(s.t1.toFixed(3)),
    text: s.text.trim(),
  }));
  return encoder.encode(JSON.stringify(compact, null, 2));
}

/**
 * Confidence-annotated JSON: preserves `conf` and `tokens:[{text,p}]` when
 * present so a downstream tool / QA pass can act on per-word probability.
 */
export function toJsonRich(segments) {
  const out = segments.map((s) => {
    const r = {
      t0: Number(s.t0.toFixed(3)),
      t1: Number(s.t1.toFixed(3)),
      text: s.text.trim(),
    };
    if (typeof s.conf === 'number') r.conf = Number(s.conf.toFixed(3));
    if (Array.isArray(s.tokens) && s.tokens.length) {
      r.tokens = s.tokens.map((t) => ({ text: t.text, p: Number((t.p ?? 0).toFixed(3)) }));
    }
    return r;
  });
  return encoder.encode(JSON.stringify(out, null, 2));
}

/**
 * Markdown transcript: timestamped paragraphs. Each segment becomes a
 * `**[mm:ss]** text` line; a long pause (≥1.5 s) starts a new paragraph.
 * Handy for pasting a readable transcript into notes / docs.
 */
export function toMd(segments) {
  const stamp = (s) => {
    const total = Math.max(0, Math.floor(s));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    return (h ? `${pad(h)}:` : "") + `${pad(m)}:${pad(sec)}`;
  };
  const lines = ["# Transcript", ""];
  let last = 0;
  for (const seg of segments) {
    if (lines.length > 2 && seg.t0 - last >= 1.5) lines.push("");
    lines.push(`**[${stamp(seg.t0)}]** ${seg.text.trim()}`);
    last = seg.t1;
  }
  return encoder.encode(lines.join("\n") + "\n");
}

/** Format dispatcher used by the converter and the transcription app. */
export const FORMATTERS = {
  txt: toTxt,
  srt: toSrt,
  vtt: toVtt,
  json: toJson,
  md: toMd,
  jsonrich: toJsonRich,
};
