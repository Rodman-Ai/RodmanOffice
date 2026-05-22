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
        <div key={s.id} className={`sheet-tab${s.id === activeId ? " active" : ""}`}>
          <button
            type="button"
            role="tab"
            aria-selected={s.id === activeId}
            className="sheet-tab-select"
            onClick={() => onSelect(s.id)}
            title={s.name}
          >
            {s.name}
          </button>
          {sheets.length > 1 && (
            <button
              type="button"
              className="sheet-tab-close"
              aria-label={`Delete sheet ${s.name}`}
              title={`Delete sheet ${s.name}`}
              onClick={(e) => requestDelete(e, s)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
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
