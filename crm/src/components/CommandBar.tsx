"use client";

import { useRef, useState } from "react";
import { exportWorkbookXlsx, importWorkbookXlsx } from "@/lib/workbook";

export function CommandBar({ pageLabel }: { pageLabel?: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport() {
    if (busy) return;
    setBusy("export");
    setMessage(null);
    try {
      const r = await exportWorkbookXlsx();
      setMessage(`Exported ${r.sheetCount} sheet${r.sheetCount === 1 ? "" : "s"} as .xlsx`);
    } catch (err) {
      console.warn("[workbook] export failed", err);
      setMessage("Export failed — " + ((err as Error)?.message || "see console"));
    } finally {
      setBusy(null);
    }
  }

  function pickImport() {
    if (busy) return;
    fileInputRef.current?.click();
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!confirm(
      `Import "${file.name}"?\n\nRows whose id matches an existing record will be updated; rows with new or missing ids will be added. Unknown sheets are skipped.`,
    )) return;
    setBusy("import");
    setMessage(null);
    try {
      const r = await importWorkbookXlsx(file);
      const totalAppended = r.summary.reduce((n, s) => n + s.appended, 0);
      const totalUpdated = r.summary.reduce((n, s) => n + s.updated, 0);
      setMessage(`Imported — ${totalAppended} added, ${totalUpdated} updated across ${r.summary.length} sheet${r.summary.length === 1 ? "" : "s"}.`);
    } catch (err) {
      console.warn("[workbook] import failed", err);
      setMessage("Import failed — " + ((err as Error)?.message || "see console"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-dyn-line bg-dyn-bar px-4 text-sm text-dyn-fg"
      role="toolbar"
      aria-label="Workbook actions"
    >
      <nav className="flex items-center gap-1.5 text-xs text-dyn-crumb" aria-label="Breadcrumb">
        <span>LeoCRM</span>
        {pageLabel ? (
          <>
            <span className="opacity-60">›</span>
            <span className="font-semibold text-dyn-fg">{pageLabel}</span>
          </>
        ) : null}
      </nav>
      <div className="flex items-center gap-1">
        {message ? (
          <span className="hidden text-xs text-dyn-crumb md:inline" role="status">{message}</span>
        ) : null}
        <button
          type="button"
          onClick={handleExport}
          disabled={busy !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 hover:bg-dyn-hover disabled:opacity-50"
          title="Download every collection as a multi-sheet .xlsx"
        >
          <span aria-hidden className="text-dyn-accent">⇩</span>
          <span className="hidden sm:inline">{busy === "export" ? "Exporting…" : "Export to Excel"}</span>
        </button>
        <button
          type="button"
          onClick={pickImport}
          disabled={busy !== null}
          className="inline-flex h-8 items-center gap-1.5 rounded-sm px-2.5 hover:bg-dyn-hover disabled:opacity-50"
          title="Import an .xlsx exported from LeoCRM (or matching headers)"
        >
          <span aria-hidden className="text-dyn-accent">⇧</span>
          <span className="hidden sm:inline">{busy === "import" ? "Importing…" : "Import workbook"}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          onChange={handleFile}
        />
      </div>
    </div>
  );
}
