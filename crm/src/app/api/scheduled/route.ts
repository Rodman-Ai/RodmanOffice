import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { ScheduledEmail } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<ScheduledEmail>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.ScheduledEmails,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<ScheduledEmail>;
  if (!body.to || !body.subject || !body.scheduledFor) {
    return bad("to, subject, scheduledFor required");
  }
  const row = {
    id: newId("se"),
    contactId: body.contactId ?? "",
    to: body.to,
    subject: body.subject,
    body: body.body ?? "",
    scheduledFor: body.scheduledFor,
    status: "scheduled",
    createdAt: nowIso(),
    sentAt: "",
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.ScheduledEmails,
    row,
  );
  return ok(row);
}
