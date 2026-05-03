import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, deleteRowById, readSheet } from "@/lib/google/sheets";
import type { SuppressionEntry } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<SuppressionEntry>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Suppression,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<SuppressionEntry>;
  if (!body.email) return bad("email required");
  const row = {
    id: newId("sp"),
    email: body.email,
    reason: body.reason ?? "manual",
    source: body.source ?? r.ctx.email,
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Suppression,
    row,
  );
  return ok(row);
}

export async function DELETE(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return bad("id required");
  const okd = await deleteRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Suppression,
    id,
  );
  if (!okd) return bad("not found", 404);
  return ok({ deleted: true });
}
