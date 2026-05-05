export declare const CLAUDE_API_URL: "https://api.anthropic.com/v1/messages";
export declare const CLAUDE_API_VERSION: "2023-06-01";
export declare const DEFAULT_CLAUDE_MODEL: "claude-sonnet-4-6";
export declare const DEFAULT_MAX_TOKENS: 2048;

export type ClaudeRole = "user" | "assistant";

export type ClaudeMessage = {
  role: ClaudeRole;
  content: string;
};

export type SendClaudeMessageRequest = {
  apiKey: string;
  messages: ClaudeMessage[];
  system?: string;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

export type SendClaudeMessageResponse = {
  text: string;
  raw: unknown;
  requestId: string;
};

export declare class ClaudeApiError extends Error {
  status: number;
  type: string;
  requestId: string;
}

export declare function sendClaudeMessage(
  request: SendClaudeMessageRequest
): Promise<SendClaudeMessageResponse>;
