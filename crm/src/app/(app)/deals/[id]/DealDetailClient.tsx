"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useUI } from "@/components/ui/UIProvider";
import { api } from "@/lib/client";
import { pushRecent } from "@/lib/recents";
import type {
  Contact,
  ContractStatus,
  Deal,
  Member,
} from "@/lib/types";
import { DEAL_STAGES, type DealStage } from "@/lib/types";

const CONTRACT_STATES: ContractStatus[] = [
  "",
  "drafting",
  "sent",
  "viewed",
  "signed",
  "declined",
];

export default function DealDetailClient() {
  const router = useRouter();
  const ui = useUI();
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  async function load() {
    const [d, c, m] = await Promise.all([
      api.get<Deal>(`/api/deals/${id}`),
      api.get<Contact[]>("/api/contacts"),
      api.get<Member[]>("/api/members"),
    ]);
    setDeal(d);
    setContacts(c);
    setMembers(m);
  }
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    if (deal) {
      pushRecent({
        id: deal.id,
        label: deal.name,
        href: `/deals/${deal.id}`,
      });
    }
  }, [deal]);

  const linkedContacts = useMemo(() => {
    if (!deal) return [];
    const ids = (deal.contactIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return ids
      .map((cid) => contacts.find((c) => c.id === cid))
      .filter((c): c is Contact => Boolean(c));
  }, [deal, contacts]);

  const splits = useMemo(() => {
    if (!deal) return [] as Array<{ owner: string; pct: number }>;
    try {
      return JSON.parse(deal.splits || "[]") as Array<{
        owner: string;
        pct: number;
      }>;
    } catch {
      return [];
    }
  }, [deal]);

  if (!deal) {
    return <div className="text-sm text-slate-500">Loading…</div>;
  }

  async function patch(body: Record<string, string>) {
    await api.patch(`/api/deals/${deal!.id}`, body);
    await load();
  }

  async function addContact(cid: string) {
    if (!cid) return;
    const ids = new Set(
      (deal!.contactIds || "").split(",").map((s) => s.trim()).filter(Boolean),
    );
    ids.add(cid);
    await patch({ contactIds: Array.from(ids).join(",") });
  }

  async function removeContact(cid: string) {
    const ids = (deal!.contactIds || "")
      .split(",")
      .map((s) => s.trim())
      .filter((x) => x && x !== cid);
    await patch({ contactIds: ids.join(",") });
  }

  function openQuote() {
    const w = window.open("", "_blank", "width=720,height=900");
    if (!w) return;
    const html = quoteHtml(deal!, linkedContacts);
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  async function setSplitPct(idx: number, pct: number) {
    const next = splits.slice();
    next[idx] = { ...next[idx], pct };
    await patch({ splits: JSON.stringify(next) });
  }
  async function addSplit() {
    const next = [...splits, { owner: "", pct: 0 }];
    await patch({ splits: JSON.stringify(next) });
  }
  async function setSplitOwner(idx: number, owner: string) {
    const next = splits.slice();
    next[idx] = { ...next[idx], owner };
    await patch({ splits: JSON.stringify(next) });
  }
  async function removeSplit(idx: number) {
    const next = splits.filter((_, i) => i !== idx);
    await patch({ splits: JSON.stringify(next) });
  }

  async function remove() {
    if (!deal) return;
    const okGo = await ui.confirm(`Delete "${deal.name}"?`, {
      danger: true,
      confirmLabel: "Delete",
    });
    if (!okGo) return;
    await api.del(`/api/deals/${deal.id}`);
    ui.toast("Deal deleted", { kind: "success" });
    router.push("/deals");
  }

  return (
    <div>
      <PageHeader
        title={deal.name}
        description={`Stage ${deal.stage} · ${Math.round(Number(deal.probability) * 100)}% · close ${deal.expectedCloseDate || "—"}`}
        actions={
          <>
            <button onClick={openQuote} className="btn-secondary">
              Quote PDF
            </button>
            <button onClick={remove} className="btn-secondary">
              Delete
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card md:col-span-1">
          <h3 className="mb-3 text-sm font-semibold">Deal</h3>
          <dl className="space-y-3 text-sm">
            <Field label="Stage">
              <select
                value={deal.stage}
                onChange={(e) => patch({ stage: e.target.value as DealStage })}
                className="input py-1 text-sm"
              >
                {DEAL_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Probability override (0-1)">
              <input
                type="number"
                step="0.05"
                min={0}
                max={1}
                className="input py-1 text-sm"
                value={deal.probability}
                onChange={(e) => patch({ probability: e.target.value })}
              />
            </Field>
            <Field label="Value (USD)">
              <input
                type="number"
                className="input py-1 text-sm"
                value={String(deal.value)}
                onChange={(e) => patch({ value: e.target.value })}
              />
            </Field>
            <Field label="Expected close">
              <input
                type="date"
                className="input py-1 text-sm"
                value={deal.expectedCloseDate}
                onChange={(e) => patch({ expectedCloseDate: e.target.value })}
              />
            </Field>
            <Field label="Owner">
              <select
                value={deal.owner || ""}
                onChange={(e) => patch({ owner: e.target.value })}
                className="input py-1 text-sm"
              >
                <option value="">— Unassigned —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.email}>
                    {m.name || m.email}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Contract status">
              <select
                value={deal.contractStatus || ""}
                onChange={(e) =>
                  patch({ contractStatus: e.target.value })
                }
                className="input py-1 text-sm"
              >
                {CONTRACT_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s || "(none)"}
                  </option>
                ))}
              </select>
            </Field>
          </dl>
        </div>

        <div className="card md:col-span-1">
          <h3 className="mb-3 text-sm font-semibold">Linked contacts</h3>
          <ul className="space-y-1 text-sm">
            {linkedContacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <Link
                  href={`/contacts/${c.id}`}
                  className="hover:text-leo-600"
                >
                  {c.name || c.email}
                  {c.role ? (
                    <span className="text-xs text-slate-500"> · {c.role}</span>
                  ) : null}
                </Link>
                <button
                  onClick={() => removeContact(c.id)}
                  className="text-xs text-rose-600 hover:underline"
                >
                  remove
                </button>
              </li>
            ))}
            {linkedContacts.length === 0 ? (
              <li className="text-xs text-slate-400">No contacts yet.</li>
            ) : null}
          </ul>
          <select
            className="input mt-3 py-1 text-sm"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) addContact(e.target.value);
              e.currentTarget.value = "";
            }}
          >
            <option value="">+ Link a contact…</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        </div>

        <div className="card md:col-span-1">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Splits</h3>
            <span
              className={`badge ${
                splits.reduce((s, x) => s + Number(x.pct || 0), 0) === 100
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}
            >
              {splits.reduce((s, x) => s + Number(x.pct || 0), 0)}%
            </span>
          </div>
          <div className="space-y-2">
            {splits.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <select
                  className="input py-1 text-sm"
                  value={s.owner}
                  onChange={(e) => setSplitOwner(i, e.target.value)}
                >
                  <option value="">— member —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.email}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={100}
                  className="input w-20 py-1 text-sm"
                  value={s.pct}
                  onChange={(e) =>
                    setSplitPct(i, Number(e.target.value || 0))
                  }
                />
                <button
                  onClick={() => removeSplit(i)}
                  className="text-xs text-rose-600"
                >
                  ×
                </button>
              </div>
            ))}
            <button onClick={addSplit} className="btn-secondary text-xs">
              + Add split
            </button>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Total should sum to 100%.
          </p>
        </div>
      </div>

      {(deal.lostReason || deal.winReason) && (
        <div className="card mt-4 text-sm">
          <strong>{deal.stage === "won" ? "Win" : "Loss"} reason:</strong>{" "}
          {deal.winReason || deal.lostReason}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="mb-1 text-xs uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  );
}

function quoteHtml(deal: Deal, contacts: Contact[]): string {
  const today = new Date().toLocaleDateString();
  const value = `$${Number(deal.value || 0).toLocaleString()}`;
  const lines = contacts
    .map(
      (c) => `<li>${escape(c.name || c.email)}${c.role ? ` — ${escape(c.role)}` : ""}</li>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Quote — ${escape(deal.name)}</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Inter,sans-serif;color:#1f2566;padding:48px;max-width:760px;margin:0 auto;}
  h1{margin:0 0 8px;font-size:28px;}
  .meta{color:#64748b;font-size:13px;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;margin-top:24px;}
  th,td{text-align:left;border-bottom:1px solid #e2e8f0;padding:8px;font-size:14px;}
  th{background:#f8fafc;}
  .total{font-size:20px;font-weight:600;margin-top:24px;text-align:right;}
  .pill{display:inline-block;background:#e8edff;color:#2e36a8;padding:2px 8px;border-radius:999px;font-size:11px;margin-right:6px;}
</style></head><body>
<h1>Quote — ${escape(deal.name)}</h1>
<div class="meta">${today} · Status <span class="pill">${escape(deal.stage)}</span> Probability <span class="pill">${Math.round(Number(deal.probability) * 100)}%</span> Expected close <span class="pill">${escape(deal.expectedCloseDate || "TBD")}</span></div>
<h3>Stakeholders</h3>
<ul>${lines || "<li>(none linked)</li>"}</ul>
<table><thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead>
<tbody><tr><td>${escape(deal.name)}</td><td style="text-align:right">${value}</td></tr></tbody></table>
<div class="total">Total: ${value}</div>
<p style="margin-top:48px;color:#94a3b8;font-size:11px;">Generated by LeoCRM. This quote is non-binding pending signature.</p>
</body></html>`;
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
