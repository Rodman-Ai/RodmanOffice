import { NextRequest } from "next/server";
import { withAuth, ok, bad } from "@/lib/api";

// Local heuristic Q&A over the user's data. Real deployment would route
// through Claude with retrieval. Here we return a templated answer so the
// demo feels alive.
export async function POST(req: NextRequest) {
  const r = await withAuth();
  if ("error" in r) return r.error;
  const body = (await req.json()) as { question?: string };
  if (!body.question) return bad("question required");
  const q = body.question.toLowerCase();
  let answer = `I parsed: "${body.question}". In demo mode, I show a templated response.`;
  if (/stalled|stale|stuck/.test(q))
    answer = `Stalled deals are surfaced on Reports → "Stale-deal SLA alerts" (anything in a non-terminal stage for 14+ days).`;
  else if (/who|prioritize|next/.test(q))
    answer = `Open the Dashboard — the "Suggested next contact" card already ranks your highest-score lead with no contact in 7+ days.`;
  else if (/reply rate|conversion/.test(q))
    answer = `Reports → top of the page shows your reply rate, and the AI vs non-AI panel breaks it down further.`;
  else if (/forecast|pipeline/.test(q))
    answer = `Reports → "Forecast by month (deals)" shows weighted closes, and Deals page totals open + weighted pipeline.`;
  else if (/goal|target/.test(q))
    answer = `Dashboard → "Weekly send goal" tracks your progress toward 25 sends/week. Adjust the target later in Settings.`;
  return ok({ answer });
}
