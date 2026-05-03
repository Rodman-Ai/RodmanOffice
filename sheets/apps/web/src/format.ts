import type { CellFormat, CellValue, NumberFormat } from "@aicell/shared";

const CURRENCY_PREFIX = "$";

/** Format a HyperFormula computed value for display per the cell's format. */
export function formatValue(value: CellValue, fmt: NumberFormat | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value !== "number") return String(value);

  // Non-finite values (NaN, +/-Infinity) skip every numeric format and
  // render as a bare string so we never produce "$NaN" or "Infinity%".
  if (!Number.isFinite(value)) return String(value);

  const fixed = (n: number) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });

  switch (fmt) {
    case "number":
      return fixed(value);
    case "currency":
      return CURRENCY_PREFIX + fixed(value);
    case "percent":
      return fixed(value * 100) + "%";
    case "date":
      return excelSerialToDate(value)?.toLocaleDateString() ?? String(value);
    case "datetime":
      return excelSerialToDate(value)?.toLocaleString() ?? String(value);
    case "general":
    case undefined:
    default:
      return String(value);
  }
}

/** HyperFormula returns dates as Excel-style serials. Convert to JS Date. */
export function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial)) return null;
  // Excel epoch is 1899-12-30 (handles the famous 1900 leap-year bug).
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** CSS style object derived from a CellFormat. Empty object if no format. */
export function formatToStyle(format: CellFormat | undefined): React.CSSProperties {
  if (!format) return {};
  const style: React.CSSProperties = {};
  if (format.bold) style.fontWeight = 600;
  if (format.italic) style.fontStyle = "italic";
  if (format.underline) style.textDecoration = "underline";
  if (format.color) style.color = format.color;
  if (format.bg) style.background = format.bg;
  if (format.align === "left") style.justifyContent = "flex-start";
  else if (format.align === "center") style.justifyContent = "center";
  else if (format.align === "right") style.justifyContent = "flex-end";
  return style;
}

/** Merge an existing format with a partial update. Removes empty values. */
export function mergeFormat(
  base: CellFormat | undefined,
  patch: Partial<CellFormat>
): CellFormat | undefined {
  const merged: CellFormat = { ...(base ?? {}) };
  for (const k of Object.keys(patch) as (keyof CellFormat)[]) {
    const v = patch[k];
    if (v === undefined || v === null || v === false || v === "") {
      delete (merged as Record<string, unknown>)[k];
    } else {
      (merged as Record<string, unknown>)[k] = v;
    }
  }
  return Object.keys(merged).length === 0 ? undefined : merged;
}
