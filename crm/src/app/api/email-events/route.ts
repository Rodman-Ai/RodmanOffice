import { NextRequest } from "next/server";
import { withAuth, ok, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { EmailEvent } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<EmailEvent>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.EmailEvents,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<EmailEvent>;
  const ev = {
    id: newId("ee"),
    emailId: body.emailId ?? "",
    type: body.type ?? "open",
    url: body.url ?? "",
    ip: body.ip ?? "",
    userAgent: body.userAgent ?? "",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.EmailEvents,
    ev,
  );
  return ok(ev);
}
