import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp, FileStore } from "./app";
import type { ClaudeClient } from "./ai/client";
import type { Workbook } from "@aicell/shared";

const fakeClaude = (canned = "MOCK"): ClaudeClient => ({
  async complete() {
    return canned;
  },
});

const sampleWorkbook = (id = "wb-test"): Workbook => ({
  id,
  name: "Untitled",
  sheets: [
    {
      id: "sheet-1",
      name: "Sheet1",
      cells: { "0,0": { raw: "42" }, "0,1": { raw: "=A1+1" } },
      rowCount: 100,
      colCount: 26,
    },
  ],
});

describe("API", () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aicell-test-"));
    app = createApp({ store: new FileStore(dir) });
  });

  it("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ai: false, agent: false });
  });

  it("GET /workbooks returns empty list initially", async () => {
    const res = await app.request("/workbooks");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ workbooks: [] });
  });

  it("GET unknown workbook returns 404", async () => {
    const res = await app.request("/workbooks/wb-test");
    expect(res.status).toBe(404);
  });

  it("PUT then GET round-trips a workbook", async () => {
    const wb = sampleWorkbook();
    const put = await app.request(`/workbooks/${wb.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workbook: wb }),
    });
    expect(put.status).toBe(200);
    const putBody = (await put.json()) as { ok: boolean; updatedAt: number };
    expect(putBody.ok).toBe(true);
    expect(typeof putBody.updatedAt).toBe("number");

    const get = await app.request(`/workbooks/${wb.id}`);
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as { workbook: Workbook };
    expect(getBody.workbook.id).toBe(wb.id);
    expect(getBody.workbook.sheets[0]?.cells["0,0"]?.raw).toBe("42");
  });

  it("PUT with mismatched id returns 400", async () => {
    const wb = sampleWorkbook("wb-a");
    const res = await app.request("/workbooks/wb-b", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workbook: wb }),
    });
    expect(res.status).toBe(400);
  });

  it("listing reflects saved workbooks", async () => {
    await app.request("/workbooks/wb-1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workbook: sampleWorkbook("wb-1") }),
    });
    const res = await app.request("/workbooks");
    const body = (await res.json()) as { workbooks: Array<{ id: string }> };
    expect(body.workbooks.map((w) => w.id)).toContain("wb-1");
  });

  it("rejects unsafe workbook ids", async () => {
    const res = await app.request("/workbooks/..%2Fevil", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workbook: { ...sampleWorkbook("..%2Fevil") } }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  // cleanup
  it.runIf(true)("cleans up tmp dir", async () => {
    await rm(dir, { recursive: true, force: true });
  });
});

describe("AI endpoints", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "aicell-ai-test-"));
  });

  it("/ai/cell returns 503 when no claude client is configured", async () => {
    const app = createApp({ store: new FileStore(dir) });
    const res = await app.request("/ai/cell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fn: "AI", prompt: "hi" }),
    });
    expect(res.status).toBe(503);
  });

  it("/ai/cell rejects unknown function names", async () => {
    const app = createApp({ store: new FileStore(dir), claude: fakeClaude() });
    const res = await app.request("/ai/cell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fn: "ROGUE", prompt: "hi" }),
    });
    expect(res.status).toBe(400);
  });

  it("/ai/cell happy path returns the value", async () => {
    const app = createApp({
      store: new FileStore(dir),
      claude: fakeClaude("positive"),
    });
    const res = await app.request("/ai/cell", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fn: "CLASSIFY",
        prompt: "I love this!",
        args: ["positive", "negative", "neutral"],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ value: "positive" });
  });

  it("/ai/chat returns 503 when AI disabled", async () => {
    const app = createApp({ store: new FileStore(dir) });
    const res = await app.request("/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    });
    expect(res.status).toBe(503);
  });

  it("/ai/chat happy path returns reply", async () => {
    const app = createApp({
      store: new FileStore(dir),
      claude: fakeClaude("Sure, here's a P&L."),
    });
    const res = await app.request("/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Build a P&L" }],
      }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: "Sure, here's a P&L." });
  });

  it("/ai/chat rejects empty messages", async () => {
    const app = createApp({
      store: new FileStore(dir),
      claude: fakeClaude(),
    });
    const res = await app.request("/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("/health reports ai status", async () => {
    const enabled = createApp({ store: new FileStore(dir), claude: fakeClaude() });
    const r1 = await enabled.request("/health");
    expect(await r1.json()).toEqual({ ok: true, ai: true, agent: false });

    const disabled = createApp({ store: new FileStore(dir) });
    const r2 = await disabled.request("/health");
    expect(await r2.json()).toEqual({ ok: true, ai: false, agent: false });
  });

  describe("auth", () => {
    it("rejects /workbooks without token when authToken is set", async () => {
      const guarded = createApp({ store: new FileStore(dir), authToken: "secret-xyz" });
      const res = await guarded.request("/workbooks");
      expect(res.status).toBe(401);
    });

    it("accepts /workbooks with correct bearer token", async () => {
      const guarded = createApp({ store: new FileStore(dir), authToken: "secret-xyz" });
      const res = await guarded.request("/workbooks", {
        headers: { Authorization: "Bearer secret-xyz" },
      });
      expect(res.status).toBe(200);
    });

    it("rejects /workbooks with wrong bearer token", async () => {
      const guarded = createApp({ store: new FileStore(dir), authToken: "secret-xyz" });
      const res = await guarded.request("/workbooks", {
        headers: { Authorization: "Bearer wrong-token" },
      });
      expect(res.status).toBe(401);
    });

    it("/health stays public even with authToken set", async () => {
      const guarded = createApp({ store: new FileStore(dir), authToken: "secret-xyz" });
      const res = await guarded.request("/health");
      expect(res.status).toBe(200);
    });
  });

  describe("CORS", () => {
    it("rejects unlisted origins", async () => {
      const restricted = createApp({
        store: new FileStore(dir),
        allowedOrigins: ["https://allowed.example.com"],
      });
      const res = await restricted.request("/health", {
        headers: { Origin: "https://evil.example.com" },
      });
      expect(res.headers.get("access-control-allow-origin")).toBeFalsy();
    });

    it("reflects an allowlisted origin", async () => {
      const restricted = createApp({
        store: new FileStore(dir),
        allowedOrigins: ["https://allowed.example.com"],
      });
      const res = await restricted.request("/health", {
        headers: { Origin: "https://allowed.example.com" },
      });
      expect(res.headers.get("access-control-allow-origin")).toBe("https://allowed.example.com");
    });
  });
});
