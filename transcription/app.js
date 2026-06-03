// RodmanTranscribe — UI controller.
import * as engine from './engine.js';
import * as pp from './postprocess.js';
import { mountWindowDropzone } from '../lib/ui/dropzone.js';

const $ = (s) => document.querySelector(s);
const APP_DEFAULT_MODEL = 'large-v3-q5_0'; // this app defaults to max quality

// ---- state ----
let currentFile = null;
let playerUrl = null;
let rawSegments = [];    // streamed from the engine, untouched
let segments = [];       // post-processed (what's rendered/exported)
let preProofread = null; // snapshot for proofread revert
let peaks = null;        // cached waveform peaks for cheap playhead redraw
let pcmChannel = null;   // Float32Array reused for VAD
let pcmSampleRate = 0;
let audioDuration = 0;
let recorder = null;
let recChunks = [];
let recTimer = 0;
let running = false;
let dictionary = pp.loadDictionary();

const player = $('#player');
const transcriptEl = $('#transcript');

// ===================================================================
// Cross-origin isolation banner
// ===================================================================
function refreshCoi() {
  $('#coiBanner').hidden = engine.isCrossOriginIsolated();
}
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
$('#recordBtn').addEventListener('click', async () => {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Microphone recording is not supported in this browser.');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recChunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'audio/webm' });
      const ext = (recorder.mimeType || 'audio/webm').includes('ogg') ? 'ogg' : 'webm';
      setSource(new File([blob], `recording.${ext}`, { type: blob.type }));
    };
    recorder.start();
    $('#recordingBar').hidden = false;
    const t0 = Date.now();
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $('#recTime').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }, 250);
  } catch (err) {
    alert('Could not access the microphone: ' + (err?.message || err));
  }
});
$('#stopRecordBtn').addEventListener('click', () => {
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  clearInterval(recTimer);
  $('#recordingBar').hidden = true;
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
$('#runBtn').addEventListener('click', runTranscription);

async function runTranscription() {
  if (!currentFile || running) return;
  running = true;
  rawSegments = [];
  segments = [];
  preProofread = null;
  transcriptEl.innerHTML = '';
  $('#rtf').hidden = true;
  $('#report').hidden = true;
  $('#status').hidden = false;
  $('#runBtn').disabled = true;
  setBar('model', 0, '');
  setBar('run', 0, 'Starting…');
  $('#modelStatus').hidden = false;
  $('#runStatus').hidden = false;
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
      onModel: (p) => {
        const pct = p.total ? p.loaded / p.total : 0;
        setBar('model', pct,
          p.stage === 'cache' ? 'from cache'
            : `${fmtBytes(p.loaded)} / ${fmtBytes(p.total)}`);
      },
      onPrepare: (r) => setBar('run', 0.02 + (r || 0) * 0.08, 'Preparing audio…'),
      onSegment: (seg) => { rawSegments.push(seg); appendSegment(seg); },
      onProgress: (ratio) => setBar('run', 0.1 + (ratio || 0) * 0.9,
        `${Math.round((ratio || 0) * 100)}%`),
    });

    // Prefer the engine's final segments (they often carry more detail than
    // the streamed ones); fall back to whatever streamed in.
    rawSegments = result.segments.length ? result.segments : rawSegments;

    // Run the quality pipeline.
    const energyMap = pcmChannel
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
    console.error(err);
    setBar('run', 0, '');
    $('#runDetail').textContent = '';
    transcriptEl.innerHTML =
      `<div class="error">⚠ ${escapeHtml(err?.message || String(err))}</div>`;
  } finally {
    running = false;
    $('#runBtn').disabled = false;
  }
}

// ----- Quality report -----
function showReport(report) {
  if (!report) { $('#report').hidden = true; return; }
  const pct = (n) => `${Math.round((n || 0) * 100)}%`;
  const parts = [];
  if (report.avgConfidence != null) parts.push(`<strong>${pct(report.avgConfidence)}</strong> avg confidence`);
  if (report.lowConfidenceRate > 0) parts.push(`${pct(report.lowConfidenceRate)} low-confidence words`);
  if (report.droppedSegments > 0) parts.push(`${report.droppedSegments} hallucinated segment${report.droppedSegments === 1 ? '' : 's'} removed`);
  if (report.dictionaryFixes > 0) parts.push(`${report.dictionaryFixes} dictionary fix${report.dictionaryFixes === 1 ? '' : 'es'}`);
  if (report.edits > report.dictionaryFixes) parts.push(`${report.edits - report.dictionaryFixes} formatting edits`);
  if (!parts.length) { $('#report').hidden = true; return; }
  $('#report').hidden = false;
  $('#report').innerHTML = '✨ Quality: ' + parts.join(' · ');
}

function setBar(which, ratio, detail) {
  $(`#${which}Bar`).style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
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
function renderTranscript() {
  transcriptEl.innerHTML = '';
  segments.forEach((seg, i) => transcriptEl.appendChild(segNode(seg, i)));
}
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
  const energyMap = pcmChannel
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
}

// ===================================================================
// AI proofread (BYOK Claude)
// ===================================================================
let proofAbort = null;
$('#proofreadBtn').addEventListener('click', () => {
  const bar = $('#proofreadBar');
  bar.hidden = !bar.hidden;
  if (!bar.hidden) $('#proofreadKey').focus();
});
$('#proofreadCloseBtn').addEventListener('click', () => { $('#proofreadBar').hidden = true; });
$('#proofreadRunBtn').addEventListener('click', async (e) => {
  if (!segments.length) { alert('Nothing to proofread yet.'); return; }
  const key = $('#proofreadKey').value.trim();
  if (!key) { alert('Paste your Anthropic API key first.'); return; }
  const btn = e.currentTarget;
  btn.disabled = true;
  const original = btn.textContent;
  proofAbort = new AbortController();
  preProofread = segments.map((s) => ({ ...s }));
  try {
    const cleaned = await engine.proofreadWithClaude(segments, {
      apiKey: key,
      signal: proofAbort.signal,
      onProgress: (r) => { btn.textContent = `Proofreading… ${Math.round(r * 100)}%`; },
    });
    segments = cleaned;
    renderTranscript();
    $('#proofreadAcceptBtn').hidden = false;
    $('#proofreadRevertBtn').hidden = false;
    btn.textContent = 'Re-run';
  } catch (err) {
    console.error(err);
    if (err?.name !== 'AbortError') alert('Proofread failed: ' + (err?.message || err));
    btn.textContent = original;
  } finally {
    btn.disabled = false;
    proofAbort = null;
  }
});
$('#proofreadAcceptBtn').addEventListener('click', () => {
  preProofread = null;
  $('#proofreadAcceptBtn').hidden = true;
  $('#proofreadRevertBtn').hidden = true;
  $('#proofreadBar').hidden = true;
});
$('#proofreadRevertBtn').addEventListener('click', () => {
  if (!preProofread) return;
  segments = preProofread;
  preProofread = null;
  renderTranscript();
  $('#proofreadAcceptBtn').hidden = true;
  $('#proofreadRevertBtn').hidden = true;
});

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

// ---- init ----
$('#threadsInput').value = Math.min(navigator.hardwareConcurrency || 4, 8);
populateModels();
updateModelNote();
