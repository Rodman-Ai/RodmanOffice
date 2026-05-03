import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { sendEmail } from "@/lib/google/gmail";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet, updateRowById } from "@/lib/google/sheets";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as {
    contactId?: string;
    to?: string;
    subject?: string;
    body?: string;
    campaignId?: string;
    aiGenerated?: boolean;
    prompt?: string;
    sequenceEnrollmentId?: string;
    stepIndex?: number;
    variant?: string;
  };
  if (!body.to || !body.subject || !body.body) {
    return bad("to, subject, body required");
  }

  let status: "sent" | "failed" = "sent";
  let threadId = "";
  let errorMsg = "";
  try {
    const sent = await sendEmail(r.ctx.clients, {
      to: body.to,
      from: r.ctx.email,
      subject: body.subject,
      body: body.body,
    });
    threadId = sent.threadId;
  } catch (err) {
    status = "failed";
    errorMsg = (err as Error).message;
  }

  const record = {
    id: newId("e"),
    contactId: body.contactId ?? "",
    campaignId: body.campaignId ?? "",
    sequenceEnrollmentId: body.sequenceEnrollmentId ?? "",
    stepIndex: body.stepIndex !== undefined ? String(body.stepIndex) : "",
    variant: body.variant ?? "",
    subject: body.subject,
    body: body.body,
    sentAt: nowIso(),
    status,
    aiGenerated: body.aiGenerated ? "yes" : "no",
    prompt: body.prompt ?? "",
    threadId,
    repliedAt: "",
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Emails,
    record,
  );

  if (body.contactId && status === "sent") {
    await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
      contactId: body.contactId,
      type: "email_sent",
      summary: `Sent: ${body.subject}`,
      meta: {
        threadId,
        variant: body.variant,
        sequenceEnrollmentId: body.sequenceEnrollmentId,
      },
      actor: r.ctx.email,
    });

    const leads = await readSheet(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Leads,
    );
    const lead = leads.find((l) => l.contactId === body.contactId);
    if (lead) {
      const nextStage = lead.stage === "new" ? "contacted" : lead.stage;
      if (nextStage !== lead.stage) {
        await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
          contactId: body.contactId,
          type: "stage_change",
          summary: `Stage: ${lead.stage} → ${nextStage}`,
          actor: r.ctx.email,
        });
      }
      await updateRowById(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Leads,
        lead.id,
        {
          lastContactedAt: nowIso(),
          stage: nextStage,
          updatedAt: nowIso(),
        },
      );
    }

    if (body.campaignId) {
      const campaigns = await readSheet(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Campaigns,
      );
      const cmp = campaigns.find((c) => c.id === body.campaignId);
      if (cmp) {
        await updateRowById(
          r.ctx.clients,
          r.ctx.workspace.spreadsheetId,
          SHEETS.Campaigns,
          cmp.id,
          { sentCount: String(Number(cmp.sentCount || 0) + 1) },
        );
      }
    }
  }

  if (status === "failed") {
    return bad(errorMsg || "send failed", 500);
  }
  return ok(record);
}
