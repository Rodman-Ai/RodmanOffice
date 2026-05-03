import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Meeting } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<Meeting>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Meetings,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Meeting>;
  if (!body.slug) return bad("slug required");
  const row = {
    id: newId("mt"),
    slug: body.slug.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    memberId: body.memberId ?? "",
    title: body.title ?? "Meeting",
    duration: body.duration ?? "15",
    availability: body.availability ?? "Mon-Fri 9-12",
    active: body.active ?? "yes",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Meetings,
    row,
  );
  return ok(row);
}
