// RodmanTranscribe — UI controller.
import * as engine from './engine.js';
import * as pp from './postprocess.js';
import * as history from './history.js';
import * as share from './share.js';
import { mountWindowDropzone } from '../lib/ui/dropzone.js';

const $ = (s) => document.querySelector(s);

// ---- environment ----
const UA = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
const IS_IOS = /iPad|iPhone|iPod/.test(UA) ||
  (UA.includes('Mac') && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const IS_MOBILE = IS_IOS || /Android/i.test(UA);
const HC = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
const RAM_GB = (typeof navigator !== 'undefined' && navigator.deviceMemory) || null;

// Devices that can't comfortably hold a 1 GB model in WASM heap. Defaults
// to base.en on these; a one-tap "use large-v3 anyway" link still works.
const LOW_RAM = IS_MOBILE || (RAM_GB !== null && RAM_GB <= 4);
const APP_DEFAULT_MODEL = LOW_RAM ? 'base.en-q5_1' : 'large-v3-q5_0';
const APP_DEFAULT_THREADS = Math.min(HC, IS_MOBILE ? 4 : 8);

// ---- state ----
let currentFile = null;
let currentTranscriptId = null;
let playerUrl = null;
let rawSegments = [];    // streamed from the engine, untouched
let segments = [];       // post-processed (what's rendered/exported)
let preProofread = null; // snapshot for proofread revert
let preTranslate = null; // snapshot for translate revert
let peaks = null;        // cached waveform peaks for cheap playhead redraw
let pcmChannel = null;   // Float32Array reused for VAD
let pcmSampleRate = 0;
let energyMap = null;    // {bucketSec, buckets} — computed once per source
let audioDuration = 0;
let recorder = null;
let recChunks = [];
let recTimer = 0;
let running = false;
let runAbort = null;     // AbortController for cancelling a run
let claudeAbort = null;  // AbortController for proofread/translate/summary
let claudeBusy = false;
let dictionary = pp.loadDictionary();
let saveDebounce = 0;

const player = $('#player');
const transcriptEl = $('#transcript');

// ===================================================================
// Cross-origin isolation banner — iOS-aware
// ===================================================================
function refreshCoi() {
  const isolated = engine.isCrossOriginIsolated();
  $('#coiBanner').hidden = isolated;
  if (isolated) {
    try { sessionStorage.removeItem('coiReloaded'); } catch { /* ignore */ }
    return;
  }
  // We're NOT isolated. Two cases:
  //   1. Page hasn't reloaded under the SW yet — the inline bootstrap
  //      script will do that automatically; show the "preparing" copy.
  //   2. We already reloaded once this session and still aren't isolated
  //      (an iOS Safari edge case where the SW didn't take control on
  //      the first try). Surface a manual Reload button and helpful copy.
  let alreadyTried = false;
  try { alreadyTried = !!sessionStorage.getItem('coiReloaded'); } catch { /* ignore */ }
  const title = $('#coiTitle');
  const body = $('#coiBody');
  const btn = $('#coiReloadBtn');
  if (alreadyTried) {
    title.textContent = 'Tap Reload to enable the transcription engine.';
    body.textContent = IS_IOS
      ? 'Safari sometimes needs an extra reload to enter the isolated tab where multi-threaded WebAssembly runs.'
      : 'Your browser needs an extra reload to enter the isolated tab where multi-threaded WebAssembly runs.';
    btn.hidden = false;
  } else {
    title.textContent = 'Preparing the high-performance engine…';
    body.textContent = 'This tab needs cross-origin isolation for multi-threaded transcription.';
    btn.hidden = true;
  }
}
$('#coiReloadBtn')?.addEventListener('click', () => {
  try { sessionStorage.removeItem('coiReloaded'); } catch { /* ignore */ }
  window.location.reload();
});
refreshCoi();
window.addEventListener('load', () => setTimeout(refreshCoi, 200));

// ===================================================================
// Model picker
// ===================================================================
function fmtBytes(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' GB';
  if (n >= 1e6) return (n / 1e6).toFixed(0) + ' MB';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + ' KB';
  return n + ' B';
}
function populateModels() {
  const sel = $('#modelSelect');
  sel.innerHTML = '';
  for (const [id, m] of Object.entries(engine.MODELS)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${m.label} — ${fmtBytes(m.bytes)}`;
    sel.appendChild(opt);
  }
  sel.value = engine.MODELS[APP_DEFAULT_MODEL] ? APP_DEFAULT_MODEL : engine.DEFAULT_MODEL_ID;
}
async function updateModelNote() {
  const id = $('#modelSelect').value;
  const m = engine.MODELS[id];
  const cached = await engine.isModelCached(id).catch(() => false);
  const big = m.bytes >= 1e9;
  $('#modelNote').innerHTML =
    `Quality: <strong>${m.quality}</strong> · ${fmtBytes(m.bytes)} · ` +
    (cached ? '<span class="ok">downloaded</span>'
            : 'downloads on first use') +
    (big ? ' · <span class="warn">large — desktop with 8 GB+ RAM recommended</span>' : '');
}

// Hardware-aware hint shown above the model picker on mobile / low-RAM
// devices. Offers a one-tap escape hatch to large-v3 anyway.
function showHardwareHint() {
  const hint = $('#hardwareHint');
  if (!hint) return;
  if (!LOW_RAM) { hint.hidden = true; return; }
  const big = $('#modelSelect').value === 'large-v3-q5_0';
  hint.hidden = big;
  hint.innerHTML =
    `This device works best with the smaller English model. ` +
    `<button type="button" class="link" id="hwUseBig">Use large-v3 anyway</button>`;
  $('#hwUseBig')?.addEventListener('click', () => {
    $('#modelSelect').value = 'large-v3-q5_0';
    saveSettings();
    updateModelNote();
    showHardwareHint();
  });
}

// ===================================================================
// Source selection
// ===================================================================
function setSource(file) {
  if (!file) return;
  clearSource(false);
  currentFile = file;
  $('#sourceName').textContent = file.name;
  $('#sourceInfo').hidden = false;
  $('#dropTarget').classList.add('has-source');
  playerUrl = URL.createObjectURL(file);
  player.src = playerUrl;
  $('#runBtn').disabled = false;
  drawWaveform(file).catch(() => { $('#waveform').hidden = true; });
}
function clearSource(full = true) {
  currentFile = null;
  peaks = null;
  pcmChannel = null;
  pcmSampleRate = 0;
  audioDuration = 0;
  if (playerUrl) { URL.revokeObjectURL(playerUrl); playerUrl = null; }
  player.removeAttribute('src');
  $('#waveform').hidden = false;
  if (full) {
    $('#sourceInfo').hidden = true;
    $('#dropTarget').classList.remove('has-source');
    $('#sourceName').textContent = '';
    $('#sourceDur').textContent = '';
    $('#runBtn').disabled = true;
  }
}
$('#chooseBtn').addEventListener('click', () => $('#filePicker').click());
$('#filePicker').addEventListener('change', (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (f) setSource(f);
});
$('#clearSourceBtn').addEventListener('click', () => clearSource(true));

mountWindowDropzone({
  onFiles: (files) => {
    for (const f of files) {
      if (f.type.startsWith('audio/') || f.type.startsWith('video/') ||
          /\.(mp3|wav|m4a|ogg|opus|flac|aac|mp4|mov|mkv|webm|avi|m4v|wma)$/i.test(f.name)) {
        setSource(f);
        return;
      }
    }
  },
});

// ===================================================================
// Microphone recording
// ===================================================================
// Pick the first MediaRecorder mime type the browser can produce. iOS
// Safari prefers audio/mp4; Chrome/Firefox prefer webm/opus.
function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates = [
    'audio/mp4',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const c of candidates) {
    try { if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c; } catch { /* ignore */ }
  }
  return ''; // let MediaRecorder pick
}
const RECORDER_MIME = pickRecorderMime();
if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
  const btn = $('#recordBtn');
  if (btn) {
    btn.disabled = true;
    btn.title = 'Your browser doesn’t support in-page recording. Use “Choose file” instead.';
  }
}

// Central teardown — used by the user-clicked Stop button AND by every
// edge case (track ended by the browser, MediaRecorder error, tab
// backgrounded on iOS that silently kills the stream, beforeunload).
// Idempotent: safe to call any number of times.
let recStream = null;
function stopRecording(reason) {
  clearInterval(recTimer);
  recTimer = 0;
  $('#recordingBar').hidden = true;
  if (recorder) {
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch { /* ignore */ }
    // After this point we don't care about further events from this recorder.
    recorder.ondataavailable = null;
    recorder.onstop = null;
    recorder.onerror = null;
  }
  if (recStream) {
    recStream.getTracks().forEach((t) => {
      try { t.onended = null; } catch { /* ignore */ }
      try { t.stop(); } catch { /* ignore */ }
    });
  }
  recStream = null;
}
window.addEventListener('beforeunload', () => stopRecording('unload'));

$('#recordBtn').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    // Button is already disabled in this case — defensive.
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recStream = stream;
    recChunks = [];
    recorder = RECORDER_MIME ? new MediaRecorder(stream, { mimeType: RECORDER_MIME })
                             : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = () => {
      const mime = recorder?.mimeType || 'audio/webm';
      const blob = new Blob(recChunks, { type: mime });
      // Teardown first so we don't leak the stream if setSource fails.
      stopRecording('stopped');
      if (blob.size === 0) return;
      const ext =
        mime.includes('mp4')  ? 'm4a' :
        mime.includes('ogg')  ? 'ogg' :
        mime.includes('webm') ? 'webm' : 'audio';
      setSource(new File([blob], `recording.${ext}`, { type: blob.type }));
    };
    recorder.onerror = (e) => {
      console.warn('[record] MediaRecorder error', e?.error || e);
      stopRecording('error');
    };
    // If the browser/system ends the track (iOS background, user revokes
    // permission, headphone unplug), tear everything down immediately.
    stream.getAudioTracks().forEach((t) => { t.onended = () => stopRecording('track-ended'); });
    recorder.start();
    $('#recordingBar').hidden = false;
    const t0 = Date.now();
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $('#recTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
  } catch (err) {
    alert('Could not access the microphone: ' + (err?.message || err));
    stopRecording('start-failed');
  }
});
$('#stopRecordBtn').addEventListener('click', () => {
  // If recorder.stop() succeeds, recorder.onstop runs stopRecording('stopped');
  // otherwise call it ourselves so the bar always clears.
  if (recorder && recorder.state !== 'inactive') {
    try { recorder.stop(); return; } catch { /* fall through */ }
  }
  stopRecording('manual');
});

// ===================================================================
// Waveform
// ===================================================================
async function drawWaveform(file) {
  const canvas = $('#waveform');
  const buf = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const audio = await ctx.decodeAudioData(buf.slice(0));
  ctx.close();
  audioDuration = audio.duration;
  $('#sourceDur').textContent = fmtClock(audioDuration);
  const ch = audio.getChannelData(0);
  // Stash the decoded mono signal for the post-process VAD pass so we
  // don't decode a second time. AudioBuffer's data isn't transferable
  // once the context closes, so make a copy here.
  pcmChannel = new Float32Array(ch);
  pcmSampleRate = audio.sampleRate;
  const width = canvas.clientWidth || 600;
  canvas.width = width;
  const buckets = width;
  const step = Math.floor(ch.length / buckets) || 1;
  peaks = new Float32Array(buckets);
  for (let i = 0; i < buckets; i++) {
    let max = 0;
    const start = i * step;
    for (let j = 0; j < step; j++) {
      const v = Math.abs(ch[start + j] || 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  renderWaveform();
}
function renderWaveform() {
  const canvas = $('#waveform');
  if (!peaks) return;
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  const mid = h / 2;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5';
  g.fillStyle = '#c7c9e8';
  for (let i = 0; i < peaks.length; i++) {
    const barH = Math.max(1, peaks[i] * (h - 4));
    g.fillRect(i, mid - barH / 2, 1, barH);
  }
  // Played portion in accent.
  if (audioDuration > 0) {
    const playedX = Math.floor((player.currentTime / audioDuration) * w);
    g.fillStyle = accent;
    for (let i = 0; i < playedX; i++) {
      const barH = Math.max(1, peaks[i] * (h - 4));
      g.fillRect(i, mid - barH / 2, 1, barH);
    }
    g.fillRect(playedX, 0, 1, h); // playhead
  }
}
$('#waveform').addEventListener('click', (e) => {
  if (!audioDuration) return;
  const rect = e.currentTarget.getBoundingClientRect();
  player.currentTime = ((e.clientX - rect.left) / rect.width) * audioDuration;
});
player.addEventListener('timeupdate', () => { renderWaveform(); highlightActive(); });

// ===================================================================
// Run transcription
// ===================================================================
$('#modelSelect').addEventListener('change', updateModelNote);
$('#runBtn').addEventListener('click', () => {
  // While a job is in flight, the same button is the Cancel button. The
  // run pipeline observes runAbort.signal and shuts down cleanly.
  if (running) { try { runAbort?.abort(); } catch { /* ignore */ } return; }
  runTranscription();
});

async function runTranscription() {
  if (!currentFile || running) return;
  running = true;
  runAbort = new AbortController();
  rawSegments = [];
  segments = [];
  preProofread = null;
  preTranslate = null;
  currentTranscriptId = null;
  transcriptEl.innerHTML = '';
  $('#rtf').hidden = true;
  $('#report').hidden = true;
  $('#report').innerHTML = '';
  $('#summary').hidden = true;
  $('#summary').innerHTML = '';
  $('#status').hidden = false;
  setBar('model', 0, '');
  setBar('run', 0, 'Starting…');
  $('#modelStatus').hidden = false;
  $('#runStatus').hidden = false;
  // Toggle the run button into a Cancel state.
  const runBtn = $('#runBtn');
  runBtn.textContent = 'Cancel';
  runBtn.classList.add('btn-danger');
  const started = performance.now();

  try {
    const result = await engine.transcribe({
      file: currentFile,
      modelId: $('#modelSelect').value,
      language: $('#langSelect').value,
      translate: $('#translateChk').checked,
      enhance: $('#enhanceChk').checked,
      suppressNonSpeech: $('#suppressNonSpeechChk').checked,
      threads: parseInt($('#threadsInput').value, 10) || undefined,
      signal: runAbort.signal,
      onModel: (p) => {
        const pct = p.total ? p.loaded / p.total : 0;
        setBar('model', pct,
          p.stage === 'cache' ? 'from cache'
            : `${fmtBytes(p.loaded)} / ${fmtBytes(p.total)}`);
      },
      onPrepare: (r) => setBar('run', 0.02 + (r || 0) * 0.08, 'Preparing audio…'),
      onStage: (stage) => {
        // Without these the bar sits at "Starting…" through the multi-second
        // engine + model + WASM compile phase, and users assume it's hung.
        const label = {
          'loading-engine':       'Loading engine…',
          'downloading-model':    'Loading model…',
          'preparing-audio':      'Preparing audio…',
          'initialising-engine':  'Initialising WASM…',
          'transcribing':         'Transcribing…',
        }[stage];
        if (label) setBar('run', undefined, label);
      },
      onSegment: (seg) => {
        rawSegments.push(seg); appendSegment(seg);
        if (rawSegments.length % 8 === 0) autoSaveTranscript();
      },
      onProgress: (ratio) => setBar('run', 0.1 + (ratio || 0) * 0.9,
        `${Math.round((ratio || 0) * 100)}%`),
    });

    // Prefer the engine's final segments (they often carry more detail than
    // the streamed ones); fall back to whatever streamed in.
    rawSegments = result.segments.length ? result.segments : rawSegments;

    // Compute the energy map once and stash it for re-renders / density.
    energyMap = pcmChannel
      ? pp.buildEnergyMap(pcmChannel, pcmSampleRate, 0.1)
      : null;
    const { segments: processed, report } = pp.runPipeline(rawSegments, {
      preset: $('#presetSelect').value,
      terms: dictionary,
      energyMap,
    });
    segments = processed;
    renderTranscript();
    showReport(report);
    renderDensity();
    autoSaveTranscript({ immediate: true });

    setBar('run', 1, 'Done');
    const elapsed = (performance.now() - started) / 1000;
    if (audioDuration > 0) {
      const rtf = elapsed / audioDuration;
      $('#rtf').hidden = false;
      $('#rtf').textContent =
        `${segments.length} segments · ${fmtClock(audioDuration)} audio in ${fmtClock(elapsed)} ` +
        `(${rtf.toFixed(1)}× realtime)`;
    }
    updateModelNote();
  } catch (err) {
    if (err?.name === 'AbortError') {
      setBar('run', 0, 'Cancelled');
      // Keep whatever has streamed so far — user can save or re-run.
      if (rawSegments.length) {
        energyMap = pcmChannel ? pp.buildEnergyMap(pcmChannel, pcmSampleRate, 0.1) : null;
        const { segments: processed, report } = pp.runPipeline(rawSegments, {
          preset: $('#presetSelect').value,
          terms: dictionary,
          energyMap,
        });
        segments = processed;
        renderTranscript();
        showReport(report);
        renderDensity();
      }
    } else {
      console.error(err);
      setBar('run', 0, '');
      $('#runDetail').textContent = '';
      transcriptEl.innerHTML =
        `<div class="error">⚠ ${escapeHtml(err?.message || String(err))}</div>`;
    }
  } finally {
    running = false;
    runAbort = null;
    runBtn.textContent = 'Transcribe';
    runBtn.classList.remove('btn-danger');
    runBtn.disabled = false;
  }
}

// ----- Quality report -----
function showReport(report) {
  if (!report) { $('#report').hidden = true; $('#report').innerHTML = ''; return; }
  const pct = (n) => `${Math.round((n || 0) * 100)}%`;
  const parts = [];
  if (report.avgConfidence != null) parts.push(`<strong>${pct(report.avgConfidence)}</strong> avg confidence`);
  if (report.lowConfidenceRate > 0) parts.push(`${pct(report.lowConfidenceRate)} low-confidence words`);
  if (report.droppedSegments > 0) parts.push(`${report.droppedSegments} hallucinated segment${report.droppedSegments === 1 ? '' : 's'} removed`);
  if (report.dictionaryFixes > 0) parts.push(`${report.dictionaryFixes} dictionary fix${report.dictionaryFixes === 1 ? '' : 'es'}`);
  if (report.edits > report.dictionaryFixes) parts.push(`${report.edits - report.dictionaryFixes} formatting edits`);
  if (!parts.length) { $('#report').hidden = true; $('#report').innerHTML = ''; return; }
  $('#report').hidden = false;
  $('#report').innerHTML = '✨ Quality: ' + parts.join(' · ');
}

function setBar(which, ratio, detail) {
  if (typeof ratio === 'number' && !Number.isNaN(ratio)) {
    $(`#${which}Bar`).style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
  }
  $(`#${which}Detail`).textContent = detail || '';
}

// ===================================================================
// Transcript rendering
// ===================================================================
function confClass(p) {
  if (p == null) return '';
  if (p >= 0.9) return 'conf-high';
  if (p >= 0.7) return 'conf-mid';
  if (p >= 0.5) return 'conf-low';
  return 'conf-vlow';
}
function segNode(seg, idx) {
  const span = document.createElement('span');
  span.className = 'seg';
  if (typeof seg.conf === 'number') span.dataset.conf = seg.conf.toFixed(3);
  if (seg.proofread) span.classList.add('proofread');
  span.dataset.t0 = seg.t0;
  span.dataset.idx = idx;
  const ts = document.createElement('button');
  ts.className = 'seg-ts';
  ts.textContent = fmtClock(seg.t0);
  ts.title = 'Jump to ' + fmtClock(seg.t0);
  ts.addEventListener('click', (e) => {
    e.preventDefault();
    player.currentTime = seg.t0;
    player.play().catch(() => {});
  });
  const text = document.createElement('span');
  text.className = 'seg-text';
  // Render per-token probability when available; fall back to the segment's
  // own confidence so the highlight still tells a story for builds that
  // don't return tokens.
  if (Array.isArray(seg.tokens) && seg.tokens.length) {
    for (const tok of seg.tokens) {
      const w = document.createElement('span');
      w.className = 'tok ' + confClass(tok.p);
      w.title = `${(tok.p * 100).toFixed(0)}%`;
      w.textContent = tok.text + ' ';
      text.appendChild(w);
    }
  } else {
    text.textContent = seg.text + ' ';
    if (typeof seg.conf === 'number') text.classList.add(confClass(seg.conf));
  }
  span.append(ts, text);
  return span;
}
function appendSegment(seg) {
  transcriptEl.appendChild(segNode(seg, segments.length - 1));
}

/**
 * Pure helper: given a list of segment DOM nodes and the current segments
 * array, return a new segments array with each segment's text replaced
 * by the corresponding `.seg-text` textContent (whitespace collapsed).
 * Timings, confidence, and tokens are preserved.
 */
function applyDomEditsToSegments(nodes, segs) {
  if (!segs?.length || !nodes?.length) return { segments: segs || [], changed: false };
  const next = segs.slice();
  let changed = false;
  for (const n of nodes) {
    const idxAttr = n.dataset?.idx ?? n.getAttribute?.('data-idx');
    const idx = parseInt(idxAttr, 10);
    if (!Number.isInteger(idx) || idx < 0 || idx >= next.length) continue;
    const t = n.querySelector?.('.seg-text');
    if (!t) continue;
    const text = (t.textContent || '').replace(/\s+/g, ' ').trim();
    if (text && text !== next[idx].text) {
      next[idx] = { ...next[idx], text, edited: true };
      changed = true;
    }
  }
  return { segments: next, changed };
}

/**
 * Read user edits from #transcript back into segments[]. Idempotent.
 *
 * Why this exists: the transcript pane is contenteditable but our state
 * lives in `segments[]`. Any code path that re-renders (Find→Replace,
 * preset switch, Claude proofread/translate, Recent reopen, fresh run)
 * would otherwise blow user typing away silently.
 */
function pullEditsFromDom() {
  if (!segments.length) return;
  const nodes = transcriptEl.querySelectorAll('.seg[data-idx]');
  const result = applyDomEditsToSegments(nodes, segments);
  if (result.changed) {
    segments = result.segments;
    autoSaveTranscript();
  }
}

function renderTranscript() {
  pullEditsFromDom();
  transcriptEl.innerHTML = '';
  segments.forEach((seg, i) => transcriptEl.appendChild(segNode(seg, i)));
}
transcriptEl.addEventListener('blur', pullEditsFromDom);
window.addEventListener('beforeunload', () => { try { pullEditsFromDom(); } catch { /* ignore */ } });
function highlightActive() {
  const t = player.currentTime;
  let activeIdx = -1;
  for (let i = 0; i < segments.length; i++) {
    if (t >= segments[i].t0 && (i + 1 >= segments.length || t < segments[i + 1].t0)) {
      activeIdx = i; break;
    }
  }
  transcriptEl.querySelectorAll('.seg.active').forEach((n) => n.classList.remove('active'));
  if (activeIdx >= 0) {
    const node = transcriptEl.querySelector(`.seg[data-idx="${activeIdx}"]`);
    if (node) node.classList.add('active');
  }
}

// Timestamps toggle
$('#tsToggle').addEventListener('click', (e) => {
  const on = transcriptEl.classList.toggle('hide-ts');
  e.currentTarget.setAttribute('aria-pressed', on ? 'false' : 'true');
});

// Confidence highlighting toggle (default off — colour can be distracting).
$('#confToggle').addEventListener('click', (e) => {
  const on = transcriptEl.classList.toggle('show-conf');
  e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
});

// Quality preset: re-run the pipeline if we already have raw segments.
$('#presetSelect').addEventListener('change', () => rerunPipeline());

function rerunPipeline() {
  if (!rawSegments.length) return;
  pullEditsFromDom();
  // Refresh the map so newly-loaded sources (with their own pcmChannel) benefit.
  if (pcmChannel && !energyMap) {
    energyMap = pp.buildEnergyMap(pcmChannel, pcmSampleRate, 0.1);
  }
  const { segments: processed, report } = pp.runPipeline(rawSegments, {
    preset: $('#presetSelect').value,
    terms: dictionary,
    energyMap,
  });
  segments = processed;
  renderTranscript();
  showReport(report);
  renderDensity();
  autoSaveTranscript();
}

// ===================================================================
// Unified Claude (BYOK) bar — proofread / translate / summary
// ===================================================================
let claudeMode = 'proofread'; // 'proofread' | 'translate' | 'summary'

function claudeRunLabel(mode) {
  return mode === 'translate' ? 'Translate'
       : mode === 'summary'   ? 'Summarize'
       :                        'Proofread';
}
function openClaudeBar(mode) {
  claudeMode = mode;
  const bar = $('#proofreadBar');
  bar.hidden = false;
  const langSel = $('#translateLang');
  const runBtn = $('#proofreadRunBtn');
  langSel.hidden = (mode !== 'translate');
  runBtn.textContent = claudeRunLabel(mode);
  $('#proofreadKey').focus();
}
$('#proofreadBtn').addEventListener('click', () => openClaudeBar('proofread'));
$('#translateBtn').addEventListener('click', () => openClaudeBar('translate'));
$('#summaryBtn').addEventListener('click', () => openClaudeBar('summary'));
function closeClaudeBar({ abort = true } = {}) {
  if (abort) try { claudeAbort?.abort(); } catch { /* ignore */ }
  $('#proofreadBar').hidden = true;
}
$('#proofreadCloseBtn').addEventListener('click', () => closeClaudeBar({ abort: true }));

$('#proofreadRunBtn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  // If a Claude call is already in flight, this button doubles as Stop.
  if (claudeBusy) {
    try { claudeAbort?.abort(); } catch { /* ignore */ }
    return;
  }
  if (!segments.length) { alert('Nothing to send yet — transcribe something first.'); return; }
  const key = $('#proofreadKey').value.trim();
  if (!key) { alert('Paste your Anthropic API key first.'); return; }
  pullEditsFromDom();
  const progressEl = $('#proofreadProgress');
  const setProgress = (text) => {
    if (!text) { progressEl.hidden = true; progressEl.textContent = ''; }
    else { progressEl.hidden = false; progressEl.textContent = text; }
  };
  // Flip the button to "Stop" for the whole flight so the user has an
  // obvious abort affordance. Live progress goes to the adjacent span.
  btn.classList.add('btn-danger');
  btn.textContent = 'Stop';
  setProgress('Starting…');
  claudeAbort = new AbortController();
  claudeBusy = true;
  try {
    if (claudeMode === 'translate') {
      preTranslate = segments.map((s) => ({ ...s }));
      const lang = $('#translateLang').value;
      const out = await engine.translateWithClaude(segments, {
        apiKey: key,
        targetLanguage: lang,
        signal: claudeAbort.signal,
        onProgress: (r) => setProgress(`Translating… ${Math.round(r * 100)}%`),
      });
      segments = out;
      renderTranscript();
      $('#proofreadAcceptBtn').hidden = false;
      $('#proofreadRevertBtn').hidden = false;
      autoSaveTranscript();
    } else if (claudeMode === 'summary') {
      setProgress('Summarizing…');
      const payload = await engine.summarizeWithClaude(segments, {
        apiKey: key, signal: claudeAbort.signal,
      });
      renderSummary(payload);
    } else {
      preProofread = segments.map((s) => ({ ...s }));
      const cleaned = await engine.proofreadWithClaude(segments, {
        apiKey: key,
        signal: claudeAbort.signal,
        onProgress: (r) => setProgress(`Proofreading… ${Math.round(r * 100)}%`),
      });
      segments = cleaned;
      renderTranscript();
      $('#proofreadAcceptBtn').hidden = false;
      $('#proofreadRevertBtn').hidden = false;
      autoSaveTranscript();
    }
  } catch (err) {
    console.error(err);
    if (err?.name !== 'AbortError') alert('Claude call failed: ' + (err?.message || err));
  } finally {
    btn.classList.remove('btn-danger');
    btn.disabled = false;
    // After a successful proofread/translate the user can Re-run; for
    // summary and any error we go back to the mode's default label.
    const showReRun = (claudeMode === 'proofread' || claudeMode === 'translate')
      && !$('#proofreadAcceptBtn').hidden;
    btn.textContent = showReRun ? 'Re-run' : claudeRunLabel(claudeMode);
    setProgress('');
    claudeAbort = null;
    claudeBusy = false;
  }
});
$('#proofreadAcceptBtn').addEventListener('click', () => {
  preProofread = null;
  preTranslate = null;
  $('#proofreadAcceptBtn').hidden = true;
  $('#proofreadRevertBtn').hidden = true;
  // User has chosen — aborts any still-running re-run, hides the bar,
  // and clears claudeBusy/claudeAbort via the helper.
  closeClaudeBar({ abort: true });
});
$('#proofreadRevertBtn').addEventListener('click', () => {
  const snap = preTranslate || preProofread;
  if (!snap) return;
  // Abort any in-flight re-run before restoring; otherwise its result
  // would land on top of the reverted segments.
  try { claudeAbort?.abort(); } catch { /* ignore */ }
  segments = snap;
  preProofread = null;
  preTranslate = null;
  renderTranscript();
  $('#proofreadAcceptBtn').hidden = true;
  $('#proofreadRevertBtn').hidden = true;
  autoSaveTranscript();
});

function renderSummary(payload) {
  const el = $('#summary');
  if (!payload || (!payload.tldr && !payload.chapters?.length)) {
    el.hidden = true; el.innerHTML = ''; return;
  }
  const parts = [];
  if (payload.tldr) parts.push(`<div class="summary-tldr">${escapeHtml(payload.tldr)}</div>`);
  if (payload.chapters?.length) {
    parts.push('<ul class="summary-chapters">' +
      payload.chapters.map((c) =>
        `<li><button class="chapter" data-t="${escapeHtml(c.t)}">${escapeHtml(c.t)}</button> ${escapeHtml(c.title)}</li>`
      ).join('') + '</ul>');
  }
  el.innerHTML = parts.join('');
  el.hidden = false;
  el.querySelectorAll('.chapter').forEach((b) => b.addEventListener('click', () => {
    const t = parseClockToSec(b.dataset.t);
    if (Number.isFinite(t)) { player.currentTime = t; player.play().catch(() => {}); }
  }));
}
function parseClockToSec(s) {
  const m = /^(?:(\d+):)?(\d+):(\d+)$/.exec(String(s || '').trim());
  if (!m) return NaN;
  return (+m[1] || 0) * 3600 + (+m[2]) * 60 + (+m[3]);
}

// ===================================================================
// Send to RodmanWord / Share (Features 4 + 5)
// ===================================================================
$('#sendWordBtn').addEventListener('click', () => {
  if (!segments.length) { alert('Nothing to send yet.'); return; }
  pullEditsFromDom();
  const md = new TextDecoder().decode(engine.formatTranscript(segments, 'md'));
  const title = (currentFile?.name || 'Transcript').replace(/\.[^.]+$/, '');
  const ok = share.sendToWord({ title, markdown: md });
  if (!ok) alert('Could not hand the transcript to RodmanWord. Open /word/ manually and paste it.');
});
$('#shareBtn').addEventListener('click', async () => {
  if (!segments.length) { alert('Nothing to share yet.'); return; }
  pullEditsFromDom();
  const title = (currentFile?.name || 'Transcript').replace(/\.[^.]+$/, '');
  const ext = $('#exportSelect').value;
  const file = engine.formatTranscript(segments, ext);
  const fileName = `${title}.${ext === 'jsonrich' ? 'rich.json' : ext}`;
  // Best UX: when the active export is plain text, share that as the
  // body too; otherwise build a TXT body alongside the file.
  const text = ext === 'txt' || ext === 'md'
    ? new TextDecoder().decode(file)
    : segments.map((s) => s.text).join(' ').trim();
  const result = await share.shareTranscript({
    title, text,
    file, fileName, mime: mimeFor(ext),
  });
  if (result.method === 'clipboard') flash($('#shareBtn'), 'Copied');
  else if (result.method === 'unsupported') alert('Share isn’t supported in this browser. Use Copy or Export.');
});

// ===================================================================
// Captions overlay (Feature 8)
// ===================================================================
$('#captionsToggle').addEventListener('click', (e) => {
  const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
  e.currentTarget.setAttribute('aria-pressed', on ? 'true' : 'false');
  $('#captionsOverlay').hidden = !on;
  syncCaption();
});
function syncCaption() {
  const overlay = $('#captionsOverlay');
  if (overlay.hidden) return;
  const t = player.currentTime;
  for (let i = 0; i < segments.length; i++) {
    if (t >= segments[i].t0 && (i + 1 >= segments.length || t < segments[i + 1].t0)) {
      overlay.textContent = segments[i].text;
      return;
    }
  }
  overlay.textContent = '';
}
player.addEventListener('timeupdate', syncCaption);

// ===================================================================
// Speaking-density histogram (Feature 9)
// ===================================================================
function renderDensity() {
  const canvas = $('#density');
  if (!energyMap || audioDuration <= 0) { canvas.hidden = true; return; }
  canvas.hidden = false;
  const w = canvas.clientWidth || 600;
  canvas.width = w;
  const h = canvas.height;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, w, h);
  const N = Math.min(120, w); // up to ~120 buckets across the canvas
  const stride = Math.max(1, Math.floor(energyMap.buckets.length / N));
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#4f46e5';
  let max = 0.01;
  const cells = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0, n = 0;
    for (let j = i * stride; j < (i + 1) * stride && j < energyMap.buckets.length; j++) {
      s += energyMap.buckets[j]; n++;
    }
    cells[i] = n ? s / n : 0;
    if (cells[i] > max) max = cells[i];
  }
  const cw = w / N;
  for (let i = 0; i < N; i++) {
    const v = cells[i] / max;
    const barH = Math.max(2, v * (h - 4));
    g.fillStyle = accent;
    g.globalAlpha = 0.25 + v * 0.7;
    g.fillRect(i * cw, h - barH, Math.max(1, cw - 1), barH);
  }
  g.globalAlpha = 1;
}
$('#density').addEventListener('click', (e) => {
  if (!audioDuration) return;
  const r = e.currentTarget.getBoundingClientRect();
  player.currentTime = ((e.clientX - r.left) / r.width) * audioDuration;
  player.play().catch(() => {});
});
window.addEventListener('resize', () => renderDensity());

// ===================================================================
// Auto-save + Recent transcripts (Feature 2)
// ===================================================================
function autoSaveTranscript({ immediate = false } = {}) {
  if (!segments.length || !currentFile) return;
  const run = async () => {
    try {
      const id = await history.save({
        id: currentTranscriptId,
        sourceName: currentFile.name,
        durationSec: audioDuration,
        modelId: $('#modelSelect').value,
        preset: $('#presetSelect').value,
        segments,
      });
      if (id) currentTranscriptId = id;
    } catch (err) { /* IndexedDB unavailable, skip silently */ }
  };
  clearTimeout(saveDebounce);
  if (immediate) run();
  else saveDebounce = setTimeout(run, 800);
}

async function refreshRecent() {
  let list = [];
  try { list = await history.list(); } catch { /* fall through */ }
  const wrap = $('#recentList');
  if (!wrap) return;
  if (!list.length) {
    wrap.innerHTML = `<p class="muted">No saved transcripts yet. After you transcribe a clip, it appears here so you can come back to it later.</p>`;
  } else {
    wrap.innerHTML = list.map((row) => `
      <div class="recent-row">
        <div class="recent-info">
          <div class="recent-name">${escapeHtml(row.sourceName)}</div>
          <div class="recent-meta">${fmtClock(row.durationSec)} · ${escapeHtml(engine.MODELS[row.modelId]?.label || row.modelId || '')} · ${new Date(row.savedAt).toLocaleString()}</div>
          <div class="recent-sentence">${escapeHtml(row.firstSentence || '')}</div>
        </div>
        <div class="recent-actions">
          <button class="btn btn-tiny" data-recent-open="${escapeHtml(row.id)}">Open</button>
          <button class="btn btn-ghost btn-tiny" data-recent-delete="${escapeHtml(row.id)}">Delete</button>
        </div>
      </div>`).join('');
    wrap.querySelectorAll('[data-recent-open]').forEach((b) => b.addEventListener('click', () => openRecent(b.dataset.recentOpen)));
    wrap.querySelectorAll('[data-recent-delete]').forEach((b) => b.addEventListener('click', async () => {
      await history.remove(b.dataset.recentDelete);
      refreshRecent();
    }));
  }
  $('#recentTotal').textContent = list.length ? `${list.length} saved` : '';
}
$('#recentBtn').addEventListener('click', async () => {
  $('#recentModal').hidden = false;
  await refreshRecent();
});
$('#recentCloseBtn').addEventListener('click', () => { $('#recentModal').hidden = true; });
$('#recentClearBtn').addEventListener('click', async () => {
  if (!confirm('Delete all saved transcripts? This can’t be undone.')) return;
  await history.clear();
  refreshRecent();
});

async function openRecent(id) {
  const row = await history.load(id);
  if (!row) return;
  currentTranscriptId = row.id;
  rawSegments = row.segments.slice();
  segments = row.segments.slice();
  audioDuration = row.durationSec || 0;
  $('#sourceName').textContent = row.sourceName;
  $('#sourceDur').textContent = fmtClock(audioDuration);
  $('#sourceInfo').hidden = false;
  $('#dropTarget').classList.add('has-source');
  energyMap = null; // we don't keep raw PCM in history; density hides until next decode
  renderTranscript();
  renderDensity();
  $('#recentModal').hidden = true;
}

// ===================================================================
// Custom dictionary modal
// ===================================================================
$('#openDictBtn').addEventListener('click', openDictionaryModal);
$('#dictCloseBtn').addEventListener('click', () => closeDictionaryModal(false));
$('#dictSaveBtn').addEventListener('click', () => closeDictionaryModal(true));

function openDictionaryModal() {
  $('#dictModal').hidden = false;
  renderDictRows();
}
function closeDictionaryModal(rerun) {
  const rows = $('#dictRows').querySelectorAll('.dict-row');
  const next = [];
  rows.forEach((r) => {
    const from = r.querySelector('.d-from').value.trim();
    const to = r.querySelector('.d-to').value;
    const cs = r.querySelector('.d-cs').checked;
    if (from) next.push({ from, to, caseSensitive: cs });
  });
  dictionary = next;
  pp.saveDictionary(dictionary);
  $('#dictModal').hidden = true;
  if (rerun && rawSegments.length) rerunPipeline();
}
function renderDictRows() {
  const wrap = $('#dictRows');
  wrap.innerHTML = '';
  if (!dictionary.length) dictionary = [{ from: '', to: '', caseSensitive: false }];
  for (const t of dictionary) wrap.appendChild(dictRow(t));
}
function dictRow(t) {
  const row = document.createElement('div');
  row.className = 'dict-row';
  row.innerHTML =
    `<input class="d-from" type="text" placeholder="From" />` +
    `<span>→</span>` +
    `<input class="d-to" type="text" placeholder="To" />` +
    `<label class="check"><input type="checkbox" class="d-cs" /> Case</label>` +
    `<button class="btn btn-ghost btn-tiny d-remove" title="Remove">✕</button>`;
  row.querySelector('.d-from').value = t.from || '';
  row.querySelector('.d-to').value = t.to || '';
  row.querySelector('.d-cs').checked = !!t.caseSensitive;
  row.querySelector('.d-remove').addEventListener('click', () => row.remove());
  return row;
}
$('#dictAddBtn').addEventListener('click', () => {
  $('#dictRows').appendChild(dictRow({ from: '', to: '', caseSensitive: false }));
});

// ===================================================================
// Find / replace, copy, export
// ===================================================================
$('#findBtn').addEventListener('click', () => {
  const bar = $('#findBar');
  bar.hidden = !bar.hidden;
  if (!bar.hidden) $('#findInput').focus();
});
$('#findCloseBtn').addEventListener('click', () => { $('#findBar').hidden = true; });
$('#findInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && window.find) window.find($('#findInput').value);
});
$('#replaceAllBtn').addEventListener('click', () => {
  const from = $('#findInput').value;
  const to = $('#replaceInput').value;
  if (!from) return;
  pullEditsFromDom();
  const re = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  segments = segments.map((s) => ({ ...s, text: s.text.replace(re, to) }));
  renderTranscript();
});

$('#copyBtn').addEventListener('click', async () => {
  const text = segments.map((s) => s.text).join(' ').trim();
  try {
    await navigator.clipboard.writeText(text);
    flash($('#copyBtn'), 'Copied');
  } catch {
    alert('Copy failed — your browser blocked clipboard access.');
  }
});

$('#exportBtn').addEventListener('click', () => {
  if (!segments.length) { alert('Nothing to export yet.'); return; }
  pullEditsFromDom();
  const ext = $('#exportSelect').value;
  const bytes = engine.formatTranscript(segments, ext);
  const base = (currentFile?.name || 'transcript').replace(/\.[^.]+$/, '');
  // jsonrich is a JSON file; everything else uses its own extension.
  const fileExt = ext === 'jsonrich' ? 'rich.json' : ext;
  downloadBytes(`${base}.${fileExt}`, bytes, mimeFor(ext));
});

// ===================================================================
// Storage manager
// ===================================================================
$('#manageBtn').addEventListener('click', openStorage);
$('#storageCloseBtn').addEventListener('click', () => { $('#storageModal').hidden = true; });
async function openStorage() {
  const list = $('#storageList');
  list.innerHTML = '';
  let total = 0;
  for (const [id, m] of Object.entries(engine.MODELS)) {
    const cached = await engine.isModelCached(id).catch(() => false);
    if (cached) total += m.bytes;
    const row = document.createElement('div');
    row.className = 'storage-row';
    row.innerHTML =
      `<div><div class="storage-name">${escapeHtml(m.label)}</div>` +
      `<div class="storage-sub">${fmtBytes(m.bytes)} · ${cached ? '<span class="ok">downloaded</span>' : 'not downloaded'}</div></div>`;
    if (cached) {
      const del = document.createElement('button');
      del.className = 'btn btn-ghost btn-tiny';
      del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        await engine.deleteModel(id);
        openStorage();
        updateModelNote();
      });
      row.appendChild(del);
    }
    list.appendChild(row);
  }
  $('#storageTotal').textContent = total ? `Using ${fmtBytes(total)} of device storage` : 'No models downloaded yet';
  $('#storageModal').hidden = false;
}

// ===================================================================
// Helpers
// ===================================================================
function fmtClock(sec) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + ':' + String(s).padStart(2, '0');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function mimeFor(ext) {
  return {
    txt: 'text/plain',
    srt: 'application/x-subrip',
    vtt: 'text/vtt',
    md: 'text/markdown',
    json: 'application/json',
    jsonrich: 'application/json',
  }[ext] || 'text/plain';
}
function downloadBytes(filename, bytes, mime) {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}
function flash(btn, text) {
  const old = btn.textContent;
  btn.textContent = text;
  setTimeout(() => { btn.textContent = old; }, 1200);
}

// ===================================================================
// Persistent settings (Feature 1)
// ===================================================================
const SETTINGS_KEY = 'rodman:transcribe:settings';
const SETTINGS_FIELDS = {
  '#presetSelect':         'value',
  '#modelSelect':          'value',
  '#langSelect':           'value',
  '#translateChk':         'checked',
  '#enhanceChk':           'checked',
  '#suppressNonSpeechChk': 'checked',
  '#threadsInput':         'value',
};
function saveSettings() {
  const out = {};
  for (const [sel, prop] of Object.entries(SETTINGS_FIELDS)) {
    const el = $(sel);
    if (el) out[sel] = el[prop];
  }
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(out)); } catch { /* ignore */ }
}
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function applySettings(saved) {
  if (!saved) return;
  for (const [sel, prop] of Object.entries(SETTINGS_FIELDS)) {
    const el = $(sel);
    if (el && saved[sel] !== undefined) {
      // Only apply known model ids — saved model might predate a catalog change.
      if (sel === '#modelSelect' && !engine.MODELS[saved[sel]]) continue;
      el[prop] = saved[sel];
    }
  }
}
for (const sel of Object.keys(SETTINGS_FIELDS)) {
  $(sel)?.addEventListener('change', saveSettings);
}

// ---- init ----
$('#threadsInput').value = APP_DEFAULT_THREADS;
populateModels();
applySettings(loadSettings());   // override defaults if user has saved settings
updateModelNote();
showHardwareHint();
refreshRecent();
