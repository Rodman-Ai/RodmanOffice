"use client";

import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";

interface Msg {
  who: "you" | "leo";
  text: string;
}

const SUGGESTIONS = [
  "Who should I prioritize today?",
  "Which deals are stalled?",
  "How is my reply rate trending?",
  "What's our pipeline forecast?",
  "Am I on track for my weekly goal?",
];

export default function AssistantPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      who: "leo",
      text: "Hi! Ask me anything about your contacts, deals, or pipeline.",
    },
  ]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    if (!text.trim()) return;
    setMsgs((m) => [...m, { who: "you", text }]);
    setQ("");
    setBusy(true);
    try {
      const res = await api.post<{ answer: string }>("/api/ai/ask", {
        question: text,
      });
      setMsgs((m) => [...m, { who: "leo", text: res.answer }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="AI assistant"
        description="Ask natural-language questions about your CRM. Demo mode answers from local heuristics; production wires to Claude with retrieval."
      />
      <div className="card flex h-[60vh] flex-col p-0">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.who === "you" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-md rounded-2xl px-4 py-2 text-sm ${
                  m.who === "you"
                    ? "bg-leo-600 text-white"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {busy ? (
            <div className="text-xs text-slate-500">Thinking…</div>
          ) : null}
        </div>
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 flex flex-wrap gap-1">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full bg-slate-100 px-2 py-1 text-xs hover:bg-leo-100 hover:text-leo-700 dark:bg-slate-800"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(q);
            }}
            className="flex gap-2"
          >
            <input
              className="input flex-1"
              placeholder="Ask anything…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="submit" disabled={busy} className="btn-primary">
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
