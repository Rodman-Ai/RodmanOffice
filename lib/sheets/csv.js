// =============================================================
//  Spreadsheet I/O — XLSX and CSV read/write. Ported from
//  /sheets/apps/web/src/csv.ts. Signatures relaxed: takes raw
//  bytes, returns raw bytes — no File objects, no DOM downloads.
//
//  XLSX comes from a vendored copy of @e965/xlsx (ESM build).
//  CSV is hand-rolled here to avoid a network dep — full RFC-4180
//  quoting on read and write.
// =============================================================

import * as XLSX from './vendor/xlsx.mjs';
import { cellKey } from './types.js';

// ---------- CSV parser / serializer (RFC-4180 quoting) ----------

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (ch === '\r') {
        // skip; handled by following \n or end-of-input
      } else {
        field += ch;
      }
    }
  }
  // Flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function serializeCsv(rows) {
  return rows.map((row) =>
    row.map((cell) => {
      const s = cell == null ? '' : String(cell);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(',')
  ).join('\r\n');
}

// ---------- Workbook helpers ----------

function rowsToSheet(rows, baseName, idSuffix) {
  const cells = {};
  let maxCol = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      const s = v == null ? '' : String(v);
      if (s !== '') {
        cells[cellKey(r, c)] = { raw: s };
        if (c + 1 > maxCol) maxCol = c + 1;
      }
    }
  }
  return {
    id: `sheet-${idSuffix}`,
    name: baseName.slice(0, 31) || 'Sheet1',
    cells,
    rowCount: Math.max(rows.length, 1000),
    colCount: Math.max(maxCol, 26),
  };
}

function sheetToMatrix(sheet) {
  let maxRow = -1;
  let maxCol = -1;
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(',').map(Number);
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  if (maxRow < 0) return [];
  const rows = [];
  for (let r = 0; r <= maxRow; r++) {
    const row = [];
    for (let c = 0; c <= maxCol; c++) {
      row.push(sheet.cells[cellKey(r, c)]?.raw ?? '');
    }
    rows.push(row);
  }
  return rows;
}

// ---------- IMPORT ----------

function importCsv(bytes, name) {
  const text = typeof bytes === 'string' ? bytes : new TextDecoder('utf-8').decode(bytes);
  const rows = parseCsv(text);
  const baseName = name.replace(/\.[^.]+$/, '');
  const sheet = rowsToSheet(rows, baseName, String(Date.now()));
  return { id: `wb-${Date.now()}`, name: baseName, sheets: [sheet] };
}

function importXlsx(bytes, name) {
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      raw: false,
      blankrows: true,
    });
    sheets.push(rowsToSheet(rows, sheetName, `${Date.now()}-${sheets.length}`));
  }
  const baseName = name.replace(/\.[^.]+$/, '');
  if (sheets.length === 0) {
    sheets.push(rowsToSheet([], baseName, String(Date.now())));
  }
  return { id: `wb-${Date.now()}`, name: baseName, sheets };
}

/**
 * Parse spreadsheet bytes into a Workbook.
 * @param {Uint8Array | ArrayBuffer | string} bytes
 * @param {string} name — original filename, used to detect format and seed workbook name.
 * @returns {import('./types.js').Workbook}
 */
export function importSpreadsheet(bytes, name) {
  const lower = (name || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) return importXlsx(bytes, name);
  return importCsv(bytes, name);
}

// ---------- EXPORT ----------

/**
 * Serialize one sheet to CSV bytes.
 * @param {import('./types.js').Sheet} sheet
 * @returns {Uint8Array}
 */
export function exportSheetAsCSV(sheet) {
  const rows = sheetToMatrix(sheet);
  return new TextEncoder().encode(serializeCsv(rows));
}

/**
 * Serialize a workbook to XLSX bytes.
 * @param {import('./types.js').Workbook} workbook
 * @returns {Uint8Array}
 */
export function exportWorkbookAsXLSX(workbook) {
  const wb = XLSX.utils.book_new();
  for (const sheet of workbook.sheets) {
    const rows = sheetToMatrix(sheet);
    const ws = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [[]]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || 'Sheet');
  }
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}
