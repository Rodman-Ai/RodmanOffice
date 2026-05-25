import { withAuth, ok } from "@/lib/api";
import { SHEETS, SHEET_NAMES } from "@/lib/google/schema";
import { readSheet } from "@/lib/google/sheets";

// GET /api/workbook/export
// Reads every known sheet from the user's workspace spreadsheet and returns a
// single payload the client can hand to `buildXlsx`. Shape:
//   { sheets: [ { name, headers, rows: object[] }, ... ] }
export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;

  const sheets = await Promise.all(
    SHEET_NAMES.map(async (key) => {
      const schema = SHEETS[key];
      try {
        const rows = await readSheet(
          r.ctx.clients,
          r.ctx.workspace.spreadsheetId,
          schema,
        );
        return { name: schema.title, headers: schema.headers, rows };
      } catch (err) {
        // A missing-or-empty sheet shouldn't fail the whole export. Surface
        // an empty rows[] so the column header still lands in the workbook.
        console.warn(`[workbook/export] read failed for ${schema.title}`, err);
        return { name: schema.title, headers: schema.headers, rows: [] };
      }
    }),
  );

  return ok({ sheets });
}
