import { NextRequest } from "next/server";
import { withAuth, ok, bad, newId, nowIso } from "@/lib/api";
import { SHEETS } from "@/lib/google/schema";
import { appendRow, readSheet } from "@/lib/google/sheets";
import type { Deal } from "@/lib/types";

export async function GET() {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const rows = await readSheet<Deal>(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Deals,
  );
  return ok(rows);
}

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as Partial<Deal>;
  if (!body.name) return bad("name required");
  const now = nowIso();
  const deal = {
    id: newId("d"),
    name: body.name,
    pipelineId: body.pipelineId ?? "pl_default",
    stage: body.stage ?? "discovery",
    probability: body.probability ?? "0.1",
    value: body.value ?? 0,
    expectedCloseDate: body.expectedCloseDate ?? "",
    owner: body.owner ?? r.ctx.email,
    splits: body.splits ?? "[]",
    contactIds: body.contactIds ?? "",
    companyId: body.companyId ?? "",
    contractStatus: body.contractStatus ?? "",
    lostReason: body.lostReason ?? "",
    winReason: body.winReason ?? "",
    stageEnteredAt: now,
    notes: body.notes ?? "",
    createdAt: now,
    updatedAt: now,
    closedAt: "",
  };
  await appendRow(
    r.ctx.clients,
    r.ctx.workspace.spreadsheetId,
    SHEETS.Deals,
    deal,
  );
  return ok(deal);
}
