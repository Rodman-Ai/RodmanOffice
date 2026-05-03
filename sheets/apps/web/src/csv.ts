import Papa from "papaparse";
import * as XLSX from "@e965/xlsx";
import { type Sheet, type Workbook, cellKey } from "@aicell/shared";

function rowsToSheet(rows: unknown[][], baseName: string, idSuffix: string): Sheet {
  const cells: Sheet["cells"] = {};
  let maxCol = 0;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      const s = v == null ? "" : String(v);
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
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  const baseName = file.name.replace(/\.[^.]+$/, "");
  return [rowsToSheet(parsed.data, baseName, String(Date.now()))];
}

async function importXlsx(file: File): Promise<Sheet[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const out: Sheet[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      blankrows: true,
    });
    const sheet = rowsToSheet(rows, name, `${Date.now()}-${out.length}`);
    out.push(sheet);
  }
  if (out.length === 0) {
    out.push(rowsToSheet([], file.name.replace(/\.[^.]+$/, ""), String(Date.now())));
  }
  return out;
}

export async function importSpreadsheetFile(file: File): Promise<Sheet[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return importXlsx(file);
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
  const rows = sheetToMatrix(sheet);
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${safeFilename(sheet.name)}.csv`);
}

/** Download the entire workbook as an XLSX file. */
export function exportWorkbookAsXLSX(workbook: Workbook): void {
  const wb = XLSX.utils.book_new();
  for (const sheet of workbook.sheets) {
    const rows = sheetToMatrix(sheet);
    const ws = XLSX.utils.aoa_to_sheet(rows.length > 0 ? rows : [[]]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || "Sheet");
  }
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${safeFilename(workbook.name)}.xlsx`);
}
