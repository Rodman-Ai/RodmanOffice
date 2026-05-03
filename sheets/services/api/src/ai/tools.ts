import type { Workbook, Sheet } from "@aicell/shared";

/**
 * Server-side helpers backing the agent's read-only tools (audit_formulas,
 * forecast). Mutating tools are recorded as a plan and applied client-side.
 */

export type FormulaIssue = {
  sheet: string;
  cell: string;
  raw: string;
  kind: "out_of_range_ref" | "self_ref" | "duplicate_formula" | "empty_ref";
  note: string;
};

const A1_RE = /\b([A-Z]+)([1-9][0-9]*)\b/g;

function colNumberFromLetters(s: string): number {
  let n = 0;
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function auditFormulas(wb: Workbook): FormulaIssue[] {
  const issues: FormulaIssue[] = [];
  for (const sheet of wb.sheets) {
    const formulaPositions = new Map<string, string[]>();
    for (const [key, cell] of Object.entries(sheet.cells)) {
      if (!cell.raw.startsWith("=")) continue;
      const [rowStr, colStr] = key.split(",");
      const row = Number(rowStr);
      const col = Number(colStr);
      const formula = cell.raw;
      const a1 = `${columnLetters(col)}${row + 1}`;

      // Track duplicates (same formula in many cells, can indicate a missed array)
      const list = formulaPositions.get(formula) ?? [];
      list.push(a1);
      formulaPositions.set(formula, list);

      // Out-of-range cell refs
      A1_RE.lastIndex = 0;
      for (const m of formula.matchAll(A1_RE)) {
        const refCol = colNumberFromLetters(m[1]!);
        const refRow = Number(m[2]) - 1;
        if (refRow >= sheet.rowCount || refCol >= sheet.colCount) {
          issues.push({
            sheet: sheet.name,
            cell: a1,
            raw: formula,
            kind: "out_of_range_ref",
            note: `References ${m[0]} but sheet is only ${sheet.rowCount}×${sheet.colCount}`,
          });
        }
        if (refRow === row && refCol === col) {
          issues.push({
            sheet: sheet.name,
            cell: a1,
            raw: formula,
            kind: "self_ref",
            note: `Cell references itself`,
          });
        }
      }
    }
    for (const [formula, cells] of formulaPositions) {
      if (cells.length >= 5) {
        issues.push({
          sheet: sheet.name,
          cell: cells[0]!,
          raw: formula,
          kind: "duplicate_formula",
          note: `Same formula used in ${cells.length} cells (${cells.slice(0, 3).join(", ")}…) — consider a single dynamic-array formula.`,
        });
      }
    }
  }
  return issues;
}

function columnLetters(col: number): string {
  let n = col;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/** Parse an A1-style range like "B2:B12" into row/col bounds (zero-indexed). */
export function parseRange(s: string): {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
} | null {
  const m = s.trim().match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!m) return null;
  return {
    startCol: colNumberFromLetters(m[1]!),
    startRow: Number(m[2]) - 1,
    endCol: colNumberFromLetters(m[3]!),
    endRow: Number(m[4]) - 1,
  };
}

export function rangeValues(sheet: Sheet, rangeStr: string): number[] {
  const r = parseRange(rangeStr);
  if (!r) return [];
  const out: number[] = [];
  for (let row = r.startRow; row <= r.endRow; row++) {
    for (let col = r.startCol; col <= r.endCol; col++) {
      const raw = sheet.cells[`${row},${col}`]?.raw ?? "";
      const n = Number(raw);
      if (Number.isFinite(n) && raw.trim() !== "") out.push(n);
    }
  }
  return out;
}

export type Forecast = {
  predictions: number[];
  slope: number;
  intercept: number;
  r2: number;
};

/** Simple least-squares linear regression. */
export function forecastSeries(values: number[], periods: number): Forecast {
  const n = values.length;
  if (n < 2) {
    return { predictions: Array(periods).fill(values[0] ?? 0), slope: 0, intercept: values[0] ?? 0, r2: 0 };
  }
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = values[i]!;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  const denom = n * sxx - sx * sx;
  const slope = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  // R²
  const meanY = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yi = values[i]!;
    const yhat = slope * i + intercept;
    ssRes += (yi - yhat) ** 2;
    ssTot += (yi - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 1 : 1 - ssRes / ssTot;

  const predictions: number[] = [];
  for (let p = 0; p < periods; p++) {
    predictions.push(slope * (n + p) + intercept);
  }
  return { predictions, slope, intercept, r2 };
}

export function forecastFromWorkbook(
  wb: Workbook,
  args: { sheet: string; range: string; periods: number }
): Forecast | { error: string } {
  const sheet = wb.sheets.find((s) => s.name === args.sheet);
  if (!sheet) return { error: `Unknown sheet "${args.sheet}"` };
  const values = rangeValues(sheet, args.range);
  if (values.length < 2)
    return { error: `Need at least 2 numeric values in ${args.range}` };
  return forecastSeries(values, args.periods);
}
