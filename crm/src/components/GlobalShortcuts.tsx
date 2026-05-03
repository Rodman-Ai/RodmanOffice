"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function GlobalShortcuts() {
  const router = useRouter();
  useEffect(() => {
    let gPressedAt = 0;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inField) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // g + key sequences
      if (e.key === "g") {
        gPressedAt = Date.now();
        return;
      }
      if (Date.now() - gPressedAt < 800) {
        const map: Record<string, string> = {
          d: "/",
          c: "/contacts",
          o: "/companies",
          p: "/leads",
          s: "/sequences",
          t: "/tasks",
          r: "/reports",
          f: "/forms",
        };
        const dest = map[e.key.toLowerCase()];
        if (dest) {
          gPressedAt = 0;
          e.preventDefault();
          router.push(dest);
          return;
        }
      }
      if (e.key.toLowerCase() === "c") {
        e.preventDefault();
        router.push("/compose");
      } else if (e.key === "/") {
        e.preventDefault();
        // Trigger ⌘K-style palette via synthetic key event
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        );
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
  return null;
}
