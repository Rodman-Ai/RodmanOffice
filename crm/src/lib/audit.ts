import { newId, nowIso } from "./api";
import type { GoogleClients } from "./google/client";
import { SHEETS } from "./google/schema";
import { appendRow } from "./google/sheets";
import type { AuditEntry } from "./types";

export async function writeAudit(
  clients: GoogleClients,
  spreadsheetId: string,
  input: {
    actor: string;
    action: AuditEntry["action"];
    entity: string;
    entityId: string;
    diff?: Record<string, [unknown, unknown]> | string;
  },
) {
  const diff =
    typeof input.diff === "string"
      ? input.diff
      : input.diff
        ? JSON.stringify(input.diff)
        : "";
  const row: Record<string, unknown> = {
    id: newId("au"),
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    diff,
    createdAt: nowIso(),
  };
  await appendRow(clients, spreadsheetId, SHEETS.AuditLog, row);
  return row as unknown as AuditEntry;
}
