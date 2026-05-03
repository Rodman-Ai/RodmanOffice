import { NextRequest } from "next/server";
import { withAuth, ok, bad, nowIso } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { scoreContact } from "@/lib/ai/score";
import { SHEETS } from "@/lib/google/schema";
import { readSheet, updateRowById } from "@/lib/google/sheets";
import type { Contact, EmailRecord, Lead } from "@/lib/types";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as { contactId?: string; all?: boolean };
  const [contacts, leads, emails] = await Promise.all([
    readSheet<Contact>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Contacts,
    ),
    readSheet<Lead>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Leads,
    ),
    readSheet<EmailRecord>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Emails,
    ),
  ]);

  const targetIds: string[] = body.all
    ? contacts.map((c) => c.id)
    : body.contactId
      ? [body.contactId]
      : [];
  if (targetIds.length === 0) return bad("contactId or all required");

  const results = [];
  for (const id of targetIds) {
    const c = contacts.find((c) => c.id === id);
    if (!c) continue;
    const lead = leads.find((l) => l.contactId === id);
    const emailCount = emails.filter((e) => e.contactId === id).length;
    const { score, reason } = await scoreContact(c, lead, emailCount);
    if (lead) {
      await updateRowById(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Leads,
        lead.id,
        {
          score: String(score),
          scoreReason: reason,
          updatedAt: nowIso(),
        },
      );
    }
    await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
      contactId: id,
      type: "score_updated",
      summary: `AI score: ${score} — ${reason}`,
      meta: { score },
      actor: r.ctx.email,
    });
    results.push({ contactId: id, score, reason });
  }
  return ok({ updated: results.length, results });
}
