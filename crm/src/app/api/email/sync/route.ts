import { NextRequest } from "next/server";
import { withAuth, ok, nowIso } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { getThreadMessageCount } from "@/lib/google/gmail";
import { SHEETS } from "@/lib/google/schema";
import { readSheet, updateRowById } from "@/lib/google/sheets";
import type { EmailRecord, Enrollment, Lead } from "@/lib/types";

// Walks recently sent emails and checks the Gmail thread for >1 message.
// On a detected reply we mark the email replied, bump the lead stage to
// "engaged", increment campaign repliedCount, and stop any active sequence
// enrollment for that contact.
export async function POST(_req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;

  const [emails, leads, enrollments] = await Promise.all([
    readSheet<EmailRecord>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Emails,
    ),
    readSheet<Lead>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Leads,
    ),
    readSheet<Enrollment>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Enrollments,
    ),
  ]);

  const recent = emails
    .filter(
      (e) =>
        e.status === "sent" &&
        e.threadId &&
        !e.repliedAt &&
        // skip emails older than 30 days
        Date.now() - new Date(e.sentAt).getTime() < 30 * 24 * 3600 * 1000,
    )
    .slice(-200); // cap calls per sync

  let detected = 0;
  const seenContactReply = new Set<string>();
  for (const e of recent) {
    let info: { count: number; latestFrom: string };
    try {
      info = await getThreadMessageCount(r.ctx.clients, e.threadId);
    } catch {
      continue;
    }
    const fromMe = info.latestFrom.toLowerCase().includes(r.ctx.email.toLowerCase());
    if (info.count > 1 && !fromMe) {
      detected++;
      await updateRowById(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Emails,
        e.id,
        { repliedAt: nowIso() },
      );
      if (e.contactId && !seenContactReply.has(e.contactId)) {
        seenContactReply.add(e.contactId);
        const lead = leads.find((l) => l.contactId === e.contactId);
        if (lead && lead.stage !== "won" && lead.stage !== "lost") {
          const newStage =
            lead.stage === "qualified" ? "qualified" : "engaged";
          if (newStage !== lead.stage) {
            await updateRowById(
              r.ctx.clients,
              r.ctx.workspace.spreadsheetId,
              SHEETS.Leads,
              lead.id,
              { stage: newStage, updatedAt: nowIso() },
            );
            await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
              contactId: e.contactId,
              type: "stage_change",
              summary: `Stage: ${lead.stage} → ${newStage} (reply detected)`,
              actor: r.ctx.email,
            });
          }
        }
        await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
          contactId: e.contactId,
          type: "email_replied",
          summary: `Reply received: ${e.subject}`,
          meta: { threadId: e.threadId },
          actor: r.ctx.email,
        });

        // Stop active enrollment for this contact
        const active = enrollments.find(
          (en) => en.contactId === e.contactId && en.status === "active",
        );
        if (active) {
          await updateRowById(
            r.ctx.clients,
            r.ctx.workspace.spreadsheetId,
            SHEETS.Enrollments,
            active.id,
            { status: "stopped", stoppedReason: "reply_received" },
          );
          await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
            contactId: e.contactId,
            type: "sequence_stopped",
            summary: "Sequence stopped: prospect replied",
            actor: r.ctx.email,
          });
        }
      }

      if (e.campaignId) {
        const camp = await readSheet(
          r.ctx.clients,
          r.ctx.workspace.spreadsheetId,
          SHEETS.Campaigns,
        );
        const c = camp.find((c) => c.id === e.campaignId);
        if (c) {
          await updateRowById(
            r.ctx.clients,
            r.ctx.workspace.spreadsheetId,
            SHEETS.Campaigns,
            c.id,
            { repliedCount: String(Number(c.repliedCount || 0) + 1) },
          );
        }
      }
    }
  }

  return ok({ scanned: recent.length, replies: detected });
}
