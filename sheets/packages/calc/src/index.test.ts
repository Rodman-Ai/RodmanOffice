import { describe, it, expect, beforeEach } from "vitest";
import { CalcEngine, aiRegistry, AI_LOADING } from "./index";
import type { Sheet } from "@aicell/shared";

const blankSheet = (): Sheet => ({
  id: "s1",
  name: "Sheet1",
  cells: {},
  rowCount: 100,
  colCount: 26,
});

describe("CalcEngine", () => {
  it("computes literal numeric values", () => {
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, "42");
    expect(e.getValue("Sheet1", 0, 0).value).toBe(42);
    e.destroy();
  });

  it("computes SUM across a range", () => {
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, "1");
    e.setCell("Sheet1", 1, 0, "2");
    e.setCell("Sheet1", 2, 0, "3");
    e.setCell("Sheet1", 3, 0, "=SUM(A1:A3)");
    expect(e.getValue("Sheet1", 3, 0).value).toBe(6);
    e.destroy();
  });

  it("recalculates dependent cells when a precedent changes", () => {
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, "10");
    e.setCell("Sheet1", 0, 1, "=A1*2");
    expect(e.getValue("Sheet1", 0, 1).value).toBe(20);
    e.setCell("Sheet1", 0, 0, "5");
    expect(e.getValue("Sheet1", 0, 1).value).toBe(10);
    e.destroy();
  });

  it("loads a sheet with pre-populated cells and computes formulas", () => {
    const e = new CalcEngine();
    e.loadSheet({
      id: "s1",
      name: "Sheet1",
      cells: {
        "0,0": { raw: "5" },
        "0,1": { raw: "7" },
        "0,2": { raw: "=A1+B1" },
      },
      rowCount: 10,
      colCount: 10,
    });
    expect(e.getValue("Sheet1", 0, 2).value).toBe(12);
    e.destroy();
  });

  it("returns an error for invalid formulas", () => {
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, "=NOT_A_FUNCTION()");
    const result = e.getValue("Sheet1", 0, 0);
    expect(result.error).toBeDefined();
    e.destroy();
  });

  it("supports VLOOKUP", () => {
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, "apple");
    e.setCell("Sheet1", 0, 1, "100");
    e.setCell("Sheet1", 1, 0, "banana");
    e.setCell("Sheet1", 1, 1, "200");
    e.setCell("Sheet1", 2, 0, "cherry");
    e.setCell("Sheet1", 2, 1, "300");
    e.setCell("Sheet1", 4, 0, '=VLOOKUP("banana",A1:B3,2,0)');
    expect(e.getValue("Sheet1", 4, 0).value).toBe(200);
    e.destroy();
  });

  it("clears a cell when set to empty string", () => {
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, "99");
    expect(e.getValue("Sheet1", 0, 0).value).toBe(99);
    e.setCell("Sheet1", 0, 0, "");
    expect(e.getValue("Sheet1", 0, 0).value).toBeNull();
    e.destroy();
  });
});

describe("AI cell functions", () => {
  beforeEach(() => {
    aiRegistry.clear();
    aiRegistry.setRunner(null);
  });

  it("returns AI_LOADING on first evaluation, then the resolved value after recalc", async () => {
    aiRegistry.setRunner(async ({ fn, prompt }) => {
      if (fn === "CLASSIFY") return "positive";
      return `[${fn}] ${prompt}`;
    });

    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, "I love this!");
    e.setCell("Sheet1", 0, 1, '=CLASSIFY(A1, "positive,negative,neutral")');

    expect(e.getValue("Sheet1", 0, 1).value).toBe(AI_LOADING);

    // Wait for the runner promise + cache update
    await new Promise((r) => setTimeout(r, 5));
    e.recalculate();

    expect(e.getValue("Sheet1", 0, 1).value).toBe("positive");
    e.destroy();
  });

  it("reuses cached result across cells with identical args", async () => {
    let callCount = 0;
    aiRegistry.setRunner(async () => {
      callCount++;
      return "neutral";
    });

    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, '=SENTIMENT("hello world")');
    e.setCell("Sheet1", 0, 1, '=SENTIMENT("hello world")');
    e.setCell("Sheet1", 0, 2, '=SENTIMENT("hello world")');

    await new Promise((r) => setTimeout(r, 5));
    e.recalculate();

    expect(e.getValue("Sheet1", 0, 0).value).toBe("neutral");
    expect(e.getValue("Sheet1", 0, 1).value).toBe("neutral");
    expect(e.getValue("Sheet1", 0, 2).value).toBe("neutral");
    expect(callCount).toBe(1);
    e.destroy();
  });

  it("returns #AI_DISABLED when no runner is configured", () => {
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, '=AI("anything")');
    expect(e.getValue("Sheet1", 0, 0).value).toBe("#AI_DISABLED");
    e.destroy();
  });

  it("propagates runner errors as cell error strings", async () => {
    aiRegistry.setRunner(async () => {
      throw new Error("rate limited");
    });
    const e = new CalcEngine();
    e.loadSheet(blankSheet());
    e.setCell("Sheet1", 0, 0, '=SUMMARIZE("blah")');
    expect(e.getValue("Sheet1", 0, 0).value).toBe(AI_LOADING);
    await new Promise((r) => setTimeout(r, 5));
    e.recalculate();
    expect(String(e.getValue("Sheet1", 0, 0).value)).toContain("#AI! rate limited");
    e.destroy();
  });
});
