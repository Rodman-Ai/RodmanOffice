/**
 * @file Minimal browser-side LLM client. Reads provider, API key, and model
 * from `Settings.connect.llm` and dispatches to the right provider's HTTP
 * shape. Calls go directly from the browser to the provider — keys are
 * never sent anywhere else, but this also means the user's key is exposed
 * to whatever JS is running in the page (acceptable for a static demo).
 *
 * Supported providers:
 * - **anthropic** (default; uses `anthropic-dangerous-direct-browser-access`)
 * - **openai** (Chat Completions API)
 * - **google** (Gemini)
 * - **ollama** (local at `http://localhost:11434`)
 *
 * @module llm
 */

import { Settings } from "./store.js";

/**
 * @returns {boolean} true if `Settings.connect.llm` has provider, apiKey, and model.
 */
export function llmIsConnected() {
  const c = (Settings.get().connect || {}).llm || {};
  return !!(c.apiKey && c.provider && c.model);
}

/**
 * Run a single user-turn generation against the configured provider.
 * Returns the assistant's text response.
 *
 * @param {object} args
 * @param {string} [args.system] System prompt (provider-supported).
 * @param {string} args.user     User prompt body.
 * @param {number} [args.maxTokens=800]
 * @returns {Promise<string>}
 * @throws {Error} On missing key, non-2xx response, or unknown provider.
 */
export async function llmGenerate({ system, user, maxTokens = 800 }) {
  const c = (Settings.get().connect || {}).llm || {};
  if (!c.apiKey) throw new Error("No LLM API key configured. Visit /connect to add one.");
  const provider = c.provider || "anthropic";
  const model = c.model || "claude-sonnet-4-6";

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": c.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: system || "",
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return (data.content || []).map((p) => p.text || "").join("\n").trim();
  }

  if (provider === "openai") {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${c.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  if (provider === "google") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${c.apiKey}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          ...(system ? [{ role: "user", parts: [{ text: system }] }] : []),
          { role: "user", parts: [{ text: user }] },
        ],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n").trim() || "";
  }

  if (provider === "ollama") {
    const res = await fetch("http://localhost:11434/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          ...(system ? [{ role: "system", content: system }] : []),
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    return data.message?.content?.trim() || "";
  }

  throw new Error(`Unknown provider: ${provider}`);
}
