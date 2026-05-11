// vCard 3.0 read + write. Contacts → spreadsheet rows.

// @ts-expect-error untyped JS module
import { parseVcardWorkbook as libParseVcardWorkbook, exportWorkbookAsVcard as libExportWorkbookAsVcard } from "../../../../lib/sheets/vcard.js";

type Workbook = any;

export function parseVcardWorkbook(text: string, name?: string): Workbook { return libParseVcardWorkbook(text, name); }
export function exportWorkbookAsVcard(workbook: Workbook): Uint8Array { return libExportWorkbookAsVcard(workbook); }
