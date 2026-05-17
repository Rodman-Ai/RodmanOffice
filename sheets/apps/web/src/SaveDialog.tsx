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
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    sessionStorage.setItem(STORE_KEY, format);
    // Pure clones with the user's filename — exporters read .name
    // for the download filename, so this overrides without mutating
    // the live workbook state.
    const wb: Workbook = { ...workbook, name: filename || "workbook" };
    const sh: Sheet = { ...activeSheet, name: filename || activeSheet.name };
    let ok = false;
    try {
      const csv = await import("./csv");
      // Every dispatch is awaited so the dialog stays open (with a
      // disabled Save button) until the encoder finishes. Closing
      // before await would race the download against unmount and
      // could swallow the file on a fast-navigation user.
      switch (format) {
        case "xlsx":   await csv.exportWorkbookAsXLSX(wb); break;
        case "ods":    await csv.exportWorkbookAsODS(wb);  break;
        case "xml":    await csv.exportWorkbookAsXML(wb);  break;
        case "csv":    await csv.exportSheetAsCSV(sh);     break;
        case "tsv":    await csv.exportSheetAsTSV(sh);     break;
        case "psv":    await csv.exportSheetAsPSV(sh);     break;
        case "pdf":    await csv.exportWorkbookAsPDF(wb);  break;
        case "html":   await csv.exportWorkbookAsHTML(wb); break;
        case "md":     await csv.exportWorkbookAsMD(wb);   break;
        case "json":   await csv.exportWorkbookAsJSON(wb); break;
        case "ndjson": await csv.exportSheetAsNDJSON(sh);  break;
        case "ics":    await csv.exportWorkbookAsICS(wb);  break;
        case "vcf":    await csv.exportWorkbookAsVCF(wb);  break;
      }
      ok = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
    if (ok) onClose();
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
          {error && (
            <div className="save-dialog-error" role="alert">
              Save failed: {error}
            </div>
          )}
        </div>
        <footer className="modal-footer save-dialog-actions">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={submit} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
