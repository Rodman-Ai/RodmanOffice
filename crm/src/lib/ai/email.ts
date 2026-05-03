import Anthropic from "@anthropic-ai/sdk";

export interface GenerateEmailInput {
  contact: {
    name: string;
    email: string;
    company?: string;
    role?: string;
    notes?: string;
    tags?: string;
  };
  goal: string;
  tone?: string;
  senderName?: string;
  senderCompany?: string;
  context?: string;
  prevThread?: string;
  subjectVariants?: number; // 1 (default) or 2 for A/B
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  subjectB?: string;
}

const SYSTEM_PROMPT = `You are an outbound sales SDR assistant. Write concise, personalized cold/lead-gen emails.
Rules:
- Plain text, no markdown.
- 90-140 words, 3 short paragraphs.
- A single, specific call to action at the end.
- Reference the prospect's company or role when provided. Never fabricate facts.
- No spammy hype, no all-caps, no exclamation marks unless strictly natural.
- Output strict JSON: { "subject": string, "body": string, "subjectB"?: string } and nothing else.
- If asked for two subjects, return both in "subject" (variant A) and "subjectB" (variant B). They must be distinct angles.`;

export async function generateEmail(
  input: GenerateEmailInput,
): Promise<GeneratedEmail> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return draftFallback(input);
  }
  const client = new Anthropic({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

  const userParts: string[] = [
    `Goal: ${input.goal}`,
    `Tone: ${input.tone || "warm, direct, professional"}`,
    `Prospect:`,
    `- Name: ${input.contact.name}`,
    `- Email: ${input.contact.email}`,
    input.contact.company ? `- Company: ${input.contact.company}` : "",
    input.contact.role ? `- Role: ${input.contact.role}` : "",
    input.contact.tags ? `- Tags: ${input.contact.tags}` : "",
    input.contact.notes ? `- Notes: ${input.contact.notes}` : "",
    input.senderName ? `Sender name: ${input.senderName}` : "",
    input.senderCompany ? `Sender company: ${input.senderCompany}` : "",
    input.context ? `Extra context: ${input.context}` : "",
    input.prevThread ? `Previous thread:\n${input.prevThread}` : "",
    "",
    input.subjectVariants && input.subjectVariants >= 2
      ? `Return strict JSON: { "subject": "<variant A>", "subjectB": "<variant B, different angle>", "body": "..." }`
      : `Return strict JSON: { "subject": "...", "body": "..." }`,
  ].filter(Boolean);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userParts.join("\n") }],
  });

  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  const json = extractJson(text);
  if (!json) {
    throw new Error("AI did not return valid JSON");
  }
  const parsed = JSON.parse(json) as Partial<GeneratedEmail>;
  if (!parsed.subject || !parsed.body) {
    throw new Error("AI returned an incomplete email");
  }
  return {
    subject: parsed.subject,
    body: parsed.body,
    subjectB: parsed.subjectB,
  };
}

function extractJson(text: string): string | null {
  const fence = text.match(/```json\s*([\s\S]+?)\s*```/i);
  if (fence) return fence[1];
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  return null;
}

function draftFallback(input: GenerateEmailInput): GeneratedEmail {
  const company = input.contact.company || "your team";
  const subject = `Quick idea for ${company}`;
  const body =
    `Hi ${input.contact.name.split(" ")[0] || "there"},\n\n` +
    `${input.goal}\n\n` +
    `Open to a 15-minute chat next week to see if it's a fit?\n\n` +
    `${input.senderName || "Best"},`;
  return { subject, body };
}
