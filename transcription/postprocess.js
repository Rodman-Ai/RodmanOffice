// RodmanTranscribe — output-quality post-processing.
//
// Pure, deterministic transforms on the segment array. Every step is a
// standalone function so the wiring layer (engine.js / app.js) can opt
// individual steps in via a quality preset, and so node-side unit checks
// can exercise them without a browser.
//
// Segment shape:
//   { t0:number, t1:number, text:string,
//     tokens?: Array<{ text:string, p:number }>,
//     conf?:number,        // segment confidence in [0,1]
//     dropped?:true,       // marked but not removed (for reporting)
//     dropReason?:string,
//     edits?: Array<{ kind:'dictionary'|'punct'|'itn', from:string, to:string }>,
//   }

// ----------------------------------------------------------------------
// 1. Hallucination & repetition removal
// ----------------------------------------------------------------------

// Known whisper hallucinations / boilerplate (English). Conservative — we
// don't want false positives on legitimate transcripts.
export const DEFAULT_BOILERPLATE = [
  /^\s*thanks?\s+(for\s+)?(watching|listening)[\s.!]*$/i,
  /^\s*(thank\s+you\s+for\s+watching)[\s.!]*$/i,
  /^\s*subtitles?\s+(by|provided\s+by|created\s+by)[^\n]+$/i,
  /^\s*(transcrib(ed|ing)\s+by|captions?\s+by)[^\n]+$/i,
  /^\s*\[(blank_audio|silence|music|applause|laughter)\]\s*$/i,
  /^\s*\(?\s*♪+\s*\)?\s*$/, // lone musical-note placeholder
  /^\s*[.…]+\s*$/, // dots / ellipsis only
  /^\s*-+\s*$/, // dash-only
];

/**
 * Crude compression-ratio proxy on consecutive-char runs. Fires on
 * "aaaaaaa…" style loops; we count the run-length encoding length as
 * `unique-runs + total log-decimals-of-each-length`, then return
 * original-length / encoded-length. Real text sits well under 2.
 */
function compressionRatio(s) {
  if (!s) return 0;
  const a = s.length;
  let b = 0;
  let i = 0;
  while (i < s.length) {
    let j = i + 1;
    while (j < s.length && s[j] === s[i]) j++;
    const runLen = j - i;
    // 1 char for the symbol + decimals to encode the run length.
    b += 1 + Math.max(1, Math.floor(Math.log10(runLen) + 1));
    i = j;
  }
  return b === 0 ? 0 : a / b;
}

/** Look for an N-token run that repeats within the same segment. */
function hasInternalRepetition(text, n = 4, minRepeats = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < n * minRepeats) return false;
  for (let i = 0; i + n * minRepeats <= words.length; i++) {
    const phrase = words.slice(i, i + n).join(' ').toLowerCase();
    let reps = 1;
    let j = i + n;
    while (j + n <= words.length &&
           words.slice(j, j + n).join(' ').toLowerCase() === phrase) {
      reps++; j += n;
      if (reps >= minRepeats) return true;
    }
  }
  return false;
}

/**
 * Mark segments that look like hallucinations / boilerplate / degenerate
 * loops. We *mark* (set `dropped`/`dropReason`) rather than splice so the
 * report can show what happened; the caller decides whether to drop.
 */
export function flagHallucinations(segments, opts = {}) {
  const blockers = opts.blockers || DEFAULT_BOILERPLATE;
  const compMax = opts.compressionMax ?? 6; // single-char runs ≥10 trip it; real text sits near 1
  return segments.map((seg) => {
    const text = (seg.text || '').trim();
    if (!text) return { ...seg, dropped: true, dropReason: 'empty' };
    if (blockers.some((re) => re.test(text))) {
      return { ...seg, dropped: true, dropReason: 'boilerplate' };
    }
    if (compressionRatio(text) > compMax) {
      return { ...seg, dropped: true, dropReason: 'repetition' };
    }
    if (hasInternalRepetition(text)) {
      return { ...seg, dropped: true, dropReason: 'repetition' };
    }
    return seg;
  });
}

/** Collapse runs of consecutive identical-text segments to one. */
export function dedupeConsecutive(segments) {
  const out = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && !prev.dropped && !seg.dropped &&
        prev.text.trim().toLowerCase() === seg.text.trim().toLowerCase()) {
      // Extend the previous segment's end time rather than emit a copy.
      prev.t1 = Math.max(prev.t1, seg.t1);
      continue;
    }
    out.push(seg);
  }
  return out;
}

// ----------------------------------------------------------------------
// 2. Energy-based VAD gating
// ----------------------------------------------------------------------

/**
 * Build an energy map from raw Float32 PCM. Buckets are `bucketSec` long;
 * each holds RMS amplitude in [0, ~1].
 */
export function buildEnergyMap(channel, sampleRate, bucketSec = 0.1) {
  if (!channel || !channel.length || !sampleRate) return null;
  const samplesPerBucket = Math.max(1, Math.floor(sampleRate * bucketSec));
  const n = Math.ceil(channel.length / samplesPerBucket);
  const buckets = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const start = i * samplesPerBucket;
    const end = Math.min(channel.length, start + samplesPerBucket);
    for (let j = start; j < end; j++) sum += channel[j] * channel[j];
    buckets[i] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return { bucketSec, buckets };
}

function meanEnergyOver(map, t0, t1) {
  if (!map) return null;
  const a = Math.max(0, Math.floor(t0 / map.bucketSec));
  const b = Math.min(map.buckets.length, Math.ceil(t1 / map.bucketSec));
  if (b <= a) return null;
  let s = 0;
  for (let i = a; i < b; i++) s += map.buckets[i];
  return s / (b - a);
}

/**
 * Mark/drop segments that whisper produced over near-silent audio — the
 * classic "Thanks for watching" hallucination. Only segments BOTH in a
 * quiet span AND already flagged (low confidence / boilerplate / no
 * speech) get dropped — pure silence-only is not enough on its own.
 */
export function vadGate(segments, energyMap, opts = {}) {
  if (!energyMap) return segments;
  const silenceFloor = opts.silenceFloor ?? 0.01; // RMS threshold
  const confFloor = opts.confFloor ?? 0.4;
  return segments.map((seg) => {
    const e = meanEnergyOver(energyMap, seg.t0, seg.t1);
    if (e == null) return seg;
    const isSilent = e < silenceFloor;
    if (!isSilent) return seg;
    const lowConf = typeof seg.conf === 'number' && seg.conf < confFloor;
    if (seg.dropped || lowConf) {
      return { ...seg, dropped: true, dropReason: seg.dropReason || 'vad-silence' };
    }
    // Audible-but-silent edge case: don't drop confident text in silence
    // (the energy map can underestimate quiet narration); just flag.
    return { ...seg, silent: true };
  });
}

// ----------------------------------------------------------------------
// 3. Custom dictionary / find-replace
// ----------------------------------------------------------------------

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/**
 * @param {Array<{from:string,to:string,caseSensitive?:boolean,wholeWord?:boolean}>} terms
 */
export function applyDictionary(segments, terms) {
  if (!terms || !terms.length) return segments;
  const compiled = terms.filter((t) => t && t.from).map((t) => {
    const pat = escRe(t.from);
    const wb = t.wholeWord === false ? '' : '\\b';
    return {
      re: new RegExp(`${wb}${pat}${wb}`, (t.caseSensitive ? 'g' : 'gi')),
      to: t.to == null ? '' : String(t.to),
      from: t.from,
      caseSensitive: !!t.caseSensitive,
    };
  });
  return segments.map((seg) => {
    let text = seg.text;
    const edits = seg.edits ? seg.edits.slice() : [];
    for (const c of compiled) {
      const before = text;
      text = text.replace(c.re, (match) => {
        // Preserve capitalization of the original match when case-insensitive
        // and the user wrote the replacement in lowercase.
        if (!c.caseSensitive && match && match[0] === match[0].toUpperCase() &&
            c.to && c.to[0] !== c.to[0].toUpperCase()) {
          return c.to[0].toUpperCase() + c.to.slice(1);
        }
        return c.to;
      });
      if (text !== before) edits.push({ kind: 'dictionary', from: c.from, to: c.to });
    }
    return { ...seg, text, edits };
  });
}

// ----------------------------------------------------------------------
// 4. Rule-based ITN + truecasing + punctuation polish
// ----------------------------------------------------------------------

const NUM_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000,
  million: 1_000_000, billion: 1_000_000_000,
};

/** Convert a small-scope number phrase ("twenty three") → digits ("23"). */
function smallNumberPhrase(words) {
  let total = 0, current = 0;
  for (const w of words) {
    const v = NUM_WORDS[w.toLowerCase()];
    if (v == null) return null;
    if (v === 100) current = (current || 1) * 100;
    else if (v === 1000 || v === 1_000_000 || v === 1_000_000_000) {
      total += (current || 1) * v;
      current = 0;
    } else if (v >= 20) current += v;
    else current += v;
  }
  return total + current;
}

/**
 * Conservative inverse text normalization. Handles:
 *   - "<n> dollars"/"cents"/"percent" → "$n" / "n¢" / "n%"
 *   - "twenty three" (≤4 word numeric phrases) → "23"
 *   - common dictation: "period"/"comma"/"question mark" → punctuation
 *   - terminal punctuation guarantee
 * Never reorders or invents content.
 */
export function applyItn(segments, opts = {}) {
  return segments.map((seg) => {
    let text = seg.text;
    const before = text;

    // "$23", "23%", "23¢"
    text = text.replace(/\b(\d+(?:\.\d+)?)\s+dollars?\b/gi, '$$$1');
    text = text.replace(/\b(\d+(?:\.\d+)?)\s+cents?\b/gi, '$1¢');
    text = text.replace(/\b(\d+(?:\.\d+)?)\s+percent\b/gi, '$1%');

    // small number-word phrases (≤4 tokens) → digits
    text = text.replace(/\b([A-Za-z]+(?:[ -][A-Za-z]+){0,3})\b/g, (m) => {
      const parts = m.split(/[ -]/);
      const n = smallNumberPhrase(parts);
      return (n != null && n > 0) ? String(n) : m;
    });

    // Dictated punctuation
    text = text.replace(/\s+,\s+|\s+comma\s+/gi, ', ');
    text = text.replace(/\s+period\s+|\s+full stop\s+/gi, '. ');
    text = text.replace(/\s+question mark\s+/gi, '? ');
    text = text.replace(/\s+exclamation (point|mark)\s+/gi, '! ');
    text = text.replace(/\s+new line\s+/gi, '\n');

    // Spacing around punctuation
    text = text.replace(/\s+([,.;:!?])/g, '$1');
    text = text.replace(/([,;:])([A-Za-z])/g, '$1 $2');

    // Smart quotes (off by default — preserve plain ASCII unless asked)
    if (opts.smartQuotes) {
      text = text.replace(/(^|[\s(])"([^"]*)"/g, '$1“$2”');
      text = text.replace(/'/g, '’');
    }

    text = text.trim();
    const edits = seg.edits ? seg.edits.slice() : [];
    if (text !== before) edits.push({ kind: 'itn', from: before, to: text });
    return { ...seg, text, edits };
  });
}

/** Truecasing: capitalize the start of every sentence + a few proper words. */
export function truecase(segments) {
  let needCap = true; // capitalize the very first word
  return segments.map((seg) => {
    const before = seg.text;
    const chars = seg.text.split('');
    for (let i = 0; i < chars.length; i++) {
      const c = chars[i];
      if (needCap && /[A-Za-z]/.test(c)) {
        chars[i] = c.toUpperCase();
        needCap = false;
      } else if (/[.!?]/.test(c)) {
        needCap = true;
      }
    }
    let text = chars.join('');
    // " i " → " I "
    text = text.replace(/(^|[^A-Za-z])i([^A-Za-z]|$)/g, '$1I$2');
    const edits = seg.edits ? seg.edits.slice() : [];
    if (text !== before) edits.push({ kind: 'punct', from: before, to: text });
    return { ...seg, text };
  });
}

/** Guarantee a terminal punctuation mark at the end of each segment. */
export function ensureTerminal(segments) {
  return segments.map((seg) => {
    if (!seg.text) return seg;
    if (/[.!?…”")\]]\s*$/.test(seg.text)) return seg;
    return { ...seg, text: seg.text.replace(/\s*$/, '.') };
  });
}

// ----------------------------------------------------------------------
// 5. Subtitle-quality cue shaping
// ----------------------------------------------------------------------

/** Hard-split text on word boundaries to ≤ maxChars per line, ≤ 2 lines. */
export function wrapCue(text, maxChars = 42, maxLines = 2) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (!line) { line = w; continue; }
    if (line.length + 1 + w.length <= maxChars) { line += ' ' + w; }
    else { lines.push(line); line = w; if (lines.length === maxLines) break; }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // If words remain, hard-truncate the second line.
  return lines.slice(0, maxLines).join('\n');
}

/**
 * Reshape segments for caption quality:
 *   - merge segments shorter than `minDur`,
 *   - split segments whose CPS exceeds `cpsMax` (at the nearest sentence
 *     boundary if possible, else at a comma, else mid-text proportionally),
 *   - cap duration at `maxDur` per cue,
 *   - wrap each line to `maxChars` (default 42), ≤ `maxLines` (default 2).
 */
export function shapeCaptions(segments, opts = {}) {
  const cpsMax = opts.cpsMax ?? 17;
  const minDur = opts.minDur ?? 1.0;
  const maxDur = opts.maxDur ?? 7.0;
  const maxChars = opts.maxChars ?? 42;
  const maxLines = opts.maxLines ?? 2;

  // 1. Merge under-short segments forward.
  let merged = [];
  for (const seg of segments) {
    if (seg.dropped) { merged.push(seg); continue; }
    const last = merged[merged.length - 1];
    if (last && !last.dropped && last.t1 - last.t0 < minDur &&
        last.text.length + seg.text.length < maxChars * maxLines) {
      last.text = (last.text + ' ' + seg.text).replace(/\s+/g, ' ').trim();
      last.t1 = seg.t1;
    } else {
      merged.push({ ...seg });
    }
  }

  // 2. Split long / fast cues.
  const out = [];
  for (const seg of merged) {
    if (seg.dropped) { out.push(seg); continue; }
    const dur = Math.max(0.01, seg.t1 - seg.t0);
    const cps = seg.text.length / dur;
    if (dur <= maxDur && cps <= cpsMax) { out.push(seg); continue; }

    // Choose a split point: prefer sentence boundary; then comma; then mid.
    const text = seg.text;
    let cut = -1;
    const sentenceRe = /[.!?]\s+/g;
    let m;
    while ((m = sentenceRe.exec(text)) !== null) {
      if (m.index > text.length * 0.3 && m.index < text.length * 0.7) {
        cut = m.index + m[0].length;
        break;
      }
    }
    if (cut < 0) {
      const commaIdx = text.lastIndexOf(', ', Math.floor(text.length * 0.6));
      if (commaIdx > text.length * 0.3) cut = commaIdx + 2;
    }
    if (cut < 0) cut = Math.floor(text.length / 2);

    const leftText = text.slice(0, cut).trim();
    const rightText = text.slice(cut).trim();
    const split = leftText.length / Math.max(1, text.length);
    const mid = seg.t0 + dur * split;
    out.push({ ...seg, text: leftText, t1: mid });
    out.push({ ...seg, text: rightText, t0: mid, edits: undefined });
  }

  // 3. Wrap each cue's lines.
  return out.map((seg) => seg.dropped ? seg : ({
    ...seg, text: wrapCue(seg.text, maxChars, maxLines),
  }));
}

// ----------------------------------------------------------------------
// 6. Paragraphing
// ----------------------------------------------------------------------

/**
 * Group segments into paragraphs. A paragraph break is inserted when the
 * inter-segment pause exceeds `pauseGap` seconds — `sentenceBreakGap` (a
 * shorter pause) is also enough IF the previous segment ended a sentence.
 * Otherwise sentence punctuation alone does NOT force a break (a single
 * line is a sequence of sentences).
 */
export function paragraphs(segments, opts = {}) {
  const pauseGap = opts.pauseGap ?? 1.5;
  const sentenceBreakGap = opts.sentenceBreakGap ?? 0.6;
  const sentenceEnd = /[.!?]['")\]]?\s*$/;
  const groups = [];
  let cur = [];
  let lastEnd = -Infinity;
  let lastText = '';
  for (const seg of segments) {
    if (seg.dropped) continue;
    const gap = seg.t0 - lastEnd;
    let startNew = false;
    if (cur.length === 0) startNew = false;
    else if (gap >= pauseGap) startNew = true;
    else if (gap >= sentenceBreakGap && sentenceEnd.test(lastText)) startNew = true;
    if (startNew) { groups.push(cur); cur = []; }
    cur.push(seg);
    lastEnd = seg.t1;
    lastText = seg.text;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

// ----------------------------------------------------------------------
// 7. Quality presets — orchestrate the pipeline
// ----------------------------------------------------------------------

export const PRESETS = {
  fast:     { hallucinations: true, vad: true,  itn: false, truecase: true,  captions: false, dedupe: true,  dictionary: true },
  balanced: { hallucinations: true, vad: true,  itn: true,  truecase: true,  captions: true,  dedupe: true,  dictionary: true },
  max:      { hallucinations: true, vad: true,  itn: true,  truecase: true,  captions: true,  dedupe: true,  dictionary: true },
};

/**
 * Run the full pipeline. Returns { segments, report }.
 *
 * `opts.energyMap` (optional) enables VAD gating; `opts.terms` enables the
 * dictionary; `opts.preset` ('fast'|'balanced'|'max') picks the steps.
 */
export function runPipeline(rawSegments, opts = {}) {
  const preset = PRESETS[opts.preset] || PRESETS.balanced;
  const initial = rawSegments.length;
  let segs = rawSegments.map((s) => ({ ...s }));

  let dropped = 0, dictionaryFixes = 0, edits = 0;

  if (preset.hallucinations) segs = flagHallucinations(segs);
  if (preset.vad && opts.energyMap) segs = vadGate(segs, opts.energyMap);
  if (preset.dedupe) segs = dedupeConsecutive(segs);
  if (preset.dictionary && opts.terms?.length) segs = applyDictionary(segs, opts.terms);
  if (preset.itn) segs = applyItn(segs, { smartQuotes: !!opts.smartQuotes });
  if (preset.truecase) segs = truecase(segs);
  segs = ensureTerminal(segs);

  // Optional caption-shape pass produces a second list; we keep both.
  let captions = null;
  if (preset.captions) captions = shapeCaptions(segs, opts.captionOpts || {});

  // Build the report.
  const kept = [];
  for (const s of segs) {
    if (s.dropped) dropped++;
    else kept.push(s);
    if (s.edits) {
      for (const e of s.edits) {
        edits++;
        if (e.kind === 'dictionary') dictionaryFixes++;
      }
    }
  }
  const confs = kept.map((s) => s.conf).filter((c) => typeof c === 'number');
  const avgConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
  const lowConfWords = kept.reduce((n, s) => {
    if (!Array.isArray(s.tokens)) return n;
    return n + s.tokens.filter((t) => typeof t.p === 'number' && t.p < 0.5).length;
  }, 0);
  const totalWords = kept.reduce((n, s) => n + (s.text ? s.text.split(/\s+/).filter(Boolean).length : 0), 0);

  const report = {
    initialSegments: initial,
    finalSegments: kept.length,
    droppedSegments: dropped,
    dictionaryFixes,
    edits,
    avgConfidence: avgConf,
    lowConfidenceWords: lowConfWords,
    totalWords,
    lowConfidenceRate: totalWords ? lowConfWords / totalWords : 0,
  };

  return { segments: kept, captions, report };
}

// ----------------------------------------------------------------------
// 8. Dictionary persistence helpers (browser-side; safe in node — guarded)
// ----------------------------------------------------------------------

const DICT_KEY = 'rodman:transcribe:dictionary';

export function loadDictionary() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(DICT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
export function saveDictionary(terms) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DICT_KEY, JSON.stringify(terms));
  } catch { /* ignore */ }
}
