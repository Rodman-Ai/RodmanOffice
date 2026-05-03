import * as XLSX from "@e965/xlsx";
import type { Sheet2D } from "./types";

export function parseXlsx(buf: ArrayBuffer): Sheet2D[] {
  const wb = XLSX.read(buf, { type: "array" });
  const out: Sheet2D[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      blankrows: true,
    });
    const rows = raw.map((row) =>
      (row ?? []).map((v) => (v == null ? "" : String(v))),
    );
    out.push({ name, rows });
  }
  return out;
}

export function buildXlsx(sheets: Sheet2D[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const list = sheets.length > 0 ? sheets : [{ name: "Sheet1", rows: [] as string[][] }];
  for (const sheet of list) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows.length > 0 ? sheet.rows : [[]]);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31) || "Sheet");
  }
  return XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}
