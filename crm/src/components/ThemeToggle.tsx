"use client";

import { useEffect, useState } from "react";

const KEY = "leocrm.theme";
type Mode = "system" | "light" | "dark";

function apply(mode: Mode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (mode === "dark") root.classList.add("dark");
  else if (mode === "light") root.classList.remove("dark");
  else {
    const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", sysDark);
  }
}

export function ThemeBoot() {
  // Apply saved theme as early as possible to avoid flash. Lives in <body>.
  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Mode) || "system";
    apply(saved);
  }, []);
  return null;
}

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    setMode((localStorage.getItem(KEY) as Mode) || "system");
  }, []);
  function set(next: Mode) {
    setMode(next);
    localStorage.setItem(KEY, next);
    apply(next);
  }
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1 text-xs dark:border-slate-700">
      {(["system", "light", "dark"] as const).map((m) => (
        <button
          key={m}
          onClick={() => set(m)}
          className={`rounded px-2 py-1 ${
            mode === m
              ? "bg-leo-600 text-white"
              : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
