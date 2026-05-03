import { useState } from "react";
import type {
  CellFormat,
  CFCondition,
  ConditionalRule,
  RangeBounds,
} from "@aicell/shared";
import { rangeBoundsToA1 } from "./conditional";
import { useReturnFocusOnClose } from "./useReturnFocusOnClose";

type ConditionType = CFCondition["type"];

type Props = {
  rules: ConditionalRule[];
  selection: RangeBounds;
  onAdd: (rule: ConditionalRule) => void;
  onRemove: (ruleId: string) => void;
  onClose: () => void;
};

const PRESETS: { label: string; style: Partial<CellFormat> }[] = [
  { label: "Red fill", style: { bg: "#fee2e2", color: "#991b1b" } },
  { label: "Yellow fill", style: { bg: "#fef3c7", color: "#92400e" } },
  { label: "Green fill", style: { bg: "#dcfce7", color: "#166534" } },
  { label: "Blue fill", style: { bg: "#dbeafe", color: "#1e40af" } },
  { label: "Bold", style: { bold: true } },
];

const CONDITION_LABELS: { value: ConditionType; label: string }[] = [
  { value: "greaterThan", label: "Greater than" },
  { value: "greaterThanOrEqual", label: "Greater than or equal to" },
  { value: "lessThan", label: "Less than" },
  { value: "lessThanOrEqual", label: "Less than or equal to" },
  { value: "equals", label: "Equals" },
  { value: "notEquals", label: "Does not equal" },
  { value: "between", label: "Between" },
  { value: "contains", label: "Text contains" },
  { value: "isEmpty", label: "Is empty" },
  { value: "isNotEmpty", label: "Is not empty" },
];

export function ConditionalFormatModal({ rules, selection, onAdd, onRemove, onClose }: Props) {
  useReturnFocusOnClose();
  const [conditionType, setConditionType] = useState<ConditionType>("greaterThan");
  const [valueA, setValueA] = useState("0");
  const [valueB, setValueB] = useState("100");
  const [presetIdx, setPresetIdx] = useState(0);

  const selectionLabel = rangeBoundsToA1(selection);

  const buildCondition = (): CFCondition | null => {
    switch (conditionType) {
      case "greaterThan":
      case "greaterThanOrEqual":
      case "lessThan":
      case "lessThanOrEqual": {
        const n = Number(valueA);
        if (!Number.isFinite(n)) return null;
        return { type: conditionType, value: n };
      }
      case "equals":
      case "notEquals":
        return { type: conditionType, value: valueA };
      case "between": {
        const a = Number(valueA);
        const b = Number(valueB);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
        return { type: "between", min: Math.min(a, b), max: Math.max(a, b) };
      }
      case "contains":
        return { type: "contains", text: valueA, matchCase: false };
      case "isEmpty":
        return { type: "isEmpty" };
      case "isNotEmpty":
        return { type: "isNotEmpty" };
    }
  };

  const onAddClick = () => {
    const condition = buildCondition();
    if (!condition) return;
    const preset = PRESETS[presetIdx]!;
    const rule: ConditionalRule = {
      id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      range: selection,
      condition,
      style: preset.style,
    };
    onAdd(rule);
  };

  const showSecondValue = conditionType === "between";
  const showFirstValue =
    conditionType !== "isEmpty" && conditionType !== "isNotEmpty";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal cf-modal"
        role="dialog"
        aria-label="Conditional formatting"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span>Conditional formatting</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="cf-body">
          <section className="cf-add">
            <h4>Add rule</h4>
            <div className="cf-row">
              <span className="cf-label">When cell</span>
              <select
                className="fmt-select"
                value={conditionType}
                onChange={(e) => setConditionType(e.target.value as ConditionType)}
              >
                {CONDITION_LABELS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            {showFirstValue && (
              <div className="cf-row">
                <span className="cf-label">Value</span>
                <input
                  value={valueA}
                  onChange={(e) => setValueA(e.target.value)}
                />
                {showSecondValue && (
                  <>
                    <span className="cf-label">and</span>
                    <input
                      value={valueB}
                      onChange={(e) => setValueB(e.target.value)}
                    />
                  </>
                )}
              </div>
            )}
            <div className="cf-row">
              <span className="cf-label">Style</span>
              <select
                className="fmt-select"
                value={presetIdx}
                onChange={(e) => setPresetIdx(Number(e.target.value))}
              >
                {PRESETS.map((p, i) => (
                  <option key={i} value={i}>{p.label}</option>
                ))}
              </select>
              <span
                className="cf-preview"
                style={{
                  background: PRESETS[presetIdx]!.style.bg ?? "white",
                  color: PRESETS[presetIdx]!.style.color ?? "#1f2937",
                  fontWeight: PRESETS[presetIdx]!.style.bold ? 600 : 400,
                  fontStyle: PRESETS[presetIdx]!.style.italic ? "italic" : "normal",
                }}
              >
                Preview 123
              </span>
            </div>
            <div className="cf-row cf-row-actions">
              <span className="cf-label">Apply to</span>
              <code className="cf-range">{selectionLabel}</code>
              <button type="button" className="primary cf-add-btn" onClick={onAddClick}>
                Add rule
              </button>
            </div>
          </section>
          <section className="cf-list">
            <h4>Existing rules ({rules.length})</h4>
            {rules.length === 0 && (
              <div className="cf-empty">No rules on this sheet yet.</div>
            )}
            <ul>
              {rules.map((r) => (
                <li key={r.id} className="cf-item">
                  <code>{rangeBoundsToA1(r.range)}</code>
                  <span className="cf-item-cond">{describeCondition(r.condition)}</span>
                  <span
                    className="cf-preview small"
                    style={{
                      background: r.style.bg ?? "white",
                      color: r.style.color ?? "#1f2937",
                      fontWeight: r.style.bold ? 600 : 400,
                    }}
                  >
                    Aa
                  </span>
                  <button onClick={() => onRemove(r.id)} aria-label="Remove rule">×</button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function describeCondition(c: CFCondition): string {
  switch (c.type) {
    case "greaterThan": return `> ${c.value}`;
    case "greaterThanOrEqual": return `>= ${c.value}`;
    case "lessThan": return `< ${c.value}`;
    case "lessThanOrEqual": return `<= ${c.value}`;
    case "equals": return `= "${c.value}"`;
    case "notEquals": return `≠ "${c.value}"`;
    case "between": return `between ${c.min} and ${c.max}`;
    case "contains": return `contains "${c.text}"`;
    case "isEmpty": return "is empty";
    case "isNotEmpty": return "is not empty";
  }
}
