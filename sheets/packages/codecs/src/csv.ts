import Papa from "papaparse";

export function parseCsv(text: string): string[][] {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: false });
  return parsed.data.map((row) => (row ?? []).map((v) => (v == null ? "" : String(v))));
}

export function unparseCsv(rows: string[][]): string {
  return Papa.unparse(rows);
}
