import { describe, it, expect } from "vitest";
import { runChat, renderWorkbookContext } from "./chat";
import type { ClaudeClient } from "./client";
import type { Workbook } from "@aicell/shared";

const mockClient = (canned: (args: { user: string; sysLen: number }) => string): ClaudeClient => ({
  async complete({ user, system }) {
    return canned({ user, sysLen: system.length });
  },
});

const sample = (): Workbook => ({
  id: "wb-1",
  name: "Q4 plan",
  sheets: [
    {
      id: "s1",
      name: "Revenue",
      cells: {
        "0,0": { raw: "Region" },
        "0,1": { raw: "Q4" },
        "1,0": { raw: "NA" },
        "1,1": { raw: "1200" },
        "2,0": { raw: "EU" },
        "2,1": { raw: "800" },
      },
      rowCount: 100,
      colCount: 4,
    },
  ],
});

describe("renderWorkbookContext", () => {
  it("includes sheet headers, dimensions, and non-empty rows", () => {
    const ctx = renderWorkbookContext(sample());
    expect(ctx).toContain("Workbook: Q4 plan");
    expect(ctx).toContain("# Sheet: Revenue");
    expect(ctx).toContain("100 rows × 4 cols");
    expect(ctx).toContain("Region | Q4");
    expect(ctx).toContain("NA");
    expect(ctx).toContain("1200");
  });

  it("truncates large sheets to 50 rows", () => {
    const wb = sample();
    wb.sheets[0]!.rowCount = 5000;
    for (let r = 0; r < 60; r++) {
      wb.sheets[0]!.cells[`${r},0`] = { raw: `row${r}` };
    }
    const ctx = renderWorkbookContext(wb);
    expect(ctx).toContain("row0");
    expect(ctx).toContain("row49");
    expect(ctx).not.toContain("row50");
    expect(ctx).toContain("more rows");
  });
});

describe("runChat", () => {
  it("sends the system prompt + workbook context (2 cacheable blocks)", async () => {
    let observed = { user: "", sysLen: 0 };
    const client = mockClient((args) => {
      observed = args;
      return "Ok!";
    });
    const r = await runChat(
      {
        messages: [{ role: "user", content: "What's NA's Q4 revenue?" }],
        workbook: sample(),
      },
      client
    );
    expect(r.reply).toBe("Ok!");
    expect(observed.sysLen).toBe(2);
    expect(observed.user).toContain("USER: What's NA's Q4 revenue?");
  });

  it("works without a workbook (1 cacheable block)", async () => {
    let sysLen = 0;
    const client = mockClient((a) => {
      sysLen = a.sysLen;
      return "ok";
    });
    await runChat(
      { messages: [{ role: "user", content: "hi" }] },
      client
    );
    expect(sysLen).toBe(1);
  });

  it("renders multi-turn transcript", async () => {
    let captured = "";
    const client = mockClient((a) => {
      captured = a.user;
      return "ok";
    });
    await runChat(
      {
        messages: [
          { role: "user", content: "Build me a P&L" },
          { role: "assistant", content: "What's the period?" },
          { role: "user", content: "Q4" },
        ],
      },
      client
    );
    expect(captured).toContain("USER: Build me a P&L");
    expect(captured).toContain("ASSISTANT: What's the period?");
    expect(captured).toContain("USER: Q4");
  });
});
