import { lazy, Suspense, useState, useRef, useEffect, useCallback, type ChangeEvent } from "react";
import { a1, type Cell, type ChartType, type Workbook, cellKey } from "@aicell/shared";
import { useWorkbook, newBlankWorkbook, type CellEdit } from "./useWorkbook";
import { Grid } from "./Grid";
import { SidePanel } from "./SidePanel";
import { SheetTabs } from "./SheetTabs";
import { Ribbon, type RibbonActions } from "./Ribbon";
import { useReturnFocusOnClose } from "./useReturnFocusOnClose";
import type { CellFormat } from "@aicell/shared";
import {
  parseTSV,
  serializeCell,
  serializeRange,
  normalizeRange,
  rangeCellCount,
  type Range,
} from "./clipboard";
import { listWorkbooks, loadWorkbook, saveWorkbook, getHealth, isOffline } from "./api";
import type { FunctionCategory } from "./functions";

const ChartStrip = lazy(() => import("./ChartStrip").then((m) => ({ default: m.ChartStrip })));
const FunctionPicker = lazy(() => import("./FunctionPicker").then((m) => ({ default: m.FunctionPicker })));
const FindReplace = lazy(() => import("./FindReplace").then((m) => ({ default: m.FindReplace })));
const ConditionalFormatModal = lazy(() => import("./ConditionalFormatModal").then((m) => ({ default: m.ConditionalFormatModal })));
const CommentModal = lazy(() => import("./CommentModal").then((m) => ({ default: m.CommentModal })));
const AuditPanel = lazy(() => import("./AuditPanel").then((m) => ({ default: m.AuditPanel })));

const AUTOSAVE_DEBOUNCE_MS = 800;
const REPO_URL = "https://github.com/Rodman-Ai/RodmanOffice";
const SUPPORT_URL = `${REPO_URL}/issues/new?labels=support`;
const FEEDBACK_URL = `${REPO_URL}/issues/new?labels=feedback`;

type HelpTopic = "whatsNew" | "training" | "install";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const modKey = isMac ? "⌘" : "Ctrl";

const ORIGIN_RANGE: Range = { startRow: 0, startCol: 0, endRow: 0, endCol: 0 };

export function App() {
  const api = useWorkbook();
  const [selection, setSelection] = useState<Range>({
    startRow: 0,
    startCol: 0,
    endRow: 0,
    endCol: 0,
  });
  const anchor = { row: selection.startRow, col: selection.startCol };
  const [busy, setBusy] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [aiEnabled, setAiEnabled] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCategory, setPickerCategory] = useState<FunctionCategory | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [cfOpen, setCfOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [helpTopic, setHelpTopic] = useState<HelpTopic | null>(null);
  const [showGridlines, setShowGridlines] = useState(true);
  const [showHeadings, setShowHeadings] = useState(true);
  const [showFormulas, setShowFormulas] = useState(false);
  const [focusCell, setFocusCell] = useState(false);
  const [formatPainter, setFormatPainter] = useState<
    { row: number; col: number; source: Range; format: CellFormat | undefined } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const formulaEditRef = useRef<{ row: number; col: number; raw: string } | null>(null);

  const bootedRef = useRef(false);
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    if (isOffline) return;
    (async () => {
      try {
        const health = await getHealth();
        setAiEnabled(health.ai);
        const list = await listWorkbooks();
        if (list.length > 0) {
          const wb = await loadWorkbook(list[0]!.id);
          if (wb) {
            api.replaceWorkbook(wb);
            setSelection(ORIGIN_RANGE);
            return;
          }
        }
        const seed = newBlankWorkbook("wb-default");
        await saveWorkbook(seed);
        api.replaceWorkbook(seed);
        setSelection(ORIGIN_RANGE);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setBootError(`Could not reach API at /api: ${msg}`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastSavedRef = useRef<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (bootError || isOffline) return;
    const serialized = JSON.stringify(api.workbook);
    if (lastSavedRef.current === serialized) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persist(api.workbook, serialized);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.workbook, bootError]);

  async function persist(wb: Workbook, serialized: string): Promise<void> {
    setSaveState({ kind: "saving" });
    try {
      const meta = await saveWorkbook(wb);
      lastSavedRef.current = serialized;
      setSaveState({ kind: "saved", at: meta.updatedAt });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveState({ kind: "error", message: msg });
    }
  }

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { importSpreadsheetFile } = await import("./csv");
      const sheets = await importSpreadsheetFile(file);
      const [first, ...rest] = sheets;
      if (first) api.loadSheet(first);
      for (const s of rest) api.loadSheet(s);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const insertFunctionAtSelection = useCallback(
    (name: string) => {
      api.setCell(anchor.row, anchor.col, `=${name}(`);
      setTimeout(() => formulaInputRef.current?.focus(), 0);
    },
    [api, anchor.row, anchor.col]
  );

  const onCopy = useCallback(async () => {
    const text =
      rangeCellCount(selection) === 1
        ? serializeCell(api.activeSheet, anchor.row, anchor.col)
        : serializeRange(api.activeSheet, selection);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard may be blocked (insecure context) — silently no-op.
    }
  }, [api.activeSheet, selection, anchor.row, anchor.col]);

  const clearRange = useCallback(() => {
    const norm = normalizeRange(selection);
    const edits = [];
    for (let r = norm.startRow; r <= norm.endRow; r++) {
      for (let c = norm.startCol; c <= norm.endCol; c++) {
        edits.push({ row: r, col: c, raw: "" });
      }
    }
    api.setCellsOnSheetBatch(api.activeSheet.name, edits);
  }, [api, selection]);

  const onCut = useCallback(async () => {
    await onCopy();
    clearRange();
  }, [onCopy, clearRange]);

  const onPaste = useCallback(async () => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (text === "") return;
    const grid = parseTSV(text);
    if (grid.length === 1 && grid[0]!.length === 1) {
      api.setCell(anchor.row, anchor.col, grid[0]![0]!);
      return;
    }
    const edits = [];
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r]!;
      for (let c = 0; c < row.length; c++) {
        edits.push({
          row: anchor.row + r,
          col: anchor.col + c,
          raw: row[c] ?? "",
        });
      }
    }
    api.setCellsOnSheetBatch(api.activeSheet.name, edits);
  }, [api, anchor.row, anchor.col]);

  const onPasteValues = useCallback(async () => {
    await onPaste();
  }, [onPaste]);

  const onClearSelection = useCallback(() => {
    clearRange();
  }, [clearRange]);

  const clearCommentsInSelection = useCallback(() => {
    const norm = normalizeRange(selection);
    const edits: CellEdit[] = [];
    for (let r = norm.startRow; r <= norm.endRow; r++) {
      for (let c = norm.startCol; c <= norm.endCol; c++) {
        const key = cellKey(r, c);
        const existing = api.activeSheet.cells[key];
        if (!existing?.comment) continue;
        const next: Cell = { ...existing };
        delete next.comment;
        edits.push({
          row: r,
          col: c,
          cell: next.raw === "" && !next.format ? null : next,
        });
      }
    }
    api.setCellsOnSheetBatch(api.activeSheet.name, edits);
  }, [api, selection]);

  const applyFormatPatch = useCallback(
    (patch: Partial<CellFormat>) => {
      api.applyFormat(api.activeSheet.name, selection, patch);
    },
    [api, selection]
  );

  const clearFormatRange = useCallback(() => {
    api.clearFormat(api.activeSheet.name, selection);
  }, [api, selection]);

  const anchorFormat = api.getCellFormat(anchor.row, anchor.col);

  const startFormatPainter = useCallback(() => {
    setFormatPainter({
      row: anchor.row,
      col: anchor.col,
      source: { ...selection },
      format: anchorFormat ? { ...anchorFormat } : undefined,
    });
  }, [anchor.row, anchor.col, anchorFormat, selection]);

  useEffect(() => {
    if (!formatPainter) return;
    const sameSource =
      selection.startRow === formatPainter.source.startRow &&
      selection.endRow === formatPainter.source.endRow &&
      selection.startCol === formatPainter.source.startCol &&
      selection.endCol === formatPainter.source.endCol;
    if (sameSource) return;
    api.clearFormat(api.activeSheet.name, selection);
    if (formatPainter.format) api.applyFormat(api.activeSheet.name, selection, formatPainter.format);
    setFormatPainter(null);
  }, [api, formatPainter, selection]);

  const insertTodayShortcut = useCallback(() => {
    api.setCell(anchor.row, anchor.col, "=TODAY()");
  }, [api, anchor.row, anchor.col]);

  const insertNowShortcut = useCallback(() => {
    api.setCell(anchor.row, anchor.col, "=NOW()");
  }, [api, anchor.row, anchor.col]);

  const selectAll = useCallback(() => {
    setSelection({
      startRow: 0,
      startCol: 0,
      endRow: api.activeSheet.rowCount - 1,
      endCol: api.activeSheet.colCount - 1,
    });
  }, [api.activeSheet]);

  // Global keyboard shortcuts. Skip when typing in any input/textarea (the
  // grid's inline editor and the formula bar still get to handle their own
  // typing) — except for ⌘Z/⌘V/⌘C which native inputs already handle natively
  // anyway, so passing through is fine.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;

      if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        if (inEditable) return;
        e.preventDefault();
        api.undo();
      } else if (
        mod &&
        ((e.shiftKey && (e.key === "z" || e.key === "Z")) ||
          e.key === "y" || e.key === "Y")
      ) {
        if (inEditable) return;
        e.preventDefault();
        api.redo();
      } else if (mod && (e.key === "c" || e.key === "C")) {
        if (inEditable) return;
        e.preventDefault();
        void onCopy();
      } else if (mod && (e.key === "x" || e.key === "X")) {
        if (inEditable) return;
        e.preventDefault();
        void onCut();
      } else if (mod && (e.key === "v" || e.key === "V")) {
        if (inEditable) return;
        e.preventDefault();
        void onPaste();
      } else if (e.shiftKey && e.key === "F3") {
        e.preventDefault();
        setPickerOpen(true);
      } else if (mod && (e.key === "/" || (e.key === "?" && e.shiftKey))) {
        if (inEditable) return;
        e.preventDefault();
        setPickerOpen(true);
      } else if (mod && e.key === ";" && !e.shiftKey) {
        if (inEditable) return;
        e.preventDefault();
        insertTodayShortcut();
      } else if (mod && e.key === ":" && e.shiftKey) {
        if (inEditable) return;
        e.preventDefault();
        insertNowShortcut();
      } else if (mod && (e.key === "a" || e.key === "A")) {
        if (inEditable) return;
        e.preventDefault();
        selectAll();
      } else if (mod && (e.key === "f" || e.key === "F")) {
        if (inEditable) return;
        e.preventDefault();
        setFindOpen(true);
      } else if (mod && (e.key === "b" || e.key === "B") && !e.shiftKey) {
        if (inEditable) return;
        e.preventDefault();
        applyFormatPatch({ bold: !anchorFormat?.bold });
      } else if (mod && (e.key === "i" || e.key === "I") && !e.shiftKey) {
        if (inEditable) return;
        e.preventDefault();
        applyFormatPatch({ italic: !anchorFormat?.italic });
      } else if (mod && (e.key === "u" || e.key === "U") && !e.shiftKey) {
        if (inEditable) return;
        e.preventDefault();
        applyFormatPatch({ underline: !anchorFormat?.underline });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [api, selection, onCopy, onCut, onPaste, insertTodayShortcut, insertNowShortcut, selectAll, applyFormatPatch, anchorFormat]);

  const triggerImport = () => fileInputRef.current?.click();


  function sortActiveSheetByColumn(col: number, ascending: boolean): void {
    const sheet = api.activeSheet;
    let maxRow = -1;
    let maxCol = -1;
    for (const key of Object.keys(sheet.cells)) {
      const [r, c] = key.split(",").map(Number) as [number, number];
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
    if (maxRow < 0) return;
    const rows: { keyVal: string; cells: (Cell | undefined)[] }[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const cells: (Cell | undefined)[] = [];
      for (let c = 0; c <= maxCol; c++) {
        cells.push(sheet.cells[cellKey(r, c)]);
      }
      rows.push({ keyVal: cells[col]?.raw ?? "", cells });
    }
    rows.sort((a, b) => {
      const an = Number(a.keyVal);
      const bn = Number(b.keyVal);
      const bothNum = !Number.isNaN(an) && !Number.isNaN(bn) && a.keyVal !== "" && b.keyVal !== "";
      const cmp = bothNum ? an - bn : a.keyVal.localeCompare(b.keyVal);
      return ascending ? cmp : -cmp;
    });
    const edits: CellEdit[] = [];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c <= maxCol; c++) {
        edits.push({
          row: r,
          col: c,
          cell: rows[r]!.cells[c] ? { ...rows[r]!.cells[c]! } : null,
        });
      }
    }
    api.setCellsOnSheetBatch(sheet.name, edits);
  }

  function removeDuplicatesInColumn(col: number): void {
    const sheet = api.activeSheet;
    let maxRow = -1;
    let maxCol = -1;
    for (const key of Object.keys(sheet.cells)) {
      const [r, c] = key.split(",").map(Number) as [number, number];
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
    if (maxRow < 0) return;
    const seen = new Set<string>();
    const kept: (Cell | undefined)[][] = [];
    for (let r = 0; r <= maxRow; r++) {
      const v = sheet.cells[cellKey(r, col)]?.raw ?? "";
      if (v === "" || !seen.has(v)) {
        if (v !== "") seen.add(v);
        const row: (Cell | undefined)[] = [];
        for (let c = 0; c <= maxCol; c++) row.push(sheet.cells[cellKey(r, c)]);
        kept.push(row);
      }
    }
    const edits: CellEdit[] = [];
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const cell = r < kept.length ? kept[r]![c] : undefined;
        edits.push({ row: r, col: c, cell: cell ? { ...cell } : null });
      }
    }
    api.setCellsOnSheetBatch(sheet.name, edits);
  }

  function textToColumns(): void {
    const rawDelimiter = window.prompt(
      "Split selected cells by delimiter (comma, tab, semicolon, space, or a custom character):",
      "comma"
    );
    if (rawDelimiter === null) return;
    const key = rawDelimiter.trim().toLowerCase();
    const delimiter =
      key === "comma" ? "," :
      key === "tab" ? "\t" :
      key === "semicolon" ? ";" :
      key === "space" ? " " :
      rawDelimiter;
    if (!delimiter) return;
    const norm = normalizeRange(selection);
    const edits: CellEdit[] = [];
    for (let r = norm.startRow; r <= norm.endRow; r++) {
      for (let c = norm.startCol; c <= norm.endCol; c++) {
        const raw = api.activeSheet.cells[cellKey(r, c)]?.raw ?? "";
        const parts = raw.split(delimiter).slice(0, 32);
        if (parts.length <= 1) continue;
        parts.forEach((part, offset) => {
          edits.push({ row: r, col: c + offset, raw: part.trim() });
        });
      }
    }
    if (!edits.length) {
      window.alert("No selected cells contained that delimiter.");
      return;
    }
    api.setCellsOnSheetBatch(api.activeSheet.name, edits);
  }

  function selectedRowCount(): number {
    const norm = normalizeRange(selection);
    return norm.endRow - norm.startRow + 1;
  }

  function selectedColCount(): number {
    const norm = normalizeRange(selection);
    return norm.endCol - norm.startCol + 1;
  }

  const selRaw = api.getRaw(anchor.row, anchor.col);
  const selComputed = api.getComputed(anchor.row, anchor.col);
  const cellCount = rangeCellCount(selection);
  const norm = normalizeRange(selection);
  const rangeLabel =
    cellCount === 1
      ? a1(anchor.row, anchor.col)
      : `${a1(norm.startRow, norm.startCol)}:${a1(norm.endRow, norm.endCol)} · ${cellCount.toLocaleString()} cells`;
  const baseStatus = `${api.activeSheet.name} · ${api.activeSheet.rowCount.toLocaleString()} rows × ${api.activeSheet.colCount} cols`;
  const status = bootError
    ? bootError
    : busy
      ? "Importing…"
      : isOffline
        ? `Demo mode (no backend) · ${baseStatus}`
        : baseStatus;
  const chartRangeLabel = `${a1(norm.startRow, norm.startCol)}:${a1(norm.endRow, norm.endCol)}`;
  const canInsertChart = norm.endRow > norm.startRow && norm.endCol > norm.startCol;

  function beginFormulaEdit(): void {
    formulaEditRef.current = {
      row: anchor.row,
      col: anchor.col,
      raw: api.getRaw(anchor.row, anchor.col),
    };
  }

  function commitFormulaEdit(): void {
    formulaEditRef.current = null;
    formulaInputRef.current?.blur();
  }

  function cancelFormulaEdit(): void {
    const started = formulaEditRef.current;
    if (started && started.row === anchor.row && started.col === anchor.col) {
      api.setCell(anchor.row, anchor.col, started.raw);
    }
    formulaEditRef.current = null;
    formulaInputRef.current?.blur();
  }

  // Insert SUM at the active cell. Picks a sensible default range
  // from the current selection: a single cell becomes =SUM(<col-above>),
  // a range becomes =SUM(<range>).
  const insertSum = useCallback(() => {
    const norm = normalizeRange(selection);
    let formula: string;
    if (norm.startRow === norm.endRow && norm.startCol === norm.endCol) {
      // Single cell — sum the column above the cell, if any rows above exist.
      if (norm.startRow > 0) {
        formula = `=SUM(${a1(0, norm.startCol)}:${a1(norm.startRow - 1, norm.startCol)})`;
      } else {
        formula = `=SUM(`;
      }
    } else {
      formula = `=SUM(${a1(norm.startRow, norm.startCol)}:${a1(norm.endRow, norm.endCol)})`;
    }
    api.setCell(anchor.row, anchor.col, formula);
    setTimeout(() => formulaInputRef.current?.focus(), 0);
  }, [api, anchor.row, anchor.col, selection]);

  const insertChart = useCallback(
    (type: ChartType) => {
      if (!canInsertChart) return;
      const title = `${type[0]!.toUpperCase()}${type.slice(1)} chart ${chartRangeLabel}`;
      api.addChart(api.activeSheet.name, {
        title,
        type,
        range: chartRangeLabel,
      });
    },
    [api, canInsertChart, chartRangeLabel]
  );

  const uniqueSheetName = useCallback(
    (proposed: string): string => {
      const base = proposed.trim() || "Sheet";
      const taken = new Set(api.workbook.sheets.map((sheet) => sheet.name));
      if (!taken.has(base)) return base;
      for (let n = 2; n < 1000; n++) {
        const candidate = `${base} (${n})`;
        if (!taken.has(candidate)) return candidate;
      }
      return `${base} (${Date.now()})`;
    },
    [api.workbook.sheets]
  );

  const uniqueRenameSheetName = useCallback(
    (proposed: string): string => {
      const base = proposed.trim() || api.activeSheet.name;
      const taken = new Set(
        api.workbook.sheets
          .filter((sheet) => sheet.id !== api.activeSheet.id)
          .map((sheet) => sheet.name)
      );
      if (!taken.has(base)) return base;
      for (let n = 2; n < 1000; n++) {
        const candidate = `${base} (${n})`;
        if (!taken.has(candidate)) return candidate;
      }
      return `${base} (${Date.now()})`;
    },
    [api.activeSheet.id, api.activeSheet.name, api.workbook.sheets]
  );

  const duplicateSheet = useCallback(() => {
    const copy = structuredClone(api.activeSheet);
    copy.id = `sheet-${Date.now()}`;
    copy.name = uniqueSheetName(`${api.activeSheet.name} Copy`);
    api.loadSheet(copy);
  }, [api, uniqueSheetName]);

  const renameSheet = useCallback(() => {
    const next = window.prompt("Sheet name:", api.activeSheet.name);
    if (next === null) return;
    const name = uniqueRenameSheetName(next);
    api.loadSheet({ ...api.activeSheet, name });
  }, [api, uniqueRenameSheetName]);

  const insertSymbol = useCallback(() => {
    const symbol = window.prompt("Symbol to insert:", "©");
    if (symbol === null) return;
    api.setCell(anchor.row, anchor.col, symbol || "©");
  }, [api, anchor.row, anchor.col]);

  const insertLink = useCallback(() => {
    const url = window.prompt("URL to insert:", "https://");
    if (url === null) return;
    api.setCell(anchor.row, anchor.col, url);
  }, [api, anchor.row, anchor.col]);

  const ribbonActions: RibbonActions = {
    newWorkbook: () => {
      api.replaceWorkbook(newBlankWorkbook(`wb-${Date.now()}`));
      setSelection(ORIGIN_RANGE);
    },
    importFile: triggerImport,
    exportCsv: () => void import("./csv").then(({ exportSheetAsCSV }) => exportSheetAsCSV(api.activeSheet)),
    exportXlsx: () => void import("./csv").then(({ exportWorkbookAsXLSX }) => exportWorkbookAsXLSX(api.workbook)),
    undo: api.undo,
    redo: api.redo,
    canUndo: api.canUndo,
    canRedo: api.canRedo,
    cut: () => void onCut(),
    copy: () => void onCopy(),
    paste: () => void onPaste(),
    pasteValues: () => void onPasteValues(),
    startFormatPainter,
    formatPainterActive: formatPainter !== null,
    clearSelection: onClearSelection,
    openFindReplace: () => setFindOpen(true),
    format: anchorFormat,
    patchFormat: applyFormatPatch,
    clearFormat: clearFormatRange,
    openConditionalFormat: () => setCfOpen(true),
    insertRowAbove: () => {
      const norm = normalizeRange(selection);
      api.insertRows(api.activeSheet.name, norm.startRow, selectedRowCount());
      setSelection({
        startRow: norm.startRow,
        endRow: norm.startRow + selectedRowCount() - 1,
        startCol: 0,
        endCol: api.activeSheet.colCount - 1,
      });
    },
    insertColLeft: () => {
      const norm = normalizeRange(selection);
      api.insertCols(api.activeSheet.name, norm.startCol, selectedColCount());
      setSelection({
        startRow: 0,
        endRow: api.activeSheet.rowCount - 1,
        startCol: norm.startCol,
        endCol: norm.startCol + selectedColCount() - 1,
      });
    },
    deleteRows: () => {
      const norm = normalizeRange(selection);
      api.deleteRows(api.activeSheet.name, norm.startRow, selectedRowCount());
      setSelection({
        startRow: Math.min(norm.startRow, Math.max(0, api.activeSheet.rowCount - selectedRowCount() - 1)),
        startCol: 0,
        endRow: Math.min(norm.startRow, Math.max(0, api.activeSheet.rowCount - selectedRowCount() - 1)),
        endCol: api.activeSheet.colCount - 1,
      });
    },
    deleteCols: () => {
      const norm = normalizeRange(selection);
      api.deleteCols(api.activeSheet.name, norm.startCol, selectedColCount());
      setSelection({
        startRow: 0,
        startCol: Math.min(norm.startCol, Math.max(0, api.activeSheet.colCount - selectedColCount() - 1)),
        endRow: api.activeSheet.rowCount - 1,
        endCol: Math.min(norm.startCol, Math.max(0, api.activeSheet.colCount - selectedColCount() - 1)),
      });
    },
    addSheet: api.addSheet,
    duplicateSheet,
    renameSheet,
    insertSymbol,
    insertLink,
    openCommentModal: () => setCommentOpen(true),
    clearComments: clearCommentsInSelection,
    openFunctionPicker: (category = null) => {
      setPickerCategory(category);
      setPickerOpen(true);
    },
    insertSum,
    recalculate: api.recalculate,
    showFormulas,
    toggleShowFormulas: () => setShowFormulas((v) => !v),
    canInsertChart,
    insertChart,
    sortAsc: () => sortActiveSheetByColumn(anchor.col, true),
    sortDesc: () => sortActiveSheetByColumn(anchor.col, false),
    removeDuplicates: () => removeDuplicatesInColumn(anchor.col),
    textToColumns,
    panelOpen,
    togglePanel: () => setPanelOpen((v) => !v),
    showGridlines,
    toggleGridlines: () => setShowGridlines((v) => !v),
    showHeadings,
    toggleHeadings: () => setShowHeadings((v) => !v),
    focusCell,
    toggleFocusCell: () => setFocusCell((v) => !v),
    openAudit: () => setAuditOpen(true),
    openWorkbookStats: () => setStatsOpen(true),
    openWhatsNew: () => setHelpTopic("whatsNew"),
    openTraining: () => setHelpTopic("training"),
    openSupport: () => window.open(SUPPORT_URL, "_blank", "noopener,noreferrer"),
    openFeedback: () => window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer"),
    openCommunity: () => window.open(REPO_URL, "_blank", "noopener,noreferrer"),
    openInstallHelp: () => setHelpTopic("install"),
    about: () => setAboutOpen(true),
  };
  const hasCharts = (api.activeSheet.charts?.length ?? 0) > 0;

  return (
    <div className={`app${panelOpen ? " with-panel" : ""}`}>
      <header className="title-bar">
        <a
          className="rodmanoffice-back"
          href="/RodmanOffice/"
          title="Back to RodmanOffice apps"
          aria-label="Back to RodmanOffice apps"
        >
          <span aria-hidden>←</span>
          <span>Apps</span>
        </a>
        <div className="brand">
          <div className="brand-logo" aria-hidden>X</div>
          <div className="brand-text">
            <div className="doc-title">{api.workbook.name || "Workbook1"}</div>
            <div className="brand-subtitle">RodmanSheets</div>
          </div>
        </div>
        <div className="title-actions">
          <button
            className="ask-claude"
            onClick={() => setPanelOpen((v) => !v)}
            title="Ask Claude"
          >
            {/* Keep this visible for per-request BYOK setup; the key field lives in the panel. */}
            {panelOpen ? "Close panel" : "🤖 Ask Claude"}
          </button>
          <SaveIndicator state={saveState} />
          <span className="status">{status}</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onPickFile}
          hidden
        />
      </header>

      <Ribbon a={ribbonActions} />

      <div className="formula-bar">
        <span className="name-box" title="Active cell / range">{rangeLabel}</span>
        <span className="fx-cluster">
          <button
            type="button"
            className="fx-btn cancel"
            title="Cancel edit (Esc)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={cancelFormulaEdit}
          >×</button>
          <button
            type="button"
            className="fx-btn commit"
            title="Commit edit (Enter)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={commitFormulaEdit}
          >✓</button>
          <button
            type="button"
            className="fx-btn fx"
            title="Insert function (⇧F3)"
            onClick={() => setPickerOpen(true)}
          ><i>fx</i></button>
        </span>
        <input
          ref={formulaInputRef}
          value={selRaw}
          onFocus={beginFormulaEdit}
          onBlur={() => {
            formulaEditRef.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancelFormulaEdit();
            } else if (e.key === "Enter") {
              e.preventDefault();
              commitFormulaEdit();
            }
          }}
          onChange={(e) =>
            api.setCell(anchor.row, anchor.col, e.target.value)
          }
          placeholder={
            selComputed.error
              ? selComputed.error
              : selComputed.value !== null
                ? String(selComputed.value)
                : ""
          }
        />
      </div>
      <div className="main-area">
        <div className="grid-wrapper">
          <Grid
            api={api}
            selection={selection}
            onSelect={setSelection}
            onSortColumn={sortActiveSheetByColumn}
            onRemoveDupesInColumn={removeDuplicatesInColumn}
            showGridlines={showGridlines}
            showHeadings={showHeadings}
            showFormulas={showFormulas}
            focusCell={focusCell}
          />
          {hasCharts && (
            <Suspense fallback={null}>
              <ChartStrip
                sheet={api.activeSheet}
                onRemove={(chartId) => api.removeChart(api.activeSheet.name, chartId)}
              />
            </Suspense>
          )}
          <SheetTabs
            sheets={api.workbook.sheets}
            activeId={api.activeSheet.id}
            onSelect={api.setActiveSheet}
            onAdd={api.addSheet}
          />
        </div>
        {panelOpen && (
          <SidePanel
            workbook={api.workbook}
            aiEnabled={aiEnabled}
            onClose={() => setPanelOpen(false)}
            onApplySetCell={api.setCellOnSheet}
            onApplyAddSheet={api.addSheetByName}
            onApplyAddChart={api.addChart}
          />
        )}
      </div>
      {pickerOpen && (
        <Suspense fallback={null}>
          <FunctionPicker
            initialCategory={pickerCategory}
            onClose={() => setPickerOpen(false)}
            onPick={(entry) => {
              setPickerOpen(false);
              insertFunctionAtSelection(entry.name);
            }}
          />
        </Suspense>
      )}
      {findOpen && (
        <Suspense fallback={null}>
          <FindReplace
            sheet={api.activeSheet}
            onClose={() => setFindOpen(false)}
            onJumpTo={(row, col) =>
              setSelection({ startRow: row, startCol: col, endRow: row, endCol: col })
            }
            onApply={(sheetName, edits) => api.setCellsOnSheetBatch(sheetName, edits)}
          />
        </Suspense>
      )}
      {cfOpen && (
        <Suspense fallback={null}>
          <ConditionalFormatModal
            rules={api.activeSheet.conditionalRules ?? []}
            selection={selection}
            onAdd={(rule) => api.addConditionalRule(api.activeSheet.name, rule)}
            onRemove={(id) => api.removeConditionalRule(api.activeSheet.name, id)}
            onClose={() => setCfOpen(false)}
          />
        </Suspense>
      )}
      {commentOpen && (
        <Suspense fallback={null}>
          <CommentModal
            row={anchor.row}
            col={anchor.col}
            current={api.getCellComment(anchor.row, anchor.col)}
            onSave={(text) => api.setCellComment(api.activeSheet.name, anchor.row, anchor.col, text)}
            onClear={() => api.clearCellComment(api.activeSheet.name, anchor.row, anchor.col)}
            onClose={() => setCommentOpen(false)}
          />
        </Suspense>
      )}
      {auditOpen && (
        <Suspense fallback={null}>
          <AuditPanel
            workbook={api.workbook}
            getComputedAt={api.getComputedOnSheet}
            onJumpTo={(sheetName, row, col) => {
              const sheet = api.workbook.sheets.find((s) => s.name === sheetName);
              if (sheet) api.setActiveSheet(sheet.id);
              setSelection({ startRow: row, startCol: col, endRow: row, endCol: col });
            }}
            onClose={() => setAuditOpen(false)}
          />
        </Suspense>
      )}
      {statsOpen && (
        <WorkbookStatsDialog
          workbook={api.workbook}
          onClose={() => setStatsOpen(false)}
        />
      )}
      {helpTopic && (
        <SheetsHelpDialog
          topic={helpTopic}
          onClose={() => setHelpTopic(null)}
        />
      )}
      {aboutOpen && (
        <AboutDialog
          aiEnabled={aiEnabled}
          offline={isOffline}
          onClose={() => setAboutOpen(false)}
        />
      )}
    </div>
  );
}

function WorkbookStatsDialog({
  workbook,
  onClose,
}: {
  workbook: Workbook;
  onClose: () => void;
}) {
  useReturnFocusOnClose();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stats = workbook.sheets.reduce(
    (acc, sheet) => {
      const populated = Object.entries(sheet.cells).filter(([, cell]) =>
        Boolean(cell.raw || cell.comment || cell.format)
      );
      acc.cells += populated.length;
      acc.formulas += populated.filter(([, cell]) => cell.raw.trim().startsWith("=")).length;
      acc.comments += populated.filter(([, cell]) => Boolean(cell.comment?.text)).length;
      acc.charts += sheet.charts?.length ?? 0;
      acc.conditionalRules += sheet.conditionalRules?.length ?? 0;
      for (const [key] of populated) {
        const [rowText = "", colText = ""] = key.split(",");
        const row = Number(rowText);
        const col = Number(colText);
        if (Number.isFinite(row) && Number.isFinite(col)) {
          acc.maxRow = Math.max(acc.maxRow, row);
          acc.maxCol = Math.max(acc.maxCol, col);
        }
      }
      return acc;
    },
    { cells: 0, formulas: 0, comments: 0, charts: 0, conditionalRules: 0, maxRow: -1, maxCol: -1 }
  );
  const usedRange = stats.maxRow >= 0 && stats.maxCol >= 0
    ? `A1:${a1(stats.maxRow, stats.maxCol)}`
    : "Empty";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal workbook-stats-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="statsTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span id="statsTitle">Workbook statistics</span>
          <button type="button" onClick={onClose} aria-label="Close">Ã—</button>
        </header>
        <dl className="workbook-stats-grid">
          <div><dt>Sheets</dt><dd>{workbook.sheets.length}</dd></div>
          <div><dt>Used range</dt><dd>{usedRange}</dd></div>
          <div><dt>Populated cells</dt><dd>{stats.cells}</dd></div>
          <div><dt>Formulas</dt><dd>{stats.formulas}</dd></div>
          <div><dt>Comments</dt><dd>{stats.comments}</dd></div>
          <div><dt>Charts</dt><dd>{stats.charts}</dd></div>
          <div><dt>Conditional rules</dt><dd>{stats.conditionalRules}</dd></div>
        </dl>
        <footer className="modal-footer">
          <span className="modal-hint">Counts include every sheet in this workbook.</span>
        </footer>
      </div>
    </div>
  );
}

function SheetsHelpDialog({
  topic,
  onClose,
}: {
  topic: HelpTopic;
  onClose: () => void;
}) {
  useReturnFocusOnClose();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const content = {
    whatsNew: {
      title: "What's new in RodmanSheets",
      body: [
        "Excel-style ribbon groups with File, Page Layout, Formulas, Data, Review, View, and Help.",
        "Manual chart insertion from the selected range.",
        "Function category shortcuts and workbook statistics.",
        "BYOK Ask Claude chat in the static GitHub Pages demo.",
      ],
    },
    training: {
      title: "RodmanSheets training",
      body: [
        "Select a range before using Insert > Charts to create a chart.",
        "Use Formulas > Insert Function or the category shortcuts to insert formulas.",
        "Use Review > Audit Formulas to jump to formula errors.",
        "Use View or Page Layout to toggle gridlines and headings for the current session.",
      ],
    },
    install: {
      title: "Install RodmanSheets",
      body: [
        "RodmanOffice is a browser app and can be installed from your browser's app menu when supported.",
        "Look for Install app, Add to home screen, or Create shortcut in the browser menu.",
        "Installed mode still uses the same local files, browser storage, and GitHub Pages demo behavior.",
      ],
    },
  }[topic];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal help-topic-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="helpTopicTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span id="helpTopicTitle">{content.title}</span>
          <button type="button" onClick={onClose} aria-label="Close">Ã—</button>
        </header>
        <div className="help-topic-body">
          <ul>
            {content.body.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <footer className="modal-footer">
          <span className="modal-hint">Esc closes this dialog.</span>
        </footer>
      </div>
    </div>
  );
}

function AboutDialog({
  aiEnabled,
  offline,
  onClose,
}: {
  aiEnabled: boolean;
  offline: boolean;
  onClose: () => void;
}) {
  useReturnFocusOnClose();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aboutTitle"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span id="aboutTitle">About RodmanSheets</span>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="about-modal-body">
          <div className="about-modal-logo" aria-hidden>X</div>
          <div>
            <h2>RodmanSheets</h2>
            <p>Spreadsheet editor for local workbook drafts, formulas, charts, comments, and CSV/XLSX handoff.</p>
          </div>
          <dl>
            <div>
              <dt>Storage</dt>
              <dd>{offline ? "Browser demo mode" : "API autosave when connected"}</dd>
            </div>
            <div>
              <dt>AI</dt>
              <dd>{aiEnabled ? "Hosted API configured; BYOK chat also available" : "BYOK chat available; formulas and apply-capable plans need a hosted API"}</dd>
            </div>
          </dl>
        </div>
        <footer className="modal-footer">
          <span className="modal-hint">Esc closes this dialog.</span>
        </footer>
      </div>
    </div>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  let text = "";
  let color = "inherit";
  if (state.kind === "saving") text = "Saving…";
  else if (state.kind === "saved") text = `Saved ${formatTime(state.at)}`;
  else if (state.kind === "error") {
    text = `Save failed`;
    color = "#ffd2d2";
  }
  if (!text) return null;
  return (
    <span style={{ fontSize: 12, color }} title={state.kind === "error" ? state.message : undefined}>
      {text}
    </span>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString();
}
