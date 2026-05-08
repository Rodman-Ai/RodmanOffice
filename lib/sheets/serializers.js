// =============================================================
//  Spreadsheet text-format serializers and the ODS writer.
//
//  Inputs are Workbook objects (from importSpreadsheet) so every
//  serializer sees the same in-memory shape regardless of source
//  format. Each serializer returns a Uint8Array so the converter
//  can dispatch them uniformly.
//
//  Reusable: parseTsvWorkbook for the TSV input path, and toJson
//  understands both array-of-arrays and array-of-objects on the
//  way back in (parseJsonWorkbook).
// =============================================================

import { parseCsv, unparseCsv } from './csv.js';
import { cellKey } from './types.js';
import { buildZip } from '../docs/docx.js';

const enc = new TextEncoder();

function escXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    name: (baseName || 'Sheet1').slice(0, 31) || 'Sheet1',
    cells,
    rowCount: Math.max(rows.length, 1000),
    colCount: Math.max(maxCol, 26),
  };
}

// ---------- TSV (read + write) ----------

export function exportSheetAsTsv(sheet) {
  const rows = sheetToMatrix(sheet);
  return enc.encode(unparseCsv(rows, '\t'));
}

export function parseTsvWorkbook(text, name) {
  const rows = parseCsv(text, '\t');
  const baseName = (name || 'workbook').replace(/\.[^.]+$/, '');
  const sheet = rowsToSheet(rows, baseName, String(Date.now()));
  return { id: `wb-${Date.now()}`, name: baseName, sheets: [sheet] };
}

// ---------- PSV (write only) ----------

export function exportSheetAsPsv(sheet) {
  const rows = sheetToMatrix(sheet);
  return enc.encode(unparseCsv(rows, '|'));
}

// ---------- JSON (read + write) ----------
//
// Write mode picks header-keyed objects when row 0 is non-empty and
// distinct, otherwise falls back to array-of-arrays. Read mode
// accepts both shapes.

export function exportWorkbookAsJson(workbook) {
  const sheetsOut = workbook.sheets.map((sheet) => {
    const rows = sheetToMatrix(sheet);
    if (rows.length === 0) return { name: sheet.name, rows: [] };
    const headers = rows[0];
    const allHeadersFilled = headers.length > 0 && headers.every((h) => String(h).trim() !== '');
    if (allHeadersFilled) {
      const records = rows.slice(1).map((row) => {
        const obj = {};
        for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c] ?? '';
        return obj;
      });
      return { name: sheet.name, records };
    }
    return { name: sheet.name, rows };
  });
  const payload = sheetsOut.length === 1
    ? (sheetsOut[0].records ?? sheetsOut[0].rows)
    : sheetsOut;
  return enc.encode(JSON.stringify(payload, null, 2));
}

export function parseJsonWorkbook(text, name) {
  const baseName = (name || 'workbook').replace(/\.[^.]+$/, '');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Invalid JSON: cannot import as a workbook'); }

  const sheets = [];
  const pushSheet = (sheetName, rows) => {
    sheets.push(rowsToSheet(rows, sheetName, `${Date.now()}-${sheets.length}`));
  };

  if (Array.isArray(parsed)) {
    pushSheet(baseName, jsonArrayToRows(parsed));
  } else if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.sheets)) {
      for (const s of parsed.sheets) {
        const rows = Array.isArray(s.rows) ? s.rows : (Array.isArray(s.records) ? jsonArrayToRows(s.records) : []);
        pushSheet(s.name || baseName, rows);
      }
    } else {
      pushSheet(baseName, jsonArrayToRows([parsed]));
    }
  } else {
    throw new Error('Unsupported JSON shape for spreadsheet import');
  }
  if (sheets.length === 0) pushSheet(baseName, []);
  return { id: `wb-${Date.now()}`, name: baseName, sheets };
}

function jsonArrayToRows(arr) {
  if (!arr.length) return [];
  // Array-of-arrays: pass through.
  if (Array.isArray(arr[0])) return arr.map((r) => Array.isArray(r) ? r.map((v) => v == null ? '' : String(v)) : []);
  // Array-of-objects: collect a stable column order from the first
  // object, then merge any new keys discovered later in declaration order.
  const headers = [];
  const seen = new Set();
  for (const obj of arr) {
    if (!obj || typeof obj !== 'object') continue;
    for (const k of Object.keys(obj)) {
      if (!seen.has(k)) { seen.add(k); headers.push(k); }
    }
  }
  const rows = [headers.slice()];
  for (const obj of arr) {
    const row = headers.map((h) => {
      const v = obj?.[h];
      if (v == null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    });
    rows.push(row);
  }
  return rows;
}

// ---------- NDJSON (write only) ----------

export function exportSheetAsNdjson(sheet) {
  const rows = sheetToMatrix(sheet);
  if (rows.length === 0) return enc.encode('');
  const headers = rows[0];
  const allHeadersFilled = headers.length > 0 && headers.every((h) => String(h).trim() !== '');
  let lines;
  if (allHeadersFilled) {
    lines = rows.slice(1).map((row) => {
      const obj = {};
      for (let c = 0; c < headers.length; c++) obj[headers[c]] = row[c] ?? '';
      return JSON.stringify(obj);
    });
  } else {
    lines = rows.map((row) => JSON.stringify(row));
  }
  return enc.encode(lines.join('\n') + '\n');
}

// ---------- HTML tables (write only, multi-sheet) ----------

export function exportWorkbookAsHtml(workbook) {
  let body = '';
  for (const sheet of workbook.sheets) {
    body += `<h2>${escapeHtml(sheet.name)}</h2>`;
    body += '<table border="1" cellspacing="0" cellpadding="4">';
    const rows = sheetToMatrix(sheet);
    for (const row of rows) {
      body += '<tr>';
      for (const cell of row) body += `<td>${escapeHtml(cell ?? '')}</td>`;
      body += '</tr>';
    }
    body += '</table>';
  }
  const title = escapeHtml(workbook.name || 'Workbook');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title></head><body>${body}</body></html>`;
  return enc.encode(html);
}

// ---------- Markdown tables (write only) ----------

export function exportWorkbookAsMarkdown(workbook) {
  const parts = [];
  for (const sheet of workbook.sheets) {
    parts.push(`## ${sheet.name}\n`);
    const rows = sheetToMatrix(sheet);
    if (rows.length === 0) { parts.push('(empty)\n'); continue; }
    const cols = Math.max(...rows.map((r) => r.length));
    const header = rows[0] ?? [];
    const headerRow = [];
    for (let c = 0; c < cols; c++) headerRow.push(mdEscape(header[c] ?? ''));
    parts.push('| ' + headerRow.join(' | ') + ' |');
    // Decide alignment per column: right-align if every non-empty cell
    // below the header parses as a number.
    const aligns = [];
    for (let c = 0; c < cols; c++) {
      let allNumeric = true;
      let nonEmpty = 0;
      for (let r = 1; r < rows.length; r++) {
        const v = String(rows[r]?.[c] ?? '').trim();
        if (v === '') continue;
        nonEmpty++;
        if (!/^-?\d+(\.\d+)?$/.test(v)) { allNumeric = false; break; }
      }
      aligns.push(allNumeric && nonEmpty > 0 ? '---:' : '---');
    }
    parts.push('| ' + aligns.join(' | ') + ' |');
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r] ?? [];
      const cells = [];
      for (let c = 0; c < cols; c++) cells.push(mdEscape(row[c] ?? ''));
      parts.push('| ' + cells.join(' | ') + ' |');
    }
    parts.push('');
  }
  return enc.encode(parts.join('\n'));
}

function mdEscape(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// ---------- Excel 2003 SpreadsheetML XML (write only) ----------

export function exportWorkbookAsExcelXml(workbook) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"';
  xml += ' xmlns:o="urn:schemas-microsoft-com:office:office"';
  xml += ' xmlns:x="urn:schemas-microsoft-com:office:excel"';
  xml += ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">\n';
  for (const sheet of workbook.sheets) {
    const rows = sheetToMatrix(sheet);
    xml += `<Worksheet ss:Name="${escXml(sheet.name)}"><Table>`;
    for (const row of rows) {
      xml += '<Row>';
      for (const cell of row) {
        const s = cell == null ? '' : String(cell);
        const isNumber = s !== '' && /^-?\d+(\.\d+)?$/.test(s);
        const type = isNumber ? 'Number' : 'String';
        xml += `<Cell><Data ss:Type="${type}">${escXml(s)}</Data></Cell>`;
      }
      xml += '</Row>';
    }
    xml += '</Table></Worksheet>\n';
  }
  xml += '</Workbook>\n';
  return enc.encode(xml);
}

// ---------- ODS (OpenDocument Spreadsheet, write only) ----------
//
// Minimal ODS package: mimetype, content.xml with one
// <table:table> per sheet, and META-INF/manifest.xml. Reuses the
// stored-only buildZip writer in lib/docs/docx.js — same
// machinery as the existing ODT exporter.

export function exportWorkbookAsOds(workbook) {
  const ODS_NS =
    ' xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"' +
    ' xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"' +
    ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"';
  let body = '<office:body><office:spreadsheet>';
  for (const sheet of workbook.sheets) {
    const rows = sheetToMatrix(sheet);
    body += `<table:table table:name="${escXml(sheet.name)}">`;
    for (const row of rows) {
      body += '<table:table-row>';
      for (const cell of row) {
        const s = cell == null ? '' : String(cell);
        const isNumber = s !== '' && /^-?\d+(\.\d+)?$/.test(s);
        if (isNumber) {
          body += `<table:table-cell office:value-type="float" office:value="${escXml(s)}"><text:p>${escXml(s)}</text:p></table:table-cell>`;
        } else if (s === '') {
          body += '<table:table-cell/>';
        } else {
          body += `<table:table-cell office:value-type="string"><text:p>${escXml(s)}</text:p></table:table-cell>`;
        }
      }
      body += '</table:table-row>';
    }
    body += '</table:table>';
  }
  body += '</office:spreadsheet></office:body>';

  const content =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<office:document-content${ODS_NS} office:version="1.2">` +
    body +
    '</office:document-content>';

  const manifest =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">' +
    '<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>' +
    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>' +
    '</manifest:manifest>';

  return buildZip([
    { name: 'mimetype', data: enc.encode('application/vnd.oasis.opendocument.spreadsheet') },
    { name: 'content.xml', data: enc.encode(content) },
    { name: 'META-INF/manifest.xml', data: enc.encode(manifest) },
  ]);
}

// ---------- HTML tables (read) ----------
//
// Accepts a full HTML document or an HTML fragment. Each <table> in
// document order becomes one sheet; <th> rows are treated as
// headers and emitted in row 0.

export function parseHtmlTablesWorkbook(text, name) {
  const baseName = (name || 'workbook').replace(/\.[^.]+$/, '');
  const doc = new DOMParser().parseFromString(text, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table'));
  if (tables.length === 0) throw new Error('No <table> elements found in HTML input');
  const sheets = [];
  tables.forEach((table, idx) => {
    const rows = [];
    const trs = Array.from(table.querySelectorAll('tr'));
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll('th,td')).map((c) => (c.textContent || '').trim());
      if (cells.length) rows.push(cells);
    }
    const sheetName = (table.getAttribute('summary') || table.getAttribute('aria-label') || `Sheet${idx + 1}`).slice(0, 31);
    sheets.push(rowsToSheet(rows, sheetName, `${Date.now()}-${idx}`));
  });
  return { id: `wb-${Date.now()}`, name: baseName, sheets };
}

// ---------- Markdown tables (read) ----------
//
// Pipe-delimited GFM tables. We scan for blocks where line N+1 looks
// like a separator (---, :---:, ---:, etc.) and accept lines above
// and below as header + body.

export function parseMarkdownTablesWorkbook(text, name) {
  const baseName = (name || 'workbook').replace(/\.[^.]+$/, '');
  const lines = String(text).split(/\r?\n/);
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1] || '';
    if (line.includes('|') && /^\s*\|?\s*:?-+:?(\s*\|\s*:?-+:?)+\s*\|?\s*$/.test(next)) {
      const rows = [];
      rows.push(splitMdRow(line));
      i += 2;
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(splitMdRow(lines[i]));
        i++;
      }
      tables.push(rows);
    } else {
      i++;
    }
  }
  if (tables.length === 0) throw new Error('No Markdown tables found in input');
  const sheets = tables.map((rows, idx) =>
    rowsToSheet(rows, `Sheet${idx + 1}`, `${Date.now()}-${idx}`));
  return { id: `wb-${Date.now()}`, name: baseName, sheets };
}

function splitMdRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim().replace(/\\\|/g, '|'));
}

// ---------- NDJSON (read) ----------

export function parseNdjsonWorkbook(text, name) {
  const baseName = (name || 'workbook').replace(/\.[^.]+$/, '');
  const lines = String(text).split(/\r?\n/).filter((l) => l.trim() !== '');
  const records = [];
  for (let i = 0; i < lines.length; i++) {
    try { records.push(JSON.parse(lines[i])); }
    catch (e) { throw new Error(`Invalid NDJSON on line ${i + 1}: ${e.message}`); }
  }
  const rows = jsonArrayToRows(records);
  const sheet = rowsToSheet(rows, baseName, String(Date.now()));
  return { id: `wb-${Date.now()}`, name: baseName, sheets: [sheet] };
}

// ---------- YAML (read, tabular subset) ----------
//
// We only handle the array-of-records subset, which is the only YAML
// shape that maps cleanly onto a spreadsheet:
//
//   - { name: alice, age: 30 }
//   - { name: bob,   age: 25 }
//
// or the multi-line form
//
//   - name: alice
//     age: 30
//   - name: bob
//     age: 25
//
// Anything else (anchors, multi-document streams, deep nesting)
// throws a friendly error pointing the user at JSON. The implementation
// is hand-rolled so we don't need a vendor parser.

export function parseYamlWorkbook(text, name) {
  const baseName = (name || 'workbook').replace(/\.[^.]+$/, '');
  const records = parseTabularYaml(text);
  const rows = jsonArrayToRows(records);
  const sheet = rowsToSheet(rows, baseName, String(Date.now()));
  return { id: `wb-${Date.now()}`, name: baseName, sheets: [sheet] };
}

function parseTabularYaml(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let cur = null;
  let curIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const stripped = raw.replace(/\s+#.*$/, '');
    if (!stripped.trim()) continue;
    if (stripped.trim().startsWith('#') || stripped.trim() === '---' || stripped.trim() === '...') continue;
    const indent = raw.match(/^\s*/)[0].length;
    const body = stripped.trim();
    if (body.startsWith('- ')) {
      if (cur) out.push(cur);
      cur = {};
      curIndent = indent + 2;
      const after = body.slice(2).trim();
      if (after.startsWith('{') && after.endsWith('}')) {
        Object.assign(cur, parseYamlInlineMap(after));
        out.push(cur); cur = null;
      } else if (after.includes(':')) {
        const [k, ...rest] = after.split(':');
        cur[k.trim()] = parseYamlScalar(rest.join(':').trim());
      } else if (after !== '') {
        throw new Error('YAML import: list of plain scalars is not tabular; convert to JSON.');
      }
    } else if (cur && indent >= curIndent && body.includes(':')) {
      const idx = body.indexOf(':');
      const k = body.slice(0, idx).trim();
      const v = body.slice(idx + 1).trim();
      cur[k] = parseYamlScalar(v);
    } else {
      throw new Error(`YAML import only supports a top-level list of records (line ${i + 1}). For nested data, save as JSON.`);
    }
  }
  if (cur) out.push(cur);
  if (!out.length) throw new Error('YAML import: no records found.');
  return out;
}

function parseYamlInlineMap(s) {
  // { key: value, key2: "v 2", key3: 'v3' }
  const inner = s.slice(1, -1);
  const pairs = [];
  let depth = 0, q = '', buf = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (q) { buf += ch; if (ch === q) q = ''; continue; }
    if (ch === '"' || ch === "'") { q = ch; buf += ch; continue; }
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { pairs.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) pairs.push(buf);
  const out = {};
  for (const pair of pairs) {
    const idx = pair.indexOf(':');
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim().replace(/^['"]|['"]$/g, '');
    const v = pair.slice(idx + 1).trim();
    out[k] = parseYamlScalar(v);
  }
  return out;
}

function parseYamlScalar(s) {
  if (s === '' || s === '~' || /^null$/i.test(s)) return '';
  if (/^(true|false)$/i.test(s)) return s.toLowerCase();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
  }
  return s;
}
