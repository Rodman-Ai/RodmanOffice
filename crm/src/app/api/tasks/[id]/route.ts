import { NextRequest } from "next/server";
import { withAuth, ok, bad, nowIso } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { SHEETS } from "@/lib/google/schema";
import { deleteRowById, updateRowById } from "@/lib/google/sheets";

interface Ctx {
  params: { id: string };
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const patch = (await req.json()) as Record<string, string>;
  const completing = patch.status === "done";
  if (completing) patch.completedAt = nowIso();
  const updated = await updateRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tasks,
    params.id,
    patch,
  );
  if (!updated) return bad("not found", 404);
  const contactId = String(updated.contactId ?? "");
  const title = String(updated.title ?? "");
  if (completing && contactId) {
    await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
      contactId,
      type: "task_completed",
      summary: `Task done: ${title}`,
      actor: r.ctx.email,
    });
  }
  return ok(updated);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const okd = await deleteRowById(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tasks,
    params.id,
  );
  if (!okd) return bad("not found", 404);
  return ok({ deleted: true });
}

