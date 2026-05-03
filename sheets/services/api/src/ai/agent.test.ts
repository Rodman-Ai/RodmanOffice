import { describe, it, expect } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent, type AgentLLM } from "./agent";
import type { Workbook } from "@aicell/shared";

type Step = (request: {
  messages: Anthropic.MessageParam[];
}) => Anthropic.Message;

const fakeLLM = (steps: Step[]): AgentLLM => {
  let i = 0;
  return {
    async step(req): Promise<Anthropic.Message> {
      const fn = steps[i++];
      if (!fn) throw new Error("Out of canned steps");
      return fn(req);
    },
  };
};

const text = (text: string): Anthropic.TextBlock => ({
  type: "text",
  text,
  citations: null,
});

const toolUse = (
  id: string,
  name: string,
  input: Record<string, unknown>
): Anthropic.ToolUseBlock => ({
  type: "tool_use",
  id,
  name,
  input,
  caller: { type: "direct" },
});

const message = (
  blocks: Anthropic.ContentBlock[],
  stop_reason: Anthropic.Message["stop_reason"]
): Anthropic.Message =>
  ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-4-7",
    content: blocks,
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      service_tier: "standard",
    },
  }) as unknown as Anthropic.Message;

const sampleWorkbook = (): Workbook => ({
  id: "wb",
  name: "Test",
  sheets: [
    {
      id: "s1",
      name: "Sheet1",
      cells: {
        "0,0": { raw: "1" },
        "1,0": { raw: "2" },
        "2,0": { raw: "3" },
        "3,0": { raw: "4" },
      },
      rowCount: 100,
      colCount: 10,
    },
  ],
});

describe("runAgent", () => {
  it("collects mutating tool calls into a plan and returns final text", async () => {
    const llm = fakeLLM([
      () =>
        message(
          [toolUse("t1", "set_cell", { sheet: "Sheet1", row: 0, col: 1, raw: "Total" })],
          "tool_use"
        ),
      () => message([text("Done — staged 1 edit.")], "end_turn"),
    ]);

    const result = await runAgent(llm, {
      messages: [{ role: "user", content: "Add a header" }],
      workbook: sampleWorkbook(),
    });

    expect(result.plan).toEqual([
      { tool: "set_cell", args: { sheet: "Sheet1", row: 0, col: 1, raw: "Total" } },
    ]);
    expect(result.reply).toBe("Done — staged 1 edit.");
  });

  it("executes audit_formulas server-side and feeds results back", async () => {
    let toolResultSeen = "";
    const llm = fakeLLM([
      () =>
        message(
          [toolUse("t1", "audit_formulas", {})],
          "tool_use"
        ),
      (req) => {
        // The most recent user turn should contain the tool_result we sent
        const last = req.messages[req.messages.length - 1];
        if (last && Array.isArray(last.content)) {
          for (const b of last.content) {
            if (typeof b === "object" && "type" in b && b.type === "tool_result") {
              toolResultSeen = String((b as { content: unknown }).content);
            }
          }
        }
        return message([text("Found no issues.")], "end_turn");
      },
    ]);

    const wb = sampleWorkbook();
    wb.sheets[0]!.cells["0,1"] = { raw: "=A1+1" }; // self-ref via row 0 col 1 won't self-ref... let's use B1=A99
    wb.sheets[0]!.cells["0,2"] = { raw: "=A999" };

    const result = await runAgent(llm, {
      messages: [{ role: "user", content: "audit my formulas" }],
      workbook: wb,
    });

    expect(toolResultSeen).toContain("out_of_range_ref");
    expect(result.reply).toBe("Found no issues.");
  });

  it("executes forecast and feeds predictions back", async () => {
    let observed = "";
    const llm = fakeLLM([
      () =>
        message(
          [
            toolUse("t1", "forecast", {
              sheet: "Sheet1",
              range: "A1:A4",
              periods: 2,
            }),
          ],
          "tool_use"
        ),
      (req) => {
        const last = req.messages[req.messages.length - 1];
        if (last && Array.isArray(last.content)) {
          for (const b of last.content) {
            if (typeof b === "object" && "type" in b && b.type === "tool_result") {
              observed = String((b as { content: unknown }).content);
            }
          }
        }
        return message([text("Forecast ready.")], "end_turn");
      },
    ]);

    await runAgent(llm, {
      messages: [{ role: "user", content: "forecast next 2" }],
      workbook: sampleWorkbook(),
    });

    expect(observed).toContain("predictions");
    expect(observed).toContain("slope");
  });

  it("handles a multi-step plan with mixed tools", async () => {
    const llm = fakeLLM([
      () =>
        message(
          [
            toolUse("t1", "add_sheet", { name: "Forecast" }),
            toolUse("t2", "set_cell", {
              sheet: "Forecast",
              row: 0,
              col: 0,
              raw: "Year",
            }),
          ],
          "tool_use"
        ),
      () => message([text("Plan staged.")], "end_turn"),
    ]);

    const result = await runAgent(llm, {
      messages: [{ role: "user", content: "build a forecast tab" }],
    });
    expect(result.plan).toHaveLength(2);
    expect(result.plan[0]).toEqual({ tool: "add_sheet", args: { name: "Forecast" } });
  });

  it("caps iterations to avoid infinite loops", async () => {
    // LLM keeps emitting tool_use forever; runAgent must bail eventually
    const everToolUse: Step = () =>
      message(
        [toolUse(`t${Math.random()}`, "set_cell", {
          sheet: "Sheet1",
          row: 0,
          col: 0,
          raw: "x",
        })],
        "tool_use"
      );
    const llm = fakeLLM(Array.from({ length: 50 }, () => everToolUse));
    const result = await runAgent(llm, {
      messages: [{ role: "user", content: "spam" }],
      workbook: sampleWorkbook(),
    });
    // Hit 10-iteration cap; plan should have 10 entries (one per iteration)
    expect(result.plan.length).toBeLessThanOrEqual(10);
  });
});
