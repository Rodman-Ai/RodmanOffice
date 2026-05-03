import { useEffect, useRef, useState } from "react";
import type { CellComment } from "@aicell/shared";
import { a1 } from "@aicell/shared";
import { useReturnFocusOnClose } from "./useReturnFocusOnClose";

type Props = {
  row: number;
  col: number;
  current: CellComment | undefined;
  onSave: (text: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export function CommentModal({ row, col, current, onSave, onClear, onClose }: Props) {
  useReturnFocusOnClose();
  const [text, setText] = useState(current?.text ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    if (text.trim() === "") {
      if (current) onClear();
      onClose();
      return;
    }
    onSave(text);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal comment-modal"
        role="dialog"
        aria-label="Cell comment"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <span>Comment on {a1(row, col)}</span>
          <button onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="comment-body">
          <textarea
            ref={ref}
            value={text}
            rows={4}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a comment…"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose();
                e.preventDefault();
              } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                submit();
                e.preventDefault();
              }
            }}
          />
          {current && (
            <div className="comment-meta">
              Last edited {new Date(current.ts).toLocaleString()}
            </div>
          )}
        </div>
        <footer className="modal-footer comment-actions">
          {current && (
            <button type="button" onClick={() => { onClear(); onClose(); }}>
              Delete
            </button>
          )}
          <button type="button" className="primary" onClick={submit}>
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}
