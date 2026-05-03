import { NextRequest, NextResponse } from "next/server";
import { getOwnerContext, OwnerNotConfiguredError } from "@/lib/google/owner";
import { SHEETS } from "@/lib/google/schema";
import { readSheet } from "@/lib/google/sheets";
import type { FormDef } from "@/lib/types";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }
  try {
    const owner = await getOwnerContext();
    const forms = await readSheet<FormDef>(
      owner.clients,
      owner.spreadsheetId,
      SHEETS.Forms,
    );
    const form = forms.find((f) => f.slug === slug);
    if (!form) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    let fields: string[];
    try {
      fields = JSON.parse(form.fields) as string[];
    } catch {
      fields = ["name", "email"];
    }
    return NextResponse.json({
      name: form.name,
      slug: form.slug,
      fields,
      redirectUrl: form.redirectUrl,
    });
  } catch (err) {
    if (err instanceof OwnerNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
