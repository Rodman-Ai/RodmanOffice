import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, appendRows, readSheet } from "@/lib/google/sheets";
import type { Sequence, SequenceStep } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const [sequences, steps] = await Promise.all([
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
  ]);
  return ok(
    sequences.map((s) => ({
      ...s,
      steps: steps
        .filter((st) => st.sequenceId === s.id)
        .sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex)),
    })),
  );
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as {
    name?: string;
    goal?: string;
    tone?: string;
    steps?: Array<{
      delayDays?: number;
      subjectHint?: string;
      instructions?: string;
    }>;
  };
  if (!body.name || !body.steps || body.steps.length === 0) {
    return bad("name and at least one step required");
  }
  const id = newId("seq");
  const now = nowIso();
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Sequences,
    {
      id,
      name: body.name,
      goal: body.goal ?? "",
      tone: body.tone ?? "warm, direct, professional",
      status: "active",
      createdAt: now,
    },
  );
  await appendRows(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.SequenceSteps,
    body.steps.map((s, i) => ({
      id: newId("step"),
      sequenceId: id,
      stepIndex: String(i),
      delayDays: String(s.delayDays ?? (i === 0 ? 0 : 3)),
      subjectHint: s.subjectHint ?? "",
      instructions: s.instructions ?? body.goal ?? "",
      createdAt: now,
    })),
  );
  return ok({ id });
}
