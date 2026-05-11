// Thin TypeScript wrappers around the extra serializers exported
// by /lib/sheets/serializers.js — TSV / PSV / JSON / NDJSON / YAML
// / HTML tables / Markdown tables / Excel 2003 XML / ODS.
//
// The lib JS is untyped; `@ts-expect-error` suppresses the
// missing-declaration diagnostic on the very next line. Each
// underlying function is re-imported under a `lib*` alias so we
// can give them typed signatures at the export boundary.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error untyped JS module
import { exportSheetAsTsv as libExportSheetAsTsv, parseTsvWorkbook as libParseTsvWorkbook, exportSheetAsPsv as libExportSheetAsPsv, exportWorkbookAsJson as libExportWorkbookAsJson, parseJsonWorkbook as libParseJsonWorkbook, exportSheetAsNdjson as libExportSheetAsNdjson, exportWorkbookAsHtml as libExportWorkbookAsHtml, exportWorkbookAsMarkdown as libExportWorkbookAsMarkdown, exportWorkbookAsExcelXml as libExportWorkbookAsExcelXml, exportWorkbookAsOds as libExportWorkbookAsOds, parseHtmlTablesWorkbook as libParseHtmlTablesWorkbook, parseMarkdownTablesWorkbook as libParseMarkdownTablesWorkbook, parseNdjsonWorkbook as libParseNdjsonWorkbook, parseYamlWorkbook as libParseYamlWorkbook } from "../../../../lib/sheets/serializers.js";

// Workbook / Sheet types are typed `any` here — the underlying lib
// uses a cellKey-indexed cells map that lines up with the React
// app's @aicell/shared Workbook, but pulling that dependency into
// the codecs package would create a cycle.
type Workbook = any;
type Sheet = any;

export function exportSheetAsTsv(sheet: Sheet): Uint8Array { return libExportSheetAsTsv(sheet); }
export function parseTsvWorkbook(text: string, name?: string): Workbook { return libParseTsvWorkbook(text, name); }
export function exportSheetAsPsv(sheet: Sheet): Uint8Array { return libExportSheetAsPsv(sheet); }
export function exportWorkbookAsJson(workbook: Workbook): Uint8Array { return libExportWorkbookAsJson(workbook); }
export function parseJsonWorkbook(text: string, name?: string): Workbook { return libParseJsonWorkbook(text, name); }
export function exportSheetAsNdjson(sheet: Sheet): Uint8Array { return libExportSheetAsNdjson(sheet); }
export function parseNdjsonWorkbook(text: string, name?: string): Workbook { return libParseNdjsonWorkbook(text, name); }
export function parseYamlWorkbook(text: string, name?: string): Workbook { return libParseYamlWorkbook(text, name); }
export function exportWorkbookAsHtml(workbook: Workbook): Uint8Array { return libExportWorkbookAsHtml(workbook); }
export function parseHtmlTablesWorkbook(text: string, name?: string): Workbook { return libParseHtmlTablesWorkbook(text, name); }
export function exportWorkbookAsMarkdown(workbook: Workbook): Uint8Array { return libExportWorkbookAsMarkdown(workbook); }
export function parseMarkdownTablesWorkbook(text: string, name?: string): Workbook { return libParseMarkdownTablesWorkbook(text, name); }
export function exportWorkbookAsExcelXml(workbook: Workbook): Uint8Array { return libExportWorkbookAsExcelXml(workbook); }
export function exportWorkbookAsOds(workbook: Workbook): Uint8Array { return libExportWorkbookAsOds(workbook); }
