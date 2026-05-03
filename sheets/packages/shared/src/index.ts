export type SheetId = string;
export type WorkbookId = string;

export type CellAddress = {
  sheet: SheetId;
  row: number;
  col: number;
};

export type CellValue = string | number | boolean | null;

export type NumberFormat =
  | "general"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "datetime";

export type CellFormat = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  /** CSS color string for text. */
  color?: string;
  /** CSS color string for cell background. */
  bg?: string;
  /** Number-format preset; "general" or undefined uses HyperFormula's raw value. */
  numberFmt?: NumberFormat;
  /** Decimal places for "number", "currency", and "percent". Defaults to 2. */
  decimals?: number;
};

export type Cell = {
  /** Raw user input — formulas start with "=" */
  raw: string;
  format?: CellFormat;
  comment?: CellComment;
};

export type CellComment = {
  text: string;
  /** Optional author display name. */
  author?: string;
  /** Unix ms when last edited. */
  ts: number;
};

export type RangeBounds = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type CFCondition =
  | { type: "greaterThan"; value: number }
  | { type: "greaterThanOrEqual"; value: number }
  | { type: "lessThan"; value: number }
  | { type: "lessThanOrEqual"; value: number }
  | { type: "equals"; value: string }
  | { type: "notEquals"; value: string }
  | { type: "between"; min: number; max: number }
  | { type: "contains"; text: string; matchCase?: boolean }
  | { type: "isEmpty" }
  | { type: "isNotEmpty" };

export type ConditionalRule = {
  id: string;
  range: RangeBounds;
  condition: CFCondition;
  style: Partial<CellFormat>;
};

export type ChartType = "bar" | "line" | "area" | "pie" | "scatter";

export type ChartSpec = {
  id: string;
  title: string;
  type: ChartType;
  /** A1-style range, e.g. "A1:B10". First row treated as header, first column as labels. */
  range: string;
};

export type Sheet = {
  id: SheetId;
  name: string;
  /** Sparse map of "row,col" -> Cell */
  cells: Record<string, Cell>;
  rowCount: number;
  colCount: number;
  /** Charts attached to this sheet. Optional for backwards compat with older workbooks. */
  charts?: ChartSpec[];
  /** Per-column widths in pixels. Sparse — missing entries use the default width. */
  colWidths?: Record<number, number>;
  /** Conditional formatting rules evaluated in order; first match wins. */
  conditionalRules?: ConditionalRule[];
};

export type Workbook = {
  id: WorkbookId;
  name: string;
  sheets: Sheet[];
};

export const cellKey = (row: number, col: number): string => `${row},${col}`;

export const colLetters = (col: number): string => {
  let n = col;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

export const a1 = (row: number, col: number): string =>
  `${colLetters(col)}${row + 1}`;
