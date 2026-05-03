"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { Contact, Task } from "@/lib/types";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<"open" | "done" | "all">("open");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    title: "",
    contactId: "",
    dueAt: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [t, c] = await Promise.all([
      api.get<Task[]>("/api/tasks"),
      api.get<Contact[]>("/api/contacts"),
    ]);
    setTasks(t);
    setContacts(c);
  }
  useEffect(() => {
    load();
  }, []);

  const contactsById = useMemo(
    () => new Map(contacts.map((c) => [c.id, c])),
    [contacts],
  );

  const filtered = useMemo(() => {
    const list =
      filter === "all" ? tasks : tasks.filter((t) => t.status === filter);
    return list.slice().sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return (a.dueAt || "9999").localeCompare(b.dueAt || "9999");
    });
  }, [tasks, filter]);

  async function toggle(t: Task) {
    await api.patch(`/api/tasks/${t.id}`, {
      status: t.status === "open" ? "done" : "open",
    });
    await load();
  }

  async function submit() {
    if (!form.title.trim()) return;
    setBusy(true);
    try {
      await api.post("/api/tasks", form);
      setShowAdd(false);
      setForm({ title: "", contactId: "", dueAt: "", notes: "" });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Per-contact follow-ups. Open tasks surface on the dashboard too."
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            New task
          </button>
        }
      />

      <div className="mb-3 flex gap-2 text-sm">
        {(["open", "done", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 ${
              filter === f
                ? "bg-leo-600 text-white"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const groups: Array<{ label: string; items: typeof filtered }> = [];
        if (filter !== "done") {
          const overdue = filtered.filter(
            (t) => t.status === "open" && t.dueAt && t.dueAt < todayStr,
          );
          const today = filtered.filter(
            (t) => t.status === "open" && t.dueAt === todayStr,
          );
          const upcoming = filtered.filter(
            (t) => t.status === "open" && t.dueAt && t.dueAt > todayStr,
          );
          const noDue = filtered.filter(
            (t) => t.status === "open" && !t.dueAt,
          );
          if (overdue.length) groups.push({ label: "Overdue", items: overdue });
          if (today.length) groups.push({ label: "Today", items: today });
          if (upcoming.length) groups.push({ label: "Upcoming", items: upcoming });
          if (noDue.length) groups.push({ label: "No due date", items: noDue });
        }
        const done = filtered.filter((t) => t.status === "done");
        if (done.length) groups.push({ label: "Done", items: done });
        if (groups.length === 0) {
          return (
            <div className="card p-6 text-center text-sm text-slate-500">
              No tasks.
            </div>
          );
        }
        return groups.map((g) => (
          <div key={g.label} className="mb-3">
            <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {g.label} · {g.items.length}
            </div>
            <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
              {g.items.map((t) => {
            const c = contactsById.get(t.contactId);
            const overdue =
              t.status === "open" &&
              t.dueAt &&
              new Date(t.dueAt).getTime() < Date.now();
            return (
              <div
                key={t.id}
                className="flex items-start gap-3 p-3"
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={t.status === "done"}
                  onChange={() => toggle(t)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-sm ${
                        t.status === "done"
                          ? "text-slate-400 line-through"
                          : "font-medium"
                      }`}
                    >
                      {t.title}
                    </p>
                    {overdue ? (
                      <span className="badge bg-red-100 text-red-700">
                        overdue
                      </span>
                    ) : null}
                  </div>
                  {c ? (
                    <Link
                      href={`/contacts/${c.id}`}
                      className="text-xs text-slate-500 hover:text-leo-600"
                    >
                      {c.name || c.email}
                    </Link>
                  ) : null}
                  {t.notes ? (
                    <p className="mt-1 text-xs text-slate-500">{t.notes}</p>
                  ) : null}
                </div>
                <div className="text-xs text-slate-400">
                  {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : ""}
                </div>
              </div>
            );
          })}
            </div>
          </div>
        ));
      })()}

      {showAdd ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 dark:bg-slate-900 md:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New task</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="text-sm text-slate-400"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="label">Title *</span>
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) =>
                    setForm({ ...form, title: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="label">Linked contact</span>
                <select
                  className="input"
                  value={form.contactId}
                  onChange={(e) =>
                    setForm({ ...form, contactId: e.target.value })
                  }
                >
                  <option value="">— None —</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Due</span>
                <input
                  type="date"
                  className="input"
                  value={form.dueAt ? form.dueAt.slice(0, 10) : ""}
                  onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="label">Notes</span>
                <textarea
                  className="input min-h-[80px]"
                  value={form.notes}
                  onChange={(e) =>
                    setForm({ ...form, notes: e.target.value })
                  }
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={busy || !form.title}
                  onClick={submit}
                >
                  {busy ? "Saving…" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
