import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { logActivity } from "@/lib/activity";
import { getOwnerContext, OwnerNotConfiguredError } from "@/lib/google/owner";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Contact, FormDef, Lead, SequenceStep } from "@/lib/types";

const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_IP_SUBMISSIONS = 10;
const MAX_EMAIL_SUBMISSIONS = 3;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_RATE_BUCKETS = 5000;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function newId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function stringField(values: Record<string, unknown>, key: string, max = 500) {
  const value = values[key];
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeSlug(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function clientIp(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "unknown";
}

function rateLimit(key: string, limit: number, now: number) {
  pruneRateBuckets(now);
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (rateBuckets.size > MAX_RATE_BUCKETS) {
      const oldestKey = rateBuckets.keys().next().value;
      if (oldestKey) rateBuckets.delete(oldestKey);
    }
    return null;
  }
  current.count += 1;
  if (current.count <= limit) return null;
  return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
}

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < MAX_RATE_BUCKETS) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

function rateLimitResponse(retryAfter: number) {
  return NextResponse.json(
    { error: "too_many_requests" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

function isRecentIso(value: string | undefined, now: number, windowMs: number) {
  if (!value) return false;
  const ts = Date.parse(value);
  return Number.isFinite(ts) && now - ts < windowMs;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    slug?: unknown;
    values?: Record<string, unknown>;
  };
  const slug = normalizeSlug(body.slug);
  const values = body.values;
  if (!slug || !values || typeof values !== "object" || Array.isArray(values)) {
    return NextResponse.json(
      { error: "slug and values required" },
      { status: 400 },
    );
  }
  const email = normalizeEmail(values.email);
  if (!email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json(
      { error: "valid email is required" },
      { status: 400 },
    );
  }
  const nowMs = Date.now();
  const ipRetryAfter = rateLimit(`ip:${clientIp(req)}:${slug}`, MAX_IP_SUBMISSIONS, nowMs);
  if (ipRetryAfter) return rateLimitResponse(ipRetryAfter);
  const emailRetryAfter = rateLimit(`email:${email}:${slug}`, MAX_EMAIL_SUBMISSIONS, nowMs);
  if (emailRetryAfter) return rateLimitResponse(emailRetryAfter);

  try {
    const owner = await getOwnerContext();
    const forms = await readSheet<FormDef>(
      owner.clients,
      owner.spreadsheetId,
      SHEETS.Forms,
    );
    const form = forms.find((f) => f.slug === slug);
    if (!form) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    if (stringField(values, "_website", 200)) {
      return NextResponse.json({
        ok: true,
        redirectUrl: form.redirectUrl || null,
      });
    }

    const now = new Date().toISOString();
    const contacts = await readSheet<Contact>(
      owner.clients,
      owner.spreadsheetId,
      SHEETS.Contacts,
    );
    const existingContact = contacts.find((c) => normalizeEmail(c.email) === email);
    const contact =
      existingContact ??
      {
        id: newId("c"),
        name: stringField(values, "name", 120),
        email,
        company: stringField(values, "company", 160),
        role: stringField(values, "role", 120),
        phone: stringField(values, "phone", 80),
        linkedin: stringField(values, "linkedin", 240),
        tags: form.tags || "form",
        notes: stringField(values, "notes", 2000),
        createdAt: now,
        updatedAt: now,
      };
    if (!existingContact) {
      await appendRow(
        owner.clients,
        owner.spreadsheetId,
        SHEETS.Contacts,
        contact,
      );
    }

    const leads = await readSheet<Lead>(
      owner.clients,
      owner.spreadsheetId,
      SHEETS.Leads,
    );
    const duplicateLead = leads.find(
      (l) =>
        l.contactId === contact.id &&
        l.source === `form:${form.slug}` &&
        isRecentIso(l.createdAt, nowMs, DUPLICATE_WINDOW_MS),
    );
    if (duplicateLead) {
      return NextResponse.json({
        ok: true,
        redirectUrl: form.redirectUrl || null,
        duplicate: true,
      });
    }

    const lead: Lead = {
      id: newId("l"),
      contactId: contact.id,
      source: `form:${form.slug}`,
      stage: "new",
      score: 0,
      scoreReason: "",
      value: 0,
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
