import { googleClients } from "./client";

// Used by public, unauthenticated routes (form submissions) to write into the
// owner's spreadsheet. Single-tenant: the deployer sets these env vars once.
export interface OwnerContext {
  spreadsheetId: string;
  driveFolderId: string;
  email: string;
  clients: ReturnType<typeof googleClients>;
}

export class OwnerNotConfiguredError extends Error {
  constructor() {
    super(
      "Public-form credentials not configured. Set LEOCRM_OWNER_REFRESH_TOKEN, LEOCRM_OWNER_EMAIL and LEOCRM_SPREADSHEET_ID env vars (see /settings).",
    );
  }
}

export async function getOwnerContext(): Promise<OwnerContext> {
  const refresh = process.env.LEOCRM_OWNER_REFRESH_TOKEN;
  const email = process.env.LEOCRM_OWNER_EMAIL;
  const spreadsheetId = process.env.LEOCRM_SPREADSHEET_ID;
  const driveFolderId = process.env.LEOCRM_DRIVE_FOLDER_ID ?? "";
  if (!refresh || !email || !spreadsheetId) {
    throw new OwnerNotConfiguredError();
  }
  const accessToken = await exchangeRefreshToken(refresh);
  return {
    spreadsheetId,
    driveFolderId,
    email,
    clients: googleClients(accessToken),
  };
}

async function exchangeRefreshToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(data.error ?? "Failed to refresh owner access token");
  }
  return data.access_token;
}
