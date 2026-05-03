import { describe, expect, it } from "vitest";
import { parseCsv, unparseCsv } from "./csv";
import { buildXlsx, parseXlsx } from "./xlsx";

describe("csv codec", () => {
  it("round-trips a simple table", () => {
    const rows = [
      ["name", "score"],
      ["Ada", "10"],
      ["Linus", "7"],
    ];
    const text = unparseCsv(rows);
    expect(parseCsv(text)).toEqual(rows);
  });

  it("preserves embedded commas, quotes, and newlines", () => {
    const rows = [
      ["a", "b"],
      ["he said \"hi\"", "1,2,3"],
      ["line1\nline2", "x"],
    ];
    expect(parseCsv(unparseCsv(rows))).toEqual(rows);
  });

  it("normalizes nullish cells to empty strings", () => {
    const text = "a,b\n,2";
    expect(parseCsv(text)).toEqual([
      ["a", "b"],
      ["", "2"],
    ]);
  });
});

describe("xlsx codec", () => {
  it("round-trips multi-sheet workbooks", () => {
    const sheets = [
      { name: "Numbers", rows: [["1", "2"], ["3", "4"]] },
      { name: "Letters", rows: [["a", "b"], ["c", "d"]] },
    ];
    const buf = buildXlsx(sheets);
    const parsed = parseXlsx(buf);
    expect(parsed.map((s) => s.name)).toEqual(["Numbers", "Letters"]);
    expect(parsed[0]!.rows).toEqual(sheets[0]!.rows);
    expect(parsed[1]!.rows).toEqual(sheets[1]!.rows);
  });

  it("emits at least one sheet when given an empty list", () => {
    const buf = buildXlsx([]);
    const parsed = parseXlsx(buf);
    expect(parsed.length).toBeGreaterThan(0);
  });
});
