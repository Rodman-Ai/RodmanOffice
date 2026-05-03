import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Member } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<Member>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Members,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Member>;
  if (!body.email) return bad("email required");
  const member: Member = {
    id: newId("m"),
    email: body.email,
    name: body.name ?? body.email.split("@")[0],
    role: (body.role as Member["role"]) ?? "rep",
    signature: body.signature ?? "",
    timezone: body.timezone ?? "UTC",
    active: "yes",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Members,
    member,
  );
  return ok(member);
}
