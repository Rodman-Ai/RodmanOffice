"use client";

import { useEffect, useState } from "react";

const KEY = "leocrm.onboarding.v1";

const STEPS = [
  {
    title: "Welcome to LeoCRM",
    body:
      "An AI-first lead-gen CRM. Pre-loaded with sample data so you can poke around instantly.",
  },
  {
    title: "⌘K to find anything",
    body:
      "Press ⌘K (or Ctrl+K) for the command palette. Or hit / to focus search, n to add a contact, c to compose.",
  },
  {
    title: "AI Compose + sequences",
    body:
      "Generate a personalized email per contact, optionally A/B-test the subject, or build a multi-step sequence that auto-stops on reply.",
  },
  {
    title: "Pipeline + Reports",
    body:
      "Drag leads through the kanban, watch the funnel + AI-vs-non-AI reply rate, and use AI smart-sort to pick who to contact next.",
  },
  {
    title: "It's all yours to break",
    body:
      "All changes stay in your browser. Hit Reset demo in the banner to start fresh whenever.",
  },
];

export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(KEY)) {
      // Slight delay so the rest of the UI mounts first.
      setTimeout(() => setOpen(true), 350);
    }
  }, []);

  function close() {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(KEY, "1");
    }
  }

  if (!open) return null;
  const s = STEPS[step];
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <div className="mb-3 flex gap-1">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded ${
                i === step ? "bg-leo-600" : "bg-slate-200 dark:bg-slate-700"
              }`}
            />
          ))}
        </div>
        <h2 className="text-lg font-semibold">{s.title}</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{s.body}</p>
        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={close}
            className="text-xs text-slate-400 hover:text-slate-600"
          >
            Skip
          </button>
          <div className="flex gap-2">
            {step > 0 ? (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="btn-secondary"
              >
                Back
              </button>
            ) : null}
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => setStep((s) => s + 1)}
                className="btn-primary"
              >
                Next
              </button>
            ) : (
              <button onClick={close} className="btn-primary">
                Got it
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
