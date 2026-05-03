import { describe, it, expect } from "vitest";
import { runCellFn } from "./cell";
import type { ClaudeClient } from "./client";

const mockClient = (canned: (user: string) => string): ClaudeClient => ({
  async complete({ user }) {
    return canned(user);
  },
});

describe("runCellFn", () => {
  it("AI passes through prompt and trims output", async () => {
    const client = mockClient(() => "  42  \n");
    const r = await runCellFn(
      { fn: "AI", prompt: "What is 6 times 7?" },
      client
    );
    expect(r.value).toBe("42");
  });

  it("CLASSIFY routes labels into the user payload", async () => {
    const seenPayloads: string[] = [];
    const client = mockClient((u) => {
      seenPayloads.push(u);
      return "positive";
    });
    const r = await runCellFn(
      {
        fn: "CLASSIFY",
        prompt: "I love this product!",
        args: ["positive", "negative", "neutral"],
      },
      client
    );
    expect(r.value).toBe("positive");
    expect(seenPayloads[0]).toContain("LABELS: positive, negative, neutral");
    expect(seenPayloads[0]).toContain("INPUT:\nI love this product!");
  });

  it("EXTRACT puts the field name in the payload", async () => {
    let captured = "";
    const client = mockClient((u) => {
      captured = u;
      return "Acme Corp";
    });
    await runCellFn(
      {
        fn: "EXTRACT",
        prompt: "Acme Corp signed a $50k deal yesterday.",
        args: ["company"],
      },
      client
    );
    expect(captured).toContain("FIELD: company");
  });

  it("TRANSLATE includes the target language", async () => {
    let captured = "";
    const client = mockClient((u) => {
      captured = u;
      return "Hola";
    });
    await runCellFn(
      { fn: "TRANSLATE", prompt: "Hello", args: ["Spanish"] },
      client
    );
    expect(captured).toContain("TARGET LANGUAGE: Spanish");
  });

  it("FORMULA returns the formula string", async () => {
    const client = mockClient(() => "=SUM(A1:A10)");
    const r = await runCellFn(
      { fn: "FORMULA", prompt: "sum the first ten cells of column A" },
      client
    );
    expect(r.value).toBe("=SUM(A1:A10)");
  });

  it("includes context in the user payload when provided", async () => {
    let captured = "";
    const client = mockClient((u) => {
      captured = u;
      return "ok";
    });
    await runCellFn(
      { fn: "AI", prompt: "describe this", context: "row 1: 1 | 2 | 3" },
      client
    );
    expect(captured).toContain("CONTEXT:\nrow 1: 1 | 2 | 3");
  });
});
