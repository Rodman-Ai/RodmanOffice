import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { TagDef } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<TagDef>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tags,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<TagDef>;
  if (!body.name) return bad("name required");
  const row = {
    id: newId("tg"),
    name: body.name,
    color: body.color ?? "slate",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tags,
    row,
  );
  return ok(row);
}
