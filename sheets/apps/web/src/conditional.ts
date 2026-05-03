import type {
  CellFormat,
  CellValue,
  CFCondition,
  ConditionalRule,
  RangeBounds,
} from "@aicell/shared";
import { a1 } from "@aicell/shared";

export function rangeBoundsContains(r: RangeBounds, row: number, col: number): boolean {
  return (
    row >= Math.min(r.startRow, r.endRow) &&
    row <= Math.max(r.startRow, r.endRow) &&
    col >= Math.min(r.startCol, r.endCol) &&
    col <= Math.max(r.startCol, r.endCol)
  );
}

/** Whether a single rule matches a cell's raw + computed value. */
export function matchesCondition(condition: CFCondition, raw: string, value: CellValue): boolean {
  const num = typeof value === "number" ? value : Number(raw);
  const hasNum = Number.isFinite(num);
  const text = value !== null && value !== undefined ? String(value) : raw;
  switch (condition.type) {
    case "greaterThan":
      return hasNum && num > condition.value;
    case "greaterThanOrEqual":
      return hasNum && num >= condition.value;
    case "lessThan":
      return hasNum && num < condition.value;
    case "lessThanOrEqual":
      return hasNum && num <= condition.value;
    case "equals":
      return text === condition.value;
    case "notEquals":
      return text !== condition.value;
    case "between":
      return hasNum && num >= condition.min && num <= condition.max;
    case "contains": {
      const hay = condition.matchCase ? text : text.toLowerCase();
      const needle = condition.matchCase ? condition.text : condition.text.toLowerCase();
      return needle !== "" && hay.includes(needle);
    }
    case "isEmpty":
      return raw === "" && (value === null || value === undefined || value === "");
    case "isNotEmpty":
      return raw !== "" || (value !== null && value !== undefined && value !== "");
  }
}

/**
 * Merge a base cell format with the styles from any matching conditional
 * rules. Rules are evaluated in order; matching styles are applied left-to-
 * right (so later rules override earlier ones). Returns the original
 * format unchanged when nothing matches.
 */
export function resolveFormat(
  base: CellFormat | undefined,
  rules: ConditionalRule[] | undefined,
  row: number,
  col: number,
  raw: string,
  value: CellValue
): CellFormat | undefined {
  if (!rules || rules.length === 0) return base;
  let result: CellFormat | undefined = base;
  for (const rule of rules) {
    if (!rangeBoundsContains(rule.range, row, col)) continue;
    if (!matchesCondition(rule.condition, raw, value)) continue;
    result = { ...(result ?? {}), ...rule.style };
  }
  return result;
}

/** Short label like "A1:B10" for displaying a range. */
export function rangeBoundsToA1(r: RangeBounds): string {
  const startRow = Math.min(r.startRow, r.endRow);
  const endRow = Math.max(r.startRow, r.endRow);
  const startCol = Math.min(r.startCol, r.endCol);
  const endCol = Math.max(r.startCol, r.endCol);
  if (startRow === endRow && startCol === endCol) return a1(startRow, startCol);
  return `${a1(startRow, startCol)}:${a1(endRow, endCol)}`;
}
