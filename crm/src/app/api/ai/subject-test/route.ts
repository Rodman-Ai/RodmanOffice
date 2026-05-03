import { NextRequest } from "next/server";
import { withAuth, ok, bad } from "@/lib/api";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as {
    contact?: { name?: string; company?: string };
    goal?: string;
  };
  const company = body.contact?.company || "your team";
  const first = (body.contact?.name || "there").split(" ")[0];
  // Local heuristic variants — Claude-backed in non-demo would replace these.
  const variants = [
    `Quick idea for ${company}`,
    `${first}, 15 minutes on ${company}'s outbound?`,
    `${company} + 30% more pipeline?`,
    `One question about ${company}`,
    `${first} — worth a look?`,
  ];
  return ok({ variants });
}
