import {
  parseCsv,
  unparseCsv,
  parseXlsx,
  buildXlsx,
  type Sheet2D,
  // Part 12: extra readers + writers from the shared lib/sheets engine.
  exportSheetAsTsv,
  parseTsvWorkbook,
  exportSheetAsPsv,
  exportWorkbookAsJson,
  parseJsonWorkbook,
  exportSheetAsNdjson,
  parseNdjsonWorkbook,
  parseYamlWorkbook,
  exportWorkbookAsHtml,
  parseHtmlTablesWorkbook,
  exportWorkbookAsMarkdown,
  parseMarkdownTablesWorkbook,
  exportWorkbookAsExcelXml,
  exportWorkbookAsOds,
  parseVcardWorkbook,
  exportWorkbookAsVcard,
  parseIcalWorkbook,
  exportWorkbookAsIcal,
  exportWorkbookAsPdf,
} from "@aicell/codecs";
import { type Sheet, type Workbook, cellKey } from "@aicell/shared";

function rowsToSheet(rows: string[][], baseName: string, idSuffix: string): Sheet {
  const cells: Sheet["cells"] = {};
  let maxCol = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const s = row[c] ?? "";
      if (s !== "") {
        cells[cellKey(r, c)] = { raw: s };
        if (c + 1 > maxCol) maxCol = c + 1;
      }
    }
  }
  return {
    id: `sheet-${idSuffix}`,
    name: baseName.slice(0, 31) || "Sheet1",
    cells,
    rowCount: Math.max(rows.length, 1000),
    colCount: Math.max(maxCol, 26),
  };
}

async function importCsv(file: File): Promise<Sheet[]> {
  const text = await file.text();
  const rows = parseCsv(text);
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return [rowsToSheet(rows, baseName, String(Date.now()))];
}

async function importXlsxFile(file: File): Promise<Sheet[]> {
  const buf = await file.arrayBuffer();
  const parsed = parseXlsx(buf);
  const out: Sheet[] = parsed.map((s, i) =>
    rowsToSheet(s.rows, s.name, `${Date.now()}-${i}`),
  );
  if (out.length === 0) {
    out.push(rowsToSheet([], file.name.replace(/\.[^.]+$/, ""), String(Date.now())));
  }
  return out;
}

// Workbook-shaped readers from the lib produce { id, name, sheets:
// [Sheet] }. We discard the wrapper and pass the sheets array up.
function importViaWorkbookReader(
  reader: (text: string, name?: string) => { sheets: Sheet[] },
) {
  return async (file: File): Promise<Sheet[]> => {
    const text = await file.text();
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const wb = reader(text, baseName);
    if (!wb.sheets || !wb.sheets.length) {
      return [rowsToSheet([], baseName, String(Date.now()))];
    }
    return wb.sheets;
  };
}

const importTsv = async (file: File): Promise<Sheet[]> => {
  // TSV is morphologically a CSV with a different delimiter; lib
  // version handles it via parseTsvWorkbook.
  return importViaWorkbookReader(parseTsvWorkbook as any)(file);
};
const importJson = importViaWorkbookReader(parseJsonWorkbook as any);
const importNdjson = importViaWorkbookReader(parseNdjsonWorkbook as any);
const importYaml = importViaWorkbookReader(parseYamlWorkbook as any);
const importHtmlTables = importViaWorkbookReader(parseHtmlTablesWorkbook as any);
const importMarkdownTables = importViaWorkbookReader(parseMarkdownTablesWorkbook as any);
const importVcard = importViaWorkbookReader(parseVcardWorkbook as any);
const importIcal = importViaWorkbookReader(parseIcalWorkbook as any);

export async function importSpreadsheetFile(file: File): Promise<Sheet[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return importXlsxFile(file);
  if (lower.endsWith(".tsv")) return importTsv(file);
  if (lower.endsWith(".json")) return importJson(file);
  if (lower.endsWith(".ndjson") || lower.endsWith(".jsonl")) return importNdjson(file);
  if (lower.endsWith(".yaml") || lower.endsWith(".yml")) return importYaml(file);
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return importHtmlTables(file);
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return importMarkdownTables(file);
  if (lower.endsWith(".vcf")) return importVcard(file);
  if (lower.endsWith(".ics")) return importIcal(file);
  return importCsv(file);
}

/**
 * Build a dense rows×cols matrix of raw cell values for the populated area
 * of the sheet. Trailing empty rows and columns are trimmed so exports
 * don't include the entire 1000×26 default canvas.
 */
function sheetToMatrix(sheet: Sheet): string[][] {
  let maxRow = -1;
  let maxCol = -1;
  for (const key of Object.keys(sheet.cells)) {
    const [r, c] = key.split(",").map(Number) as [number, number];
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  if (maxRow < 0) return [];
  const rows: string[][] = [];
  for (let r = 0; r <= maxRow; r++) {
    const row: string[] = [];
    for (let c = 0; c <= maxCol; c++) {
      row.push(sheet.cells[cellKey(r, c)]?.raw ?? "");
    }
    rows.push(row);
  }
  return rows;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(name: string): string {
  return name.replace(/[^\w.-]+/g, "_") || "Sheet";
}

/** Download the active sheet as a CSV file. Raw values, no formula resolution. */
export function exportSheetAsCSV(sheet: Sheet): void {
  const csv = unparseCsv(sheetToMatrix(sheet));
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${safeFilename(sheet.name)}.csv`);
}

/** Download the entire workbook as an XLSX file. */
export function exportWorkbookAsXLSX(workbook: Workbook): void {
  const sheets: Sheet2D[] = workbook.sheets.map((s) => ({
    name: s.name,
    rows: sheetToMatrix(s),
  }));
  const buf = buildXlsx(sheets);
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${safeFilename(workbook.name)}.xlsx`);
}

// ---------- Part 12: additional export formats ----------
//
// All of these route through @aicell/codecs, which thinly wraps the
// shared /lib/sheets/ engine. The workbook shape passed in is the
// React app's existing Workbook (cellKey-indexed cells map) — the
// lib serializers consume it directly without conversion.

function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  // Copy into a fresh Uint8Array so the underlying buffer is a
  // plain ArrayBuffer (not potentially SharedArrayBuffer-backed) —
  // TypeScript's strict BlobPart typing requires the narrower form.
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  downloadBlob(blob, filename);
}

export function exportSheetAsTSV(sheet: Sheet): void {
  downloadBytes(exportSheetAsTsv(sheet),
    `${safeFilename(sheet.name)}.tsv`, "text/tab-separated-values;charset=utf-8");
}
export function exportSheetAsPSV(sheet: Sheet): void {
  downloadBytes(exportSheetAsPsv(sheet),
    `${safeFilename(sheet.name)}.psv`, "text/plain;charset=utf-8");
}
export function exportWorkbookAsJSON(workbook: Workbook): void {
  downloadBytes(exportWorkbookAsJson(workbook),
    `${safeFilename(workbook.name)}.json`, "application/json;charset=utf-8");
}
export function exportSheetAsNDJSON(sheet: Sheet): void {
  downloadBytes(exportSheetAsNdjson(sheet),
    `${safeFilename(sheet.name)}.ndjson`, "application/x-ndjson;charset=utf-8");
}
export function exportWorkbookAsHTML(workbook: Workbook): void {
  downloadBytes(exportWorkbookAsHtml(workbook),
    `${safeFilename(workbook.name)}.html`, "text/html;charset=utf-8");
}
export function exportWorkbookAsMD(workbook: Workbook): void {
  downloadBytes(exportWorkbookAsMarkdown(workbook),
    `${safeFilename(workbook.name)}.md`, "text/markdown;charset=utf-8");
}
export function exportWorkbookAsXML(workbook: Workbook): void {
  downloadBytes(exportWorkbookAsExcelXml(workbook),
    `${safeFilename(workbook.name)}.xml`, "application/vnd.ms-excel.sheet.xml");
}
export function exportWorkbookAsODS(workbook: Workbook): void {
  downloadBytes(exportWorkbookAsOds(workbook),
    `${safeFilename(workbook.name)}.ods`, "application/vnd.oasis.opendocument.spreadsheet");
}
export function exportWorkbookAsVCF(workbook: Workbook): void {
  downloadBytes(exportWorkbookAsVcard(workbook),
    `${safeFilename(workbook.name)}.vcf`, "text/vcard;charset=utf-8");
}
export function exportWorkbookAsICS(workbook: Workbook): void {
  downloadBytes(exportWorkbookAsIcal(workbook),
    `${safeFilename(workbook.name)}.ics`, "text/calendar;charset=utf-8");
}
export async function exportWorkbookAsPDF(workbook: Workbook): Promise<void> {
  const blob = await exportWorkbookAsPdf(workbook);
  downloadBlob(blob, `${safeFilename(workbook.name)}.pdf`);
}
