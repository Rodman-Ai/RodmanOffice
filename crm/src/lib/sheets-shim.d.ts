// Loose type declarations for the shared /lib/sheets/ engine exposed via the
// `@rodman/sheets` webpack alias. The underlying module is plain JS with
// JSDoc — typing every helper precisely isn't worth it. We declare just the
// few functions the workbook wrapper actually calls.
declare module "@rodman/sheets" {
  export interface XlsxSheet {
    name: string;
    rows: string[][];
  }

  export function buildXlsx(sheets: XlsxSheet[]): Uint8Array;
  export function parseXlsx(buf: Uint8Array | ArrayBuffer): XlsxSheet[];
  export function parseCsv(text: string, delim?: string): string[][];
  export function unparseCsv(rows: string[][], delim?: string): string;
  export function importSpreadsheet(bytes: Uint8Array, name: string): unknown;
  export function exportWorkbookAsXLSX(workbook: unknown): Uint8Array;
}
