import { serve } from "@hono/node-server";
import { resolve } from "node:path";
import { createApp, FileStore } from "./app";
import { createPostgresStore } from "./storage-pg";
import { createClaudeClient } from "./ai/client";
import type { WorkbookStore } from "./storage";

const PORT = Number(process.env.PORT ?? 3000);
const DATA_DIR = resolve(process.env.AICELL_DATA_DIR ?? ".aicell-data");
const DATABASE_URL = process.env.DATABASE_URL;
const ALLOWED_ORIGINS = process.env.AICELL_ALLOWED_ORIGINS
  ? process.env.AICELL_ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;
const AUTH_TOKEN = process.env.AICELL_API_TOKEN || undefined;

let store: WorkbookStore;
let storeKind: string;
if (DATABASE_URL) {
  store = await createPostgresStore(DATABASE_URL);
  storeKind = "postgres";
} else {
  store = new FileStore(DATA_DIR);
  storeKind = `file (${DATA_DIR})`;
}

const { claude, agent } = createClaudeClient();
const app = createApp({
  store,
  claude,
  agent,
  allowedOrigins: ALLOWED_ORIGINS,
  authToken: AUTH_TOKEN,
});

serve({ fetch: app.fetch, port: PORT });
const aiStatus = claude ? "enabled" : "disabled (set ANTHROPIC_API_KEY)";
const corsStatus = ALLOWED_ORIGINS
  ? `restricted to ${ALLOWED_ORIGINS.join(", ")}`
  : "dev defaults (localhost only)";
const authStatus = AUTH_TOKEN ? "bearer-token required" : "open";
console.log(
  `AiCell API listening on http://localhost:${PORT} (store: ${storeKind}, ai: ${aiStatus}, cors: ${corsStatus}, auth: ${authStatus})`
);
