import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Leads,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Record<string, string>;
  if (!body.contactId) return bad("contactId required");
  const now = nowIso();
  const lead = {
    id: newId("l"),
    contactId: body.contactId,
    source: body.source ?? "manual",
    stage: body.stage ?? "new",
    score: body.score ?? "0",
    value: body.value ?? "0",
    owner: body.owner ?? "",
    lastContactedAt: body.lastContactedAt ?? "",
    nextActionAt: body.nextActionAt ?? "",
    nextAction: body.nextAction ?? "",
    notes: body.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Leads,
    lead,
  );
  return ok(lead);
}
