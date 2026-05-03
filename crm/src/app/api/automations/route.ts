import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Automation } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<Automation>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Automations,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Automation>;
  if (!body.name || !body.trigger) return bad("name + trigger required");
  const row = {
    id: newId("au"),
    name: body.name,
    trigger: body.trigger,
    condition: body.condition ?? "{}",
    action: body.action ?? "create_task",
    config: body.config ?? "{}",
    active: body.active ?? "yes",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Automations,
    row,
  );
  return ok(row);
}
