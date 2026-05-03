"use client";

import { useState } from "react";
import { DEMO_MODE } from "@/lib/client";
import { resetDemo } from "@/lib/demo/store";

export function DemoBanner() {
  const [done, setDone] = useState(false);
  if (!DEMO_MODE) return null;
  return (
    <div className="border-b border-amber-300/40 bg-amber-100/70 text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2 text-xs">
        <span className="font-semibold">DEMO</span>
        <span className="hidden sm:inline">
          This is sample data. All changes stay in your browser.
        </span>
        <span className="ml-auto flex items-center gap-3">
          <button
            onClick={() => {
              resetDemo();
              setDone(true);
              setTimeout(() => location.reload(), 400);
            }}
            className="font-medium underline-offset-2 hover:underline"
          >
            {done ? "Resetting…" : "Reset demo"}
          </button>
          <a
            href="https://github.com/Rodman-Ai/LeoCRM"
            className="hidden font-medium underline-offset-2 hover:underline sm:inline"
            target="_blank"
            rel="noreferrer"
          >
            Source ↗
          </a>
        </span>
      </div>
    </div>
  );
}
