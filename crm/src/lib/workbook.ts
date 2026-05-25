// Client-side full-workbook XLSX round-trip for LeoCRM.
// Talks to the new /api/workbook/export and /api/workbook/import routes and
// uses the shared spreadsheet engine at /lib/sheets/ (exposed via the
// `@rodman/sheets` webpack alias in next.config.js).

import { buildXlsx, parseXlsx } from "@rodman/sheets";

type ServerSheet = {
  name: string;
  headers: string[];
  rows: Record<string, string>[];
};

function rowsObjectsToCells(headers: string[], rows: Record<string, string>[]): string[][] {
  const out: string[][] = [headers.slice()];
  for (const row of rows) {
    out.push(headers.map((h) => {
      const v = row[h];
      if (v === undefined || v === null) return "";
      return String(v);
    }));
  }
  return out;
}

function cellsToRowObjects(rows: string[][]): { headers: string[]; rows: Record<string, string>[] } {
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => String(h || ""));
  const objects: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === "" || c == null)) continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c] == null ? "" : String(row[c]);
    }
    objects.push(obj);
  }
  return { headers, rows: objects };
}

function downloadBytes(filename: string, bytes: Uint8Array, mime: string) {
  // The generic Uint8Array<ArrayBufferLike> isn't directly a BlobPart in TS 5.9+;
  // pass the underlying ArrayBuffer slice instead.
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const blob = new Blob([ab], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 200);
}

export async function exportWorkbookXlsx(): Promise<{ sheetCount: number }> {
  const res = await fetch("/api/workbook/export");
  if (!res.ok) throw new Error(`Export failed: HTTP ${res.status}`);
  const data = (await res.json()) as { sheets: ServerSheet[] };
  const xlsxSheets = data.sheets.map((s) => ({
    name: s.name,
    rows: rowsObjectsToCells(s.headers, s.rows),
  }));
  const bytes = buildXlsx(xlsxSheets);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBytes(
    `leocrm-${stamp}.xlsx`,
    bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  return { sheetCount: data.sheets.length };
}

export async function importWorkbookXlsx(file: File): Promise<{ summary: Array<{ sheet: string; appended: number; updated: number; skipped: number }> }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const sheets = parseXlsx(buf);
  const payload = {
    sheets: sheets.map((s) => {
      const parsed = cellsToRowObjects(s.rows);
      return { name: s.name, rows: parsed.rows };
    }),
  };
  const res = await fetch("/api/workbook/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Import failed: HTTP ${res.status}${txt ? " — " + txt : ""}`);
  }
  return (await res.json()) as { summary: Array<{ sheet: string; appended: number; updated: number; skipped: number }> };
}
