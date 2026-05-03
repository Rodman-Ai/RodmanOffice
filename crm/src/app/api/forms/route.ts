import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { FormDef } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<FormDef>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Forms,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<FormDef> & {
    fields?: string[];
  };
  if (!body.name || !body.slug) return bad("name and slug required");
  const slug = body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  // ensure unique slug
  const existing = await readSheet<FormDef>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Forms,
  );
  if (existing.some((f) => f.slug === slug)) {
    return bad("slug already in use");
  }
  const fields = Array.isArray(body.fields) ? body.fields : ["name", "email"];
  const form = {
    id: newId("f"),
    slug,
    name: body.name,
    fields: JSON.stringify(fields),
    redirectUrl: body.redirectUrl ?? "",
    tags: body.tags ?? "",
    sequenceId: body.sequenceId ?? "",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Forms,
    form,
  );
  return ok(form);
}
