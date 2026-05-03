import { NextRequest } from "next/server";
import { withAuth, ok, bad, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { deleteRowById, updateRowById } from "@/lib/google/sheets";

interface Ctx {
  params: { id: string };
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const patch = (await req.json()) as Record<string, string>;
  const now = nowIso();
  const merged: Record<string, string> = { ...patch, updatedAt: now };
  if (patch.stage) merged.stageEnteredAt = now;
  if (patch.stage === "won" || patch.stage === "lost") merged.closedAt = now;
  const updated = await updateRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Deals,
    params.id,
    merged,
  );
  if (!updated) return bad("not found", 404);
  return ok(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const okd = await deleteRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Deals,
    params.id,
  );
  if (!okd) return bad("not found", 404);
  return ok({ deleted: true });
}
