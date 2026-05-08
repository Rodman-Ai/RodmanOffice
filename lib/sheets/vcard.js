// =============================================================
//  vCard 3.0 ↔ Workbook bridge.
//
//  Each VCARD block becomes one row; columns are FN, N, EMAIL,
//  TEL, ADR, ORG, TITLE, NOTE. Property parameters (`;TYPE=CELL`)
//  are dropped on read because a single column can only hold one
//  value of each type — when a contact has multiple values for
//  the same property, they are joined with `; `. Line folding
//  (RFC 2425 §5.8.1: a line starting with whitespace continues
//  the previous logical line) is unfolded before parsing.
//
//  No external dependencies: vCard is a flat newline-delimited
//  key/value text format, so a hand-rolled reader/writer is well
//  within scope.
// =============================================================

import { cellKey } from './types.js';

const enc = new TextEncoder();

const COLS = ['FN', 'N', 'EMAIL', 'TEL', 'ADR', 'ORG', 'TITLE', 'NOTE'];

function unfold(text) {
  // Replace CRLF/LF that is followed by SP or HTAB with the
  // empty string (continuation), per RFC 6350 §3.2.
  return String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

function unescapeValue(s) {
  return String(s)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function escapeValue(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function parseLine(line) {
  // Property:value, with optional parameters between PROP and the colon.
  const idx = line.indexOf(':');
  if (idx < 0) return null;
  const left = line.slice(0, idx);
  const value = line.slice(idx + 1);
  const semi = left.indexOf(';');
  const prop = (semi < 0 ? left : left.slice(0, semi)).toUpperCase();
  return { prop, value };
}

export function parseVcardWorkbook(text, name) {
  const baseName = (name || 'contacts').replace(/\.[^.]+$/, '');
  const unfolded = unfold(text);
  const lines = unfolded.split(/\r?\n/);
  const rows = [];
  rows.push(COLS.slice());
  let current = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    const upper = line.toUpperCase();
    if (upper.startsWith('BEGIN:VCARD')) { current = {}; continue; }
    if (upper.startsWith('END:VCARD')) {
      if (current) {
        const row = COLS.map((c) => unescapeValue(current[c] || ''));
        rows.push(row);
        current = null;
      }
      continue;
    }
    if (!current) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (!COLS.includes(parsed.prop)) continue;
    if (current[parsed.prop]) current[parsed.prop] += '; ' + parsed.value;
    else current[parsed.prop] = parsed.value;
  }
  // Build the sheet directly so we don't depend on serializers.js's
  // private rowsToSheet helper.
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
    name: 'Contacts',
    cells,
    rowCount: Math.max(rows.length, 1000),
    colCount: Math.max(maxCol, 26),
  };
  return { id: `wb-${Date.now()}`, name: baseName, sheets: [sheet] };
}

// Serialize the first sheet of the workbook as a vCard 3.0 stream.
// The first row is treated as headers; recognized headers map onto
// the standard properties. Anything outside COLS becomes an
// X-RODMAN- prefixed extension property so we never silently drop
// data.
export function exportWorkbookAsVcard(workbook) {
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
  const lines = [];
  for (let r = 1; r <= maxRow; r++) {
    const card = [];
    card.push('BEGIN:VCARD');
    card.push('VERSION:3.0');
    let hasFN = false;
    for (let c = 0; c <= maxCol; c++) {
      const v = sheet.cells[cellKey(r, c)]?.raw;
      if (v == null || v === '') continue;
      const h = headers[c] || `X-RODMAN-COL${c + 1}`;
      const prop = COLS.includes(h) ? h : 'X-RODMAN-' + h.replace(/[^A-Z0-9-]/g, '-');
      if (prop === 'FN') hasFN = true;
      card.push(`${prop}:${escapeValue(v)}`);
    }
    // RFC 6350 requires FN; synthesize one if the spreadsheet only
    // had an N column.
    if (!hasFN) {
      const n = sheet.cells[cellKey(r, headers.indexOf('N'))]?.raw;
      if (n) card.push(`FN:${escapeValue(n.replace(/;/g, ' ').trim())}`);
    }
    card.push('END:VCARD');
    lines.push(card.join('\r\n'));
  }
  return enc.encode(lines.join('\r\n') + '\r\n');
}
