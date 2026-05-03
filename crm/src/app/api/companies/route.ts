import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Company, Contact } from "@/lib/types";

// Returns a unified list: explicit company rows merged with companies derived
// from contacts' `company` field, with a contactCount per company.
export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const [companies, contacts] = await Promise.all([
    readSheet<Company>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Companies,
    ),
    readSheet<Contact>(
      r.ctx.clients,
      r.ctx.workspace.spreadsheetId,
      SHEETS.Contacts,
    ),
  ]);
  const byName = new Map<string, Company & { contactCount: number }>();
  for (const c of companies) {
    if (!c.name) continue;
    byName.set(c.name.toLowerCase(), { ...c, contactCount: 0 });
  }
  for (const ct of contacts) {
    if (!ct.company) continue;
    const key = ct.company.toLowerCase();
    const existing = byName.get(key);
    if (existing) {
      existing.contactCount += 1;
    } else {
      byName.set(key, {
        id: "",
        name: ct.company,
        domain: emailDomain(ct.email),
        industry: "",
        size: "",
        website: "",
        notes: "",
        createdAt: "",
        updatedAt: "",
        contactCount: 1,
      });
    }
  }
  const result = Array.from(byName.values()).sort((a, b) =>
    (b.contactCount || 0) - (a.contactCount || 0),
  );
  return ok(result);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Company>;
  if (!body.name) return bad("name required");
  const now = nowIso();
  const company = {
    id: newId("co"),
    name: body.name,
    domain: body.domain ?? "",
    industry: body.industry ?? "",
    size: body.size ?? "",
    website: body.website ?? "",
    notes: body.notes ?? "",
    createdAt: now,
    updatedAt: now,
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Companies,
    company,
  );
  return ok(company);
}

function emailDomain(email: string) {
  const m = email.match(/@(.+)$/);
  return m ? m[1] : "";
}
