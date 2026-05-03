import { newId, nowIso } from "./api";
import type { GoogleClients } from "./google/client";
import { SHEETS } from "./google/schema";
import { appendRow } from "./google/sheets";
import type { Activity } from "./types";

export async function logActivity(
  clients: GoogleClients,
  spreadsheetId: string,
  input: {
    contactId: string;
    type: Activity["type"];
    summary: string;
    meta?: Record<string, unknown>;
    actor?: string;
  },
) {
  const row = {
    id: newId("a"),
    contactId: input.contactId,
    type: input.type,
    summary: input.summary,
    meta: input.meta ? JSON.stringify(input.meta) : "",
    createdAt: nowIso(),
    actor: input.actor ?? "",
  };
  await appendRow(clients, spreadsheetId, SHEETS.Activity, row);
  return row;
}
