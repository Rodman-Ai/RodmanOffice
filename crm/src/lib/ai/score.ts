import Anthropic from "@anthropic-ai/sdk";
import type { Contact, Lead } from "../types";

export interface ScoreResult {
  score: number;
  reason: string;
}

const SYSTEM = `You score B2B sales leads from 0-100 by reply likelihood.
- 80-100: very likely to engage (clear ICP fit + recent signal)
- 60-80: solid fit
- 40-60: weak fit or insufficient data
- 0-40: unlikely
Return strict JSON: {"score": number 0-100, "reason": "<one short sentence>"}.
No markdown. No extra text.`;

export async function scoreContact(
  contact: Contact,
  lead?: Lead,
  recentEmailCount?: number,
): Promise<ScoreResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return heuristicFallback(contact, lead);
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const profile = [
    `Name: ${contact.name || "?"}`,
    `Email: ${contact.email}`,
    contact.company ? `Company: ${contact.company}` : "",
    contact.role ? `Role: ${contact.role}` : "",
    contact.tags ? `Tags: ${contact.tags}` : "",
    contact.notes ? `Notes: ${contact.notes}` : "",
    lead?.source ? `Source: ${lead.source}` : "",
    lead?.stage ? `Stage: ${lead.stage}` : "",
    lead?.lastContactedAt
      ? `Last contacted: ${lead.lastContactedAt}`
      : "Never contacted",
    recentEmailCount !== undefined
      ? `Sent emails: ${recentEmailCount}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await client.messages.create({
    model,
    max_tokens: 256,
    system: SYSTEM,
    messages: [{ role: "user", content: profile }],
  });
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) {
    return heuristicFallback(contact, lead);
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as ScoreResult;
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score))));
    return { score, reason: String(parsed.reason || "").slice(0, 240) };
  } catch {
    return heuristicFallback(contact, lead);
  }
}

function heuristicFallback(contact: Contact, lead?: Lead): ScoreResult {
  let score = 30;
  const reasons: string[] = [];
  if (contact.company) {
    score += 10;
    reasons.push("has company");
  }
  if (contact.role) {
    score += 10;
    reasons.push("has role");
  }
  if (/(VP|Director|Head|Chief|CEO|CTO|CFO|Founder)/i.test(contact.role)) {
    score += 15;
    reasons.push("decision-maker title");
  }
  if (contact.linkedin) {
    score += 5;
    reasons.push("has LinkedIn");
  }
  if (contact.tags) {
    score += 5;
    reasons.push("tagged");
  }
  if (lead?.lastContactedAt) {
    score -= 5;
  }
  return {
    score: Math.max(0, Math.min(100, score)),
    reason: reasons.length ? reasons.join(", ") : "limited data on profile",
  };
}
