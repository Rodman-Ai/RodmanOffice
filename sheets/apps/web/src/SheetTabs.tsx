import type { MouseEvent } from "react";
import type { Sheet } from "@aicell/shared";

type Props = {
  sheets: Sheet[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
};

export function SheetTabs({ sheets, activeId, onSelect, onAdd, onDelete }: Props) {
  const requestDelete = (e: MouseEvent, sheet: Sheet) => {
    e.stopPropagation();
    const hasContent = Object.keys(sheet.cells).length > 0;
    if (
      hasContent &&
      !window.confirm(`Delete sheet "${sheet.name}" and its contents?`)
    ) {
      return;
    }
    onDelete(sheet.id);
  };
  return (
    <div className="sheet-tabs" role="tablist">
      {sheets.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={s.id === activeId}
          className={`sheet-tab${s.id === activeId ? " active" : ""}`}
          onClick={() => onSelect(s.id)}
          title={s.name}
        >
          <span className="sheet-tab-label">{s.name}</span>
          {sheets.length > 1 && (
            <span
              className="sheet-tab-close"
              aria-label={`Delete ${s.name}`}
              onClick={(e) => requestDelete(e, s)}
            >
              ×
            </span>
          )}
        </button>
      ))}
      <button
        className="sheet-tab sheet-tab-add"
        onClick={onAdd}
        aria-label="New sheet"
        title="New sheet"
      >
        +
      </button>
    </div>
  );
}
