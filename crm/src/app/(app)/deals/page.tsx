"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import { useUI } from "@/components/ui/UIProvider";
import type { Contact, Deal, Member, Pipeline } from "@/lib/types";
import { DEAL_STAGES, type DealStage } from "@/lib/types";

const STAGE_COLOR: Record<string, string> = {
  discovery: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  evaluation: "bg-sky-100 text-sky-700",
  proposal: "bg-amber-100 text-amber-700",
  negotiation: "bg-violet-100 text-violet-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-rose-100 text-rose-700",
};

function fmtUSD(n: number) {
  if (n >= 1000) return `$${Math.round(n / 1000).toLocaleString()}k`;
  return `$${n.toLocaleString()}`;
}

export default function DealsPage() {
  const ui = useUI();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState("pl_default");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    value: "0",
    stage: "discovery" as DealStage,
    expectedCloseDate: "",
    owner: "",
  });

  async function load() {
    const [d, c, m, p] = await Promise.all([
      api.get<Deal[]>("/api/deals"),
      api.get<Contact[]>("/api/contacts"),
      api.get<Member[]>("/api/members"),
      api.get<Pipeline[]>("/api/pipelines"),
    ]);
    setDeals(d);
    setContacts(c);
    setMembers(m);
    setPipelines(p);
  }
  useEffect(() => {
    load();
  }, []);

  async function move(deal: Deal, stage: DealStage) {
    const patch: Record<string, string> = { stage };
    if (stage === "won" || stage === "lost") {
      const r = window.prompt(
        stage === "won"
          ? "Reason for the win? (optional)"
          : "Reason this deal was lost? (optional)",
        "",
      );
      if (r === null) return;
      if (stage === "won") patch.winReason = r;
      else patch.lostReason = r;
      patch.probability = stage === "won" ? "1" : "0";
    }
    await api.patch(`/api/deals/${deal.id}`, patch);
    ui.toast(`Moved → ${stage}`, { kind: "success" });
    await load();
  }

  async function submit() {
    if (!form.name) return;
    await api.post("/api/deals", {
      name: form.name,
      value: Number(form.value || 0),
      stage: form.stage,
      pipelineId,
      expectedCloseDate: form.expectedCloseDate,
      owner: form.owner,
    });
    setShowAdd(false);
    setForm({
      name: "",
      value: "0",
      stage: "discovery",
      expectedCloseDate: "",
      owner: "",
    });
    await load();
  }

  const visibleDeals = useMemo(
    () => deals.filter((d) => d.pipelineId === pipelineId),
    [deals, pipelineId],
  );

  const totalWeighted = visibleDeals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce(
      (s, d) => s + Number(d.value || 0) * Number(d.probability || 0),
      0,
    );
  const totalRaw = visibleDeals
    .filter((d) => d.stage !== "won" && d.stage !== "lost")
    .reduce((s, d) => s + Number(d.value || 0), 0);

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Standalone opportunities with their own pipeline + multi-contact + splits + contracts."
        actions={
          <>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="input w-auto py-1 text-sm"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              New deal
            </button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open deals" value={visibleDeals.filter((d) => d.stage !== "won" && d.stage !== "lost").length} />
        <Stat label="Pipeline raw" value={fmtUSD(totalRaw)} />
        <Stat label="Pipeline weighted" value={fmtUSD(totalWeighted)} />
        <Stat
          label="Won (90d)"
          value={fmtUSD(
            visibleDeals
              .filter(
                (d) =>
                  d.stage === "won" &&
                  d.closedAt &&
                  Date.now() - new Date(d.closedAt).getTime() <
                    90 * 24 * 3600 * 1000,
              )
              .reduce((s, d) => s + Number(d.value || 0), 0),
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {DEAL_STAGES.map((stage) => {
          const items = visibleDeals.filter((d) => d.stage === stage);
          return (
            <div
              key={stage}
              className="rounded-xl bg-slate-100/60 p-3 dark:bg-slate-900/60"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {stage}
                </span>
                <span className="text-xs text-slate-400">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((d) => {
                  const stale =
                    d.stage !== "won" &&
                    d.stage !== "lost" &&
                    d.stageEnteredAt &&
                    Date.now() - new Date(d.stageEnteredAt).getTime() >
                      14 * 24 * 3600 * 1000;
                  const member = members.find((m) => m.email === d.owner);
                  return (
                    <div key={d.id} className="card p-3">
                      <Link
                        href={`/deals/${d.id}`}
                        className="block text-sm font-medium hover:text-leo-600"
                      >
                        {d.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold">
                          {fmtUSD(Number(d.value || 0))}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span>
                          {Math.round(Number(d.probability || 0) * 100)}%
                        </span>
                        {stale ? (
                          <span className="badge bg-rose-100 text-[10px] text-rose-700">
                            stale
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        {member?.name || d.owner || "Unassigned"}
                        {d.expectedCloseDate ? (
                          <span>· close {d.expectedCloseDate}</span>
                        ) : null}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {DEAL_STAGES.filter((s) => s !== d.stage).map((s) => (
                          <button
                            key={s}
                            onClick={() => move(d, s)}
                            className={`badge text-[10px] hover:bg-leo-50 hover:text-leo-700 ${
                              STAGE_COLOR[s] ?? "bg-slate-100"
                            }`}
                          >
                            → {s}
                          </button>
                        ))}
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

      {showAdd ? (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6"
          onClick={() => setShowAdd(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-slate-900 md:rounded-2xl"
          >
            <h2 className="mb-3 text-lg font-semibold">New deal</h2>
            <div className="space-y-2">
              <input
                className="input"
                placeholder="Deal name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  className="input"
                  placeholder="Value (USD)"
                  value={form.value}
                  onChange={(e) =>
                    setForm({ ...form, value: e.target.value })
                  }
                />
                <select
                  className="input"
                  value={form.stage}
                  onChange={(e) =>
                    setForm({ ...form, stage: e.target.value as DealStage })
                  }
                >
                  {DEAL_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <input
                type="date"
                className="input"
                value={form.expectedCloseDate}
                onChange={(e) =>
                  setForm({ ...form, expectedCloseDate: e.target.value })
                }
              />
              <select
                className="input"
                value={form.owner}
                onChange={(e) => setForm({ ...form, owner: e.target.value })}
              >
                <option value="">— Owner —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.email}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!form.name}
                  className="btn-primary"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
