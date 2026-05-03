import { NextRequest } from "next/server";
import { withAuth, ok, bad } from "@/lib/api";

export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as { company?: string; domain?: string };
  if (!body.company) return bad("company required");
  const brief = `# ${body.company}

**One-liner**: ${body.company} is operating in their market with what looks like steady growth. (Demo stub.)

**Why now**:
- Hiring signals suggest revenue-team scaling
- Recent press / launch hints at a fresh outbound need
- ICP fit on team size and tooling stack

**Key personas**:
- VP Sales / Head of Sales Ops
- RevOps Manager (likely champion)

**Likely objections**:
- Existing tooling sunk cost
- Procurement timeline (Q3 budget)

**Conversation starters**:
- Reference the recent expansion / hiring
- Lead with a peer customer outcome
- Offer a concise compare doc, not a demo

(Generated locally in demo mode. Wire ANTHROPIC_API_KEY for Claude-backed research.)`;
  return ok({ brief });
}
