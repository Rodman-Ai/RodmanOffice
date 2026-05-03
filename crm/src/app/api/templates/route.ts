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
    SHEETS.Templates,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Record<string, string>;
  if (!body.name) return bad("name required");
  const tpl = {
    id: newId("tpl"),
    name: body.name,
    subject: body.subject ?? "",
    body: body.body ?? "",
    aiPrompt: body.aiPrompt ?? "",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Templates,
    tpl,
  );
  return ok(tpl);
}
