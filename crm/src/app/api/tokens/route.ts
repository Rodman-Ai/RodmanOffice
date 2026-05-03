import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { ApiToken } from "@/lib/types";

function randomToken() {
  const alpha = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "leo_pk_";
  for (let i = 0; i < 24; i++) out += alpha[Math.floor(Math.random() * alpha.length)];
  return out;
}

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<ApiToken>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tokens,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<ApiToken>;
  if (!body.name) return bad("name required");
  const row = {
    id: newId("tok"),
    name: body.name,
    memberId: body.memberId ?? "",
    token: randomToken(),
    createdAt: nowIso(),
    lastUsedAt: "",
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Tokens,
    row,
  );
  return ok(row);
}
