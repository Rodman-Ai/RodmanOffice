"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PageHeader } from "@/components/PageHeader";
import type { Activity, Contact, EmailRecord, Lead, Task } from "@/lib/types";
import { LEAD_STAGES } from "@/lib/types";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activityActor, setActivityActor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    try {
        const [c, l, e, t, a] = await Promise.all([
          api.get<Contact[]>("/api/contacts"),
          api.get<Lead[]>("/api/leads"),
          api.get<EmailRecord[]>("/api/emails"),
          api.get<Task[]>("/api/tasks"),
          api.get<Activity[]>("/api/activity"),
        ]);
        setContacts(c);
        setLeads(l);
        setEmails(e);
        setTasks(t);
        setActivity(a);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
  }
  useEffect(() => {
    load();
  }, []);

  const stageCounts = LEAD_STAGES.map((stage) => ({
    stage,
    count: leads.filter((l) => l.stage === stage).length,
  }));

  const sent = emails.filter((e) => e.status === "sent");
  const aiSent = sent.filter((e) => e.aiGenerated === "yes").length;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="A snapshot of your pipeline and AI activity."
        actions={
          <>
            <button
              onClick={load}
              disabled={refreshing}
              className="btn-secondary"
              title="Refresh data"
            >
              {refreshing ? "↻ …" : "↻ Refresh"}
            </button>
            <SyncRepliesButton />
            <Link href="/compose" className="btn-primary">
              New AI email
            </Link>
          </>
        }
      />
      {error ? (
        <div className="card mb-4 border-red-300 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Contacts" value={contacts.length} loading={loading} />
        <Stat label="Active leads" value={leads.length} loading={loading} />
        <Stat
          label="Pipeline $"
          value={loading ? "—" : fmtUSD(
            leads
              .filter((l) => l.stage !== "lost" && l.stage !== "won")
              .reduce((s, l) => s + Number(l.value || 0), 0),
          )}
          loading={false}
        />
        <Stat label="Emails sent" value={sent.length} loading={loading} />
        <Stat label="AI-generated" value={aiSent} loading={loading} />
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-slate-500">
        Pipeline
      </h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {stageCounts.map(({ stage, count }) => (
          <div key={stage} className="card">
            <div className="text-xs uppercase tracking-wide text-slate-500">
              {stage}
            </div>
            <div className="mt-2 text-2xl font-semibold">{count}</div>
          </div>
        ))}
      </div>

      {(() => {
        const today = new Date().toISOString().slice(0, 10);
        const todaySends = sent.filter((e) => e.sentAt.slice(0, 10) === today)
          .length;
        const todayReplies = sent.filter(
          (e) => e.repliedAt && e.repliedAt.slice(0, 10) === today,
        ).length;
        const stale = leads.filter(
          (l) =>
            l.stage !== "won" &&
            l.stage !== "lost" &&
            l.lastContactedAt &&
            Date.now() - new Date(l.lastContactedAt).getTime() >
              14 * 24 * 3600 * 1000,
        ).length;

        // Streak: consecutive days (working backwards from today) with >=1 send.
        const sendDays = new Set(
          sent.map((e) => (e.sentAt || "").slice(0, 10)).filter(Boolean),
        );
        let streak = 0;
        for (let i = 0; i < 60; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          if (sendDays.has(d.toISOString().slice(0, 10))) streak++;
          else break;
        }

        // Weekly goal: default 25/wk
        const goal = 25;
        const start = new Date();
        start.setDate(start.getDate() - 6);
        const weekStr = start.toISOString().slice(0, 10);
        const weekSends = sent.filter(
          (e) => e.sentAt.slice(0, 10) >= weekStr,
        ).length;

        // Suggested next contact: highest scoring lead not contacted in 7+ days
        // among non-terminal stages
        const sevenDaysAgo = Date.now() - 7 * 24 * 3600 * 1000;
        const ranked = leads
          .filter(
            (l) =>
              l.stage !== "won" &&
              l.stage !== "lost" &&
              (!l.lastContactedAt ||
                new Date(l.lastContactedAt).getTime() < sevenDaysAgo),
          )
          .sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
        const nextLead = ranked[0];
        const nextContact = nextLead
          ? contacts.find((c) => c.id === nextLead.contactId)
          : undefined;

        return (
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="card">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Today
              </div>
              <div className="mt-2 text-sm">
                <div>
                  <span className="font-semibold">{todaySends}</span> sent ·{" "}
                  <span className="font-semibold text-emerald-600">
                    {todayReplies}
                  </span>{" "}
                  replies
                </div>
                <div>
                  <span className="font-semibold text-rose-600">{stale}</span>{" "}
                  stale leads (14d+)
                </div>
                <div>
                  Streak:{" "}
                  <span className="font-semibold">
                    {streak} day{streak === 1 ? "" : "s"}
                  </span>{" "}
                  🔥
                </div>
              </div>
            </div>
            <div className="card">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Weekly send goal
              </div>
              <div className="mt-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{weekSends}</span>
                  <span className="text-slate-400">/ {goal}</span>
                  <span className="ml-auto text-xs text-slate-500">
                    {Math.min(100, Math.round((weekSends / goal) * 100))}%
                  </span>
                </div>
                <div className="mt-2 h-2 rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-2 rounded bg-leo-500"
                    style={{
                      width: `${Math.min(100, (weekSends / goal) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Last 7 days. Adjust the target in Settings.
                </p>
              </div>
            </div>
            <div className="card">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Suggested next contact
              </div>
              {nextContact ? (
                <div className="mt-2 text-sm">
                  <Link
                    className="font-semibold hover:text-leo-600"
                    href={`/contacts/${nextContact.id}`}
                  >
                    {nextContact.name || nextContact.email}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {nextContact.role || ""}
                    {nextContact.company ? ` · ${nextContact.company}` : ""}
                  </div>
                  <div className="mt-1 text-xs">
                    Score{" "}
                    <span className="font-semibold">{nextLead!.score}</span> ·
                    Stage {nextLead!.stage}
                  </div>
                  <Link
                    href={`/compose?contactId=${nextContact.id}`}
                    className="mt-2 inline-block text-xs text-leo-600 hover:underline"
                  >
                    AI compose →
                  </Link>
                </div>
              ) : (
                <div className="mt-2 text-sm text-slate-500">
                  Everyone's been contacted recently.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <h2 className="mt-8 mb-3 text-sm font-semibold text-slate-500">
        Today
      </h2>
      <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
        {(() => {
          const open = tasks.filter((t) => t.status === "open");
          if (open.length === 0) {
            return (
              <div className="p-6 text-center text-sm text-slate-500">
                No open tasks. Add follow-ups from a contact's page or{" "}
                <Link href="/tasks" className="text-leo-600">
                  Tasks
                </Link>
                .
              </div>
            );
          }
          const sorted = open
            .slice()
            .sort((a, b) =>
              (a.dueAt || "9999").localeCompare(b.dueAt || "9999"),
            )
            .slice(0, 6);
          return sorted.map((t) => {
            const c = contacts.find((c) => c.id === t.contactId);
            const overdue =
              t.dueAt && new Date(t.dueAt).getTime() < Date.now();
            return (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={false}
                  onChange={async () => {
                    await api.patch(`/api/tasks/${t.id}`, { status: "done" });
                    setTasks(tasks.filter((x) => x.id !== t.id));
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{t.title}</p>
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
                </div>
                <div className="text-xs text-slate-400">
                  {t.dueAt ? new Date(t.dueAt).toLocaleDateString() : ""}
                </div>
              </div>
            );
          });
        })()}
      </div>

      <div className="mt-8 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500">Activity feed</h2>
        <select
          value={activityActor}
          onChange={(e) => setActivityActor(e.target.value)}
          className="input w-auto py-1 text-xs"
        >
          <option value="">All members</option>
          {Array.from(new Set(activity.map((a) => a.actor).filter(Boolean))).map(
            (a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
        {activity.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No activity yet.
          </div>
        ) : (
          activity
            .filter((a) => !activityActor || a.actor === activityActor)
            .slice()
            .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
            .slice(0, 10)
            .map((a) => {
              const c = contacts.find((c) => c.id === a.contactId);
              return (
                <div key={a.id} className="flex items-start gap-3 p-3">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-leo-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{a.summary}</p>
                    <p className="text-xs text-slate-400">
                      {c ? (
                        <Link
                          className="hover:text-leo-600"
                          href={`/contacts/${c.id}`}
                        >
                          {c.name || c.email}
                        </Link>
                      ) : null}
                      {c ? " · " : ""}
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleString()
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })
        )}
      </div>

      <h2 className="mt-8 mb-3 text-sm font-semibold text-slate-500">
        Recent emails
      </h2>
      <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
        {sent
          .slice()
          .sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || ""))
          .slice(0, 8)
          .map((e) => {
            const c = contacts.find((c) => c.id === e.contactId);
            return (
              <div key={e.id} className="flex items-start gap-3 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-leo-100 text-xs font-semibold text-leo-700">
                  {(c?.name || c?.email || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {c?.name || c?.email || "Unknown"}
                    </p>
                    {e.aiGenerated === "yes" ? (
                      <span className="badge bg-leo-100 text-leo-700">AI</span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm text-slate-600 dark:text-slate-300">
                    {e.subject}
                  </p>
                </div>
                <div className="text-xs text-slate-400">
                  {e.sentAt ? new Date(e.sentAt).toLocaleDateString() : ""}
                </div>
              </div>
            );
          })}
        {sent.length === 0 && !loading ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No emails yet. Try{" "}
            <Link href="/compose" className="text-leo-600">
              composing one with AI
            </Link>
            .
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SyncRepliesButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <button
      className="btn-secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        setMsg(null);
        try {
          const res = await api.post<{ scanned: number; replies: number }>(
            "/api/email/sync",
            {},
          );
          setMsg(`${res.replies} new ${res.replies === 1 ? "reply" : "replies"}`);
          if (res.replies > 0) setTimeout(() => location.reload(), 600);
        } catch (e) {
          setMsg((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Syncing…" : msg ?? "Sync replies"}
    </button>
  );
}

function fmtUSD(n: number) {
  if (n >= 1000)
    return `$${Math.round(n / 1000).toLocaleString()}k`;
  return `$${n.toLocaleString()}`;
}

function Stat({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold">
        {loading ? "—" : value}
      </div>
    </div>
  );
}
