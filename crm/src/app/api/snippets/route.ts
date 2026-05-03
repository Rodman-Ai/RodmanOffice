import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Snippet } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<Snippet>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Snippets,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Snippet>;
  if (!body.trigger || !body.body) return bad("trigger and body required");
  const row = {
    id: newId("sn"),
    trigger: body.trigger,
    name: body.name ?? body.trigger,
    body: body.body,
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Snippets,
    row,
  );
  return ok(row);
}
