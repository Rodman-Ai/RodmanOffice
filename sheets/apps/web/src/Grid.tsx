import {
  memo,
  useRef,
  useState,
  useCallback,
  useEffect,
  type KeyboardEvent,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { colLetters, type CellFormat, type CellComment } from "@aicell/shared";
import type { WorkbookApi } from "./useWorkbook";
import { normalizeRange, rangeContains, type Range } from "./clipboard";
import { formatToStyle, formatValue } from "./format";
import { resolveFormat } from "./conditional";

const ROW_HEIGHT = 24;
const DEFAULT_COL_WIDTH = 100;
const MIN_COL_WIDTH = 32;
const ROW_HEADER_WIDTH = 56;

type Props = {
  api: WorkbookApi;
  selection: Range;
  onSelect: (sel: Range) => void;
  onSortColumn: (col: number, ascending: boolean) => void;
  onRemoveDupesInColumn: (col: number) => void;
};

export function Grid({ api, selection, onSelect, onSortColumn, onRemoveDupesInColumn }: Props) {
  const { activeSheet, getRaw, getComputed, getCellFormat, getCellComment, setCell, version, setColWidth } = api;
  const parentRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ row: number; col: number; draft: string } | null>(null);
  const [resizing, setResizing] = useState<{ col: number; startX: number; startWidth: number } | null>(null);
  const [draftWidth, setDraftWidth] = useState<{ col: number; width: number } | null>(null);
  const [chevronCol, setChevronCol] = useState<number | null>(null);

  const widthOf = useCallback(
    (col: number): number => {
      if (draftWidth && draftWidth.col === col) return draftWidth.width;
      return activeSheet.colWidths?.[col] ?? DEFAULT_COL_WIDTH;
    },
    [activeSheet.colWidths, draftWidth]
  );

  const totalWidth = useCallback((): number => {
    let w = ROW_HEADER_WIDTH;
    for (let c = 0; c < activeSheet.colCount; c++) w += widthOf(c);
    return w;
  }, [activeSheet.colCount, widthOf])();

  const rowVirtualizer = useVirtualizer({
    count: activeSheet.rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  const beginEdit = useCallback(
    (row: number, col: number, seed?: string) => {
      const initial = seed !== undefined ? seed : getRaw(row, col);
      setEditing({ row, col, draft: initial });
    },
    [getRaw]
  );

  const commitEdit = useCallback(() => {
    if (!editing) return;
    setCell(editing.row, editing.col, editing.draft);
    setEditing(null);
  }, [editing, setCell]);

  const cancelEdit = useCallback(() => setEditing(null), []);

  const onChangeDraft = useCallback(
    (v: string) => setEditing((prev) => (prev ? { ...prev, draft: v } : prev)),
    []
  );

  const handleCellKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (editing) return;
      const sel = normalizeRange(selection);
      const anchor = { row: selection.startRow, col: selection.startCol };
      const focus = { row: selection.endRow, col: selection.endCol };
      const lastRow = activeSheet.rowCount - 1;
      const lastCol = activeSheet.colCount - 1;

      const moveAnchor = (row: number, col: number) =>
        onSelect({ startRow: row, startCol: col, endRow: row, endCol: col });
      const moveFocus = (row: number, col: number) =>
        onSelect({ ...selection, endRow: row, endCol: col });

      if (e.key === "ArrowDown") {
        if (e.shiftKey) moveFocus(Math.min(focus.row + 1, lastRow), focus.col);
        else moveAnchor(Math.min(sel.endRow + 1, lastRow), anchor.col);
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        if (e.shiftKey) moveFocus(Math.max(focus.row - 1, 0), focus.col);
        else moveAnchor(Math.max(sel.startRow - 1, 0), anchor.col);
        e.preventDefault();
      } else if (e.key === "ArrowLeft") {
        if (e.shiftKey) moveFocus(focus.row, Math.max(focus.col - 1, 0));
        else moveAnchor(anchor.row, Math.max(sel.startCol - 1, 0));
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "Tab") {
        if (e.shiftKey && e.key !== "Tab") moveFocus(focus.row, Math.min(focus.col + 1, lastCol));
        else moveAnchor(anchor.row, Math.min(sel.endCol + 1, lastCol));
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === "F2") {
        beginEdit(anchor.row, anchor.col);
        e.preventDefault();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Clear all selected cells as one batch -> one undo step.
        const edits = [];
        for (let r = sel.startRow; r <= sel.endRow; r++) {
          for (let c = sel.startCol; c <= sel.endCol; c++) {
            edits.push({ row: r, col: c, raw: "" });
          }
        }
        api.setCellsOnSheetBatch(activeSheet.name, edits);
        e.preventDefault();
      } else if (e.key === "Home") {
        if (e.ctrlKey || e.metaKey) moveAnchor(0, 0);
        else moveAnchor(anchor.row, 0);
        e.preventDefault();
      } else if (e.key === "End") {
        if (e.ctrlKey || e.metaKey) moveAnchor(lastRow, lastCol);
        else moveAnchor(anchor.row, lastCol);
        e.preventDefault();
      } else if (
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        beginEdit(anchor.row, anchor.col, e.key);
        e.preventDefault();
      }
    },
    [editing, selection, activeSheet, onSelect, beginEdit, setCell]
  );

  // Cancel any in-progress edit when selection moves off the editing cell.
  useEffect(() => {
    if (editing && !rangeContains(selection, editing.row, editing.col)) {
      setEditing(null);
    }
  }, [selection, editing]);

  // Mouse drag-to-select state
  const dragRef = useRef<{ startRow: number; startCol: number } | null>(null);

  const onCellMouseDown = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      if (e.shiftKey) {
        onSelect({ ...selection, endRow: row, endCol: col });
        return;
      }
      dragRef.current = { startRow: row, startCol: col };
      onSelect({ startRow: row, startCol: col, endRow: row, endCol: col });
    },
    [selection, onSelect]
  );

  const onCellMouseEnter = useCallback(
    (row: number, col: number, e: React.MouseEvent) => {
      if (!dragRef.current) return;
      if (e.buttons === 0) {
        dragRef.current = null;
        return;
      }
      const start = dragRef.current;
      onSelect({
        startRow: start.startRow,
        startCol: start.startCol,
        endRow: row,
        endCol: col,
      });
    },
    [onSelect]
  );

  useEffect(() => {
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, []);

  // Column resize drag. Uses a ref for the draft width so the effect's
  // mousemove/mouseup handlers register once per drag, not per pixel.
  const draftWidthRef = useRef<{ col: number; width: number } | null>(null);
  useEffect(() => {
    draftWidthRef.current = draftWidth;
  }, [draftWidth]);

  useEffect(() => {
    if (!resizing) return;
    const { col, startX, startWidth } = resizing;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const w = Math.max(MIN_COL_WIDTH, startWidth + dx);
      setDraftWidth({ col, width: w });
    };
    const onUp = () => {
      const dw = draftWidthRef.current;
      if (dw && dw.col === col) {
        setColWidth(activeSheet.name, col, dw.width);
      }
      setResizing(null);
      setDraftWidth(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [resizing, activeSheet.name, setColWidth]);

  // Auto-focus the grid container so keyboard works after CSV import
  useEffect(() => {
    parentRef.current?.focus();
  }, [activeSheet.id]);

  // Compute column left offsets for absolute positioning
  const colLefts: number[] = [];
  let acc = ROW_HEADER_WIDTH;
  for (let c = 0; c < activeSheet.colCount; c++) {
    colLefts.push(acc);
    acc += widthOf(c);
  }

  const onColumnHeaderClick = useCallback(
    (col: number) => {
      onSelect({
        startRow: 0,
        startCol: col,
        endRow: activeSheet.rowCount - 1,
        endCol: col,
      });
    },
    [onSelect, activeSheet.rowCount]
  );

  const onRowHeaderClick = useCallback(
    (row: number) => {
      onSelect({
        startRow: row,
        startCol: 0,
        endRow: row,
        endCol: activeSheet.colCount - 1,
      });
    },
    [onSelect, activeSheet.colCount]
  );

  const chevronTriggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <div
      className="grid-container"
      ref={parentRef}
      tabIndex={0}
      onKeyDown={handleCellKeyDown}
    >
      <div className="grid-header-row" style={{ width: totalWidth }}>
        <div className="grid-col-header corner" />
        {Array.from({ length: activeSheet.colCount }).map((_, c) => (
          <div
            className="grid-col-header"
            key={c}
            style={{ width: widthOf(c) }}
            onClick={() => onColumnHeaderClick(c)}
          >
            <span>{colLetters(c)}</span>
            <button
              type="button"
              className="col-chevron"
              aria-label={`Column ${colLetters(c)} actions`}
              aria-haspopup="menu"
              aria-expanded={chevronCol === c}
              onClick={(e) => {
                e.stopPropagation();
                if (chevronCol === c) {
                  setChevronCol(null);
                } else {
                  chevronTriggerRef.current = e.currentTarget;
                  setChevronCol(c);
                }
              }}
            >
              ▾
            </button>
            {chevronCol === c && (
              <ColChevronPopup
                col={c}
                onClose={() => {
                  setChevronCol(null);
                  chevronTriggerRef.current?.focus();
                }}
                onSortAsc={() => {
                  onSortColumn(c, true);
                  setChevronCol(null);
                  chevronTriggerRef.current?.focus();
                }}
                onSortDesc={() => {
                  onSortColumn(c, false);
                  setChevronCol(null);
                  chevronTriggerRef.current?.focus();
                }}
                onDedupe={() => {
                  onRemoveDupesInColumn(c);
                  setChevronCol(null);
                  chevronTriggerRef.current?.focus();
                }}
              />
            )}
            <span
              className="col-resize-handle"
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setResizing({ col: c, startX: e.clientX, startWidth: widthOf(c) });
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="grid"
        style={{
          height: rowVirtualizer.getTotalSize(),
          width: totalWidth,
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const r = vRow.index;
          return (
            <div
              key={r}
              className={`grid-row${r % 2 === 1 ? " alt" : ""}`}
              style={{
                transform: `translateY(${vRow.start}px)`,
                width: totalWidth,
              }}
            >
              <div
                className="grid-row-header"
                style={{ width: ROW_HEADER_WIDTH }}
                onClick={() => onRowHeaderClick(r)}
              >
                {r + 1}
              </div>
              {Array.from({ length: activeSheet.colCount }).map((_, c) => (
                <CellView
                  key={c}
                  row={r}
                  col={c}
                  width={widthOf(c)}
                  isAnchor={selection.startRow === r && selection.startCol === c}
                  inSelection={rangeContains(selection, r, c)}
                  baseFormat={getCellFormat(r, c)}
                  comment={getCellComment(r, c)}
                  conditionalRules={activeSheet.conditionalRules}
                  editing={editing && editing.row === r && editing.col === c ? editing : null}
                  versionTick={version}
                  getRaw={getRaw}
                  getComputed={getComputed}
                  onMouseDown={onCellMouseDown}
                  onMouseEnter={onCellMouseEnter}
                  onBeginEdit={beginEdit}
                  onChangeDraft={onChangeDraft}
                  onCommit={commitEdit}
                  onCancel={cancelEdit}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type CellProps = {
  row: number;
  col: number;
  width: number;
  isAnchor: boolean;
  inSelection: boolean;
  baseFormat: CellFormat | undefined;
  comment: CellComment | undefined;
  conditionalRules: import("@aicell/shared").ConditionalRule[] | undefined;
  editing: { row: number; col: number; draft: string } | null;
  versionTick: number;
  getRaw: (row: number, col: number) => string;
  getComputed: WorkbookApi["getComputed"];
  onMouseDown: (row: number, col: number, e: React.MouseEvent) => void;
  onMouseEnter: (row: number, col: number, e: React.MouseEvent) => void;
  onBeginEdit: (row: number, col: number) => void;
  onChangeDraft: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
};

const CellView = memo(CellViewImpl, areCellPropsEqual);

function areCellPropsEqual(prev: CellProps, next: CellProps): boolean {
  return (
    prev.row === next.row &&
    prev.col === next.col &&
    prev.width === next.width &&
    prev.isAnchor === next.isAnchor &&
    prev.inSelection === next.inSelection &&
    prev.baseFormat === next.baseFormat &&
    prev.comment === next.comment &&
    prev.conditionalRules === next.conditionalRules &&
    prev.editing === next.editing &&
    prev.versionTick === next.versionTick &&
    prev.getRaw === next.getRaw &&
    prev.getComputed === next.getComputed &&
    prev.onMouseDown === next.onMouseDown &&
    prev.onMouseEnter === next.onMouseEnter &&
    prev.onBeginEdit === next.onBeginEdit &&
    prev.onChangeDraft === next.onChangeDraft &&
    prev.onCommit === next.onCommit &&
    prev.onCancel === next.onCancel
  );
}

function CellViewImpl({
  row,
  col,
  width,
  isAnchor,
  inSelection,
  baseFormat,
  comment,
  conditionalRules,
  editing,
  versionTick,
  getRaw,
  getComputed,
  onMouseDown,
  onMouseEnter,
  onBeginEdit,
  onChangeDraft,
  onCommit,
  onCancel,
}: CellProps) {
  void versionTick;
  const computed = getComputed(row, col);
  const raw = getRaw(row, col);
  const format = resolveFormat(baseFormat, conditionalRules, row, col, raw, computed.value);
  const display =
    computed.error !== undefined
      ? computed.error
      : formatValue(computed.value, format?.numberFmt, format?.decimals ?? 2);
  const isNumeric = typeof computed.value === "number" && !format?.align;
  const fmtStyle = formatToStyle(format);

  if (editing) {
    return (
      <div
        className={`grid-cell anchor${isNumeric ? " numeric" : ""}`}
        style={{ width, ...fmtStyle }}
      >
        <input
          autoFocus
          value={editing.draft}
          onChange={(e) => onChangeDraft(e.target.value)}
          onBlur={onCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onCommit();
              e.preventDefault();
            } else if (e.key === "Escape") {
              onCancel();
              e.preventDefault();
            } else if (e.key === "Tab") {
              onCommit();
            }
            e.stopPropagation();
          }}
        />
      </div>
    );
  }

  const cls = [
    "grid-cell",
    isNumeric ? "numeric" : "",
    computed.error ? "error" : "",
    isAnchor ? "anchor" : "",
    inSelection && !isAnchor ? "in-range" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const tooltip = comment
    ? `Comment: ${comment.text}${raw && raw !== display ? `\n${raw}` : ""}`
    : raw && raw !== display
      ? raw
      : undefined;

  return (
    <div
      className={`${cls}${comment ? " has-comment" : ""}`}
      style={{ width, ...fmtStyle }}
      title={tooltip}
      onMouseDown={(e) => onMouseDown(row, col, e)}
      onMouseEnter={(e) => onMouseEnter(row, col, e)}
      onDoubleClick={() => onBeginEdit(row, col)}
    >
      {display}
    </div>
  );
}

function ColChevronPopup({
  col,
  onClose,
  onSortAsc,
  onSortDesc,
  onDedupe,
}: {
  col: number;
  onClose: () => void;
  onSortAsc: () => void;
  onSortDesc: () => void;
  onDedupe: () => void;
}) {
  void col;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      className="col-chevron-popup"
      ref={ref}
      role="menu"
      aria-label="Column actions"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" onClick={onSortAsc}>Sort A → Z</button>
      <button type="button" onClick={onSortDesc}>Sort Z → A</button>
      <hr />
      <button type="button" onClick={onDedupe}>Remove duplicates</button>
      <button type="button" disabled title="Coming in a follow-up">Filter…</button>
    </div>
  );
}
