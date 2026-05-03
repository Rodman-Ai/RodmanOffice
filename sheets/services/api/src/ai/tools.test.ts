import { describe, it, expect } from "vitest";
import {
  auditFormulas,
  parseRange,
  rangeValues,
  forecastSeries,
  forecastFromWorkbook,
} from "./tools";
import type { Workbook } from "@aicell/shared";

const wb = (cells: Record<string, string>): Workbook => ({
  id: "w1",
  name: "Test",
  sheets: [
    {
      id: "s1",
      name: "Sheet1",
      cells: Object.fromEntries(
        Object.entries(cells).map(([k, v]) => [k, { raw: v }])
      ),
      rowCount: 50,
      colCount: 10,
    },
  ],
});

describe("auditFormulas", () => {
  it("flags out-of-range refs", () => {
    const issues = auditFormulas(wb({ "0,0": "=A99" }));
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("out_of_range_ref");
  });

  it("flags self-references", () => {
    const issues = auditFormulas(wb({ "0,0": "=A1+1" }));
    expect(issues.find((i) => i.kind === "self_ref")).toBeDefined();
  });

  it("flags duplicate formulas across many cells", () => {
    const cells: Record<string, string> = {};
    for (let r = 0; r < 6; r++) cells[`${r},2`] = "=A1+B1";
    const issues = auditFormulas(wb(cells));
    expect(issues.find((i) => i.kind === "duplicate_formula")).toBeDefined();
  });

  it("returns empty for clean sheets", () => {
    const issues = auditFormulas(wb({ "0,0": "1", "0,1": "=A1*2" }));
    expect(issues).toHaveLength(0);
  });
});

describe("parseRange / rangeValues", () => {
  it("parses A1-style ranges", () => {
    expect(parseRange("B2:D4")).toEqual({
      startCol: 1,
      startRow: 1,
      endCol: 3,
      endRow: 3,
    });
  });

  it("returns null for malformed input", () => {
    expect(parseRange("hello")).toBeNull();
  });

  it("rangeValues collects numeric cells in range", () => {
    const sheet = wb({ "0,0": "10", "1,0": "20", "2,0": "30", "3,0": "x" }).sheets[0]!;
    expect(rangeValues(sheet, "A1:A4")).toEqual([10, 20, 30]);
  });
});

describe("forecastSeries", () => {
  it("recovers a perfect linear trend", () => {
    const f = forecastSeries([1, 2, 3, 4, 5], 3);
    expect(f.slope).toBeCloseTo(1, 6);
    expect(f.intercept).toBeCloseTo(1, 6);
    expect(f.r2).toBeCloseTo(1, 6);
    expect(f.predictions[0]).toBeCloseTo(6, 6);
    expect(f.predictions[1]).toBeCloseTo(7, 6);
    expect(f.predictions[2]).toBeCloseTo(8, 6);
  });

  it("handles 2-point series", () => {
    const f = forecastSeries([10, 20], 2);
    expect(f.predictions[0]).toBeCloseTo(30, 6);
    expect(f.predictions[1]).toBeCloseTo(40, 6);
  });

  it("returns flat predictions on a constant series", () => {
    const f = forecastSeries([5, 5, 5, 5], 2);
    expect(f.slope).toBe(0);
    expect(f.predictions).toEqual([5, 5]);
  });
});

describe("forecastFromWorkbook", () => {
  it("forecasts from a sheet range", () => {
    const w = wb({ "0,0": "1", "1,0": "2", "2,0": "3", "3,0": "4" });
    const r = forecastFromWorkbook(w, { sheet: "Sheet1", range: "A1:A4", periods: 2 });
    expect("predictions" in r).toBe(true);
    if ("predictions" in r) {
      expect(r.predictions[0]).toBeCloseTo(5, 6);
    }
  });

  it("returns error for unknown sheet", () => {
    const r = forecastFromWorkbook(wb({}), { sheet: "Nope", range: "A1:A4", periods: 1 });
    expect("error" in r).toBe(true);
  });

  it("returns error when fewer than 2 numeric values", () => {
    const r = forecastFromWorkbook(wb({ "0,0": "5" }), {
      sheet: "Sheet1",
      range: "A1:A4",
      periods: 1,
    });
    expect("error" in r).toBe(true);
  });
});
