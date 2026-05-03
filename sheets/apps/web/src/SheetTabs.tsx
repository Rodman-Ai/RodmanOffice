import type { Sheet } from "@aicell/shared";

type Props = {
  sheets: Sheet[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
};

export function SheetTabs({ sheets, activeId, onSelect, onAdd }: Props) {
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
          {s.name}
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
