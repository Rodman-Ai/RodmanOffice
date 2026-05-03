import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";

// Returns the values the deployer needs to copy into env vars to enable
// public form submissions. The refresh token here is the same one already
// stored in the user's NextAuth JWT cookie — exposing it back to its owner
// is fine; it's not transmitted anywhere new.
export async function GET(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  return NextResponse.json({
    LEOCRM_OWNER_EMAIL: r.ctx.email,
    LEOCRM_SPREADSHEET_ID: r.ctx.workspace.spreadsheetId,
    LEOCRM_DRIVE_FOLDER_ID: r.ctx.workspace.driveFolderId,
    LEOCRM_OWNER_REFRESH_TOKEN:
      (token?.refreshToken as string | undefined) ?? "",
    configured: Boolean(
      process.env.LEOCRM_OWNER_REFRESH_TOKEN &&
        process.env.LEOCRM_OWNER_EMAIL &&
        process.env.LEOCRM_SPREADSHEET_ID,
    ),
  });
}
