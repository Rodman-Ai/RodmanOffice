import { NextRequest } from "next/server";
import { withAuth, ok, bad } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import type { Activity } from "@/lib/types";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as {
    contactId?: string;
    type?: Activity["type"];
    summary?: string;
    meta?: Record<string, unknown>;
  };
  if (!body.contactId || !body.type || !body.summary) {
    return bad("contactId, type, summary required");
  }
  const row = await logActivity(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    {
      contactId: body.contactId,
      type: body.type,
      summary: body.summary,
      meta: body.meta,
      actor: r.ctx.email,
    },
  );
  return ok(row);
}
