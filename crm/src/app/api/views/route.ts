import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, deleteRowById, readSheet } from "@/lib/google/sheets";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Views,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as { name?: string; filter?: unknown };
  if (!body.name || !body.filter) return bad("name and filter required");
  const view = {
    id: newId("v"),
    name: body.name,
    filter: JSON.stringify(body.filter),
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Views,
    view,
  );
  return ok(view);
}

export async function DELETE(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return bad("id required");
  const ok_ = await deleteRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Views,
    id,
  );
  if (!ok_) return bad("not found", 404);
  return ok({ deleted: true });
}
