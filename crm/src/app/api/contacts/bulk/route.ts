import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRows, readSheet } from "@/lib/google/sheets";
import type { ParsedContact } from "@/lib/csv";

interface BulkRequest {
  contacts: ParsedContact[];
  createLeads?: boolean;
  source?: string;
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as BulkRequest;
  if (!Array.isArray(body.contacts) || body.contacts.length === 0) {
    return bad("contacts required");
  }

  const existing = await readSheet(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Contacts,
  );
  const existingEmails = new Set(
    existing.map((c) => c.email.toLowerCase()).filter(Boolean),
  );

  const now = nowIso();
  const toCreate = body.contacts.filter((c) => {
    if (!c.email) return false;
    const k = c.email.toLowerCase();
    if (existingEmails.has(k)) return false;
    existingEmails.add(k);
    return true;
  });
  const contacts = toCreate.map((c) => ({
    id: newId("c"),
    name: c.name,
    email: c.email,
    company: c.company,
    role: c.role,
    phone: c.phone,
    linkedin: c.linkedin,
    tags: c.tags,
    notes: c.notes,
    createdAt: now,
    updatedAt: now,
  }));

  await appendRows(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Contacts,
    contacts,
  );

  if (body.createLeads !== false) {
    const leads = contacts.map((c) => ({
      id: newId("l"),
      contactId: c.id,
      source: body.source ?? "csv-import",
      stage: "new",
      score: "0",
      value: "0",
      owner: "",
      lastContactedAt: "",
      nextActionAt: "",
      nextAction: "",
      notes: "",
      createdAt: now,
      updatedAt: now,
    }));
    await appendRows(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Leads,
      leads,
    );
  }

  return ok({
    created: contacts.length,
    skipped: body.contacts.length - contacts.length,
    contacts,
  });
}
