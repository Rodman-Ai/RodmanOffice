// =============================================================
//  iCalendar (RFC 5545) ↔ Workbook bridge.
//
//  Each VEVENT becomes one row; columns are SUMMARY, DTSTART,
//  DTEND, LOCATION, DESCRIPTION, ORGANIZER, UID. Other event
//  properties are dropped on read; on write, unrecognized header
//  columns become X-RODMAN- prefixed extension properties.
//
//  Line folding (RFC 5545 §3.1) is unfolded before parsing.
// =============================================================

import { cellKey } from './types.js';

const enc = new TextEncoder();

const COLS = ['SUMMARY', 'DTSTART', 'DTEND', 'LOCATION', 'DESCRIPTION', 'ORGANIZER', 'UID'];

function unfold(text) {
  return String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function unescapeText(s) {
  return String(s)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeText(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function parseLine(line) {
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const semi = left.indexOf(';');
  const prop = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
  return { prop, value };
}

export function parseIcalWorkbook(text, name) {
  const baseName = (name || 'events').replace(/\.[^.]+$/, '');
  const unfolded = unfold(text);
  const lines = unfolded.split(/\r?\n/);
  const rows = [COLS.slice()];
  let current = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:VEVENT')) { current = {}; continue; }
    if (upper.startsWith('END:VEVENT')) {
      if (current) {
        rows.push(COLS.map((c) => unescapeText(current[c] || '')));
        current = null;
      }
      continue;
    }
    if (!current) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (!COLS.includes(parsed.prop)) continue;
    current[parsed.prop] = parsed.value;
  }
  const cells = {};
  let maxCol = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v !== '') {
        cells[cellKey(r, c)] = { raw: String(v) };
        if (c + 1 > maxCol) maxCol = c + 1;
      }
    }
  }
  const sheet = {
    id: `sheet-${Date.now()}`,
    name: 'Events',
    cells,
    rowCount: Math.max(rows.length, 1000),
    colCount: Math.max(maxCol, 26),
  };
  return { id: `wb-${Date.now()}`, name: baseName, sheets: [sheet] };
}

function pad(n, w) { return String(n).padStart(w, '0'); }

function ensureIcalDate(s) {
  // Accept YYYY-MM-DD, YYYY-MM-DDTHH:MM:SSZ, or already-iCal forms.
  // Pass through anything that already starts with a date-like prefix
  // (8 digits) so users can supply RFC 5545 values directly.
  if (!s) return '';
  if (/^\d{8}T\d{6}Z?$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}` +
    `T${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}Z`;
}

export function exportWorkbookAsIcal(workbook) {
  const sheet = workbook.sheets[0];
  if (!sheet) return enc.encode('');
  let maxRow = -1, maxCol = -1;
  for (const k of Object.keys(sheet.cells)) {
    const [r, c] = k.split(',').map(Number);
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  if (maxRow < 1) return enc.encode('');
  const headers = [];
  for (let c = 0; c <= maxCol; c++) {
    headers.push((sheet.cells[cellKey(0, c)]?.raw || '').toUpperCase().trim());
  }
  const out = [];
  out.push('BEGIN:VCALENDAR');
  out.push('VERSION:2.0');
  out.push('PRODID:-//RodmanOffice//Converter//EN');
  out.push('CALSCALE:GREGORIAN');
  for (let r = 1; r <= maxRow; r++) {
    const event = ['BEGIN:VEVENT'];
    let hasUid = false;
    let hasSummary = false;
    for (let c = 0; c <= maxCol; c++) {
      const v = sheet.cells[cellKey(r, c)]?.raw;
      if (v == null || v === '') continue;
      const h = headers[c] || `X-RODMAN-COL${c + 1}`;
      if (h === 'DTSTART' || h === 'DTEND') {
        event.push(`${h}:${ensureIcalDate(v)}`);
      } else if (COLS.includes(h)) {
        if (h === 'UID') hasUid = true;
        if (h === 'SUMMARY') hasSummary = true;
        event.push(`${h}:${escapeText(v)}`);
      } else {
        event.push(`X-RODMAN-${h.replace(/[^A-Z0-9-]/g, '-')}:${escapeText(v)}`);
      }
    }
    if (!hasUid) event.push(`UID:rodman-${Date.now()}-${r}@rodmanoffice`);
    if (!hasSummary) event.push('SUMMARY:(untitled)');
    event.push('END:VEVENT');
    out.push(event.join('\r\n'));
  }
  out.push('END:VCALENDAR');
  return enc.encode(out.join('\r\n') + '\r\n');
}
