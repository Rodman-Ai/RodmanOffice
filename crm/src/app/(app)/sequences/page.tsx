"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type {
  Contact,
  EmailRecord,
  Enrollment,
  Sequence,
  SequenceStep,
} from "@/lib/types";

interface SequenceWithSteps extends Sequence {
  steps: SequenceStep[];
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<SequenceWithSteps[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [showBuilder, setShowBuilder] = useState(false);
  const [enrolling, setEnrolling] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);

  async function load() {
    const [s, c, e, em] = await Promise.all([
      api.get<SequenceWithSteps[]>("/api/sequences"),
      api.get<Contact[]>("/api/contacts"),
      api.get<Enrollment[]>("/api/enrollments"),
      api.get<EmailRecord[]>("/api/emails"),
    ]);
    setSequences(s);
    setContacts(c);
    setEnrollments(e);
    setEmails(em);
  }

  const statsBySeq = useMemo(() => {
    const m = new Map<string, { active: number; completed: number; stopped: number; sent: number; replied: number }>();
    for (const s of sequences) {
      m.set(s.id, { active: 0, completed: 0, stopped: 0, sent: 0, replied: 0 });
    }
    for (const e of enrollments) {
      const cur = m.get(e.sequenceId);
      if (!cur) continue;
      if (e.status === "active") cur.active++;
      else if (e.status === "completed") cur.completed++;
      else if (e.status === "stopped") cur.stopped++;
    }
    for (const em of emails) {
      if (!em.sequenceEnrollmentId) continue;
      const enr = enrollments.find((e) => e.id === em.sequenceEnrollmentId);
      if (!enr) continue;
      const cur = m.get(enr.sequenceId);
      if (!cur) continue;
      if (em.status === "sent") cur.sent++;
      if (em.repliedAt) cur.replied++;
    }
    return m;
  }, [sequences, enrollments, emails]);
  useEffect(() => {
    load();
  }, []);

  async function runDue() {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await api.post<{
        due: number;
        processed: number;
        failed: number;
      }>("/api/sequences/run", {});
      setRunMsg(
        `Sent ${res.processed} of ${res.due} due${
          res.failed ? `, ${res.failed} failed` : ""
        }.`,
      );
    } catch (e) {
      setRunMsg((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sequences"
        description="Multi-step AI cadences. Each step is freshly personalized; replies auto-stop the sequence."
        actions={
          <>
            <button
              onClick={runDue}
              disabled={running}
              className="btn-secondary"
            >
              {running ? "Running…" : runMsg ?? "Run due steps"}
            </button>
            <button
              onClick={() => setShowBuilder(true)}
              className="btn-primary"
            >
              New sequence
            </button>
          </>
        }
      />
      <div className="grid gap-3 md:grid-cols-2">
        {sequences.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            No sequences yet.
          </div>
        ) : (
          sequences.map((s) => (
            <div key={s.id} className="card">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">{s.name}</h3>
                <span className="badge bg-leo-100 text-leo-700">
                  {s.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{s.goal}</p>
              {(() => {
                const st = statsBySeq.get(s.id) ?? {
                  active: 0,
                  completed: 0,
                  stopped: 0,
                  sent: 0,
                  replied: 0,
                };
                const rate = st.sent
                  ? Math.round((st.replied / st.sent) * 100)
                  : 0;
                return (
                  <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                    <Stat n="Active" v={st.active} />
                    <Stat n="Done" v={st.completed} />
                    <Stat n="Stopped" v={st.stopped} />
                    <Stat n="Sent" v={st.sent} />
                    <Stat n="Reply %" v={`${rate}%`} />
                  </div>
                );
              })()}
              <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
                {s.steps.map((st) => (
                  <li key={st.id}>
                    <span className="font-medium">
                      {st.subjectHint || `Step ${Number(st.stepIndex) + 1}`}
                    </span>{" "}
                    <span className="text-xs text-slate-400">
                      ({st.delayDays} days delay)
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => setPreviewing(s.id)}
                >
                  Preview step 1
                </button>
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    await api.patch(`/api/sequences/${s.id}`, {
                      status: s.status === "active" ? "paused" : "active",
                    });
                    await load();
                  }}
                >
                  {s.status === "active" ? "Pause" : "Resume"}
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => setEnrolling(s.id)}
                >
                  Enroll contacts
                </button>
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    if (!confirm(`Delete sequence "${s.name}"?`)) return;
                    await api.del(`/api/sequences/${s.id}`);
                    await load();
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {showBuilder ? (
        <SequenceBuilder
          onClose={() => setShowBuilder(false)}
          onCreated={async () => {
            setShowBuilder(false);
            await load();
          }}
        />
      ) : null}

      {enrolling ? (
        <EnrollPicker
          sequenceId={enrolling}
          contacts={contacts}
          onClose={() => setEnrolling(null)}
          onEnrolled={async () => {
            setEnrolling(null);
            await load();
          }}
        />
      ) : null}

      {previewing ? (
        <PreviewModal
          sequence={sequences.find((s) => s.id === previewing)!}
          contacts={contacts}
          onClose={() => setPreviewing(null)}
        />
      ) : null}
    </div>
  );
}

function Stat({ n, v }: { n: string; v: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">
        {n}
      </div>
      <div className="text-sm font-semibold">{v}</div>
    </div>
  );
}

function PreviewModal({
  sequence,
  contacts,
  onClose,
}: {
  sequence: SequenceWithSteps;
  contacts: Contact[];
  onClose: () => void;
}) {
  const [contactId, setContactId] = useState(contacts[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);

  async function generate() {
    const c = contacts.find((c) => c.id === contactId);
    if (!c) return;
    const step = sequence.steps[0];
    if (!step) return;
    setBusy(true);
    try {
      const res = await api.post<{ subject: string; body: string }>(
        "/api/ai/generate",
        {
          contact: {
            name: c.name,
            email: c.email,
            company: c.company,
            role: c.role,
            tags: c.tags,
            notes: c.notes,
          },
          goal: step.instructions || sequence.goal,
          tone: sequence.tone,
          context: `Step 1 of sequence "${sequence.name}". Subject hint: ${step.subjectHint || "(none)"}.`,
        },
      );
      setPreview(res);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 md:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold">Preview step 1</h2>
          <button onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>
        <div className="space-y-3 p-4">
          <label className="block">
            <span className="label">Render for</span>
            <select
              className="input"
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                  {c.company ? ` · ${c.company}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={generate}
            disabled={busy || !contactId}
            className="btn-primary w-full"
          >
            {busy ? "Generating…" : "Generate preview"}
          </button>
          {preview ? (
            <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-700">
              <div className="font-medium">{preview.subject}</div>
              <pre className="mt-2 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-200">
                {preview.body}
              </pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SequenceBuilder({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(
    "Book an intro call to demo our product to a relevant decision maker.",
  );
  const [tone, setTone] = useState("warm, direct, professional");
  const [steps, setSteps] = useState([
    { delayDays: 0, subjectHint: "Quick intro", instructions: "" },
    { delayDays: 3, subjectHint: "Following up", instructions: "Reference the first email; offer a different angle." },
    { delayDays: 7, subjectHint: "Last note for now", instructions: "Be concise; soft breakup." },
  ]);
  const [busy, setBusy] = useState(false);

  function update(i: number, patch: Partial<(typeof steps)[number]>) {
    setSteps(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function submit() {
    if (!name) return;
    setBusy(true);
    try {
      await api.post("/api/sequences", { name, goal, tone, steps });
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
      <div className="w-full max-w-2xl overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold">New sequence</h2>
          <button onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="space-y-3">
            <label className="block">
              <span className="label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Sequence goal</span>
              <textarea
                className="input min-h-[80px]"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="label">Tone</span>
              <input
                className="input"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </label>
            <div className="space-y-3">
              {steps.map((s, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Step {i + 1}</h4>
                    {steps.length > 1 ? (
                      <button
                        onClick={() =>
                          setSteps(steps.filter((_, idx) => idx !== i))
                        }
                        className="text-xs text-red-500"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <label className="block">
                      <span className="label">Delay (days)</span>
                      <input
                        type="number"
                        min={0}
                        className="input"
                        value={s.delayDays}
                        onChange={(e) =>
                          update(i, { delayDays: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="label">Subject hint</span>
                      <input
                        className="input"
                        value={s.subjectHint}
                        onChange={(e) =>
                          update(i, { subjectHint: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label className="mt-2 block">
                    <span className="label">Per-step instructions (optional)</span>
                    <textarea
                      className="input min-h-[60px]"
                      value={s.instructions}
                      onChange={(e) =>
                        update(i, { instructions: e.target.value })
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                onClick={() =>
                  setSteps([
                    ...steps,
                    {
                      delayDays: 3,
                      subjectHint: "",
                      instructions: "",
                    },
                  ])
                }
                className="btn-secondary"
              >
                + Add step
              </button>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !name}
            className="btn-primary"
          >
            {busy ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EnrollPicker({
  sequenceId,
  contacts,
  onClose,
  onEnrolled,
}: {
  sequenceId: string;
  contacts: Contact[];
  onClose: () => void;
  onEnrolled: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const visible = contacts.filter((c) => {
    const q = filter.toLowerCase();
    if (!q) return true;
    return [c.name, c.email, c.company, c.tags]
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  async function submit() {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      await api.post("/api/sequences/enroll", {
        sequenceId,
        contactIds: Array.from(selected),
      });
      onEnrolled();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
      <div className="w-full max-w-xl overflow-hidden rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold">Enroll contacts</h2>
          <button onClick={onClose} className="text-sm text-slate-400">
            Close
          </button>
        </div>
        <div className="p-4">
          <input
            className="input mb-3"
            placeholder="Filter contacts…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
            {visible.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-3 border-b border-slate-100 p-2 last:border-b-0 dark:border-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {c.name || c.email}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {c.company} {c.role ? `· ${c.role}` : ""}
                  </div>
                </div>
              </label>
            ))}
            {visible.length === 0 ? (
              <div className="p-3 text-center text-sm text-slate-500">
                No contacts match.
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || selected.size === 0}
            className="btn-primary"
          >
            {busy ? "Enrolling…" : `Enroll ${selected.size}`}
          </button>
        </div>
      </div>
    </div>
  );
}
