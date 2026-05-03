import type { Sheet, RangeBounds } from "@aicell/shared";
import { cellKey } from "@aicell/shared";

/**
 * Rectangular range used by selection and clipboard ops. Same shape as
 * `RangeBounds` from `@aicell/shared`; this alias exists so app code can
 * keep saying `Range` while the persisted type stays canonical.
 */
export type Range = RangeBounds;

export function normalizeRange(r: Range): Range {
  return {
    startRow: Math.min(r.startRow, r.endRow),
    endRow: Math.max(r.startRow, r.endRow),
    startCol: Math.min(r.startCol, r.endCol),
    endCol: Math.max(r.startCol, r.endCol),
  };
}

export function rangeContains(r: Range, row: number, col: number): boolean {
  const n = normalizeRange(r);
  return row >= n.startRow && row <= n.endRow && col >= n.startCol && col <= n.endCol;
}

export function rangeCellCount(r: Range): number {
  const n = normalizeRange(r);
  return (n.endRow - n.startRow + 1) * (n.endCol - n.startCol + 1);
}

/** Serialize a single cell's raw value as plain text for the clipboard. */
export function serializeCell(sheet: Sheet, row: number, col: number): string {
  return sheet.cells[cellKey(row, col)]?.raw ?? "";
}

/**
 * Quote a cell value if it contains a tab, newline, or double-quote, per
 * the de-facto TSV/CSV convention used by Excel and Sheets. Internal
 * double-quotes are doubled.
 */
function escapeTsvCell(s: string): string {
  if (s.indexOf("\t") === -1 && s.indexOf("\n") === -1 && s.indexOf("\r") === -1 && s.indexOf('"') === -1) {
    return s;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

/** Serialize a rectangular range as TSV with proper escaping. */
export function serializeRange(sheet: Sheet, r: Range): string {
  const n = normalizeRange(r);
  const rows: string[] = [];
  for (let row = n.startRow; row <= n.endRow; row++) {
    const cells: string[] = [];
    for (let col = n.startCol; col <= n.endCol; col++) {
      cells.push(escapeTsvCell(sheet.cells[cellKey(row, col)]?.raw ?? ""));
    }
    rows.push(cells.join("\t"));
  }
  return rows.join("\n");
}

/**
 * Parse clipboard text as TSV. Excel/Sheets put tabs between columns and
 * newlines between rows when copying a range. Cells containing tabs,
 * newlines, or double-quotes are wrapped in `"..."` with internal `"`
 * doubled — we honor that convention so round-trip survives.
 *
 * A bare value still parses as a 1×1 grid. CRLF is normalized to LF.
 */
export function parseTSV(text: string): string[][] {
  if (text === "") return [[""]];
  const normalized = text.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < normalized.length) {
    const ch = normalized[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === "\t") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Flush trailing cell + row. Drop a single trailing empty row that
  // arises from inputs ending with "\n" (Excel adds one).
  row.push(cell);
  if (!(row.length === 1 && row[0] === "" && rows.length > 0)) {
    rows.push(row);
  }
  return rows;
}
