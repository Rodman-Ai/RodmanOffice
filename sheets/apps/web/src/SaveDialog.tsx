import { useEffect, useRef, useState } from "react";
import type { Sheet, Workbook } from "@aicell/shared";
import { useReturnFocusOnClose } from "./useReturnFocusOnClose";

const STORE_KEY = "rodmansheets:lastSaveFormat";

type Format =
  | "xlsx" | "ods" | "xml"
  | "csv" | "tsv" | "psv"
  | "pdf" | "html" | "md"
  | "json" | "ndjson"
  | "ics" | "vcf";

type Props = {
  workbook: Workbook;
  activeSheet: Sheet;
  onClose: () => void;
};

export function SaveDialog({ workbook, activeSheet, onClose }: Props) {
  useReturnFocusOnClose();
  const [filename, setFilename] = useState(workbook.name || "workbook");
  const [format, setFormat] = useState<Format>(() => {
    const remembered = sessionStorage.getItem(STORE_KEY);
    return (remembered as Format) || "xlsx";
  });
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    sessionStorage.setItem(STORE_KEY, format);
    // Pure clones with the user's filename — exporters read .name
    // for the download filename, so this overrides without mutating
    // the live workbook state.
    const wb: Workbook = { ...workbook, name: filename || "workbook" };
    const sh: Sheet = { ...activeSheet, name: filename || activeSheet.name };
    try {
      const csv = await import("./csv");
      switch (format) {
        case "xlsx":   csv.exportWorkbookAsXLSX(wb); break;
        case "ods":    csv.exportWorkbookAsODS(wb);  break;
        case "xml":    csv.exportWorkbookAsXML(wb);  break;
        case "csv":    csv.exportSheetAsCSV(sh);     break;
        case "tsv":    csv.exportSheetAsTSV(sh);     break;
        case "psv":    csv.exportSheetAsPSV(sh);     break;
        case "pdf":    await csv.exportWorkbookAsPDF(wb); break;
        case "html":   csv.exportWorkbookAsHTML(wb); break;
        case "md":     csv.exportWorkbookAsMD(wb);   break;
        case "json":   csv.exportWorkbookAsJSON(wb); break;
        case "ndjson": csv.exportSheetAsNDJSON(sh);  break;
        case "ics":    csv.exportWorkbookAsICS(wb);  break;
        case "vcf":    csv.exportWorkbookAsVCF(wb); break;
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal save-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Save workbook"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span>Save workbook</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="save-dialog-body">
          <label className="save-dialog-row">
            <span>Filename</span>
            <input
              ref={ref}
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { onClose(); e.preventDefault(); }
                else if (e.key === "Enter") { void submit(); e.preventDefault(); }
              }}
            />
          </label>
          <label className="save-dialog-row">
            <span>Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
            >
              <optgroup label="Spreadsheet">
                <option value="xlsx">Excel workbook (.xlsx)</option>
                <option value="ods">OpenDocument (.ods)</option>
                <option value="xml">Excel XML (.xml)</option>
              </optgroup>
              <optgroup label="Delimited">
                <option value="csv">CSV — active sheet</option>
                <option value="tsv">TSV — active sheet</option>
                <option value="psv">PSV — active sheet</option>
              </optgroup>
              <optgroup label="Document">
                <option value="pdf">PDF</option>
                <option value="html">HTML</option>
                <option value="md">Markdown</option>
              </optgroup>
              <optgroup label="Data">
                <option value="json">JSON</option>
                <option value="ndjson">NDJSON — active sheet</option>
              </optgroup>
              <optgroup label="Calendar / Contacts">
                <option value="ics">iCalendar (.ics)</option>
                <option value="vcf">vCard (.vcf)</option>
              </optgroup>
            </select>
          </label>
        </div>
        <footer className="modal-footer save-dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={submit} disabled={busy}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
