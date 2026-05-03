import type { GoogleClients } from "./client";
import { SHEETS, type SheetSchema } from "./schema";

export function rowsToObjects<T extends Record<string, string>>(
  headers: string[],
  rows: string[][],
): T[] {
  return rows.map((row) => {
    const obj = {} as Record<string, string>;
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj as T;
  });
}

export function objectToRow(headers: string[], obj: Record<string, unknown>) {
  return headers.map((h) => {
    const v = obj[h];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

export async function readSheet<T = Record<string, string>>(
  clients: GoogleClients,
  spreadsheetId: string,
  schema: SheetSchema,
): Promise<T[]> {
  const range = `${schema.title}!A2:${columnLetter(schema.headers.length)}`;
  const res = await clients.sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
  });
  const values = (res.data.values ?? []) as string[][];
  return rowsToObjectsAny<T>(schema.headers, values);
}

function rowsToObjectsAny<T>(headers: string[], rows: string[][]): T[] {
  return rows.map((row) => {
    const obj = {} as Record<string, string>;
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? "";
    });
    return obj as unknown as T;
  });
}

export async function appendRow(
  clients: GoogleClients,
  spreadsheetId: string,
  schema: SheetSchema,
  obj: Record<string, unknown>,
) {
  const row = objectToRow(schema.headers, obj);
  await clients.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${schema.title}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
  return obj;
}

export async function appendRows(
  clients: GoogleClients,
  spreadsheetId: string,
  schema: SheetSchema,
  objects: Record<string, unknown>[],
) {
  if (objects.length === 0) return [];
  const values = objects.map((o) => objectToRow(schema.headers, o));
  await clients.sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${schema.title}!A:A`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
  return objects;
}

export async function updateRowById(
  clients: GoogleClients,
  spreadsheetId: string,
  schema: SheetSchema,
  id: string,
  patch: Record<string, unknown>,
) {
  const all = await readSheet(clients, spreadsheetId, schema);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const merged = { ...all[idx], ...patch };
  const row = objectToRow(schema.headers, merged);
  const rowNumber = idx + 2; // skipping header
  await clients.sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${schema.title}!A${rowNumber}:${columnLetter(schema.headers.length)}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
  return merged;
}

export async function deleteRowById(
  clients: GoogleClients,
  spreadsheetId: string,
  schema: SheetSchema,
  id: string,
) {
  const all = await readSheet(clients, spreadsheetId, schema);
  const idx = all.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  const sheetId = await getSheetId(clients, spreadsheetId, schema.title);
  const rowNumber = idx + 1; // 0-indexed in batchUpdate, +1 to skip header
  await clients.sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber,
              endIndex: rowNumber + 1,
            },
          },
        },
      ],
    },
  });
  return true;
}

async function getSheetId(
  clients: GoogleClients,
  spreadsheetId: string,
  title: string,
): Promise<number> {
  const meta = await clients.sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  if (!sheet?.properties?.sheetId && sheet?.properties?.sheetId !== 0) {
    throw new Error(`Sheet "${title}" not found`);
  }
  return sheet.properties.sheetId;
}

function columnLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export { SHEETS };
