import type { CellFormat, NumberFormat } from "@aicell/shared";

type Props = {
  current: CellFormat | undefined;
  onPatch: (patch: Partial<CellFormat>) => void;
  onClear: () => void;
};

const NUMBER_FORMATS: { key: NumberFormat; label: string }[] = [
  { key: "general", label: "General" },
  { key: "number", label: "Number" },
  { key: "currency", label: "Currency" },
  { key: "percent", label: "Percent" },
  { key: "date", label: "Date" },
  { key: "datetime", label: "Date & time" },
];

export function FormatToolbar({ current, onPatch, onClear }: Props) {
  const fmt = current ?? {};
  return (
    <div className="format-toolbar">
      <button
        type="button"
        className={`fmt-btn${fmt.bold ? " active" : ""}`}
        title="Bold (⌘B)"
        onClick={() => onPatch({ bold: !fmt.bold })}
      >
        <b>B</b>
      </button>
      <button
        type="button"
        className={`fmt-btn${fmt.italic ? " active" : ""}`}
        title="Italic (⌘I)"
        onClick={() => onPatch({ italic: !fmt.italic })}
      >
        <i>I</i>
      </button>
      <button
        type="button"
        className={`fmt-btn${fmt.underline ? " active" : ""}`}
        title="Underline (⌘U)"
        onClick={() => onPatch({ underline: !fmt.underline })}
      >
        <u>U</u>
      </button>
      <span className="fmt-sep" />
      <button
        type="button"
        className={`fmt-btn${fmt.align === "left" ? " active" : ""}`}
        title="Align left"
        onClick={() => onPatch({ align: fmt.align === "left" ? undefined : "left" })}
      >
        ⇤
      </button>
      <button
        type="button"
        className={`fmt-btn${fmt.align === "center" ? " active" : ""}`}
        title="Align center"
        onClick={() => onPatch({ align: fmt.align === "center" ? undefined : "center" })}
      >
        ↔
      </button>
      <button
        type="button"
        className={`fmt-btn${fmt.align === "right" ? " active" : ""}`}
        title="Align right"
        onClick={() => onPatch({ align: fmt.align === "right" ? undefined : "right" })}
      >
        ⇥
      </button>
      <span className="fmt-sep" />
      <label className="fmt-color" title="Text color">
        A
        <input
          type="color"
          value={fmt.color ?? "#1f2937"}
          onChange={(e) => onPatch({ color: e.target.value })}
        />
      </label>
      <label className="fmt-color fmt-bg" title="Fill color">
        <span>▆</span>
        <input
          type="color"
          value={fmt.bg ?? "#ffffff"}
          onChange={(e) => onPatch({ bg: e.target.value })}
        />
      </label>
      <span className="fmt-sep" />
      <select
        className="fmt-select"
        value={fmt.numberFmt ?? "general"}
        onChange={(e) => onPatch({ numberFmt: e.target.value as NumberFormat })}
        title="Number format"
      >
        {NUMBER_FORMATS.map((nf) => (
          <option key={nf.key} value={nf.key}>
            {nf.label}
          </option>
        ))}
      </select>
      <span className="fmt-sep" />
      <button type="button" className="fmt-btn fmt-clear" title="Clear formatting" onClick={onClear}>
        ⌫ Clear
      </button>
    </div>
  );
}
