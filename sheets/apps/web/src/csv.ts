import { parseCsv, unparseCsv, parseXlsx, buildXlsx, type Sheet2D } from "@aicell/codecs";
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

export async function importSpreadsheetFile(file: File): Promise<Sheet[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return importXlsxFile(file);
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
