import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRows, readSheet, updateRowById } from "@/lib/google/sheets";

type IncomingSheet = {
  name: string;
  rows: Record<string, string>[];
};

// POST /api/workbook/import
// Upserts each row by id. Existing rows (same id) are updated in place; rows
// missing an id, or with an id not seen in the workspace, are appended.
// Sheets unknown to SHEETS are ignored — partial imports are fine.
export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;

  let body: { sheets?: IncomingSheet[] };
  try {
    body = (await req.json()) as { sheets?: IncomingSheet[] };
  } catch {
    return bad("invalid json");
  }
  const incoming = body.sheets;
  if (!Array.isArray(incoming)) return bad("sheets[] required");

  const summary: Array<{ sheet: string; appended: number; updated: number; skipped: number }> = [];

  for (const sheet of incoming) {
    const schemaKey = Object.keys(SHEETS).find(
      (k) => SHEETS[k].title.toLowerCase() === String(sheet.name).toLowerCase(),
    );
    if (!schemaKey) {
      summary.push({ sheet: sheet.name, appended: 0, updated: 0, skipped: sheet.rows?.length ?? 0 });
      continue;
    }
    const schema = SHEETS[schemaKey];
    const existing = await readSheet(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      schema,
    );
    const existingIds = new Set(existing.map((e) => e.id));

    const toAppend: Record<string, unknown>[] = [];
    let updated = 0;
    for (const incomingRow of sheet.rows || []) {
      const row: Record<string, unknown> = { ...incomingRow };
      if (!row.id || typeof row.id !== "string") {
        row.id = newId(schemaKey.toLowerCase().slice(0, 3));
      }
      if (!row.createdAt && schema.headers.includes("createdAt")) {
        row.createdAt = nowIso();
      }
      if (schema.headers.includes("updatedAt")) {
        row.updatedAt = nowIso();
      }
      if (existingIds.has(row.id as string)) {
        await updateRowById(
          r.ctx.clients,
          r.ctx.workspace.spreadsheetId,
          schema,
          row.id as string,
          row,
        );
        updated += 1;
      } else {
        toAppend.push(row);
      }
    }
    if (toAppend.length) {
      await appendRows(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        schema,
        toAppend,
      );
    }
    summary.push({ sheet: schema.title, appended: toAppend.length, updated, skipped: 0 });
  }

  return ok({ summary });
}
