import { NextRequest } from "next/server";
import { withAuth, ok } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { readSheet } from "@/lib/google/sheets";
import type { AuditEntry } from "@/lib/types";

export async function GET(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const url = new URL(req.url);
  const entity = url.searchParams.get("entity");
  const entityId = url.searchParams.get("entityId");
  const rows = await readSheet<AuditEntry>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.AuditLog,
  );
  let out = rows;
  if (entity) out = out.filter((r) => r.entity === entity);
  if (entityId) out = out.filter((r) => r.entityId === entityId);
  out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return ok(out);
}
