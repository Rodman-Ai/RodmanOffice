import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Pipeline } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<Pipeline>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Pipelines,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Pipeline> & { stages?: string[] };
  if (!body.name) return bad("name required");
  const pipeline = {
    id: newId("pl"),
    name: body.name,
    stages: JSON.stringify(body.stages ?? ["discovery", "evaluation", "proposal", "won", "lost"]),
    isDefault: "no",
    createdAt: nowIso(),
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Pipelines,
    pipeline,
  );
  return ok(pipeline);
}
