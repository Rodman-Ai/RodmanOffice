import { NextRequest } from "next/server";
import { withAuth, ok, bad } from "@/lib/api";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as { contactId?: string; goal?: string };
  if (!body.contactId) return bad("contactId required");
  const points = [
    "Open with a quick recap of the last touchpoint.",
    "Lead with a peer customer outcome (~30s).",
    "Ask: what does success look like 6 months from now?",
    "Probe budget timing without naming a number first.",
    "Land on one concrete next step (demo, trial, or intro).",
  ];
  return ok({ points });
}
