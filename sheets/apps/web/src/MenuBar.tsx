import { useEffect, useRef, useState } from "react";

export type MenuItem =
  | { kind: "item"; label: string; onClick: () => void; shortcut?: string; disabled?: boolean }
  | { kind: "separator" };

export type MenuSpec = {
  label: string;
  items: MenuItem[];
};

type Props = {
  menus: MenuSpec[];
};

export function MenuBar({ menus }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (openIdx === null) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenIdx(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [openIdx]);

  return (
    <div className="menubar" ref={ref}>
      {menus.map((menu, i) => (
        <div key={menu.label} className="menubar-menu">
          <button
            type="button"
            className={`menubar-button${openIdx === i ? " open" : ""}`}
            onClick={() => setOpenIdx((cur) => (cur === i ? null : i))}
            onMouseEnter={() => {
              if (openIdx !== null && openIdx !== i) setOpenIdx(i);
            }}
          >
            {menu.label}
          </button>
          {openIdx === i && (
            <ul className="menu-popup" role="menu">
              {menu.items.map((item, j) => {
                if (item.kind === "separator") {
                  return <li key={j} className="menu-sep" role="separator" />;
                }
                return (
                  <li
                    key={j}
                    role="menuitem"
                    className={`menu-item${item.disabled ? " disabled" : ""}`}
                    onClick={() => {
                      if (item.disabled) return;
                      setOpenIdx(null);
                      item.onClick();
                    }}
                  >
                    <span className="menu-item-label">{item.label}</span>
                    {item.shortcut && (
                      <span className="menu-shortcut">{item.shortcut}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
