import { useEffect, useMemo, useRef, useState } from "react";
import type { Sheet } from "@aicell/shared";
import { cellKey } from "@aicell/shared";
import type { CellEdit } from "./useWorkbook";
import { useReturnFocusOnClose } from "./useReturnFocusOnClose";

type Props = {
  sheet: Sheet;
  onClose: () => void;
  onJumpTo: (row: number, col: number) => void;
  onApply: (sheetName: string, edits: CellEdit[]) => void;
};

export function FindReplace({ sheet, onClose, onJumpTo, onApply }: Props) {
  useReturnFocusOnClose();
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [activeMatch, setActiveMatch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    if (find === "") return [] as { row: number; col: number; raw: string }[];
    const list: { row: number; col: number; raw: string }[] = [];
    const needle = matchCase ? find : find.toLowerCase();
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const hay = matchCase ? cell.raw : cell.raw.toLowerCase();
      if (hay.includes(needle)) {
        const [r, c] = key.split(",").map(Number) as [number, number];
        list.push({ row: r, col: c, raw: cell.raw });
      }
    }
    list.sort((a, b) => a.row - b.row || a.col - b.col);
    return list;
  }, [sheet.cells, find, matchCase]);

  useEffect(() => {
    if (activeMatch >= matches.length) setActiveMatch(0);
  }, [matches.length, activeMatch]);

  const replaceOnce = () => {
    const m = matches[activeMatch];
    if (!m) return;
    const next = swap(m.raw, find, replace, matchCase);
    onApply(sheet.name, [{ row: m.row, col: m.col, raw: next }]);
    onJumpTo(m.row, m.col);
  };

  const replaceAll = () => {
    if (matches.length === 0) return;
    const edits: CellEdit[] = matches.map((m) => ({
      row: m.row,
      col: m.col,
      raw: swap(m.raw, find, replace, matchCase),
    }));
    onApply(sheet.name, edits);
  };

  const goNext = () => {
    if (matches.length === 0) return;
    const next = (activeMatch + 1) % matches.length;
    setActiveMatch(next);
    const m = matches[next]!;
    onJumpTo(m.row, m.col);
  };

  const goPrev = () => {
    if (matches.length === 0) return;
    const prev = (activeMatch - 1 + matches.length) % matches.length;
    setActiveMatch(prev);
    const m = matches[prev]!;
    onJumpTo(m.row, m.col);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal find-replace"
        role="dialog"
        aria-label="Find and replace"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span>Find & replace</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="find-replace-body">
          <label>
            <span>Find</span>
            <input
              ref={inputRef}
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (e.shiftKey) goPrev();
                  else goNext();
                  e.preventDefault();
                } else if (e.key === "Escape") {
                  onClose();
                  e.preventDefault();
                }
              }}
            />
          </label>
          <label>
            <span>Replace with</span>
            <input
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
            />
          </label>
          <label className="find-replace-checkbox">
            <input
              type="checkbox"
              checked={matchCase}
              onChange={(e) => setMatchCase(e.target.checked)}
            />
            Match case
          </label>
          <div className="find-replace-status">
            {find === ""
              ? "Type to find."
              : matches.length === 0
                ? "No matches."
                : `${activeMatch + 1} of ${matches.length} match${matches.length === 1 ? "" : "es"} on ${sheet.name}.`}
          </div>
          <div className="find-replace-actions">
            <button type="button" onClick={goPrev} disabled={matches.length === 0}>
              Previous
            </button>
            <button type="button" onClick={goNext} disabled={matches.length === 0}>
              Next
            </button>
            <button
              type="button"
              onClick={replaceOnce}
              disabled={matches.length === 0 || find === replace}
            >
              Replace
            </button>
            <button
              type="button"
              className="primary"
              onClick={replaceAll}
              disabled={matches.length === 0 || find === replace}
            >
              Replace all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function swap(text: string, find: string, replace: string, matchCase: boolean): string {
  if (find === "") return text;
  if (matchCase) return text.split(find).join(replace);
  // Case-insensitive: walk and rebuild.
  const lowerHay = text.toLowerCase();
  const lowerNeedle = find.toLowerCase();
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (lowerHay.startsWith(lowerNeedle, i)) {
      result += replace;
      i += find.length;
    } else {
      result += text[i];
      i += 1;
    }
  }
  return result;
}
