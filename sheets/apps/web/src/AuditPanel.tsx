import { useMemo } from "react";
import type { Workbook } from "@aicell/shared";
import { a1 } from "@aicell/shared";
import type { CellComputed } from "@aicell/calc";
import { useReturnFocusOnClose } from "./useReturnFocusOnClose";

export type AuditFinding = {
  sheetName: string;
  row: number;
  col: number;
  raw: string;
  error: string;
};

type Props = {
  workbook: Workbook;
  /** Provide computed values; lets the panel reach the same engine the grid uses. */
  getComputedAt: (sheetName: string, row: number, col: number) => CellComputed;
  onJumpTo: (sheetName: string, row: number, col: number) => void;
  onClose: () => void;
};

export function AuditPanel({ workbook, getComputedAt, onJumpTo, onClose }: Props) {
  useReturnFocusOnClose();
  const findings = useMemo<AuditFinding[]>(() => {
    const out: AuditFinding[] = [];
    for (const sheet of workbook.sheets) {
      for (const [key, cell] of Object.entries(sheet.cells)) {
        if (!cell.raw.startsWith("=")) continue;
        const [r, c] = key.split(",").map(Number) as [number, number];
        const computed = getComputedAt(sheet.name, r, c);
        if (computed.error) {
          out.push({
            sheetName: sheet.name,
            row: r,
            col: c,
            raw: cell.raw,
            error: computed.error,
          });
        }
      }
    }
    out.sort((a, b) =>
      a.sheetName.localeCompare(b.sheetName) || a.row - b.row || a.col - b.col
    );
    return out;
  }, [workbook, getComputedAt]);

  const formulaCount = useMemo(() => {
    let n = 0;
    for (const sheet of workbook.sheets) {
      for (const cell of Object.values(sheet.cells)) {
        if (cell.raw.startsWith("=")) n++;
      }
    }
    return n;
  }, [workbook]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal audit-modal"
        role="dialog"
        aria-label="Audit formulas"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span>Audit formulas</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="audit-body">
          <div className="audit-summary">
            Scanned <strong>{formulaCount}</strong> formula{formulaCount === 1 ? "" : "s"} across{" "}
            <strong>{workbook.sheets.length}</strong> sheet{workbook.sheets.length === 1 ? "" : "s"}.{" "}
            {findings.length === 0 ? (
              <span className="audit-clean">No errors found.</span>
            ) : (
              <span className="audit-errors">{findings.length} error{findings.length === 1 ? "" : "s"}.</span>
            )}
          </div>
          {findings.length > 0 && (
            <ul className="audit-list">
              {findings.map((f, i) => (
                <li key={i} className="audit-item">
                  <button
                    type="button"
                    className="audit-jump"
                    onClick={() => {
                      onJumpTo(f.sheetName, f.row, f.col);
                      onClose();
                    }}
                  >
                    {f.sheetName}!{a1(f.row, f.col)}
                  </button>
                  <code className="audit-formula">{f.raw}</code>
                  <span className="audit-error">{f.error}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="modal-footer">
          <span className="modal-hint">Click a cell ref to jump to it.</span>
        </footer>
      </div>
    </div>
  );
}
