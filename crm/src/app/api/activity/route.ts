import { NextRequest } from "next/server";
import { withAuth, ok } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { readSheet } from "@/lib/google/sheets";

export async function GET(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const url = new URL(req.url);
  const contactId = url.searchParams.get("contactId");
  const rows = await readSheet(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Activity,
  );
  const filtered = contactId
    ? rows.filter((r) => r.contactId === contactId)
    : rows;
  filtered.sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
  return ok(filtered);
}
