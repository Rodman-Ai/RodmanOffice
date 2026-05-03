import { withAuth, ok } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { readSheet } from "@/lib/google/sheets";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Emails,
  );
  return ok(rows);
}
