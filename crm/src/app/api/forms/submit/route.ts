import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activity";
import { getOwnerContext, OwnerNotConfiguredError } from "@/lib/google/owner";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { FormDef, SequenceStep } from "@/lib/types";

function newId(prefix: string) {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    slug?: string;
    values?: Record<string, string>;
  };
  if (!body.slug || !body.values) {
    return NextResponse.json(
      { error: "slug and values required" },
      { status: 400 },
    );
  }
  if (!body.values.email || !/.+@.+\..+/.test(body.values.email)) {
    return NextResponse.json(
      { error: "valid email is required" },
      { status: 400 },
    );
  }
  try {
    const owner = await getOwnerContext();
    const forms = await readSheet<FormDef>(
      owner.clients,
      owner.spreadsheetId,
      SHEETS.Forms,
    );
    const form = forms.find((f) => f.slug === body.slug);
    if (!form) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const contact = {
      id: newId("c"),
      name: body.values.name ?? "",
      email: body.values.email,
      company: body.values.company ?? "",
      role: body.values.role ?? "",
      phone: body.values.phone ?? "",
      linkedin: body.values.linkedin ?? "",
      tags: form.tags || "form",
      notes: body.values.notes ?? "",
      createdAt: now,
      updatedAt: now,
    };
    await appendRow(
      owner.clients,
      owner.spreadsheetId,
      SHEETS.Contacts,
      contact,
    );

    const lead = {
      id: newId("l"),
      contactId: contact.id,
      source: `form:${form.slug}`,
      stage: "new",
      score: "0",
      scoreReason: "",
      value: "0",
      owner: owner.email,
      lastContactedAt: "",
      nextActionAt: "",
      nextAction: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    await appendRow(
      owner.clients,
      owner.spreadsheetId,
      SHEETS.Leads,
      lead,
    );

    await logActivity(owner.clients, owner.spreadsheetId, {
      contactId: contact.id,
      type: "form_submission",
      summary: `Form: ${form.name}`,
      meta: { slug: form.slug },
      actor: "form",
    });

    if (form.sequenceId) {
      const steps = await readSheet<SequenceStep>(
        owner.clients,
        owner.spreadsheetId,
        SHEETS.SequenceSteps,
      );
      const sorted = steps
        .filter((s) => s.sequenceId === form.sequenceId)
        .sort((a, b) => Number(a.stepIndex) - Number(b.stepIndex));
      if (sorted.length > 0) {
        const enrollment = {
          id: newId("en"),
          sequenceId: form.sequenceId,
          contactId: contact.id,
          status: "active",
          currentStep: "0",
          nextRunAt: new Date(
            Date.now() + Number(sorted[0].delayDays || 0) * 24 * 3600 * 1000,
          ).toISOString(),
          lastRunAt: "",
          createdAt: now,
          stoppedReason: "",
        };
        await appendRow(
          owner.clients,
          owner.spreadsheetId,
          SHEETS.Enrollments,
          enrollment,
        );
        await logActivity(owner.clients, owner.spreadsheetId, {
          contactId: contact.id,
          type: "sequence_enrolled",
          summary: "Auto-enrolled from form",
          meta: { sequenceId: form.sequenceId },
          actor: "form",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      redirectUrl: form.redirectUrl || null,
    });
  } catch (err) {
    if (err instanceof OwnerNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
