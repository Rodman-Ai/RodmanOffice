import { HyperFormula, type RawCellContent } from "hyperformula";
import type { Sheet, CellValue } from "@aicell/shared";
import { ensureAIPluginRegistered, aiRegistry } from "./ai-plugin";

export type CellComputed = {
  value: CellValue;
  error?: string;
};

export { aiRegistry } from "./ai-plugin";
export type { AIRunner, CellFn } from "./ai-plugin";
export { AI_LOADING } from "./ai-plugin";

/**
 * Thin wrapper around HyperFormula for a single workbook.
 * Phase 0: in-memory only, single sheet at a time per engine instance is fine.
 */
export class CalcEngine {
  private hf: HyperFormula;
  private sheetIdByName = new Map<string, number>();

  constructor() {
    ensureAIPluginRegistered();
    this.hf = HyperFormula.buildEmpty({
      licenseKey: "gpl-v3",
      language: "enGB",
    });
  }

  /** Force HyperFormula to re-evaluate every cell — used when the AI cache updates. */
  recalculate(): void {
    this.hf.rebuildAndRecalculate();
  }

  /** For host apps to subscribe to cache invalidation. */
  onAIUpdate(fn: () => void): () => void {
    return aiRegistry.subscribe(fn);
  }

  loadSheet(sheet: Sheet): void {
    if (this.sheetIdByName.has(sheet.name)) {
      const id = this.sheetIdByName.get(sheet.name)!;
      this.hf.clearSheet(id);
    } else {
      this.hf.addSheet(sheet.name);
      const id = this.hf.getSheetId(sheet.name);
      if (id === undefined) throw new Error(`Failed to add sheet ${sheet.name}`);
      this.sheetIdByName.set(sheet.name, id);
    }
    const sheetId = this.sheetIdByName.get(sheet.name)!;

    const data: RawCellContent[][] = [];
    for (let r = 0; r < sheet.rowCount; r++) {
      const row: RawCellContent[] = [];
      for (let c = 0; c < sheet.colCount; c++) {
        const cell = sheet.cells[`${r},${c}`];
        row.push(cell ? cell.raw : null);
      }
      data.push(row);
    }
    this.hf.setSheetContent(sheetId, data);
  }

  setCell(sheetName: string, row: number, col: number, raw: string): void {
    const sheetId = this.sheetIdByName.get(sheetName);
    if (sheetId === undefined) throw new Error(`Unknown sheet ${sheetName}`);
    this.hf.setCellContents({ sheet: sheetId, row, col }, raw === "" ? null : raw);
  }

  getValue(sheetName: string, row: number, col: number): CellComputed {
    const sheetId = this.sheetIdByName.get(sheetName);
    if (sheetId === undefined) return { value: null };
    const v = this.hf.getCellValue({ sheet: sheetId, row, col });
    if (v === null || v === undefined) return { value: null };
    if (typeof v === "object" && "type" in v) {
      // DetailedCellError
      return { value: null, error: String((v as { value?: unknown }).value ?? v) };
    }
    return { value: v as CellValue };
  }

  destroy(): void {
    this.hf.destroy();
  }
}
