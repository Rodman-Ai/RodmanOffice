"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { Contact, Lead } from "@/lib/types";
import { LEAD_STAGES, type LeadStage } from "@/lib/types";

interface Row {
  lead: Lead;
  contact?: Contact;
}

export default function LeadsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const [leads, contacts] = await Promise.all([
      api.get<Lead[]>("/api/leads"),
      api.get<Contact[]>("/api/contacts"),
    ]);
    const map = new Map(contacts.map((c) => [c.id, c]));
    setRows(leads.map((lead) => ({ lead, contact: map.get(lead.contactId) })));
  }
  useEffect(() => {
    load();
  }, []);

  async function move(lead: Lead, stage: LeadStage) {
    setBusy(lead.id);
    try {
      await api.patch(`/api/leads/${lead.id}`, { stage });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Tap a stage to move a lead. Synced live to your sheet."
        actions={
          <Link href="/compose" className="btn-primary">
            AI compose
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {LEAD_STAGES.map((stage) => {
          const items = rows.filter((r) => r.lead.stage === stage);
          return (
            <div
              key={stage}
              className="rounded-xl bg-slate-100/60 p-3 dark:bg-slate-900/60"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {stage}
                </span>
                <span className="text-xs text-slate-400">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((r) => {
                  const lastTs = r.lead.lastContactedAt
                    ? new Date(r.lead.lastContactedAt).getTime()
                    : 0;
                  const stale =
                    r.lead.stage !== "won" &&
                    r.lead.stage !== "lost" &&
                    lastTs > 0 &&
                    Date.now() - lastTs > 14 * 24 * 3600 * 1000;
                  return (
                  <div key={r.lead.id} className="card p-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/contacts/${r.contact?.id ?? ""}`}
                        className="block flex-1 truncate text-sm font-medium hover:text-leo-600"
                      >
                        {r.contact?.name || r.contact?.email || "Unknown"}
                      </Link>
                      {stale ? (
                        <span
                          className="badge bg-rose-100 text-[10px] text-rose-700"
                          title={`No contact in ${Math.round(
                            (Date.now() - lastTs) / (24 * 3600 * 1000),
                          )}d`}
                        >
                          stale
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-slate-500">
                      {r.contact?.company || r.lead.source}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {LEAD_STAGES.filter((s) => s !== r.lead.stage).map(
                        (s) => (
                          <button
                            key={s}
                            disabled={busy === r.lead.id}
                            onClick={() => move(r.lead, s)}
                            className="badge bg-slate-100 text-[10px] text-slate-600 hover:bg-leo-50 hover:text-leo-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            → {s}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  );
                })}
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center text-xs text-slate-400 dark:border-slate-700">
                    Empty
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
