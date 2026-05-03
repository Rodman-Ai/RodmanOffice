import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Webhook } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<Webhook>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Webhooks,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Webhook>;
  if (!body.url) return bad("url required");
  const row = {
    id: newId("wh"),
    name: body.name ?? "Webhook",
    url: body.url,
    events: body.events ?? "",
    secret: body.secret ?? "",
    active: body.active ?? "yes",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Webhooks,
    row,
  );
  return ok(row);
}
