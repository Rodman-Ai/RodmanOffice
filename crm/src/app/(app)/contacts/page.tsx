"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import { csvToContacts, type ParsedContact } from "@/lib/csv";
import { downloadCsv, toCsv } from "@/lib/export";
import { getPins, onPinsChange, togglePin } from "@/lib/pins";
import type { Contact, Enrollment, Lead, SavedView, Sequence } from "@/lib/types";
import { LEAD_STAGES, type LeadStage } from "@/lib/types";
import { avatarClasses, avatarInitials } from "@/lib/ui";
import { SkeletonRow } from "@/components/Skeleton";
import { useUI } from "@/components/ui/UIProvider";

interface ViewFilter {
  q?: string;
  tag?: string;
  stage?: LeadStage | "";
  minScore?: number;
  owner?: string;
}

type SortKey = "smart" | "score" | "lastContacted" | "name";

const STAGE_COLOR: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  contacted: "bg-sky-100 text-sky-700",
  engaged: "bg-amber-100 text-amber-700",
  qualified: "bg-violet-100 text-violet-700",
  won: "bg-emerald-100 text-emerald-700",
  lost: "bg-rose-100 text-rose-700",
};

function scoreBadgeClass(score: number) {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  if (score > 0) return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500";
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [filter, setFilter] = useState<ViewFilter>({});
  const [sort, setSort] = useState<SortKey>("smart");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [pins, setPins] = useState<Set<string>>(new Set());
  const ui = useUI();
  useEffect(() => {
    setPins(getPins());
    return onPinsChange(() => setPins(getPins()));
  }, []);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
    tags: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [c, l, v, s, e] = await Promise.all([
        api.get<Contact[]>("/api/contacts"),
        api.get<Lead[]>("/api/leads"),
        api.get<SavedView[]>("/api/views"),
        api.get<Sequence[]>("/api/sequences"),
        api.get<Enrollment[]>("/api/enrollments"),
      ]);
      setContacts(c);
      setLeads(l);
      setViews(v);
      setSequences(s);
      setEnrollments(e);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const leadByContact = useMemo(
    () => new Map(leads.map((l) => [l.contactId, l])),
    [leads],
  );

  const filtered = useMemo(() => {
    const q = (filter.q ?? "").trim().toLowerCase();
    const tag = (filter.tag ?? "").trim().toLowerCase();
    const list = contacts.filter((c) => {
      if (
        q &&
        ![c.name, c.email, c.company, c.role, c.tags]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (tag && !c.tags.toLowerCase().includes(tag)) return false;
      if (filter.stage) {
        const lead = leadByContact.get(c.id);
        if (!lead || lead.stage !== filter.stage) return false;
      }
      if (filter.minScore !== undefined) {
        const lead = leadByContact.get(c.id);
        if (!lead || Number(lead.score || 0) < filter.minScore) return false;
      }
      if (filter.owner) {
        const lead = leadByContact.get(c.id);
        if (!lead || lead.owner !== filter.owner) return false;
      }
      return true;
    });
    function priority(c: Contact): number {
      // Composite: AI score + engagement (replied) + recency, minus staleness.
      const lead = leadByContact.get(c.id);
      const score = Number(lead?.score || 0);
      const stageBoost: Record<string, number> = {
        engaged: 20,
        qualified: 30,
        contacted: 5,
        new: 0,
        won: -100,
        lost: -100,
      };
      const stage = stageBoost[lead?.stage ?? "new"] ?? 0;
      const lastTs = lead?.lastContactedAt
        ? new Date(lead.lastContactedAt).getTime()
        : 0;
      const daysAgo = lastTs
        ? (Date.now() - lastTs) / (24 * 3600 * 1000)
        : 30;
      const recency = Math.max(0, 20 - daysAgo);
      return score + stage + recency;
    }
    return list.slice().sort((a, b) => {
      const pinDiff = (pins.has(b.id) ? 1 : 0) - (pins.has(a.id) ? 1 : 0);
      if (pinDiff !== 0) return pinDiff;
      if (sort === "name") return (a.name || a.email).localeCompare(b.name || b.email);
      if (sort === "lastContacted") {
        const la = leadByContact.get(a.id)?.lastContactedAt || "";
        const lb = leadByContact.get(b.id)?.lastContactedAt || "";
        return lb.localeCompare(la);
      }
      if (sort === "smart") return priority(b) - priority(a);
      const sa = Number(leadByContact.get(a.id)?.score || 0);
      const sb = Number(leadByContact.get(b.id)?.score || 0);
      return sb - sa;
    });
  }, [contacts, filter, leadByContact, sort, pins]);

  const enrolledByContact = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of enrollments) {
      if (e.status === "active") m.set(e.contactId, e.sequenceId);
    }
    return m;
  }, [enrollments]);

  const seqById = useMemo(
    () => new Map(sequences.map((s) => [s.id, s])),
    [sequences],
  );

  function toggleSelected(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  }

  async function bulkScore() {
    if (selected.size === 0) return;
    setBulkBusy("score");
    try {
      for (const id of selected) {
        await api.post("/api/ai/score", { contactId: id });
      }
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(null);
    }
  }

  async function bulkEnroll(sequenceId: string) {
    if (!sequenceId || selected.size === 0) return;
    setBulkBusy("enroll");
    try {
      await api.post("/api/sequences/enroll", {
        sequenceId,
        contactIds: Array.from(selected),
      });
      ui.toast(`Enrolled ${selected.size} contact(s).`, { kind: "success" });
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(null);
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    const okGo = await ui.confirm(
      `Delete ${selected.size} contact(s) and their leads?`,
      { confirmLabel: "Delete", danger: true },
    );
    if (!okGo) return;
    setBulkBusy("delete");
    try {
      for (const id of selected) {
        const lead = leads.find((l) => l.contactId === id);
        if (lead) await api.del(`/api/leads/${lead.id}`);
        await api.del(`/api/contacts/${id}`);
      }
      ui.toast(`Deleted ${selected.size} contact(s).`, { kind: "success" });
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(null);
    }
  }

  async function bulkAutoTagByDomain() {
    if (selected.size === 0) return;
    setBulkBusy("autotag");
    try {
      for (const id of selected) {
        const c = contacts.find((c) => c.id === id);
        if (!c) continue;
        const m = c.email.match(/@(.+)$/);
        if (!m) continue;
        const domain = m[1].split(".")[0];
        const merged = c.tags
          ? Array.from(
              new Set(
                c.tags
                  .split(",")
                  .map((t) => t.trim())
                  .concat(domain),
              ),
            ).join(", ")
          : domain;
        await api.patch(`/api/contacts/${id}`, { tags: merged });
      }
      ui.toast(`Auto-tagged ${selected.size} contact(s) by domain.`, {
        kind: "success",
      });
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(null);
    }
  }

  async function findDuplicates() {
    const groups = new Map<string, Contact[]>();
    for (const c of contacts) {
      const m = c.email.match(/@(.+)$/);
      const domain = m ? m[1].toLowerCase() : "";
      const nameKey = (c.name || "").trim().toLowerCase().split(/\s+/)[0];
      if (!nameKey || !domain) continue;
      const key = `${nameKey}|${domain}`;
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    const dupes = Array.from(groups.values()).filter((g) => g.length > 1);
    if (dupes.length === 0) {
      ui.toast("No duplicates detected.");
      return;
    }
    const ids = new Set<string>();
    for (const g of dupes) for (const c of g) ids.add(c.id);
    setSelected(ids);
    ui.toast(
      `Found ${dupes.length} duplicate group(s) — ${ids.size} contacts selected.`,
      { kind: "success" },
    );
  }

  async function bulkTag() {
    if (selected.size === 0) return;
    const tag = window.prompt("Tag to add (comma-separated values are kept):");
    if (!tag) return;
    setBulkBusy("tag");
    try {
      for (const id of selected) {
        const c = contacts.find((c) => c.id === id);
        if (!c) continue;
        const merged = c.tags
          ? Array.from(
              new Set(
                c.tags
                  .split(",")
                  .map((t) => t.trim())
                  .concat(tag),
              ),
            ).join(", ")
          : tag;
        await api.patch(`/api/contacts/${id}`, { tags: merged });
      }
      ui.toast(`Tagged ${selected.size} contact(s).`, { kind: "success" });
      setSelected(new Set());
      await load();
    } finally {
      setBulkBusy(null);
    }
  }

  function applyView(v: SavedView) {
    try {
      const f = JSON.parse(v.filter) as ViewFilter;
      setFilter(f);
    } catch {
      // ignore malformed filter
    }
  }

  async function saveView() {
    const name = window.prompt("Name this view:");
    if (!name) return;
    await api.post("/api/views", { name, filter });
    const v = await api.get<SavedView[]>("/api/views");
    setViews(v);
  }

  async function removeView(id: string) {
    if (!confirm("Delete this saved view?")) return;
    await api.del(`/api/views?id=${id}`);
    setViews((v) => v.filter((x) => x.id !== id));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.post<Contact>("/api/contacts", form);
      // Auto-create a "new" lead for every contact so the pipeline stays in sync.
      await api.post("/api/leads", {
        contactId: created.id,
        source: "manual",
        stage: "new",
      });
      setShowAdd(false);
      setForm({
        name: "",
        email: "",
        company: "",
        role: "",
        tags: "",
        notes: "",
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Stored as rows in your LeoCRM Google Sheet."
        actions={
          <>
            <button onClick={findDuplicates} className="btn-secondary">
              Find duplicates
            </button>
            <button
              onClick={() => {
                const merged = filtered.map((c) => {
                  const lead = leadByContact.get(c.id);
                  return {
                    name: c.name,
                    email: c.email,
                    company: c.company,
                    role: c.role,
                    tags: c.tags,
                    stage: lead?.stage ?? "",
                    score: lead?.score ?? "",
                    lastContactedAt: lead?.lastContactedAt ?? "",
                    notes: c.notes,
                  };
                });
                downloadCsv(
                  `contacts-${new Date().toISOString().slice(0, 10)}.csv`,
                  toCsv(merged),
                );
              }}
              className="btn-secondary"
            >
              Export CSV
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="btn-secondary"
            >
              Import CSV
            </button>
            <button onClick={() => setShowAdd(true)} className="btn-primary">
              Add contact
            </button>
          </>
        }
      />
      <div className="mb-2 flex flex-wrap gap-1 text-xs">
        <span className="text-slate-500 mr-1 self-center">Quick:</span>
        <QuickChip
          label="Assigned to me"
          onClick={() => setFilter({ owner: "you@yourco.example" })}
        />
        <QuickChip label="Hot (≥80)" onClick={() => setFilter({ minScore: 80 })} />
        <QuickChip
          label="Replied"
          onClick={() => setFilter({ tag: "replied" })}
        />
        <QuickChip
          label="No emails yet"
          onClick={() => setFilter({ stage: "new" })}
        />
        <QuickChip
          label="Engaged"
          onClick={() => setFilter({ stage: "engaged" })}
        />
        <QuickChip
          label="Founders"
          onClick={() => setFilter({ tag: "founder" })}
        />
        <QuickChip
          label="Healthcare"
          onClick={() => setFilter({ tag: "healthcare" })}
        />
        {(filter.q || filter.tag || filter.stage || filter.minScore) && (
          <button
            onClick={() => setFilter({})}
            className="rounded-full bg-slate-200 px-2 py-1 hover:bg-slate-300 dark:bg-slate-800"
          >
            × Clear
          </button>
        )}
      </div>
      <div className="mb-3 grid gap-2 md:grid-cols-4">
        <input
          className="input"
          placeholder="Search…"
          value={filter.q ?? ""}
          onChange={(e) => setFilter({ ...filter, q: e.target.value })}
        />
        <input
          className="input"
          placeholder="Tag contains…"
          value={filter.tag ?? ""}
          onChange={(e) => setFilter({ ...filter, tag: e.target.value })}
        />
        <select
          className="input"
          value={filter.stage ?? ""}
          onChange={(e) =>
            setFilter({ ...filter, stage: e.target.value as LeadStage | "" })
          }
        >
          <option value="">All stages</option>
          {LEAD_STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="input"
          placeholder="Min score (0-100)"
          value={filter.minScore ?? ""}
          onChange={(e) =>
            setFilter({
              ...filter,
              minScore: e.target.value ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Views:</span>
        {views.map((v) => (
          <span
            key={v.id}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 dark:bg-slate-800"
          >
            <button
              onClick={() => applyView(v)}
              className="font-medium hover:text-leo-600"
            >
              {v.name}
            </button>
            <button
              onClick={() => removeView(v.id)}
              className="text-slate-400 hover:text-red-500"
              aria-label="Delete view"
            >
              ×
            </button>
          </span>
        ))}
        <button onClick={saveView} className="text-leo-600 hover:underline">
          + Save current as view
        </button>
        {(filter.q || filter.tag || filter.stage || filter.minScore) && (
          <button
            onClick={() => setFilter({})}
            className="text-slate-500 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      {error ? (
        <div className="card mb-3 border-red-300 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === filtered.length}
            onChange={toggleAll}
          />
          {selected.size > 0
            ? `${selected.size} selected`
            : `${filtered.length} contacts`}
        </label>
        <select
          className="input ml-auto w-auto py-1 text-xs"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="smart">Sort: AI smart sort</option>
          <option value="score">Sort: score (high→low)</option>
          <option value="lastContacted">Sort: last contacted</option>
          <option value="name">Sort: name</option>
        </select>
        {selected.size > 0 ? (
          <>
            <button
              onClick={bulkScore}
              disabled={bulkBusy !== null}
              className="btn-secondary py-1 text-xs"
            >
              {bulkBusy === "score" ? "Scoring…" : "AI score selected"}
            </button>
            <button
              onClick={bulkTag}
              disabled={bulkBusy !== null}
              className="btn-secondary py-1 text-xs"
            >
              {bulkBusy === "tag" ? "Tagging…" : "Add tag"}
            </button>
            <button
              onClick={bulkAutoTagByDomain}
              disabled={bulkBusy !== null}
              className="btn-secondary py-1 text-xs"
            >
              {bulkBusy === "autotag" ? "Tagging…" : "Auto-tag by domain"}
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkBusy !== null}
              className="btn-secondary py-1 text-xs text-red-600"
            >
              {bulkBusy === "delete" ? "Deleting…" : "Delete"}
            </button>
            <select
              className="input w-auto py-1 text-xs"
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value;
                if (v) bulkEnroll(v);
                e.currentTarget.value = "";
              }}
              disabled={bulkBusy !== null}
            >
              <option value="">Enroll in sequence…</option>
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        ) : null}
      </div>

      {loading ? (
        <SkeletonRow count={8} />
      ) : (
      <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No contacts match the current filter.
          </div>
        ) : (
          filtered.map((c) => {
            const lead = leadByContact.get(c.id);
            const score = Number(lead?.score || 0);
            const seq = enrolledByContact.get(c.id);
            const pinned = pins.has(c.id);
            return (
              <div
                key={c.id}
                className="flex items-center gap-3 p-3 hover:bg-slate-50 dark:hover:bg-slate-900"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.has(c.id)}
                  onChange={() => toggleSelected(c.id)}
                  onClick={(e) => e.stopPropagation()}
                />
                <button
                  onClick={() => togglePin(c.id)}
                  className={`text-base leading-none ${
                    pinned ? "text-amber-500" : "text-slate-300 hover:text-amber-500"
                  }`}
                  title={pinned ? "Unpin" : "Pin to top"}
                  aria-label={pinned ? "Unpin contact" : "Pin contact"}
                >
                  {pinned ? "★" : "☆"}
                </button>
                <Link
                  href={`/contacts/${c.id}`}
                  className="flex flex-1 items-center gap-3 min-w-0"
                >
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${avatarClasses(
                      c.id,
                    )}`}
                  >
                    {avatarInitials(c.name || c.email)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {c.name || c.email}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      {[c.role, c.company].filter(Boolean).join(" · ") ||
                        c.email}
                    </div>
                  </div>
                  {seq ? (
                    <span
                      className="badge hidden bg-leo-100 text-[10px] text-leo-700 sm:inline-flex"
                      title={`Enrolled in ${seqById.get(seq)?.name ?? "sequence"}`}
                    >
                      ⟳ {seqById.get(seq)?.name?.split(" ")[0] ?? "sequence"}
                    </span>
                  ) : null}
                  <span
                    className={`badge ${scoreBadgeClass(score)}`}
                    title={lead?.scoreReason || ""}
                  >
                    {score || "—"}
                  </span>
                </Link>
                {lead ? (
                  <select
                    value={lead.stage}
                    onClick={(e) => e.stopPropagation()}
                    onChange={async (e) => {
                      const next = e.target.value;
                      await api.patch(`/api/leads/${lead.id}`, { stage: next });
                      await load();
                    }}
                    className={`hidden text-[10px] font-medium border-0 bg-transparent rounded ${
                      STAGE_COLOR[lead.stage] ??
                      "bg-slate-100 text-slate-700"
                    } px-2 py-0.5 sm:inline-block`}
                  >
                    {LEAD_STAGES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      )}

      {showImport ? (
        <ImportCsvModal
          onClose={() => setShowImport(false)}
          onImported={async () => {
            setShowImport(false);
            await load();
          }}
        />
      ) : null}

      {showAdd ? (
        <Modal onClose={() => setShowAdd(false)} title="Add contact">
          <div className="space-y-3">
            <Field label="Name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Email *">
              <input
                className="input"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company">
                <input
                  className="input"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
              </Field>
              <Field label="Role">
                <input
                  className="input"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Tags (comma-separated)">
              <input
                className="input"
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className="input min-h-[80px]"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="btn-secondary"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                disabled={busy || !form.email}
                onClick={submit}
              >
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
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
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function ImportCsvModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<{
    contacts: ParsedContact[];
    skipped: number;
    total: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [createLeads, setCreateLeads] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function preview(t: string) {
    setText(t);
    if (!t.trim()) {
      setParsed(null);
      return;
    }
    setParsed(csvToContacts(t));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    preview(t);
  }

  async function submit() {
    if (!parsed || parsed.contacts.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/contacts/bulk", {
        contacts: parsed.contacts,
        createLeads,
        source: "csv-import",
      });
      onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sample = parsed?.contacts.slice(0, 5) ?? [];

  return (
    <Modal title="Import contacts from CSV" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">
          Paste CSV or upload a file. We auto-map columns named{" "}
          <span className="font-mono">email</span>,{" "}
          <span className="font-mono">name</span>,{" "}
          <span className="font-mono">company</span>,{" "}
          <span className="font-mono">role</span>, plus phone, linkedin, tags,
          notes. Email is required.
        </p>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        <textarea
          className="input min-h-[120px] font-mono text-xs"
          placeholder="email,name,company,role&#10;jane@acme.com,Jane Doe,Acme,VP Sales"
          value={text}
          onChange={(e) => preview(e.target.value)}
        />
        {parsed ? (
          <div className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800">
            <div className="font-medium">
              {parsed.contacts.length} valid · {parsed.total - parsed.contacts.length}{" "}
              skipped (missing/invalid email)
            </div>
            {sample.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {sample.map((c, i) => (
                  <li key={i} className="truncate">
                    {c.name || "—"} · {c.email}{" "}
                    {c.company ? `(${c.company})` : ""}
                  </li>
                ))}
                {parsed.contacts.length > sample.length ? (
                  <li className="text-slate-400">
                    …and {parsed.contacts.length - sample.length} more
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={createLeads}
            onChange={(e) => setCreateLeads(e.target.checked)}
          />
          Also create a lead (stage: new) for each imported contact
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || !parsed || parsed.contacts.length === 0}
            onClick={submit}
          >
            {busy
              ? "Importing…"
              : `Import ${parsed?.contacts.length ?? 0} contacts`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function QuickChip({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full bg-slate-100 px-2 py-1 hover:bg-leo-100 hover:text-leo-700 dark:bg-slate-800 dark:hover:bg-leo-900/40 dark:hover:text-leo-200"
    >
      {label}
    </button>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 shadow-xl dark:bg-slate-900 md:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
