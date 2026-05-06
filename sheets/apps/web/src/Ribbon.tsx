// Word-style ribbon for AiCell. Uses the same .tabs / .ribbon /
// .ribbon-panel / .group / .group-row / .group-label class names and
// sizing language as RodmanWord, with Sheets' green palette.

import { useState, type ReactNode } from "react";
import type { CellFormat, NumberFormat } from "@aicell/shared";

export type RibbonActions = {
  // File
  newWorkbook: () => void;
  importFile: () => void;
  exportCsv: () => void;
  exportXlsx: () => void;
  // Edit
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  cut: () => void;
  copy: () => void;
  paste: () => void;
  clearSelection: () => void;
  openFindReplace: () => void;
  // Format
  format: CellFormat | undefined;
  patchFormat: (patch: Partial<CellFormat>) => void;
  clearFormat: () => void;
  openConditionalFormat: () => void;
  // Insert
  addSheet: () => void;
  openCommentModal: () => void;
  openFunctionPicker: () => void;
  insertSum: () => void;
  // Data
  sortAsc: () => void;
  sortDesc: () => void;
  removeDuplicates: () => void;
  // View
  panelOpen: boolean;
  togglePanel: () => void;
  // Help
  openAudit: () => void;
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

type Tab = "home" | "insert" | "formulas" | "data" | "review" | "view" | "help";

const TABS: { id: Tab; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "insert", label: "Insert" },
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
        {tab === "home" && (
          <div className="ribbon-panel active">
            <Group label="Clipboard">
              <Row>
                <BigBtn icon="📋" label="Paste" onClick={a.paste} />
              </Row>
              <Row>
                <Btn icon="✂" label="Cut" onClick={a.cut} title="Cut (⌘X)" />
              </Row>
              <Row>
                <Btn icon="⎘" label="Copy" onClick={a.copy} title="Copy (⌘C)" />
              </Row>
            </Group>

            <Group label="Font">
              <Row>
                <Btn
                  active={!!fmt.bold}
                  onClick={() => a.patchFormat({ bold: !fmt.bold })}
                  title="Bold (⌘B)"
                >
                  <b>B</b>
                </Btn>
                <Btn
                  active={!!fmt.italic}
                  onClick={() => a.patchFormat({ italic: !fmt.italic })}
                  title="Italic (⌘I)"
                >
                  <i>I</i>
                </Btn>
                <Btn
                  active={!!fmt.underline}
                  onClick={() => a.patchFormat({ underline: !fmt.underline })}
                  title="Underline (⌘U)"
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
                  <span style={{ background: fmt.bg ?? "transparent", outline: "1px solid #ccc" }}>▆</span>
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
                >⇤</Btn>
                <Btn
                  active={fmt.align === "center"}
                  onClick={() => a.patchFormat({ align: fmt.align === "center" ? undefined : "center" })}
                  title="Align center"
                >↔</Btn>
                <Btn
                  active={fmt.align === "right"}
                  onClick={() => a.patchFormat({ align: fmt.align === "right" ? undefined : "right" })}
                  title="Align right"
                >⇥</Btn>
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
                <Btn onClick={() => a.patchFormat({ numberFmt: "number" })} title="Comma separated">, </Btn>
              </Row>
            </Group>

            <Group label="Styles">
              <Row>
                <BigBtn icon="🎨" label="Conditional" onClick={a.openConditionalFormat} />
              </Row>
              <Row>
                <Btn icon="⌫" label="Clear" onClick={a.clearFormat} title="Clear formatting" />
              </Row>
            </Group>

            <Group label="Cells">
              <Row>
                <Btn icon="＋" label="Insert sheet" onClick={a.addSheet} />
              </Row>
              <Row>
                <Btn icon="🗑" label="Clear contents" onClick={a.clearSelection} title="Delete contents (Del)" />
              </Row>
            </Group>

            <Group label="Editing">
              <Row>
                <BigBtn icon="Σ" label="AutoSum" onClick={a.insertSum} title="Insert SUM at the active cell" />
              </Row>
              <Row>
                <Btn icon="🔍" label="Find &amp; Select" onClick={a.openFindReplace} title="Find &amp; replace (⌘F)" />
              </Row>
              <Row>
                <Btn icon="↑" label="Sort A→Z" onClick={a.sortAsc} title="Sort ascending by selected column" />
                <Btn icon="↓" label="Sort Z→A" onClick={a.sortDesc} title="Sort descending by selected column" />
              </Row>
            </Group>
          </div>
        )}

        {tab === "insert" && (
          <div className="ribbon-panel active">
            <Group label="Tables">
              <Row>
                <BigBtn icon="📑" label="New sheet" onClick={a.addSheet} />
              </Row>
            </Group>
            <Group label="Functions">
              <Row>
                <BigBtn icon="ƒₓ" label="Function…" onClick={a.openFunctionPicker} title="Insert function (⇧F3)" />
              </Row>
              <Row>
                <Btn icon="Σ" label="Sum" onClick={a.insertSum} />
              </Row>
            </Group>
            <Group label="Comments">
              <Row>
                <BigBtn icon="💬" label="Comment" onClick={a.openCommentModal} />
              </Row>
            </Group>
            <Group label="Files">
              <Row>
                <Btn icon="📂" label="Import…" onClick={a.importFile} />
              </Row>
              <Row>
                <Btn icon="↓" label="Export CSV" onClick={a.exportCsv} />
                <Btn icon="↓" label="Export XLSX" onClick={a.exportXlsx} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "formulas" && (
          <div className="ribbon-panel active">
            <Group label="Function library">
              <Row>
                <BigBtn icon="ƒₓ" label="Insert function" onClick={a.openFunctionPicker} title="Browse all functions (⇧F3)" />
              </Row>
              <Row>
                <Btn icon="Σ" label="AutoSum" onClick={a.insertSum} />
              </Row>
            </Group>
            <Group label="Auditing">
              <Row>
                <BigBtn icon="🔎" label="Audit formulas" onClick={a.openAudit} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "data" && (
          <div className="ribbon-panel active">
            <Group label="Get data">
              <Row>
                <BigBtn icon="📂" label="Import file" onClick={a.importFile} />
              </Row>
            </Group>
            <Group label="Sort &amp; filter">
              <Row>
                <Btn icon="↑" label="Sort A→Z" onClick={a.sortAsc} />
                <Btn icon="↓" label="Sort Z→A" onClick={a.sortDesc} />
              </Row>
            </Group>
            <Group label="Data tools">
              <Row>
                <Btn icon="⊟" label="Remove duplicates" onClick={a.removeDuplicates} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "review" && (
          <div className="ribbon-panel active">
            <Group label="Comments">
              <Row>
                <BigBtn icon="💬" label="New comment" onClick={a.openCommentModal} />
              </Row>
            </Group>
            <Group label="Find">
              <Row>
                <Btn icon="🔍" label="Find &amp; replace" onClick={a.openFindReplace} title="⌘F" />
              </Row>
            </Group>
          </div>
        )}

        {tab === "view" && (
          <div className="ribbon-panel active">
            <Group label="Show">
              <Row>
                <Btn
                  active={a.panelOpen}
                  onClick={a.togglePanel}
                  icon="🤖"
                  label="Ask Claude panel"
                />
              </Row>
            </Group>
            <Group label="Workbook">
              <Row>
                <Btn icon="＋" label="New" onClick={a.newWorkbook} />
              </Row>
            </Group>
          </div>
        )}

        {tab === "help" && (
          <div className="ribbon-panel active">
            <Group label="Help">
              <Row>
                <BigBtn icon="ƒₓ" label="Function reference" onClick={a.openFunctionPicker} />
              </Row>
              <Row>
                <Btn icon="🔎" label="Audit formulas" onClick={a.openAudit} />
              </Row>
            </Group>
            <Group label="About">
              <Row>
                <Btn icon="ⓘ" label="About RodmanSheets" onClick={a.about} />
              </Row>
            </Group>
          </div>
        )}
      </section>
    </>
  );
}

// ---------- tiny presentational primitives — match Word/Slides class names ----------

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

function BigBtn({ onClick, title, icon, label }: BtnProps) {
  return (
    <button
      type="button"
      className="ribbon-btn wide"
      onClick={onClick}
      title={title || label}
    >
      <span className="ribbon-btn-icon">{icon}</span>
      <span className="ribbon-btn-text">{label}</span>
    </button>
  );
}
