// Shared browser-side Claude connector for RodmanOffice BYOK panels.
// The caller supplies an API key per request; this module never stores it.

export const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
export const CLAUDE_API_VERSION = '2023-06-01';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';
export const DEFAULT_MAX_TOKENS = 2048;

export class ClaudeApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ClaudeApiError';
    this.status = details.status || 0;
    this.type = details.type || '';
    this.requestId = details.requestId || '';
  }
}

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') {
    throw new TypeError('Claude messages must be objects with role and content.');
  }
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  const content = typeof message.content === 'string'
    ? message.content.trim()
    : message.content;
  if (!content || (typeof content === 'string' && content.length === 0)) {
    throw new TypeError('Claude message content cannot be empty.');
  }
  return { role, content };
}

function readTextContent(responseBody) {
  if (!responseBody || !Array.isArray(responseBody.content)) return '';
  return responseBody.content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

export async function sendClaudeMessage({
  apiKey,
  messages,
  system,
  model = DEFAULT_CLAUDE_MODEL,
  maxTokens = DEFAULT_MAX_TOKENS,
  signal,
  fetchImpl = fetch,
} = {}) {
  const requestKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!requestKey) throw new TypeError('Enter a Claude API key before sending.');
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new TypeError('Enter a prompt before sending.');
  }

  const body = {
    model,
    max_tokens: maxTokens,
    messages: messages.map(normalizeMessage),
  };
  if (system) body.system = system;

  const response = await fetchImpl(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': requestKey,
      'anthropic-version': CLAUDE_API_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
    signal,
  });

  const data = await readJsonResponse(response);
  const requestId = response.headers?.get?.('request-id') || '';
  if (!response.ok) {
    const apiError = data?.error || {};
    const message = apiError.message || `Claude request failed (${response.status})`;
    throw new ClaudeApiError(message, {
      status: response.status,
      type: apiError.type,
      requestId,
    });
  }

  return {
    text: readTextContent(data),
    raw: data,
    requestId,
  };
}
