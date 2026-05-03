import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { SHEETS } from "@/lib/google/schema";
import { appendRows, readSheet } from "@/lib/google/sheets";
import type { Enrollment, SequenceStep } from "@/lib/types";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as {
    sequenceId?: string;
    contactIds?: string[];
  };
  if (!body.sequenceId || !body.contactIds || body.contactIds.length === 0) {
    return bad("sequenceId and contactIds required");
  }

  const [steps, existing] = await Promise.all([
    readSheet<SequenceStep>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.SequenceSteps,
    ),
    readSheet<Enrollment>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Enrollments,
    ),
  ]);
  const seqSteps = steps
    .filter((s) => s.sequenceId === body.sequenceId)
    .sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex));
  if (seqSteps.length === 0) return bad("sequence has no steps");

  const firstDelay = Number(seqSteps[0].delayDays || 0);
  const now = nowIso();
  const nextRunAt = new Date(
    Date.now() + firstDelay * 24 * 3600 * 1000,
  ).toISOString();

  const newEnrollments: Omit<Enrollment, never>[] = [];
  for (const contactId of body.contactIds) {
    const dup = existing.find(
      (e) =>
        e.sequenceId === body.sequenceId &&
        e.contactId === contactId &&
        e.status === "active",
    );
    if (dup) continue;
    newEnrollments.push({
      id: newId("en"),
      sequenceId: body.sequenceId!,
      contactId,
      status: "active",
      currentStep: "0",
      nextRunAt,
      lastRunAt: "",
      createdAt: now,
      stoppedReason: "",
    });
  }
  if (newEnrollments.length > 0) {
    await appendRows(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Enrollments,
      newEnrollments,
    );
    for (const en of newEnrollments) {
      await logActivity(r.ctx.clients, r.ctx.workspace.spreadsheetId, {
        contactId: en.contactId,
        type: "sequence_enrolled",
        summary: "Enrolled in sequence",
        meta: { sequenceId: en.sequenceId },
        actor: r.ctx.email,
      });
    }
  }
  return ok({ enrolled: newEnrollments.length });
}
