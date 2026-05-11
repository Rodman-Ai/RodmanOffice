// iCalendar (.ics) read + write. VEVENT records → spreadsheet rows.

// @ts-expect-error untyped JS module
import { parseIcalWorkbook as libParseIcalWorkbook, exportWorkbookAsIcal as libExportWorkbookAsIcal } from "../../../../lib/sheets/icalendar.js";

type Workbook = any;

export function parseIcalWorkbook(text: string, name?: string): Workbook { return libParseIcalWorkbook(text, name); }
export function exportWorkbookAsIcal(workbook: Workbook): Uint8Array { return libExportWorkbookAsIcal(workbook); }
