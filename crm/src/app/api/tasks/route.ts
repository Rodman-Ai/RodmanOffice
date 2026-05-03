import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tasks,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Record<string, string>;
  if (!body.title) return bad("title required");
  const task = {
    id: newId("t"),
    contactId: body.contactId ?? "",
    title: body.title,
    dueAt: body.dueAt ?? "",
    status: "open",
    owner: body.owner ?? r.ctx.email,
    notes: body.notes ?? "",
    createdAt: nowIso(),
    completedAt: "",
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tasks,
    task,
  );
  if (task.contactId) {
    await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
      contactId: task.contactId,
      type: "task_created",
      summary: `Task: ${task.title}`,
      meta: { dueAt: task.dueAt },
      actor: r.ctx.email,
    });
  }
  return ok(task);
}
