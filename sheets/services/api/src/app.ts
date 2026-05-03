import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Workbook } from "@aicell/shared";
import { FileStore, type WorkbookStore } from "./storage";
import type { ClaudeClient } from "./ai/client";
import { runCellFn, type CellRequest, type CellFn } from "./ai/cell";
import { runChat, type ChatRequest } from "./ai/chat";
import { runAgent, type AgentLLM } from "./ai/agent";

export type AppDeps = {
  store: WorkbookStore;
  /** Optional — if absent, /ai/cell and /ai/chat return 503. */
  claude?: ClaudeClient | null;
  /** Optional — if absent, /ai/agent returns 503. */
  agent?: AgentLLM | null;
  /**
   * Allowed CORS origins. If undefined, defaults to common dev origins
   * only; pass an explicit list (e.g. `["https://my-app.example.com"]`)
   * before exposing the API publicly. Pass `["*"]` to opt into the old
   * "reflect any origin" behavior — never recommended for hosted use.
   */
  allowedOrigins?: string[];
  /**
   * If set, every request to `/workbooks/*` and `/ai/*` must carry an
   * `Authorization: Bearer <token>` header matching this value. Leave
   * unset for local dev; required for any hosted deployment that hands
   * out a real Anthropic key.
   */
  authToken?: string;
};

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
];

const VALID_FNS: ReadonlySet<string> = new Set([
  "AI",
  "CLASSIFY",
  "EXTRACT",
  "SUMMARIZE",
  "TRANSLATE",
  "SENTIMENT",
  "FORMULA",
]);

export function createApp(deps: AppDeps) {
  const app = new Hono();

  const allowed = deps.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
  const allowAny = allowed.length === 1 && allowed[0] === "*";
  app.use("*", cors({
    origin: (origin) => {
      if (allowAny) return origin ?? "*";
      if (!origin) return null;
      return allowed.includes(origin) ? origin : null;
    },
    credentials: !allowAny,
  }));

  // Bearer-token gate on everything except /health (so liveness checks
  // stay simple). Constant-time compare to avoid timing oracles.
  if (deps.authToken) {
    const expected = deps.authToken;
    app.use("/workbooks/*", async (c, next) => requireToken(c, expected, next));
    app.use("/workbooks", async (c, next) => requireToken(c, expected, next));
    app.use("/ai/*", async (c, next) => requireToken(c, expected, next));
  }

  app.get("/health", (c) =>
    c.json({ ok: true, ai: !!deps.claude, agent: !!deps.agent })
  );

  app.get("/workbooks", async (c) => {
    const list = await deps.store.list();
    return c.json({ workbooks: list });
  });

  app.get("/workbooks/:id", async (c) => {
    const id = c.req.param("id");
    const wb = await deps.store.get(id);
    if (!wb) return c.json({ error: "not_found" }, 404);
    return c.json({ workbook: wb });
  });

  app.put("/workbooks/:id", async (c) => {
    const id = c.req.param("id");
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const wb = (body as { workbook?: Workbook }).workbook;
    if (!wb || wb.id !== id) {
      return c.json({ error: "id_mismatch" }, 400);
    }
    const meta = await deps.store.save(wb);
    return c.json({ ok: true, updatedAt: meta.updatedAt });
  });

  app.post("/ai/cell", async (c) => {
    if (!deps.claude) return c.json({ error: "ai_disabled" }, 503);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const req = body as Partial<CellRequest>;
    if (!req.fn || !VALID_FNS.has(req.fn)) {
      return c.json({ error: "invalid_fn" }, 400);
    }
    if (typeof req.prompt !== "string" || req.prompt.length === 0) {
      return c.json({ error: "invalid_prompt" }, 400);
    }
    if (req.prompt.length > 8000) {
      return c.json({ error: "prompt_too_long" }, 413);
    }
    try {
      const out = await runCellFn(req as CellRequest, deps.claude);
      return c.json(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "ai_failed", message: msg }, 502);
    }
  });

  app.post("/ai/chat", async (c) => {
    if (!deps.claude) return c.json({ error: "ai_disabled" }, 503);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const req = body as Partial<ChatRequest>;
    if (!Array.isArray(req.messages) || req.messages.length === 0) {
      return c.json({ error: "invalid_messages" }, 400);
    }
    try {
      const out = await runChat(req as ChatRequest, deps.claude);
      return c.json(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "ai_failed", message: msg }, 502);
    }
  });

  app.post("/ai/agent", async (c) => {
    if (!deps.agent) return c.json({ error: "ai_disabled" }, 503);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json" }, 400);
    }
    const req = body as { messages?: unknown; workbook?: Workbook };
    if (!Array.isArray(req.messages) || req.messages.length === 0) {
      return c.json({ error: "invalid_messages" }, 400);
    }
    try {
      const out = await runAgent(deps.agent, {
        messages: req.messages as Array<{ role: "user" | "assistant"; content: string }>,
        workbook: req.workbook,
      });
      return c.json(out);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: "agent_failed", message: msg }, 502);
    }
  });

  return app;
}

async function requireToken(
  c: import("hono").Context,
  expected: string,
  next: import("hono").Next
) {
  const header = c.req.header("Authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!constantTimeEq(presented, expected)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
}

function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export { FileStore };
export type { CellFn };
