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
    SHEETS.Contacts,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Record<string, string>;
  if (!body.email) return bad("email required");
  const now = nowIso();
  const contact = {
    id: newId("c"),
    name: body.name ?? "",
    email: body.email,
    company: body.company ?? "",
    role: body.role ?? "",
    phone: body.phone ?? "",
    linkedin: body.linkedin ?? "",
    tags: body.tags ?? "",
    notes: body.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Contacts,
    contact,
  );
  return ok(contact);
}
