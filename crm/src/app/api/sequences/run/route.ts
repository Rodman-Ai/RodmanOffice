import { NextRequest } from "next/server";
import { withAuth, ok, newId, nowIso } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { generateEmail } from "@/lib/ai/email";
import { sendEmail } from "@/lib/google/gmail";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet, updateRowById } from "@/lib/google/sheets";
import type {
  Contact,
  Enrollment,
  Sequence,
  SequenceStep,
} from "@/lib/types";

// Processes all enrollments whose nextRunAt is now-or-past.
// Generates a personalized AI email for the current step, sends via Gmail,
// logs to Emails + Activity, advances or completes the enrollment.
export async function POST(_req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;

  const [enrollments, sequences, steps, contacts] = await Promise.all([
    readSheet<Enrollment>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Enrollments,
    ),
    readSheet<Sequence>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Sequences,
    ),
    readSheet<SequenceStep>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.SequenceSteps,
    ),
    readSheet<Contact>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Contacts,
    ),
  ]);
  const seqById = new Map(sequences.map((s) => [s.id, s]));
  const stepsBySequence = new Map<string, SequenceStep[]>();
  for (const s of steps) {
    const list = stepsBySequence.get(s.sequenceId) ?? [];
    list.push(s);
    stepsBySequence.set(s.sequenceId, list);
  }
  for (const list of stepsBySequence.values()) {
    list.sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex));
  }
  const contactById = new Map(contacts.map((c) => [c.id, c]));

  const due = enrollments.filter(
    (e) =>
      e.status === "active" &&
      e.nextRunAt &&
      new Date(e.nextRunAt).getTime() <= Date.now(),
  );

  let processed = 0;
  let failed = 0;
  // Cap per run so we don't blow Gmail rate limits.
  for (const en of due.slice(0, 25)) {
    const seq = seqById.get(en.sequenceId);
    const seqSteps = stepsBySequence.get(en.sequenceId) ?? [];
    const contact = contactById.get(en.contactId);
    if (!seq || !contact || seqSteps.length === 0) continue;

    const idx = Number(en.currentStep || 0);
    const step = seqSteps[idx];
    if (!step) {
      await updateRowById(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Enrollments,
        en.id,
        { status: "completed", lastRunAt: nowIso() },
      );
      continue;
    }

    let subject = "";
    let body = "";
    try {
      const generated = await generateEmail({
        contact: {
          name: contact.name,
          email: contact.email,
          company: contact.company,
          role: contact.role,
          tags: contact.tags,
          notes: contact.notes,
        },
        goal: step.instructions || seq.goal,
        tone: seq.tone,
        senderName: r.ctx.name,
        context: step.subjectHint
          ? `Step ${idx + 1} of sequence "${seq.name}". Subject hint: ${step.subjectHint}`
          : `Step ${idx + 1} of sequence "${seq.name}".`,
      });
      subject = generated.subject;
      body = generated.body;
    } catch {
      failed++;
      await updateRowById(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Enrollments,
        en.id,
        {
          nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          lastRunAt: nowIso(),
        },
      );
      continue;
    }

    let threadId = "";
    let status: "sent" | "failed" = "sent";
    try {
      const sent = await sendEmail(r.ctx.clients, {
        to: contact.email,
        from: r.ctx.email,
        subject,
        body,
      });
      threadId = sent.threadId;
    } catch {
      status = "failed";
      failed++;
    }

    await appendRow(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Emails,
      {
        id: newId("e"),
        contactId: contact.id,
        campaignId: "",
        sequenceEnrollmentId: en.id,
        stepIndex: String(idx),
        variant: "",
        subject,
        body,
        sentAt: nowIso(),
        status,
        aiGenerated: "yes",
        prompt: step.instructions || seq.goal,
        threadId,
        repliedAt: "",
      },
    );
    await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
      contactId: contact.id,
      type: "email_sent",
      summary: `Sequence step ${idx + 1}: ${subject}`,
      meta: { sequenceId: seq.id, stepIndex: idx, threadId, status },
      actor: r.ctx.email,
    });

    const nextIdx = idx + 1;
    const nextStep = seqSteps[nextIdx];
    if (nextStep) {
      const delay = Number(nextStep.delayDays || 0);
      await updateRowById(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Enrollments,
        en.id,
        {
          currentStep: String(nextIdx),
          nextRunAt: new Date(
            Date.now() + delay * 24 * 3600 * 1000,
          ).toISOString(),
          lastRunAt: nowIso(),
        },
      );
    } else {
      await updateRowById(
        r.ctx.clients,
        r.ctx.workspace.spreadsheetId,
        SHEETS.Enrollments,
        en.id,
        {
          status: "completed",
          lastRunAt: nowIso(),
        },
      );
    }
    processed++;
  }
  return ok({ due: due.length, processed, failed });
}
