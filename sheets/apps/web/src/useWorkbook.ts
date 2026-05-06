import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { CalcEngine, aiRegistry, type CellComputed } from "@aicell/calc";
import {
  type Workbook,
  type Sheet,
  type Cell,
  type ChartSpec,
  type CellFormat,
  type CellComment,
  type ConditionalRule,
  cellKey,
} from "@aicell/shared";
import type { Range } from "./clipboard";
import { mergeFormat } from "./format";
import { callAiCell, isOffline } from "./api";

if (!isOffline) {
  aiRegistry.setRunner(({ fn, prompt, args }) => callAiCell({ fn, prompt, args }));
}

export type CellEdit = { row: number; col: number; raw?: string; cell?: Cell | null };

export type WorkbookApi = {
  workbook: Workbook;
  activeSheet: Sheet;
  /** Bumped on every recalc so the grid re-renders */
  version: number;
  setActiveSheet: (id: string) => void;
  setCell: (row: number, col: number, raw: string) => void;
  getRaw: (row: number, col: number) => string;
  getComputed: (row: number, col: number) => CellComputed;
  getComputedOnSheet: (sheetName: string, row: number, col: number) => CellComputed;
  recalculate: () => void;
  loadSheet: (sheet: Sheet) => void;
  replaceWorkbook: (wb: Workbook) => void;
  addSheet: () => void;
  setCellOnSheet: (sheetName: string, row: number, col: number, raw: string) => void;
  /** Apply many cell edits as a single undo step. */
  setCellsOnSheetBatch: (sheetName: string, edits: CellEdit[]) => void;
  addSheetByName: (name: string) => void;
  addChart: (sheetName: string, spec: Omit<ChartSpec, "id">) => void;
  removeChart: (sheetName: string, chartId: string) => void;
  /** Set a single column's width (px). Pushes one undo step per call. */
  setColWidth: (sheetName: string, col: number, width: number) => void;
  insertRows: (sheetName: string, row: number, count?: number) => void;
  deleteRows: (sheetName: string, row: number, count?: number) => void;
  insertCols: (sheetName: string, col: number, count?: number) => void;
  deleteCols: (sheetName: string, col: number, count?: number) => void;
  /** Apply a format patch to every cell in the range. One undo step. */
  applyFormat: (sheetName: string, range: Range, patch: Partial<CellFormat>) => void;
  /** Remove all formatting from every cell in the range. One undo step. */
  clearFormat: (sheetName: string, range: Range) => void;
  getCellFormat: (row: number, col: number) => CellFormat | undefined;
  getCellComment: (row: number, col: number) => CellComment | undefined;
  setCellComment: (sheetName: string, row: number, col: number, text: string, author?: string) => void;
  clearCellComment: (sheetName: string, row: number, col: number) => void;
  addConditionalRule: (sheetName: string, rule: ConditionalRule) => void;
  removeConditionalRule: (sheetName: string, ruleId: string) => void;
  /** Undo / redo over workbook snapshots. */
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

const HISTORY_LIMIT = 100;

const newBlankSheet = (): Sheet => ({
  id: "sheet-1",
  name: "Sheet1",
  cells: {},
  rowCount: 1000,
  colCount: 26,
});

export const newBlankWorkbook = (id: string, name = "Untitled"): Workbook => ({
  id,
  name,
  sheets: [newBlankSheet()],
});

const cloneWorkbook = (wb: Workbook): Workbook =>
  typeof structuredClone === "function" ? structuredClone(wb) : JSON.parse(JSON.stringify(wb));

function nextCellWithRaw(existing: Cell | undefined, raw: string): Cell | undefined {
  if (raw === "") {
    if (!existing?.format && !existing?.comment) return undefined;
    return { ...existing, raw: "" };
  }
  return existing ? { ...existing, raw } : { raw };
}

function cloneCell(cell: Cell): Cell {
  return {
    ...cell,
    format: cell.format ? { ...cell.format } : undefined,
    comment: cell.comment ? { ...cell.comment } : undefined,
  };
}

function cellFromEdit(existing: Cell | undefined, edit: CellEdit): Cell | undefined {
  if ("cell" in edit) return edit.cell ? cloneCell(edit.cell) : undefined;
  return nextCellWithRaw(existing, edit.raw ?? "");
}

function parseCellKey(key: string): [number, number] {
  const [r = "0", c = "0"] = key.split(",");
  return [Number(r), Number(c)];
}

/** Suffix the proposed name with " (2)", " (3)", … until it doesn't collide. */
function uniqueSheetName(proposed: string, existing: Sheet[]): string {
  const taken = new Set(existing.map((s) => s.name));
  if (!taken.has(proposed)) return proposed;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${proposed} (${n})`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${proposed} (${Date.now()})`;
}

export function useWorkbook(): WorkbookApi {
  const engineRef = useRef<CalcEngine | null>(null);
  if (engineRef.current === null) {
    engineRef.current = new CalcEngine();
  }
  const getEngine = () => {
    if (!engineRef.current) throw new Error("CalcEngine not initialized");
    return engineRef.current;
  };

  const [workbook, setWorkbook] = useState<Workbook>(() =>
    newBlankWorkbook("wb-default")
  );
  const [activeSheetId, setActiveSheetId] = useState<string>("sheet-1");
  const [version, setVersion] = useState(0);

  // History stacks of full workbook snapshots. Each push is one undo step.
  const pastRef = useRef<Workbook[]>([]);
  const futureRef = useRef<Workbook[]>([]);
  const [historyTick, setHistoryTick] = useState(0);
  const workbookRef = useRef(workbook);
  workbookRef.current = workbook;

  const pushHistory = useCallback(() => {
    pastRef.current.push(cloneWorkbook(workbookRef.current));
    if (pastRef.current.length > HISTORY_LIMIT) pastRef.current.shift();
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  }, []);

  const activeSheet = useMemo(
    () => workbook.sheets.find((s) => s.id === activeSheetId) ?? workbook.sheets[0]!,
    [workbook, activeSheetId]
  );

  const initLoadedRef = useRef(false);
  useEffect(() => {
    if (initLoadedRef.current) return;
    initLoadedRef.current = true;
    getEngine().loadSheet(activeSheet);
    setVersion((v) => v + 1);
  }, [activeSheet]);

  useEffect(() => {
    return aiRegistry.subscribe(() => {
      engineRef.current?.recalculate();
      setVersion((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.destroy();
      engineRef.current = null;
    };
  }, []);

  const reloadEngine = useCallback((wb: Workbook) => {
    engineRef.current?.destroy();
    engineRef.current = new CalcEngine();
    for (const s of wb.sheets) engineRef.current.loadSheet(s);
  }, []);

  const setCell = useCallback(
    (row: number, col: number, raw: string) => {
      pushHistory();
      const key = cellKey(row, col);
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.id !== activeSheetId) return s;
          const cells = { ...s.cells };
          const existing = cells[key];
          const next = nextCellWithRaw(existing, raw);
          if (next) cells[key] = next;
          else delete cells[key];
          return {
            ...s,
            cells,
            rowCount: Math.max(s.rowCount, row + 1),
            colCount: Math.max(s.colCount, col + 1),
          };
        });
        return { ...wb, sheets };
      });
      const sheetName = activeSheet.name;
      getEngine().setCell(sheetName, row, col, raw);
      setVersion((v) => v + 1);
    },
    [activeSheetId, activeSheet.name, pushHistory]
  );

  const getRaw = useCallback(
    (row: number, col: number): string => {
      const cell = activeSheet.cells[cellKey(row, col)];
      return cell ? cell.raw : "";
    },
    [activeSheet]
  );

  const getComputed = useCallback(
    (row: number, col: number): CellComputed => {
      void version;
      return getEngine().getValue(activeSheet.name, row, col);
    },
    [activeSheet.name, version]
  );

  const getComputedOnSheet = useCallback(
    (sheetName: string, row: number, col: number): CellComputed => {
      void version;
      try {
        return getEngine().getValue(sheetName, row, col);
      } catch {
        return { value: null };
      }
    },
    [version]
  );

  const recalculate = useCallback(() => {
    getEngine().recalculate();
    setVersion((v) => v + 1);
  }, []);

  const loadSheet = useCallback(
    (sheet: Sheet) => {
      pushHistory();
      const wb = workbookRef.current;
      const sameId = wb.sheets.find((s) => s.id === sheet.id);
      // Same-id replacement keeps the existing name; otherwise dedupe the
      // incoming name against existing sheets so the calc engine (keyed by
      // name) doesn't conflate two workbook sheets.
      const finalName = sameId ? sheet.name : uniqueSheetName(sheet.name, wb.sheets);
      const finalSheet: Sheet = finalName === sheet.name ? sheet : { ...sheet, name: finalName };
      getEngine().loadSheet(finalSheet);
      setWorkbook((cur) => {
        const exists = cur.sheets.some((s) => s.id === finalSheet.id);
        const sheets = exists
          ? cur.sheets.map((s) => (s.id === finalSheet.id ? finalSheet : s))
          : [...cur.sheets, finalSheet];
        return { ...cur, sheets };
      });
      setActiveSheetId(finalSheet.id);
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const replaceWorkbook = useCallback(
    (wb: Workbook) => {
      // Discard undo history that belonged to the previous workbook so a
      // post-replace Undo can't resurrect a snapshot of a different workbook
      // (and have autosave persist the resurrection).
      pastRef.current = [];
      futureRef.current = [];
      setHistoryTick((t) => t + 1);
      reloadEngine(wb);
      setWorkbook(wb);
      setActiveSheetId(wb.sheets[0]?.id ?? "sheet-1");
      setVersion((v) => v + 1);
    },
    [reloadEngine]
  );

  const addSheet = useCallback(() => {
    pushHistory();
    const id = `sheet-${Date.now()}`;
    setWorkbook((wb) => {
      const n = wb.sheets.length + 1;
      const name = `Sheet${n}`;
      const sheet: Sheet = { id, name, cells: {}, rowCount: 1000, colCount: 26 };
      getEngine().loadSheet(sheet);
      return { ...wb, sheets: [...wb.sheets, sheet] };
    });
    setActiveSheetId(id);
    setVersion((v) => v + 1);
  }, [pushHistory]);

  const addSheetByName = useCallback(
    (name: string) => {
      const wb = workbookRef.current;
      const existing = wb.sheets.find((s) => s.name === name);
      if (existing) {
        setActiveSheetId(existing.id);
        return;
      }
      pushHistory();
      const id = `sheet-${Date.now()}-${wb.sheets.length}`;
      setWorkbook((cur) => {
        if (cur.sheets.some((s) => s.name === name)) return cur;
        const sheet: Sheet = { id, name, cells: {}, rowCount: 1000, colCount: 26 };
        getEngine().loadSheet(sheet);
        return { ...cur, sheets: [...cur.sheets, sheet] };
      });
      setActiveSheetId(id);
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const setCellOnSheet = useCallback(
    (sheetName: string, row: number, col: number, raw: string) => {
      pushHistory();
      const key = cellKey(row, col);
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const cells = { ...s.cells };
          const existing = cells[key];
          const next = nextCellWithRaw(existing, raw);
          if (next) cells[key] = next;
          else delete cells[key];
          return {
            ...s,
            cells,
            rowCount: Math.max(s.rowCount, row + 1),
            colCount: Math.max(s.colCount, col + 1),
          };
        });
        return { ...wb, sheets };
      });
      try {
        getEngine().setCell(sheetName, row, col, raw);
      } catch {
        // Sheet may not exist in engine yet (just-created); skip silently
      }
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const setCellsOnSheetBatch = useCallback(
    (sheetName: string, edits: CellEdit[]) => {
      if (edits.length === 0) return;
      const targetSheet = workbookRef.current.sheets.find((s) => s.name === sheetName);
      if (!targetSheet) {
        console.warn(`setCellsOnSheetBatch: unknown sheet "${sheetName}", skipping`);
        return;
      }
      pushHistory();
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const cells = { ...s.cells };
          let rowCount = s.rowCount;
          let colCount = s.colCount;
          for (const e of edits) {
            const key = cellKey(e.row, e.col);
            const existing = cells[key];
            const next = cellFromEdit(existing, e);
            if (next) cells[key] = next;
            else delete cells[key];
            if (e.row + 1 > rowCount) rowCount = e.row + 1;
            if (e.col + 1 > colCount) colCount = e.col + 1;
          }
          return { ...s, cells, rowCount, colCount };
        });
        return { ...wb, sheets };
      });
      const eng = getEngine();
      for (const e of edits) {
        try {
          eng.setCell(sheetName, e.row, e.col, "cell" in e ? e.cell?.raw ?? "" : e.raw ?? "");
        } catch {
          // ignore — engine will catch up on next reload
        }
      }
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const addChart = useCallback(
    (sheetName: string, spec: Omit<ChartSpec, "id">) => {
      pushHistory();
      const id = `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const charts = [...(s.charts ?? []), { id, ...spec }];
          return { ...s, charts };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const removeChart = useCallback(
    (sheetName: string, chartId: string) => {
      pushHistory();
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const charts = (s.charts ?? []).filter((c) => c.id !== chartId);
          return { ...s, charts };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const applyFormat = useCallback(
    (sheetName: string, range: Range, patch: Partial<CellFormat>) => {
      const norm = {
        startRow: Math.min(range.startRow, range.endRow),
        endRow: Math.max(range.startRow, range.endRow),
        startCol: Math.min(range.startCol, range.endCol),
        endCol: Math.max(range.startCol, range.endCol),
      };
      pushHistory();
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const cells = { ...s.cells };
          for (let r = norm.startRow; r <= norm.endRow; r++) {
            for (let c = norm.startCol; c <= norm.endCol; c++) {
              const key = cellKey(r, c);
              const existing = cells[key];
              const merged = mergeFormat(existing?.format, patch);
              if (existing) {
                if (merged) cells[key] = { ...existing, format: merged };
                else if (existing.raw === "" && !existing.comment) delete cells[key];
                else {
                  const next = { ...existing };
                  delete next.format;
                  cells[key] = next;
                }
              } else if (merged) {
                cells[key] = { raw: "", format: merged };
              }
            }
          }
          return { ...s, cells };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const clearFormat = useCallback(
    (sheetName: string, range: Range) => {
      const norm = {
        startRow: Math.min(range.startRow, range.endRow),
        endRow: Math.max(range.startRow, range.endRow),
        startCol: Math.min(range.startCol, range.endCol),
        endCol: Math.max(range.startCol, range.endCol),
      };
      pushHistory();
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const cells = { ...s.cells };
          for (let r = norm.startRow; r <= norm.endRow; r++) {
            for (let c = norm.startCol; c <= norm.endCol; c++) {
              const key = cellKey(r, c);
              const existing = cells[key];
              if (!existing) continue;
              if (existing.raw === "" && !existing.comment) delete cells[key];
              else {
                const next = { ...existing };
                delete next.format;
                cells[key] = next;
              }
            }
          }
          return { ...s, cells };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const getCellFormat = useCallback(
    (row: number, col: number): CellFormat | undefined => {
      return activeSheet.cells[cellKey(row, col)]?.format;
    },
    [activeSheet]
  );

  const getCellComment = useCallback(
    (row: number, col: number): CellComment | undefined => {
      return activeSheet.cells[cellKey(row, col)]?.comment;
    },
    [activeSheet]
  );

  const setCellComment = useCallback(
    (sheetName: string, row: number, col: number, text: string, author?: string) => {
      pushHistory();
      const key = cellKey(row, col);
      const comment: CellComment = { text, author, ts: Date.now() };
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const cells = { ...s.cells };
          const existing = cells[key];
          cells[key] = existing ? { ...existing, comment } : { raw: "", comment };
          return { ...s, cells };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const clearCellComment = useCallback(
    (sheetName: string, row: number, col: number) => {
      pushHistory();
      const key = cellKey(row, col);
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const cells = { ...s.cells };
          const existing = cells[key];
          if (!existing) return s;
          if (existing.raw === "" && !existing.format) {
            delete cells[key];
          } else {
            const next = { ...existing };
            delete next.comment;
            cells[key] = next;
          }
          return { ...s, cells };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const addConditionalRule = useCallback(
    (sheetName: string, rule: ConditionalRule) => {
      pushHistory();
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const conditionalRules = [...(s.conditionalRules ?? []), rule];
          return { ...s, conditionalRules };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const removeConditionalRule = useCallback(
    (sheetName: string, ruleId: string) => {
      pushHistory();
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const conditionalRules = (s.conditionalRules ?? []).filter((r) => r.id !== ruleId);
          return { ...s, conditionalRules };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const setColWidth = useCallback(
    (sheetName: string, col: number, width: number) => {
      pushHistory();
      setWorkbook((wb) => {
        const sheets = wb.sheets.map((s) => {
          if (s.name !== sheetName) return s;
          const colWidths = { ...(s.colWidths ?? {}), [col]: Math.max(24, Math.round(width)) };
          return { ...s, colWidths };
        });
        return { ...wb, sheets };
      });
      setVersion((v) => v + 1);
    },
    [pushHistory]
  );

  const transformSheetStructure = useCallback(
    (sheetName: string, transform: (sheet: Sheet) => Sheet) => {
      const current = workbookRef.current;
      if (!current.sheets.some((s) => s.name === sheetName)) return;
      pushHistory();
      const next = {
        ...current,
        sheets: current.sheets.map((s) => (s.name === sheetName ? transform(s) : s)),
      };
      reloadEngine(next);
      setWorkbook(next);
      setVersion((v) => v + 1);
    },
    [pushHistory, reloadEngine]
  );

  const insertRows = useCallback(
    (sheetName: string, row: number, count = 1) => {
      const amount = Math.max(1, Math.floor(count));
      transformSheetStructure(sheetName, (sheet) => {
        const at = Math.max(0, Math.min(row, sheet.rowCount));
        const cells: Record<string, Cell> = {};
        for (const [key, cell] of Object.entries(sheet.cells)) {
          const [r, c] = parseCellKey(key);
          cells[cellKey(r >= at ? r + amount : r, c)] = cloneCell(cell);
        }
        return { ...sheet, cells, rowCount: sheet.rowCount + amount };
      });
    },
    [transformSheetStructure]
  );

  const deleteRows = useCallback(
    (sheetName: string, row: number, count = 1) => {
      const amount = Math.max(1, Math.floor(count));
      transformSheetStructure(sheetName, (sheet) => {
        const at = Math.max(0, Math.min(row, sheet.rowCount - 1));
        const cells: Record<string, Cell> = {};
        for (const [key, cell] of Object.entries(sheet.cells)) {
          const [r, c] = parseCellKey(key);
          if (r >= at && r < at + amount) continue;
          cells[cellKey(r >= at + amount ? r - amount : r, c)] = cloneCell(cell);
        }
        return { ...sheet, cells, rowCount: Math.max(1, sheet.rowCount - amount) };
      });
    },
    [transformSheetStructure]
  );

  const insertCols = useCallback(
    (sheetName: string, col: number, count = 1) => {
      const amount = Math.max(1, Math.floor(count));
      transformSheetStructure(sheetName, (sheet) => {
        const at = Math.max(0, Math.min(col, sheet.colCount));
        const cells: Record<string, Cell> = {};
        for (const [key, cell] of Object.entries(sheet.cells)) {
          const [r, c] = parseCellKey(key);
          cells[cellKey(r, c >= at ? c + amount : c)] = cloneCell(cell);
        }
        const colWidths: Record<number, number> = {};
        for (const [key, width] of Object.entries(sheet.colWidths ?? {})) {
          const c = Number(key);
          colWidths[c >= at ? c + amount : c] = width;
        }
        return { ...sheet, cells, colWidths, colCount: sheet.colCount + amount };
      });
    },
    [transformSheetStructure]
  );

  const deleteCols = useCallback(
    (sheetName: string, col: number, count = 1) => {
      const amount = Math.max(1, Math.floor(count));
      transformSheetStructure(sheetName, (sheet) => {
        const at = Math.max(0, Math.min(col, sheet.colCount - 1));
        const cells: Record<string, Cell> = {};
        for (const [key, cell] of Object.entries(sheet.cells)) {
          const [r, c] = parseCellKey(key);
          if (c >= at && c < at + amount) continue;
          cells[cellKey(r, c >= at + amount ? c - amount : c)] = cloneCell(cell);
        }
        const colWidths: Record<number, number> = {};
        for (const [key, width] of Object.entries(sheet.colWidths ?? {})) {
          const c = Number(key);
          if (c >= at && c < at + amount) continue;
          colWidths[c >= at + amount ? c - amount : c] = width;
        }
        return { ...sheet, cells, colWidths, colCount: Math.max(1, sheet.colCount - amount) };
      });
    },
    [transformSheetStructure]
  );

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(cloneWorkbook(workbookRef.current));
    reloadEngine(prev);
    setWorkbook(prev);
    if (!prev.sheets.find((s) => s.id === activeSheetId)) {
      setActiveSheetId(prev.sheets[0]?.id ?? "sheet-1");
    }
    setVersion((v) => v + 1);
    setHistoryTick((t) => t + 1);
  }, [reloadEngine, activeSheetId]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(cloneWorkbook(workbookRef.current));
    reloadEngine(next);
    setWorkbook(next);
    if (!next.sheets.find((s) => s.id === activeSheetId)) {
      setActiveSheetId(next.sheets[0]?.id ?? "sheet-1");
    }
    setVersion((v) => v + 1);
    setHistoryTick((t) => t + 1);
  }, [reloadEngine, activeSheetId]);

  void historyTick;
  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return {
    workbook,
    activeSheet,
    version,
    setActiveSheet: setActiveSheetId,
    setCell,
    getRaw,
    getComputed,
    getComputedOnSheet,
    recalculate,
    loadSheet,
    replaceWorkbook,
    addSheet,
    addSheetByName,
    setCellOnSheet,
    setCellsOnSheetBatch,
    addChart,
    removeChart,
    setColWidth,
    insertRows,
    deleteRows,
    insertCols,
    deleteCols,
    applyFormat,
    clearFormat,
    getCellFormat,
    getCellComment,
    setCellComment,
    clearCellComment,
    addConditionalRule,
    removeConditionalRule,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
