"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const KEY = "leocrm.pwa.dismissed";

export function PWAInstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(KEY)) return;
    function onPrompt(e: Event) {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setEvt(null);
    window.localStorage.setItem(KEY, "1");
  }

  if (!evt) return null;
  return (
    <div className="fixed bottom-4 right-4 z-40 flex max-w-xs items-center gap-3 rounded-xl bg-leo-600 px-4 py-3 text-sm text-white shadow-xl">
      <span>Install LeoCRM as an app?</span>
      <button
        onClick={async () => {
          await evt.prompt();
          await evt.userChoice;
          dismiss();
        }}
        className="rounded bg-white/20 px-2 py-1 text-xs font-medium hover:bg-white/30"
      >
        Install
      </button>
      <button
        onClick={dismiss}
        className="text-xs text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
