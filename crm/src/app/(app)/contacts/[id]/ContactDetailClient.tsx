"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import { pushRecent } from "@/lib/recents";
import { renderMarkdown } from "@/lib/markdown";
import { pushTrash } from "@/lib/trash";
import { useUI } from "@/components/ui/UIProvider";
import type {
  Activity,
  Contact,
  EmailRecord,
  Lead,
  Member,
  Task,
} from "@/lib/types";
import { LEAD_STAGES, type LeadStage } from "@/lib/types";

export default function ContactDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [contact, setContact] = useState<Contact | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTask, setShowTask] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", dueAt: "" });
  const [activityFilter, setActivityFilter] = useState<
    "all" | "emails" | "stage" | "tasks"
  >("all");
  const [summarizing, setSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const ui = useUI();
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    api.get<Contact[]>("/api/contacts").then(setAllContacts);
    api.get<Member[]>("/api/members").then(setMembers).catch(() => {});
  }, []);

  function followUpSuggestions() {
    if (!contact || !lead) return [] as string[];
    const out: string[] = [];
    const replied = emails.some((e) => e.repliedAt);
    const days = lead.lastContactedAt
      ? Math.round(
          (Date.now() - new Date(lead.lastContactedAt).getTime()) /
            (24 * 3600 * 1000),
        )
      : null;
    if (lead.stage === "new") {
      out.push("Send a 90-word opener referencing their company + a recent signal.");
    } else if (replied && lead.stage !== "qualified" && lead.stage !== "won") {
      out.push("They replied — propose two specific times next week.");
    } else if (days !== null && days >= 7) {
      out.push(`No contact in ${days}d — try a different angle (case study or ROI math).`);
    }
    if (lead.stage === "engaged" && Number(lead.value || 0) === 0) {
      out.push("Add a value to this lead so it shows in the pipeline forecast.");
    }
    if (lead.stage === "qualified" && tasks.filter((t) => t.status === "open").length === 0) {
      out.push("Add a follow-up task — qualified leads stall without a next action.");
    }
    if (out.length === 0) {
      out.push("All looks healthy — pick the next contact from the dashboard.");
    }
    return out;
  }

  function summarizeContact() {
    if (!contact) return;
    setSummarizing(true);
    // Synthesize a summary from the data we already have. Stays static-friendly.
    setTimeout(() => {
      const stage = lead?.stage ?? "—";
      const score = lead?.score ?? "—";
      const sent = emails.length;
      const replies = emails.filter((e) => e.repliedAt).length;
      const lastEmail =
        emails
          .slice()
          .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""))[0];
      const openTasks = tasks.filter((t) => t.status === "open").length;
      const lines = [
        `${contact.name || contact.email}` +
          (contact.role ? `, ${contact.role}` : "") +
          (contact.company ? ` at ${contact.company}` : "") +
          ".",
        `Stage: ${stage}. AI score: ${score}${
          lead?.scoreReason ? ` (${lead.scoreReason})` : ""
        }.`,
        `${sent} email${sent === 1 ? "" : "s"} sent, ${replies} repl${
          replies === 1 ? "y" : "ies"
        }.${lastEmail ? ` Last: "${lastEmail.subject}".` : ""}`,
        openTasks
          ? `${openTasks} open task${openTasks === 1 ? "" : "s"}.`
          : "No open tasks.",
        contact.notes ? `Notes: ${contact.notes}` : "",
      ].filter(Boolean);
      setSummary(lines.join(" "));
      setSummarizing(false);
    }, 350);
  }

  async function load() {
    try {
      const [c, leads, allEmails, acts, allTasks] = await Promise.all([
        api.get<Contact>(`/api/contacts/${id}`),
        api.get<Lead[]>("/api/leads"),
        api.get<EmailRecord[]>("/api/emails"),
        api.get<Activity[]>(`/api/activity?contactId=${id}`),
        api.get<Task[]>("/api/tasks"),
      ]);
      setContact(c);
      setLead(leads.find((l) => l.contactId === id) ?? null);
      setEmails(allEmails.filter((e) => e.contactId === id));
      setActivity(acts);
      setTasks(allTasks.filter((t) => t.contactId === id));
    } catch (err) {
      setError((err as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    if (contact) {
      pushRecent({
        id: contact.id,
        label: contact.name || contact.email,
        href: `/contacts/${contact.id}`,
      });
    }
  }, [contact]);

  async function changeStage(stage: LeadStage) {
    if (!lead) return;
    let reason = "";
    if (stage === "won" || stage === "lost") {
      const r = window.prompt(
        stage === "won"
          ? "Brief reason for winning? (optional)"
          : "Reason this lead was lost? (optional)",
        "",
      );
      if (r === null) return; // cancelled
      reason = r.trim();
    }
    setBusy(true);
    try {
      const patch: Record<string, string> = { stage };
      if (reason) {
        patch.notes = lead.notes
          ? `${lead.notes}\n[${stage}] ${reason}`
          : `[${stage}] ${reason}`;
      }
      await api.patch(`/api/leads/${lead.id}`, patch);
      await api.post("/api/activity/log", {
        contactId: contact?.id,
        type: "stage_change",
        summary: `Stage: ${lead.stage} → ${stage}${
          reason ? ` — ${reason}` : ""
        }`,
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function score() {
    if (!contact) return;
    setScoring(true);
    try {
      await api.post("/api/ai/score", { contactId: contact.id });
      await load();
    } finally {
      setScoring(false);
    }
  }

  async function addTask() {
    if (!contact || !taskForm.title.trim()) return;
    await api.post("/api/tasks", {
      contactId: contact.id,
      title: taskForm.title,
      dueAt: taskForm.dueAt,
    });
    setTaskForm({ title: "", dueAt: "" });
    setShowTask(false);
    await load();
  }

  async function toggleTask(t: Task) {
    await api.patch(`/api/tasks/${t.id}`, {
      status: t.status === "open" ? "done" : "open",
    });
    await load();
  }

  async function snoozeTask(t: Task, days: number) {
    const base = t.dueAt ? new Date(t.dueAt) : new Date();
    if (Number.isNaN(base.getTime())) base.setTime(Date.now());
    base.setTime(base.getTime() + days * 24 * 3600 * 1000);
    await api.patch(`/api/tasks/${t.id}`, { dueAt: base.toISOString().slice(0, 10) });
    await load();
  }

  async function remove() {
    if (!contact) return;
    const okGo = await ui.confirm("Delete this contact and its lead?", {
      confirmLabel: "Delete",
      danger: true,
    });
    if (!okGo) return;
    pushTrash({
      id: contact.id,
      kind: "contact",
      label: contact.name || contact.email,
      payload: contact,
      related: lead ? [lead] : [],
    });
    if (lead) await api.del(`/api/leads/${lead.id}`);
    await api.del(`/api/contacts/${id}`);
    ui.toast(`Deleted ${contact.name || contact.email}.`, {
      kind: "success",
      action: {
        label: "Undo",
        onClick: async () => {
          await api.post("/api/contacts", {
            name: contact.name,
            email: contact.email,
            company: contact.company,
            role: contact.role,
            phone: contact.phone,
            linkedin: contact.linkedin,
            tags: contact.tags,
            notes: contact.notes,
          });
          if (lead) {
            await api.post("/api/leads", {
              contactId: contact.id,
              source: lead.source,
              stage: lead.stage,
            });
          }
          ui.toast("Restored.", { kind: "success" });
          router.push("/contacts");
        },
      },
      ttl: 8000,
    });
    router.push("/contacts");
  }

  if (!contact) {
    return (
      <div className="text-sm text-slate-500">{error ?? "Loading…"}</div>
    );
  }

  return (
    <div>
      <PageHeader
        title={contact.name || contact.email}
        description={[contact.role, contact.company].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link
              href={`/compose?contactId=${contact.id}`}
              className="btn-primary"
            >
              AI compose
            </Link>
            <button
              onClick={score}
              disabled={scoring}
              className="btn-secondary"
            >
              {scoring ? "Scoring…" : "AI score"}
            </button>
            <button onClick={() => setShowTask(true)} className="btn-secondary">
              + Task
            </button>
            <button
              onClick={() => window.print()}
              className="btn-secondary"
              title="Print this contact"
            >
              Print
            </button>
            <button
              onClick={() => {
                if (!contact) return;
                const bundle = {
                  contact,
                  lead,
                  emails,
                  tasks,
                  activity,
                  exportedAt: new Date().toISOString(),
                };
                const blob = new Blob([JSON.stringify(bundle, null, 2)], {
                  type: "application/json",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `leocrm-${contact.id}.json`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 0);
                ui.toast("Exported as JSON", { kind: "success" });
              }}
              className="btn-secondary"
              title="GDPR export — full bundle of all data for this contact"
            >
              Export
            </button>
            <button
              onClick={async () => {
                if (!contact) return;
                const okGo = await ui.confirm(
                  "Forget this contact? Deletes contact, lead, linked tasks. Emails and activity history remain anonymized.",
                  { confirmLabel: "Forget", danger: true },
                );
                if (!okGo) return;
                if (lead) await api.del(`/api/leads/${lead.id}`);
                for (const t of tasks) {
                  await api.del(`/api/tasks/${t.id}`);
                }
                await api.del(`/api/contacts/${contact.id}`);
                ui.toast("Forgotten.", { kind: "success" });
                router.push("/contacts");
              }}
              className="btn-secondary text-rose-600"
              title="GDPR right-to-forget"
            >
              Forget
            </button>
            <button onClick={remove} className="btn-secondary">
              Delete
            </button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card md:col-span-1">
          <h3 className="mb-3 text-sm font-semibold">Details</h3>
          <dl className="space-y-2 text-sm">
            <EditableRow
              k="Name"
              v={contact.name}
              onSave={async (v) => {
                await api.patch(`/api/contacts/${contact.id}`, { name: v });
                await load();
              }}
            />
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">
                Email
              </dt>
              <dd className="text-sm">
                <a
                  href={`mailto:${contact.email}`}
                  className="text-leo-600 hover:underline"
                >
                  {contact.email}
                </a>
              </dd>
            </div>
            <EditableRow
              k="Role"
              v={contact.role}
              onSave={async (v) => {
                await api.patch(`/api/contacts/${contact.id}`, { role: v });
                await load();
              }}
            />
            <EditableRow
              k="Company"
              v={contact.company}
              onSave={async (v) => {
                await api.patch(`/api/contacts/${contact.id}`, { company: v });
                await load();
              }}
            />
            <EditableRow
              k="Phone"
              v={contact.phone}
              renderValue={(v) =>
                v ? (
                  <a
                    href={`tel:${v.replace(/\s/g, "")}`}
                    className="text-leo-600 hover:underline"
                  >
                    {v}
                  </a>
                ) : (
                  "—"
                )
              }
              onSave={async (v) => {
                await api.patch(`/api/contacts/${contact.id}`, { phone: v });
                await load();
              }}
            />
            <EditableRow
              k="LinkedIn"
              v={contact.linkedin}
              renderValue={(v) =>
                v ? (
                  <a
                    href={v.startsWith("http") ? v : `https://${v}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-leo-600 hover:underline"
                  >
                    {v}
                  </a>
                ) : (
                  "—"
                )
              }
              onSave={async (v) => {
                await api.patch(`/api/contacts/${contact.id}`, { linkedin: v });
                await load();
              }}
            />
            <EditableRow
              k="Tags"
              v={contact.tags}
              onSave={async (v) => {
                await api.patch(`/api/contacts/${contact.id}`, { tags: v });
                await load();
              }}
            />
            <EditableRow
              k="Notes"
              v={contact.notes}
              multiline
              renderValue={(v) => (
                <div
                  className="prose prose-sm max-w-none text-sm dark:prose-invert"
                  dangerouslySetInnerHTML={{
                    __html: renderMarkdown(v || "", allContacts),
                  }}
                />
              )}
              onSave={async (v) => {
                await api.patch(`/api/contacts/${contact.id}`, { notes: v });
                await load();
              }}
            />
          </dl>
        </div>
        <div className="card md:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Pipeline</h3>
          {lead ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                {LEAD_STAGES.map((s) => (
                  <button
                    key={s}
                    onClick={() => changeStage(s)}
                    disabled={busy}
                    className={`badge cursor-pointer ${
                      lead.stage === s
                        ? "bg-leo-600 text-white"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Row k="Source" v={lead.source} />
                <Row k="Score" v={String(lead.score)} />
                <Row k="Why" v={lead.scoreReason} />
                <EditableRow
                  k="Value ($)"
                  v={String(lead.value || "")}
                  onSave={async (v) => {
                    await api.patch(`/api/leads/${lead.id}`, {
                      value: v.replace(/[^0-9.]/g, "") || "0",
                    });
                    await load();
                  }}
                />
                <Row k="Last contacted" v={fmtDate(lead.lastContactedAt)} />
                <EditableRow
                  k="Next action"
                  v={lead.nextAction}
                  onSave={async (v) => {
                    await api.patch(`/api/leads/${lead.id}`, {
                      nextAction: v,
                    });
                    await load();
                  }}
                />
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-400">
                    Owner
                  </dt>
                  <dd className="text-sm">
                    <select
                      value={lead.owner || ""}
                      onChange={async (e) => {
                        await api.patch(`/api/leads/${lead.id}`, {
                          owner: e.target.value,
                        });
                        await load();
                      }}
                      className="input mt-1 w-full py-1 text-sm"
                    >
                      <option value="">— Unassigned —</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.email}>
                          {m.name || m.email}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-slate-500">No lead record.</p>
          )}
        </div>
      </div>

      {emails.length > 0 ? (
        <div className="mt-4 card">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Engagement (last 30 days)
          </div>
          <Sparkline emails={emails} />
        </div>
      ) : null}

      <div className="mt-4 card border-leo-200 bg-leo-50 dark:border-leo-900 dark:bg-leo-900/30">
        <div className="text-xs font-semibold uppercase tracking-wide text-leo-700 dark:text-leo-200">
          AI follow-up suggestions
        </div>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {followUpSuggestions().map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Tasks</h3>
          <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
            {tasks.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">
                No tasks for this contact.
              </div>
            ) : (
              tasks
                .slice()
                .sort((a, b) => {
                  if (a.status !== b.status)
                    return a.status === "open" ? -1 : 1;
                  return (a.dueAt || "9999").localeCompare(b.dueAt || "9999");
                })
                .map((t) => (
                  <div key={t.id} className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={t.status === "done"}
                      onChange={() => toggleTask(t)}
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-sm ${
                          t.status === "done"
                            ? "text-slate-400 line-through"
                            : "font-medium"
                        }`}
                      >
                        {t.title}
                      </p>
                      {t.notes ? (
                        <p className="text-xs text-slate-500">{t.notes}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-xs text-slate-400">
                      {t.dueAt
                        ? new Date(t.dueAt).toLocaleDateString()
                        : ""}
                      {t.status === "open" ? (
                        <span className="hidden gap-1 sm:flex">
                          <button
                            onClick={() => snoozeTask(t, 1)}
                            className="rounded bg-slate-100 px-1 hover:bg-leo-50 hover:text-leo-700 dark:bg-slate-800"
                            title="Snooze +1 day"
                          >
                            +1d
                          </button>
                          <button
                            onClick={() => snoozeTask(t, 3)}
                            className="rounded bg-slate-100 px-1 hover:bg-leo-50 hover:text-leo-700 dark:bg-slate-800"
                            title="Snooze +3 days"
                          >
                            +3d
                          </button>
                          <button
                            onClick={() => snoozeTask(t, 7)}
                            className="rounded bg-slate-100 px-1 hover:bg-leo-50 hover:text-leo-700 dark:bg-slate-800"
                            title="Snooze +7 days"
                          >
                            +1w
                          </button>
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Activity</h3>
            <button
              onClick={summarizeContact}
              disabled={summarizing}
              className="text-xs text-leo-600 hover:underline"
            >
              {summarizing ? "Summarizing…" : "AI summarize"}
            </button>
          </div>
          {summary ? (
            <div className="card mb-2 border-leo-200 bg-leo-50 text-sm dark:border-leo-900 dark:bg-leo-900/30">
              {summary}
            </div>
          ) : null}
          <div className="mb-2 flex flex-wrap gap-1 text-xs">
            {(["all", "emails", "stage", "tasks"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setActivityFilter(f)}
                className={`rounded-full px-2 py-1 ${
                  activityFilter === f
                    ? "bg-leo-600 text-white"
                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="card p-0">
            {(() => {
              const visible = activity.filter((a) => {
                if (activityFilter === "all") return true;
                if (activityFilter === "emails")
                  return (
                    a.type === "email_sent" || a.type === "email_replied"
                  );
                if (activityFilter === "stage")
                  return a.type === "stage_change";
                if (activityFilter === "tasks")
                  return (
                    a.type === "task_created" || a.type === "task_completed"
                  );
                return true;
              });
              if (visible.length === 0) {
                return (
                  <div className="p-4 text-center text-sm text-slate-500">
                    No activity in this filter.
                  </div>
                );
              }
              return (
                <ol className="relative space-y-3 p-4">
                  {visible.map((a) => (
                    <li key={a.id} className="flex gap-3">
                      <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-leo-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{a.summary}</p>
                        <p className="text-xs text-slate-400">
                          {fmtDate(a.createdAt)}
                          {a.actor ? ` · ${a.actor}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              );
            })()}
          </div>
        </div>
      </div>

      {showTask ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-slate-900 md:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New task for {contact.name || contact.email}</h2>
              <button
                onClick={() => setShowTask(false)}
                className="text-sm text-slate-400"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="label">Title</span>
                <input
                  className="input"
                  value={taskForm.title}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, title: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="label">Due</span>
                <input
                  type="date"
                  className="input"
                  value={taskForm.dueAt}
                  onChange={(e) =>
                    setTaskForm({ ...taskForm, dueAt: e.target.value })
                  }
                />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowTask(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={addTask} className="btn-primary">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <h3 className="mb-2 mt-6 text-sm font-semibold">Email threads</h3>
      <div className="space-y-3">
        {emails.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            No emails yet.
          </div>
        ) : (
          (() => {
            const threads = new Map<string, EmailRecord[]>();
            for (const e of emails) {
              const k = e.threadId || `solo-${e.id}`;
              const list = threads.get(k) ?? [];
              list.push(e);
              threads.set(k, list);
            }
            const groups = Array.from(threads.entries()).map(([k, msgs]) => ({
              key: k,
              msgs: msgs.slice().sort((a, b) =>
                (a.sentAt || "").localeCompare(b.sentAt || ""),
              ),
            }));
            groups.sort((a, b) => {
              const al = a.msgs[a.msgs.length - 1].sentAt || "";
              const bl = b.msgs[b.msgs.length - 1].sentAt || "";
              return bl.localeCompare(al);
            });
            return groups.map((g) => {
              const head = g.msgs[0];
              const replied = g.msgs.some((m) => m.repliedAt);
              return (
                <ThreadCard
                  key={g.key}
                  head={head}
                  msgs={g.msgs}
                  replied={replied}
                />
              );
            });
          })()
        )}
      </div>
    </div>
  );
}

function EditableRow({
  k,
  v,
  onSave,
  multiline,
  renderValue,
}: {
  k: string;
  v: string;
  onSave: (val: string) => Promise<void>;
  multiline?: boolean;
  renderValue?: (v: string) => React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(v);
  const [busy, setBusy] = useState(false);
  useEffect(() => setVal(v), [v]);
  if (editing) {
    return (
      <div>
        <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
        {multiline ? (
          <textarea
            autoFocus
            className="input mt-1 min-h-[80px]"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
        ) : (
          <input
            autoFocus
            className="input mt-1"
            value={val}
            onChange={(e) => setVal(e.target.value)}
          />
        )}
        <div className="mt-1 flex gap-2 text-xs">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(val);
                setEditing(false);
              } finally {
                setBusy(false);
              }
            }}
            className="text-leo-600"
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setVal(v);
              setEditing(false);
            }}
            className="text-slate-500"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <div
      onClick={() => setEditing(true)}
      className="cursor-pointer rounded -mx-1 px-1 hover:bg-slate-50 dark:hover:bg-slate-900"
      title="Click to edit"
    >
      <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
      {renderValue ? (
        <dd>{v ? renderValue(v) : "—"}</dd>
      ) : multiline ? (
        <dd className="whitespace-pre-wrap text-sm">{v || "—"}</dd>
      ) : (
        <dd className="text-sm">{v || "—"}</dd>
      )}
    </div>
  );
}

function ThreadCard({
  head,
  msgs,
  replied,
}: {
  head: EmailRecord;
  msgs: EmailRecord[];
  replied: boolean;
}) {
  const [open, setOpen] = useState(msgs.length <= 2);
  return (
    <div className="card p-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900"
      >
        <p className="truncate text-sm font-medium">{head.subject}</p>
        {head.aiGenerated === "yes" ? (
          <span className="badge bg-leo-100 text-leo-700">AI</span>
        ) : null}
        {head.variant ? (
          <span className="badge bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {head.variant}
          </span>
        ) : null}
        {replied ? (
          <span className="badge bg-emerald-100 text-emerald-700">replied</span>
        ) : null}
        <span className="ml-auto text-xs text-slate-400">
          {msgs.length} msg{msgs.length === 1 ? "" : "s"} ·{" "}
          {fmtDateLocal(msgs[msgs.length - 1].sentAt)}
        </span>
      </button>
      {open ? (
        <ol className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {msgs.map((m, i) => (
            <li key={m.id} className="p-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="font-medium">
                  {i === 0 ? "Sent" : `Reply ${i}`}
                </span>
                <span>· {fmtDateLocal(m.sentAt)}</span>
                {m.repliedAt ? (
                  <span className="ml-auto text-emerald-600">
                    replied {fmtDateLocal(m.repliedAt)}
                  </span>
                ) : null}
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200">
                {m.body}
              </pre>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function Sparkline({ emails }: { emails: EmailRecord[] }) {
  const days = 30;
  const sentByDay = new Map<string, { sent: number; replied: number }>();
  for (const e of emails) {
    if (!e.sentAt) continue;
    const k = e.sentAt.slice(0, 10);
    const cur = sentByDay.get(k) ?? { sent: 0, replied: 0 };
    cur.sent++;
    if (e.repliedAt) cur.replied++;
    sentByDay.set(k, cur);
  }
  const cells: { date: string; sent: number; replied: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const c = sentByDay.get(k) ?? { sent: 0, replied: 0 };
    cells.push({ date: k, ...c });
  }
  const max = Math.max(1, ...cells.map((c) => c.sent));
  return (
    <div className="mt-2 flex h-12 items-end gap-[2px]">
      {cells.map((c) => (
        <div
          key={c.date}
          title={`${c.date}: ${c.sent} sent, ${c.replied} replied`}
          className="flex-1 rounded-sm bg-leo-500"
          style={{
            height: `${Math.max(4, (c.sent / max) * 100)}%`,
            opacity: c.sent === 0 ? 0.1 : c.replied > 0 ? 1 : 0.5,
          }}
        />
      ))}
    </div>
  );
}

function fmtDateLocal(s: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}

function Row({ k, v, pre }: { k: string; v: string; pre?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{k}</dt>
      {pre ? (
        <dd className="whitespace-pre-wrap text-sm">{v || "—"}</dd>
      ) : (
        <dd className="text-sm">{v || "—"}</dd>
      )}
    </div>
  );
}

function fmtDate(s: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString();
}
