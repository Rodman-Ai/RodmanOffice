import { useState, useRef, useEffect, useCallback, type ChangeEvent } from "react";
import { a1, type Workbook, cellKey } from "@aicell/shared";
import { useWorkbook, newBlankWorkbook } from "./useWorkbook";
import { Grid } from "./Grid";
import { SidePanel } from "./SidePanel";
import { SheetTabs } from "./SheetTabs";
import { ChartStrip } from "./ChartStrip";
import { MenuBar, type MenuSpec } from "./MenuBar";
import { FunctionPicker } from "./FunctionPicker";
import { FormatToolbar } from "./FormatToolbar";
import { FindReplace } from "./FindReplace";
import { ConditionalFormatModal } from "./ConditionalFormatModal";
import { CommentModal } from "./CommentModal";
import { AuditPanel } from "./AuditPanel";
import type { CellFormat } from "@aicell/shared";
import {
  importSpreadsheetFile,
  exportSheetAsCSV,
  exportWorkbookAsXLSX,
} from "./csv";
import {
  parseTSV,
  serializeCell,
  serializeRange,
  normalizeRange,
  rangeCellCount,
  type Range,
} from "./clipboard";
import { listWorkbooks, loadWorkbook, saveWorkbook, getHealth, isOffline } from "./api";

const AUTOSAVE_DEBOUNCE_MS = 800;

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
  const [findOpen, setFindOpen] = useState(false);
  const [cfOpen, setCfOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);

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

  const onClearSelection = useCallback(() => {
    clearRange();
  }, [clearRange]);

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

  const menus: MenuSpec[] = [
    {
      label: "File",
      items: [
        {
          kind: "item",
          label: "New workbook",
          onClick: () => {
            api.replaceWorkbook(newBlankWorkbook(`wb-${Date.now()}`));
            setSelection(ORIGIN_RANGE);
          },
        },
        { kind: "item", label: "Import…", onClick: triggerImport },
        { kind: "separator" },
        {
          kind: "item",
          label: "Export as CSV",
          onClick: () => exportSheetAsCSV(api.activeSheet),
        },
        {
          kind: "item",
          label: "Export as XLSX",
          onClick: () => exportWorkbookAsXLSX(api.workbook),
        },
      ],
    },
    {
      label: "Edit",
      items: [
        {
          kind: "item",
          label: "Undo",
          shortcut: `${modKey}Z`,
          onClick: api.undo,
          disabled: !api.canUndo,
        },
        {
          kind: "item",
          label: "Redo",
          shortcut: `${modKey}⇧Z`,
          onClick: api.redo,
          disabled: !api.canRedo,
        },
        { kind: "separator" },
        { kind: "item", label: "Cut", shortcut: `${modKey}X`, onClick: () => void onCut() },
        { kind: "item", label: "Copy", shortcut: `${modKey}C`, onClick: () => void onCopy() },
        { kind: "item", label: "Paste", shortcut: `${modKey}V`, onClick: () => void onPaste() },
        { kind: "separator" },
        { kind: "item", label: "Clear contents", shortcut: "Del", onClick: onClearSelection },
        { kind: "separator" },
        {
          kind: "item",
          label: "Find & replace…",
          shortcut: `${modKey}F`,
          onClick: () => setFindOpen(true),
        },
      ],
    },
    {
      label: "View",
      items: [
        {
          kind: "item",
          label: panelOpen ? "Hide Ask Claude panel" : "Show Ask Claude panel",
          onClick: () => setPanelOpen((v) => !v),
        },
      ],
    },
    {
      label: "Format",
      items: [
        { kind: "item", label: "Bold", shortcut: `${modKey}B`, onClick: () => applyFormatPatch({ bold: !anchorFormat?.bold }) },
        { kind: "item", label: "Italic", shortcut: `${modKey}I`, onClick: () => applyFormatPatch({ italic: !anchorFormat?.italic }) },
        { kind: "item", label: "Underline", shortcut: `${modKey}U`, onClick: () => applyFormatPatch({ underline: !anchorFormat?.underline }) },
        { kind: "separator" },
        { kind: "item", label: "Number → General", onClick: () => applyFormatPatch({ numberFmt: "general" }) },
        { kind: "item", label: "Number → Number", onClick: () => applyFormatPatch({ numberFmt: "number" }) },
        { kind: "item", label: "Number → Currency", onClick: () => applyFormatPatch({ numberFmt: "currency" }) },
        { kind: "item", label: "Number → Percent", onClick: () => applyFormatPatch({ numberFmt: "percent" }) },
        { kind: "item", label: "Number → Date", onClick: () => applyFormatPatch({ numberFmt: "date" }) },
        { kind: "separator" },
        { kind: "item", label: "Align left", onClick: () => applyFormatPatch({ align: "left" }) },
        { kind: "item", label: "Align center", onClick: () => applyFormatPatch({ align: "center" }) },
        { kind: "item", label: "Align right", onClick: () => applyFormatPatch({ align: "right" }) },
        { kind: "separator" },
        { kind: "item", label: "Conditional formatting…", onClick: () => setCfOpen(true) },
        { kind: "item", label: "Clear formatting", onClick: clearFormatRange },
      ],
    },
    {
      label: "Insert",
      items: [
        { kind: "item", label: "Sheet", onClick: api.addSheet },
        { kind: "item", label: "Comment on selected cell…", onClick: () => setCommentOpen(true) },
        { kind: "separator" },
        {
          kind: "item",
          label: "Function…",
          shortcut: "⇧F3",
          onClick: () => setPickerOpen(true),
        },
      ],
    },
    {
      label: "Data",
      items: [
        {
          kind: "item",
          label: "Sort sheet by selected column ↑",
          onClick: () => sortActiveSheetByColumn(anchor.col, true),
        },
        {
          kind: "item",
          label: "Sort sheet by selected column ↓",
          onClick: () => sortActiveSheetByColumn(anchor.col, false),
        },
        { kind: "separator" },
        {
          kind: "item",
          label: "Remove duplicates in selected column",
          onClick: () => removeDuplicatesInColumn(anchor.col),
        },
      ],
    },
    {
      label: "Help",
      items: [
        { kind: "item", label: "Function reference…", onClick: () => setPickerOpen(true) },
        { kind: "item", label: "Audit formulas…", onClick: () => setAuditOpen(true) },
        { kind: "item", label: "About RodmanSheets", onClick: () => alert("RodmanSheets — AI-native spreadsheet. Ask Claude what you'd normally click for.") },
      ],
    },
  ];

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
    const rows: { keyVal: string; values: (string | undefined)[] }[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const values: (string | undefined)[] = [];
      for (let c = 0; c <= maxCol; c++) {
        values.push(sheet.cells[cellKey(r, c)]?.raw);
      }
      rows.push({ keyVal: values[col] ?? "", values });
    }
    rows.sort((a, b) => {
      const an = Number(a.keyVal);
      const bn = Number(b.keyVal);
      const bothNum = !Number.isNaN(an) && !Number.isNaN(bn) && a.keyVal !== "" && b.keyVal !== "";
      const cmp = bothNum ? an - bn : a.keyVal.localeCompare(b.keyVal);
      return ascending ? cmp : -cmp;
    });
    const edits = [];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c <= maxCol; c++) {
        edits.push({ row: r, col: c, raw: rows[r]!.values[c] ?? "" });
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
    const kept: (string | undefined)[][] = [];
    for (let r = 0; r <= maxRow; r++) {
      const v = sheet.cells[cellKey(r, col)]?.raw ?? "";
      if (v === "" || !seen.has(v)) {
        if (v !== "") seen.add(v);
        const row: (string | undefined)[] = [];
        for (let c = 0; c <= maxCol; c++) row.push(sheet.cells[cellKey(r, c)]?.raw);
        kept.push(row);
      }
    }
    const edits = [];
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        const raw = r < kept.length ? kept[r]![c] ?? "" : "";
        edits.push({ row: r, col: c, raw });
      }
    }
    api.setCellsOnSheetBatch(sheet.name, edits);
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

  return (
    <div className={`app${panelOpen ? " with-panel" : ""}`}>
      <div className="toolbar">
        <a
          className="rodmanoffice-back"
          href="/RodmanOffice/"
          title="Back to RodmanOffice apps"
          aria-label="Back to RodmanOffice apps"
        >
          <span aria-hidden>←</span>
          <span>Apps</span>
        </a>
        <h1>RodmanSheets</h1>
        <label>
          Import
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onPickFile}
          />
        </label>
        <button
          className="ask-claude"
          onClick={() => setPanelOpen((v) => !v)}
          title={aiEnabled ? "Ask Claude" : "AI is not configured"}
        >
          {panelOpen ? "Close panel" : "Ask Claude"}
        </button>
        <SaveIndicator state={saveState} />
        <span className="status">{status}</span>
      </div>
      <MenuBar menus={menus} />
      <FormatToolbar
        current={anchorFormat}
        onPatch={applyFormatPatch}
        onClear={clearFormatRange}
      />
      <div className="formula-bar">
        <span className="addr" title={cellCount > 1 ? rangeLabel : undefined}>
          {rangeLabel}
        </span>
        <input
          ref={formulaInputRef}
          value={selRaw}
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
          />
          <ChartStrip
            sheet={api.activeSheet}
            onRemove={(chartId) => api.removeChart(api.activeSheet.name, chartId)}
          />
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
        <FunctionPicker
          onClose={() => setPickerOpen(false)}
          onPick={(entry) => {
            setPickerOpen(false);
            insertFunctionAtSelection(entry.name);
          }}
        />
      )}
      {findOpen && (
        <FindReplace
          sheet={api.activeSheet}
          onClose={() => setFindOpen(false)}
          onJumpTo={(row, col) =>
            setSelection({ startRow: row, startCol: col, endRow: row, endCol: col })
          }
          onApply={(sheetName, edits) => api.setCellsOnSheetBatch(sheetName, edits)}
        />
      )}
      {cfOpen && (
        <ConditionalFormatModal
          rules={api.activeSheet.conditionalRules ?? []}
          selection={selection}
          onAdd={(rule) => api.addConditionalRule(api.activeSheet.name, rule)}
          onRemove={(id) => api.removeConditionalRule(api.activeSheet.name, id)}
          onClose={() => setCfOpen(false)}
        />
      )}
      {commentOpen && (
        <CommentModal
          row={anchor.row}
          col={anchor.col}
          current={api.getCellComment(anchor.row, anchor.col)}
          onSave={(text) => api.setCellComment(api.activeSheet.name, anchor.row, anchor.col, text)}
          onClear={() => api.clearCellComment(api.activeSheet.name, anchor.row, anchor.col)}
          onClose={() => setCommentOpen(false)}
        />
      )}
      {auditOpen && (
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
      )}
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
