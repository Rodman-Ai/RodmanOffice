import { useEffect, useMemo, useRef, useState } from "react";
import { FUNCTIONS, FUNCTION_CATEGORIES, type FunctionEntry } from "./functions";
import { useReturnFocusOnClose } from "./useReturnFocusOnClose";

type Props = {
  onPick: (entry: FunctionEntry) => void;
  onClose: () => void;
};

export function FunctionPicker({ onPick, onClose }: Props) {
  useReturnFocusOnClose();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FUNCTIONS;
    return FUNCTIONS.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.summary.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered, activeIdx]);

  const grouped = useMemo(() => {
    const map = new Map<string, FunctionEntry[]>();
    for (const cat of FUNCTION_CATEGORIES) map.set(cat, []);
    for (const f of filtered) map.get(f.category)?.push(f);
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [filtered]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal function-picker"
        role="dialog"
        aria-label="Insert function"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span>Insert function</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="function-picker-search">
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Search 50 functions…"
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIdx(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
                e.preventDefault();
              } else if (e.key === "ArrowUp") {
                setActiveIdx((i) => Math.max(i - 1, 0));
                e.preventDefault();
              } else if (e.key === "Enter") {
                const pick = filtered[activeIdx];
                if (pick) onPick(pick);
                e.preventDefault();
              } else if (e.key === "Escape") {
                onClose();
                e.preventDefault();
              }
            }}
          />
          <span className="function-picker-count">
            {filtered.length} of {FUNCTIONS.length}
          </span>
        </div>
        <div className="function-picker-list">
          {grouped.length === 0 && (
            <div className="function-picker-empty">No functions match "{query}".</div>
          )}
          {grouped.map(([cat, list]) => (
            <section key={cat} className="function-picker-group">
              <h4>{cat}</h4>
              <ul>
                {list.map((f) => {
                  const idx = filtered.indexOf(f);
                  const active = idx === activeIdx;
                  return (
                    <li
                      key={f.name}
                      className={`function-picker-item${active ? " active" : ""}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => onPick(f)}
                    >
                      <div className="function-picker-name">{f.name}</div>
                      <div className="function-picker-sig">{f.signature}</div>
                      <div className="function-picker-summary">{f.summary}</div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        <footer className="modal-footer">
          <span className="modal-hint">↑↓ to navigate · Enter to insert · Esc to close</span>
        </footer>
      </div>
    </div>
  );
}
