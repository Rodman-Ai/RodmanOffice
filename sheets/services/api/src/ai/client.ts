import Anthropic from "@anthropic-ai/sdk";
import type { AgentLLM } from "./agent";
import { AnthropicAgentLLM } from "./agent";

/**
 * Minimal interface we need from a Claude client. Real client uses the SDK;
 * tests inject a mock that returns deterministic values without a network call.
 */
export interface ClaudeClient {
  /** Single-shot call returning a plain text string. */
  complete(req: {
    model: string;
    system: Anthropic.TextBlockParam[];
    user: string;
    maxTokens: number;
  }): Promise<string>;
}

class RealClaudeClient implements ClaudeClient {
  constructor(private readonly sdk: Anthropic) {}

  async complete(req: {
    model: string;
    system: Anthropic.TextBlockParam[];
    user: string;
    maxTokens: number;
  }): Promise<string> {
    const response = await this.sdk.messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    let out = "";
    for (const block of response.content) {
      if (block.type === "text") out += block.text;
    }
    return out.trim();
  }
}

export function createClaudeClient(): {
  claude: ClaudeClient | null;
  agent: AgentLLM | null;
} {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { claude: null, agent: null };
  const sdk = new Anthropic({ apiKey: key });
  return {
    claude: new RealClaudeClient(sdk),
    agent: new AnthropicAgentLLM(sdk),
  };
}

export const MODELS = {
  /** Side-panel chat / agent. */
  agent: "claude-opus-4-7",
  /** Per-cell AI functions — latency- and cost-sensitive. */
  cell: "claude-haiku-4-5",
} as const;
