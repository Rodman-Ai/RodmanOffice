import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";

// Returns the non-secret values the deployer needs to copy into env vars to
// enable public form submissions. The refresh token is only included for an
// explicit reveal request so normal settings reads do not expose a long-lived
// credential to routine browser traffic.
export async function GET(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const reveal = req.nextUrl.searchParams.get("reveal") === "1";
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const refreshToken = (token?.refreshToken as string | undefined) ?? "";
  return NextResponse.json({
    LEOCRM_OWNER_EMAIL: r.ctx.email,
    LEOCRM_SPREADSHEET_ID: r.ctx.workspace.spreadsheetId,
    LEOCRM_DRIVE_FOLDER_ID: r.ctx.workspace.driveFolderId,
    LEOCRM_OWNER_REFRESH_TOKEN: reveal ? refreshToken : "",
    hasSessionRefreshToken: Boolean(refreshToken),
    configured: Boolean(
      process.env.LEOCRM_OWNER_REFRESH_TOKEN &&
        process.env.LEOCRM_OWNER_EMAIL &&
        process.env.LEOCRM_SPREADSHEET_ID,
    ),
  });
}
