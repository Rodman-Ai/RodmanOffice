// Word-style ribbon for RodmanSheets. Uses the shared .tabs / .ribbon /
// .ribbon-panel / .group / .group-row / .group-label class names and
// sizing language, with Sheets' green palette.

import { useState, type ReactNode } from "react";
import type { CellFormat, ChartType, NumberFormat } from "@aicell/shared";
import type { FunctionCategory } from "./functions";

export type RibbonActions = {
  // File
  newWorkbook: () => void;
  importFile: () => void;
  exportCsv: () => void;
  exportXlsx: () => void;
  // Part 12: extra exports.
  exportTsv: () => void;
  exportPsv: () => void;
  exportJson: () => void;
  exportNdjson: () => void;
  exportHtml: () => void;
  exportMd: () => void;
  exportXml: () => void;
  exportOds: () => void;
  exportVcf: () => void;
  exportIcs: () => void;
  exportPdf: () => void;
  // Edit
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  pasteValues: () => void;
  startFormatPainter: () => void;
  formatPainterActive: boolean;
  clearSelection: () => void;
  openFindReplace: () => void;
  // Format
  format: CellFormat | undefined;
  patchFormat: (patch: Partial<CellFormat>) => void;
  clearFormat: () => void;
  openConditionalFormat: () => void;
  insertRowAbove: () => void;
  insertColLeft: () => void;
  deleteRows: () => void;
  deleteCols: () => void;
  // Insert
  addSheet: () => void;
  duplicateSheet: () => void;
  renameSheet: () => void;
  insertSymbol: () => void;
  insertLink: () => void;
  openCommentModal: () => void;
  clearComments: () => void;
  openFunctionPicker: (category?: FunctionCategory | null) => void;
  insertSum: () => void;
  recalculate: () => void;
  showFormulas: boolean;
  toggleShowFormulas: () => void;
  canInsertChart: boolean;
  insertChart: (type: ChartType) => void;
  // Data
  sortAsc: () => void;
  sortDesc: () => void;
  removeDuplicates: () => void;
  textToColumns: () => void;
  // View
  panelOpen: boolean;
  togglePanel: () => void;
  showGridlines: boolean;
  toggleGridlines: () => void;
  showHeadings: boolean;
  toggleHeadings: () => void;
  focusCell: boolean;
  toggleFocusCell: () => void;
  // Help
  openAudit: () => void;
  openWorkbookStats: () => void;
  openWhatsNew: () => void;
  openTraining: () => void;
  openSupport: () => void;
  openFeedback: () => void;
  openCommunity: () => void;
  openInstallHelp: () => void;
  about: () => void;
};

const NUMBER_FORMATS: { key: NumberFormat; label: string }[] = [
  { key: "general", label: "General" },
  { key: "number", label: "Number" },
  { key: "currency", label: "Currency" },
  { key: "percent", label: "Percent" },
  { key: "date", label: "Date" },
  { key: "datetime", label: "Date & time" },
];

type Tab = "file" | "home" | "insert" | "pageLayout" | "formulas" | "data" | "review" | "view" | "help";

const TABS: { id: Tab; label: string }[] = [
  { id: "file", label: "File" },
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
  { id: "pageLayout", label: "Page Layout" },
  { id: "formulas", label: "Formulas" },
  { id: "data", label: "Data" },
  { id: "review", label: "Review" },
  { id: "view", label: "View" },
  { id: "help", label: "Help" },
];

export function Ribbon({ a }: { a: RibbonActions }) {
  const [tab, setTab] = useState<Tab>("home");
  const fmt = a.format ?? {};
  return (
    <>
      <nav className="tabs" role="tablist" aria-label="Ribbon tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="ribbon" role="tabpanel">
        {tab === "file" && (
          <div className="ribbon-panel active">
            <Group label="Workbook">
              <Row>
                <BigBtn icon="+" label="New" onClick={a.newWorkbook} />
                <BigBtn icon="Open" label="Import" onClick={a.importFile} />
              </Row>
            </Group>
            <Group label="Export">
              <Row>
                <BigBtn icon="CSV" label="Export CSV" onClick={a.exportCsv} />
                <BigBtn icon="XLSX" label="Export XLSX" onClick={a.exportXlsx} />
                <BigBtn icon="PDF" label="Export PDF" onClick={a.exportPdf} />
              </Row>
            </Group>
            <Group label="More formats">
              <Row>
                <BigBtn icon="TSV" label="TSV" onClick={a.exportTsv} />
                <BigBtn icon="PSV" label="PSV" onClick={a.exportPsv} />
                <BigBtn icon="JSON" label="JSON" onClick={a.exportJson} />
                <BigBtn icon="ND" label="NDJSON" onClick={a.exportNdjson} />
                <BigBtn icon="HTML" label="HTML" onClick={a.exportHtml} />
                <BigBtn icon="MD" label="Markdown" onClick={a.exportMd} />
                <BigBtn icon="XML" label="Excel XML" onClick={a.exportXml} />
                <BigBtn icon="ODS" label="ODS" onClick={a.exportOds} />
                <BigBtn icon="VCF" label="vCard" onClick={a.exportVcf} />
                <BigBtn icon="ICS" label="iCal" onClick={a.exportIcs} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "home" && (
          <div className="ribbon-panel active">
            <Group label="Clipboard">
              <Row>
                <BigBtn icon="Paste" label="Paste" onClick={a.paste} />
              </Row>
              <Row>
                <Btn icon="123" label="Paste Values" onClick={a.pasteValues} title="Paste plain values" />
                <Btn icon="Cut" label="Cut" onClick={a.cut} title="Cut" />
                <Btn icon="Copy" label="Copy" onClick={a.copy} title="Copy" />
                <Btn
                  active={a.formatPainterActive}
                  icon="Brush"
                  label="Format Painter"
                  onClick={a.startFormatPainter}
                  title="Copy the active cell format, then select a target range"
                />
              </Row>
            </Group>

            <Group label="Font">
              <Row>
                <select
                  className="select"
                  value={fmt.fontFamily ?? ""}
                  onChange={(e) => a.patchFormat({ fontFamily: e.target.value || undefined })}
                  title="Font family"
                  style={{ width: 130 }}
                >
                  <option value="">Default</option>
                  <option value="Aptos, Calibri, Arial, sans-serif">Aptos</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="'Courier New', monospace">Courier New</option>
                  <option value="'Times New Roman', Times, serif">Times New Roman</option>
                </select>
                <select
                  className="select sm"
                  value={fmt.fontSize ?? ""}
                  onChange={(e) => a.patchFormat({ fontSize: e.target.value ? Number(e.target.value) : undefined })}
                  title="Font size"
                >
                  <option value="">Size</option>
                  {[10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map((size) => (
                    <option key={size} value={size}>{size}</option>
                  ))}
                </select>
              </Row>
              <Row>
                <Btn
                  active={!!fmt.bold}
                  onClick={() => a.patchFormat({ bold: !fmt.bold })}
                  title="Bold"
                >
                  <b>B</b>
                </Btn>
                <Btn
                  active={!!fmt.italic}
                  onClick={() => a.patchFormat({ italic: !fmt.italic })}
                  title="Italic"
                >
                  <i>I</i>
                </Btn>
                <Btn
                  active={!!fmt.underline}
                  onClick={() => a.patchFormat({ underline: !fmt.underline })}
                  title="Underline"
                >
                  <u>U</u>
                </Btn>
                <label className="ribbon-btn color" title="Font color">
                  <span style={{ borderBottom: `2px solid ${fmt.color ?? "#dc2626"}` }}>A</span>
                  <input
                    type="color"
                    value={fmt.color ?? "#1f2937"}
                    onChange={(e) => a.patchFormat({ color: e.target.value })}
                  />
                </label>
                <label className="ribbon-btn color" title="Fill color">
                  <span style={{ background: fmt.bg ?? "transparent", outline: "1px solid #ccc" }}>Fill</span>
                  <input
                    type="color"
                    value={fmt.bg ?? "#ffffff"}
                    onChange={(e) => a.patchFormat({ bg: e.target.value })}
                  />
                </label>
              </Row>
            </Group>

            <Group label="Alignment">
              <Row>
                <Btn
                  active={fmt.align === "left"}
                  onClick={() => a.patchFormat({ align: fmt.align === "left" ? undefined : "left" })}
                  title="Align left"
                >Left</Btn>
                <Btn
                  active={fmt.align === "center"}
                  onClick={() => a.patchFormat({ align: fmt.align === "center" ? undefined : "center" })}
                  title="Align center"
                >Center</Btn>
                <Btn
                  active={fmt.align === "right"}
                  onClick={() => a.patchFormat({ align: fmt.align === "right" ? undefined : "right" })}
                  title="Align right"
                >Right</Btn>
                <Btn
                  active={!!fmt.wrap}
                  onClick={() => a.patchFormat({ wrap: !fmt.wrap })}
                  title="Wrap text"
                >Wrap</Btn>
                <Btn
                  active={!!fmt.border}
                  onClick={() => a.patchFormat({ border: !fmt.border })}
                  title="Toggle cell borders"
                >Borders</Btn>
              </Row>
            </Group>

            <Group label="Number">
              <Row>
                <select
                  className="select"
                  value={fmt.numberFmt ?? "general"}
                  onChange={(e) => a.patchFormat({ numberFmt: e.target.value as NumberFormat })}
                  title="Number format"
                  style={{ width: 130 }}
                >
                  {NUMBER_FORMATS.map((nf) => (
                    <option key={nf.key} value={nf.key}>{nf.label}</option>
                  ))}
                </select>
              </Row>
              <Row>
                <Btn onClick={() => a.patchFormat({ numberFmt: "currency" })} title="Currency">$</Btn>
                <Btn onClick={() => a.patchFormat({ numberFmt: "percent" })} title="Percent">%</Btn>
                <Btn onClick={() => a.patchFormat({ numberFmt: "number" })} title="Comma separated">,</Btn>
                <Btn
                  onClick={() => a.patchFormat({ decimals: Math.max(0, (fmt.decimals ?? 2) - 1) })}
                  title="Decrease decimals"
                >.0</Btn>
                <Btn
                  onClick={() => a.patchFormat({ decimals: Math.min(8, (fmt.decimals ?? 2) + 1) })}
                  title="Increase decimals"
                >.00</Btn>
              </Row>
            </Group>

            <Group label="Styles">
              <Row>
                <BigBtn icon="CF" label="Conditional Formatting" onClick={a.openConditionalFormat} />
              </Row>
              <Row>
                <Btn icon="Clear" label="Clear Formats" onClick={a.clearFormat} title="Clear formatting" />
              </Row>
            </Group>

            <Group label="Cells">
              <Row>
                <Btn icon="+" label="Insert Sheet" onClick={a.addSheet} />
                <Btn icon="Row+" label="Insert Row" onClick={a.insertRowAbove} />
                <Btn icon="Col+" label="Insert Column" onClick={a.insertColLeft} />
              </Row>
              <Row>
                <Btn icon="Del" label="Clear Contents" onClick={a.clearSelection} title="Delete contents" />
                <Btn icon="Row-" label="Delete Row" onClick={a.deleteRows} />
                <Btn icon="Col-" label="Delete Column" onClick={a.deleteCols} />
              </Row>
            </Group>

            <Group label="Editing">
              <Row>
                <Btn icon="Undo" label="Undo" onClick={a.undo} disabled={!a.canUndo} />
                <Btn icon="Redo" label="Redo" onClick={a.redo} disabled={!a.canRedo} />
              </Row>
              <Row>
                <BigBtn icon="SUM" label="AutoSum" onClick={a.insertSum} title="Insert SUM at the active cell" />
              </Row>
              <Row>
                <Btn icon="Find" label="Find & Select" onClick={a.openFindReplace} title="Find and replace" />
                <Btn icon="AZ" label="Sort A-Z" onClick={a.sortAsc} title="Sort ascending by selected column" />
                <Btn icon="ZA" label="Sort Z-A" onClick={a.sortDesc} title="Sort descending by selected column" />
              </Row>
            </Group>
          </div>
        )}

        {tab === "insert" && (
          <div className="ribbon-panel active">
            <Group label="Tables">
              <Row>
                <BigBtn icon="Sheet" label="New Sheet" onClick={a.addSheet} />
                <BigBtn icon="Copy" label="Duplicate Sheet" onClick={a.duplicateSheet} />
                <BigBtn icon="Name" label="Rename Sheet" onClick={a.renameSheet} />
              </Row>
            </Group>
            <Group label="Charts">
              <Row>
                <Btn icon="Bar" label="Bar" onClick={() => a.insertChart("bar")} disabled={!a.canInsertChart} />
                <Btn icon="Line" label="Line" onClick={() => a.insertChart("line")} disabled={!a.canInsertChart} />
                <Btn icon="Area" label="Area" onClick={() => a.insertChart("area")} disabled={!a.canInsertChart} />
              </Row>
              <Row>
                <Btn icon="Pie" label="Pie" onClick={() => a.insertChart("pie")} disabled={!a.canInsertChart} />
                <Btn icon="Scatter" label="Scatter" onClick={() => a.insertChart("scatter")} disabled={!a.canInsertChart} />
              </Row>
            </Group>
            <Group label="Comments">
              <Row>
                <BigBtn icon="Comment" label="Comment" onClick={a.openCommentModal} />
              </Row>
            </Group>
            <Group label="Text">
              <Row>
                <Btn icon="Link" label="Link" onClick={a.insertLink} title="Insert a URL in the active cell" />
                <Btn icon="Ω" label="Symbol" onClick={a.insertSymbol} title="Insert a symbol in the active cell" />
              </Row>
            </Group>
          </div>
        )}

        {tab === "pageLayout" && (
          <div className="ribbon-panel active">
            <Group label="Sheet Options">
              <Row>
                <Toggle checked={a.showGridlines} label="Gridlines" onChange={a.toggleGridlines} />
                <Toggle checked={a.showHeadings} label="Headings" onChange={a.toggleHeadings} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "formulas" && (
          <div className="ribbon-panel active">
            <Group label="Function Library">
              <Row>
                <BigBtn icon="fx" label="Insert Function" onClick={() => a.openFunctionPicker(null)} title="Browse all functions" />
                <BigBtn icon="SUM" label="AutoSum" onClick={a.insertSum} />
              </Row>
              <Row>
                <Btn icon="Math" label="Math" onClick={() => a.openFunctionPicker("Math & Stats")} />
                <Btn icon="Logic" label="Logic" onClick={() => a.openFunctionPicker("Logic")} />
                <Btn icon="Lookup" label="Lookup" onClick={() => a.openFunctionPicker("Lookup & Reference")} />
              </Row>
              <Row>
                <Btn icon="Text" label="Text" onClick={() => a.openFunctionPicker("Text")} />
                <Btn icon="Date" label="Date" onClick={() => a.openFunctionPicker("Date & Time")} />
                <Btn icon="More" label="More Functions" onClick={() => a.openFunctionPicker(null)} />
              </Row>
            </Group>
            <Group label="Formula Auditing">
              <Row>
                <BigBtn icon="Audit" label="Audit Formulas" onClick={a.openAudit} />
              </Row>
              <Row>
                <Toggle checked={a.showFormulas} label="Show Formulas" onChange={a.toggleShowFormulas} />
                <Btn icon="Calc" label="Recalculate" onClick={a.recalculate} title="Recalculate workbook formulas" />
                <Btn icon="Check" label="Error Checking" onClick={a.openAudit} title="Open formula audit results" />
              </Row>
            </Group>
          </div>
        )}

        {tab === "data" && (
          <div className="ribbon-panel active">
            <Group label="Get Data">
              <Row>
                <BigBtn icon="Import" label="Import File" onClick={a.importFile} />
              </Row>
            </Group>
            <Group label="Sort & Filter">
              <Row>
                <Btn icon="AZ" label="Sort A-Z" onClick={a.sortAsc} />
                <Btn icon="ZA" label="Sort Z-A" onClick={a.sortDesc} />
              </Row>
            </Group>
            <Group label="Data Tools">
              <Row>
                <Btn icon="Dedupe" label="Remove Duplicates" onClick={a.removeDuplicates} />
                <Btn icon="Split" label="Text to Columns" onClick={a.textToColumns} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "review" && (
          <div className="ribbon-panel active">
            <Group label="Comments">
              <Row>
                <BigBtn icon="Comment" label="New Comment" onClick={a.openCommentModal} />
                <BigBtn icon="Clear" label="Clear Comments" onClick={a.clearComments} />
              </Row>
            </Group>
            <Group label="Performance">
              <Row>
                <BigBtn icon="Audit" label="Audit Formulas" onClick={a.openAudit} />
                <BigBtn icon="Stats" label="Check Performance" onClick={a.openWorkbookStats} />
              </Row>
            </Group>
            <Group label="Statistics">
              <Row>
                <BigBtn icon="Stats" label="Workbook Statistics" onClick={a.openWorkbookStats} />
              </Row>
            </Group>
            <Group label="Find">
              <Row>
                <Btn icon="Find" label="Find & Replace" onClick={a.openFindReplace} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "view" && (
          <div className="ribbon-panel active">
            <Group label="Show">
              <Row>
                <Toggle checked={a.showGridlines} label="Gridlines" onChange={a.toggleGridlines} />
                <Toggle checked={a.showHeadings} label="Headings" onChange={a.toggleHeadings} />
                <Toggle checked={a.focusCell} label="Focus Cell" onChange={a.toggleFocusCell} />
              </Row>
            </Group>
            <Group label="AI Panel">
              <Row>
                <Btn
                  active={a.panelOpen}
                  onClick={a.togglePanel}
                  icon="Claude"
                  label="Ask Claude"
                />
              </Row>
            </Group>
            <Group label="Workbook">
              <Row>
                <Btn icon="New" label="New Workbook" onClick={a.newWorkbook} />
                <Btn icon="Copy" label="Duplicate Sheet" onClick={a.duplicateSheet} />
                <Btn icon="Name" label="Rename Sheet" onClick={a.renameSheet} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "help" && (
          <div className="ribbon-panel active">
            <Group label="Help">
              <Row>
                <BigBtn icon="fx" label="Function Reference" onClick={() => a.openFunctionPicker(null)} />
                <BigBtn icon="New" label="What's New" onClick={a.openWhatsNew} />
              </Row>
              <Row>
                <Btn icon="Audit" label="Audit Formulas" onClick={a.openAudit} />
                <Btn icon="Learn" label="Training" onClick={a.openTraining} />
              </Row>
            </Group>
            <Group label="Support">
              <Row>
                <Btn icon="Help" label="Contact Support" onClick={a.openSupport} />
                <Btn icon="Feedback" label="Feedback" onClick={a.openFeedback} />
              </Row>
              <Row>
                <Btn icon="Community" label="Community" onClick={a.openCommunity} />
              </Row>
            </Group>
            <Group label="About">
              <Row>
                <Btn icon="Install" label="Install App" onClick={a.openInstallHelp} />
                <Btn icon="Info" label="About RodmanSheets" onClick={a.about} />
              </Row>
            </Group>
          </div>
        )}
      </section>
    </>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group">
      <div style={{ flex: 1 }}>{children}</div>
      <div className="group-label">{label}</div>
    </div>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="group-row">{children}</div>;
}

type BtnProps = {
  onClick?: () => void;
  title?: string;
  active?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  label?: string;
  children?: ReactNode;
};

function Btn({ onClick, title, active, disabled, icon, label, children }: BtnProps) {
  return (
    <button
      type="button"
      className={`ribbon-btn${active ? " active" : ""}`}
      onClick={onClick}
      title={title || label}
      disabled={disabled}
    >
      {icon && <span className="ribbon-btn-icon">{icon}</span>}
      {label && <span className="ribbon-btn-text">{label}</span>}
      {children}
    </button>
  );
}

function BigBtn({ onClick, title, icon, label, disabled }: BtnProps) {
  return (
    <button
      type="button"
      className="ribbon-btn wide"
      onClick={onClick}
      title={title || label}
      disabled={disabled}
    >
      <span className="ribbon-btn-icon">{icon}</span>
      <span className="ribbon-btn-text">{label}</span>
    </button>
  );
}

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="ribbon-toggle">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
