import { NextRequest } from "next/server";
import { withAuth, ok, bad, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { deleteRowById, readSheet, updateRowById } from "@/lib/google/sheets";

interface Ctx {
  params: { id: string };
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const all = await readSheet(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Contacts,
  );
  const c = all.find((row) => row.id === params.id);
  if (!c) return bad("not found", 404);
  return ok(c);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const patch = (await req.json()) as Record<string, string>;
  const updated = await updateRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Contacts,
    params.id,
    { ...patch, updatedAt: nowIso() },
  );
  if (!updated) return bad("not found", 404);
  return ok(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const ok_ = await deleteRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Contacts,
    params.id,
  );
  if (!ok_) return bad("not found", 404);
  return ok({ deleted: true });
}
