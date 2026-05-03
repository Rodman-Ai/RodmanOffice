import type { ClaudeClient } from "./client";
import { MODELS } from "./client";

/**
 * AI cell functions. Each maps to a system prompt + small wrapping logic.
 * Designed so the system prompt is stable across calls of the same function
 * — every system block is sent with `cache_control: ephemeral` so HTTP-level
 * prompt caching kicks in once we cross the cache-write threshold.
 */
export type CellFn =
  | "AI"
  | "CLASSIFY"
  | "EXTRACT"
  | "SUMMARIZE"
  | "TRANSLATE"
  | "SENTIMENT"
  | "FORMULA";

export type CellRequest = {
  fn: CellFn;
  /** The user's prompt text — for AI/SUMMARIZE/EXTRACT this is free-form. */
  prompt: string;
  /** Additional positional args (e.g. labels for CLASSIFY, target lang for TRANSLATE). */
  args?: string[];
  /** Optional cell range data the model should reason over. */
  context?: string;
};

export type CellResponse = {
  value: string;
};

const SYSTEM_PROMPTS: Record<CellFn, string> = {
  AI: [
    "You are a spreadsheet cell function. The user's request will be in the user message.",
    "Return ONLY the answer as a single short value suitable for a spreadsheet cell.",
    "Do NOT include explanations, prefaces, or formatting. Plain text only.",
    "If the answer is a number, return only the number. If text, keep it concise.",
  ].join(" "),
  CLASSIFY: [
    "You are a spreadsheet classification function. Pick exactly ONE label from the provided LABELS list",
    "that best matches the INPUT text. Return ONLY the label, nothing else. No quotes, no punctuation.",
  ].join(" "),
  EXTRACT: [
    "You are a spreadsheet extraction function. Extract the requested field from the INPUT text.",
    "Return ONLY the extracted value. If not found, return an empty string. No prefaces, no quotes.",
  ].join(" "),
  SUMMARIZE: [
    "You are a spreadsheet summarization function. Produce a tight one-sentence summary of the INPUT.",
    "Return ONLY the summary. No prefaces like 'The text says' — just the summary itself.",
  ].join(" "),
  TRANSLATE: [
    "You are a spreadsheet translation function. Translate the INPUT into the target language.",
    "Return ONLY the translation. No transliteration, no notes.",
  ].join(" "),
  SENTIMENT: [
    "You are a spreadsheet sentiment function. Return exactly one of: positive, negative, neutral.",
    "Return ONLY that single word, lowercase, no punctuation.",
  ].join(" "),
  FORMULA: [
    "You are a spreadsheet formula generator. The user describes what they want in natural language.",
    "Return ONLY a valid Excel-compatible formula starting with '='. No explanation, no code fences.",
    "Use standard functions like SUM, AVERAGE, COUNTIF, VLOOKUP, INDEX, MATCH, FILTER, etc.",
  ].join(" "),
};

function userPayload(req: CellRequest): string {
  const parts: string[] = [];
  if (req.context) parts.push(`CONTEXT:\n${req.context}`);
  switch (req.fn) {
    case "CLASSIFY":
      parts.push(`LABELS: ${(req.args ?? []).join(", ")}`);
      parts.push(`INPUT:\n${req.prompt}`);
      break;
    case "EXTRACT":
      parts.push(`FIELD: ${req.args?.[0] ?? "value"}`);
      parts.push(`INPUT:\n${req.prompt}`);
      break;
    case "TRANSLATE":
      parts.push(`TARGET LANGUAGE: ${req.args?.[0] ?? "English"}`);
      parts.push(`INPUT:\n${req.prompt}`);
      break;
    default:
      parts.push(req.prompt);
  }
  return parts.join("\n\n");
}

export async function runCellFn(
  req: CellRequest,
  client: ClaudeClient
): Promise<CellResponse> {
  const system = [
    {
      type: "text" as const,
      text: SYSTEM_PROMPTS[req.fn],
      cache_control: { type: "ephemeral" as const },
    },
  ];
  const value = await client.complete({
    model: MODELS.cell,
    system,
    user: userPayload(req),
    maxTokens: 512,
  });
  return { value: value.trim() };
}
