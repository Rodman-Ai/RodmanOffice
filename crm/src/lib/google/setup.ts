import type { GoogleClients } from "./client";
import { SHEETS, SHEET_NAMES } from "./schema";

const WORKSPACE_FILE_NAME = "LeoCRM Workspace";
const WORKSPACE_FOLDER_NAME = "LeoCRM";

export interface WorkspaceIds {
  spreadsheetId: string;
  driveFolderId: string;
}

export async function findWorkspace(
  clients: GoogleClients,
): Promise<WorkspaceIds | null> {
  const sheetSearch = await clients.drive.files.list({
    q: `name='${WORKSPACE_FILE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`,
    fields: "files(id,name,parents)",
    spaces: "drive",
    pageSize: 1,
  });
  const file = sheetSearch.data.files?.[0];
  if (!file?.id) return null;

  const folderSearch = await clients.drive.files.list({
    q: `name='${WORKSPACE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
    pageSize: 1,
  });
  const folderId = folderSearch.data.files?.[0]?.id ?? "";
  return { spreadsheetId: file.id, driveFolderId: folderId };
}

export async function ensureWorkspace(
  clients: GoogleClients,
): Promise<WorkspaceIds> {
  const existing = await findWorkspace(clients);
  if (existing?.spreadsheetId && existing.driveFolderId) return existing;

  const folderId =
    existing?.driveFolderId || (await createFolder(clients));
  const spreadsheetId =
    existing?.spreadsheetId || (await createSpreadsheet(clients, folderId));

  await ensureTabsAndHeaders(clients, spreadsheetId);
  return { spreadsheetId, driveFolderId: folderId };
}

async function createFolder(clients: GoogleClients): Promise<string> {
  const res = await clients.drive.files.create({
    requestBody: {
      name: WORKSPACE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    },
    fields: "id",
  });
  if (!res.data.id) throw new Error("Could not create LeoCRM Drive folder");
  return res.data.id;
}

async function createSpreadsheet(
  clients: GoogleClients,
  parentFolderId: string,
): Promise<string> {
  const created = await clients.sheets.spreadsheets.create({
    requestBody: {
      properties: { title: WORKSPACE_FILE_NAME },
      sheets: SHEET_NAMES.map((name) => ({
        properties: { title: SHEETS[name].title },
      })),
    },
  });
  const id = created.data.spreadsheetId;
  if (!id) throw new Error("Could not create LeoCRM spreadsheet");
  if (parentFolderId) {
    await clients.drive.files.update({
      fileId: id,
      addParents: parentFolderId,
      fields: "id,parents",
    });
  }
  return id;
}

async function ensureTabsAndHeaders(
  clients: GoogleClients,
  spreadsheetId: string,
) {
  const meta = await clients.sheets.spreadsheets.get({ spreadsheetId });
  const existingTitles = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
  );
  const requests = SHEET_NAMES.filter((n) => !existingTitles.has(n)).map(
    (name) => ({ addSheet: { properties: { title: name } } }),
  );
  if (requests.length) {
    await clients.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests },
    });
  }
  const headerData = SHEET_NAMES.map((name) => ({
    range: `${name}!A1`,
    values: [SHEETS[name].headers],
  }));
  await clients.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: headerData },
  });
}
