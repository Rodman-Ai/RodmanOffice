"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import { useUI } from "@/components/ui/UIProvider";

interface Catalog {
  name: string;
  goal: string;
  tone: string;
  steps: { delayDays: number; subjectHint: string; instructions: string }[];
}

const CATALOG: Catalog[] = [
  {
    name: "Founder 3-touch",
    goal: "Land design-partner conversations with Series A founders.",
    tone: "warm, direct, peer-to-peer",
    steps: [
      { delayDays: 0, subjectHint: "Quick intro", instructions: "Open. Reference recent funding or hiring signal." },
      { delayDays: 3, subjectHint: "Different angle", instructions: "Lead with a peer outcome." },
      { delayDays: 5, subjectHint: "Last note for now", instructions: "Soft breakup; door open." },
    ],
  },
  {
    name: "Mid-market 4-step",
    goal: "Book demos with VPs Sales / RevOps at 200-2000 employee companies.",
    tone: "warm, direct, professional",
    steps: [
      { delayDays: 0, subjectHint: "Quick idea", instructions: "Open with a relevant signal (hiring, expansion, funding)." },
      { delayDays: 3, subjectHint: "Different angle", instructions: "Lead with a customer outcome metric." },
      { delayDays: 5, subjectHint: "Bumping this up", instructions: "Short, one question." },
      { delayDays: 7, subjectHint: "Last note", instructions: "Soft breakup." },
    ],
  },
  {
    name: "Enterprise security-first",
    goal: "Get past procurement at large enterprises by leading with compliance.",
    tone: "professional, technical, deferential",
    steps: [
      { delayDays: 0, subjectHint: "Compliance + outbound", instructions: "Open with SOC2/HIPAA fit." },
      { delayDays: 4, subjectHint: "Reference customers", instructions: "Name 1-2 enterprise customers (anonymized)." },
      { delayDays: 7, subjectHint: "Looping in security", instructions: "Offer a security review session." },
      { delayDays: 10, subjectHint: "Q3 timing", instructions: "Tie to budget cycle." },
    ],
  },
  {
    name: "Win-back 90-day",
    goal: "Re-engage leads that went cold 60-120 days ago.",
    tone: "friendly, no-pressure",
    steps: [
      { delayDays: 0, subjectHint: "Still on the radar?", instructions: "Reference what changed since last contact." },
      { delayDays: 5, subjectHint: "Quick what's-new", instructions: "Bullet list of recent product changes." },
      { delayDays: 10, subjectHint: "Saying hi one more time", instructions: "Soft close." },
    ],
  },
  {
    name: "Inbound demo follow-up",
    goal: "Convert form-submitted demo requests into booked demos.",
    tone: "fast, helpful",
    steps: [
      { delayDays: 0, subjectHint: "Confirmed", instructions: "Acknowledge demo request, propose 2 times." },
      { delayDays: 1, subjectHint: "Reminder", instructions: "Friendly reminder if no booking yet." },
      { delayDays: 3, subjectHint: "Different time?", instructions: "Offer asynchronous Loom alternative." },
    ],
  },
];

export default function SequenceTemplatesPage() {
  const router = useRouter();
  const ui = useUI();
  const [busy, setBusy] = useState<string | null>(null);

  async function use(c: Catalog) {
    setBusy(c.name);
    try {
      await api.post("/api/sequences", c);
      ui.toast(`"${c.name}" created`, { kind: "success" });
      router.push("/sequences");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sequence template marketplace"
        description="Battle-tested cadences. Pick one, tweak the steps, then enroll contacts."
      />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {CATALOG.map((c) => (
          <div key={c.name} className="card">
            <h3 className="text-base font-semibold">{c.name}</h3>
            <p className="mt-1 text-sm text-slate-500">{c.goal}</p>
            <ol className="mt-3 list-decimal space-y-0.5 pl-4 text-xs text-slate-600 dark:text-slate-300">
              {c.steps.map((s, i) => (
                <li key={i}>
                  <span className="font-medium">
                    {s.subjectHint || `Step ${i + 1}`}
                  </span>{" "}
                  <span className="text-slate-400">
                    ({s.delayDays}d delay)
                  </span>
                </li>
              ))}
            </ol>
            <button
              onClick={() => use(c)}
              disabled={busy !== null}
              className="btn-primary mt-3 w-full"
            >
              {busy === c.name ? "Creating…" : "Use this template"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
