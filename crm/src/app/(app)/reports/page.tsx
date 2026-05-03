"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type {
  Campaign,
  Deal,
  EmailEvent,
  EmailRecord,
  Lead,
} from "@/lib/types";
import { LEAD_STAGES } from "@/lib/types";

export default function ReportsPage() {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [events, setEvents] = useState<EmailEvent[]>([]);

  useEffect(() => {
    (async () => {
      const [e, l, c, d, ev] = await Promise.all([
        api.get<EmailRecord[]>("/api/emails"),
        api.get<Lead[]>("/api/leads"),
        api.get<Campaign[]>("/api/campaigns"),
        api.get<Deal[]>("/api/deals").catch(() => [] as Deal[]),
        api.get<EmailEvent[]>("/api/email-events").catch(
          () => [] as EmailEvent[],
        ),
      ]);
      setEmails(e);
      setLeads(l);
      setCampaigns(c);
      setDeals(d);
      setEvents(ev);
    })();
  }, []);

  const sent = useMemo(
    () => emails.filter((e) => e.status === "sent"),
    [emails],
  );
  const replied = useMemo(
    () => sent.filter((e) => e.repliedAt),
    [sent],
  );
  const ai = sent.filter((e) => e.aiGenerated === "yes");
  const aiReplied = ai.filter((e) => e.repliedAt);
  const nonAi = sent.filter((e) => e.aiGenerated !== "yes");
  const nonAiReplied = nonAi.filter((e) => e.repliedAt);

  // Funnel: count leads in each stage
  const funnel = LEAD_STAGES.map((stage) => ({
    stage,
    count: leads.filter((l) => l.stage === stage).length,
  }));
  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);

  // Day-of-week heatmap of sends
  const dow = [0, 0, 0, 0, 0, 0, 0];
  const dowReplies = [0, 0, 0, 0, 0, 0, 0];
  for (const e of sent) {
    if (!e.sentAt) continue;
    const d = new Date(e.sentAt).getDay();
    dow[d]++;
    if (e.repliedAt) dowReplies[d]++;
  }
  const dowMax = Math.max(...dow, 1);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // A/B subject win rate
  const variantA = sent.filter((e) => e.variant === "A");
  const variantB = sent.filter((e) => e.variant === "B");
  const aRate = rate(variantA.length, variantA.filter((e) => e.repliedAt).length);
  const bRate = rate(variantB.length, variantB.filter((e) => e.repliedAt).length);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Conversion funnel, AI vs non-AI reply rates, and send timing."
      />

      {(() => {
        const opens = events.filter((e) => e.type === "open");
        const clicks = events.filter((e) => e.type === "click");
        const sentIds = new Set(sent.map((s) => s.id));
        const openedEmails = new Set(
          opens.filter((e) => sentIds.has(e.emailId)).map((e) => e.emailId),
        );
        const clickedEmails = new Set(
          clicks.filter((e) => sentIds.has(e.emailId)).map((e) => e.emailId),
        );
        const openRate = sent.length
          ? Math.round((openedEmails.size / sent.length) * 100)
          : 0;
        const ctr = openedEmails.size
          ? Math.round((clickedEmails.size / openedEmails.size) * 100)
          : 0;
        return (
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="card">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Open rate
              </div>
              <div className="mt-1 text-2xl font-semibold">{openRate}%</div>
              <div className="text-xs text-slate-400">
                {openedEmails.size} / {sent.length} unique opens
              </div>
            </div>
            <div className="card">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Click-through (of opens)
              </div>
              <div className="mt-1 text-2xl font-semibold">{ctr}%</div>
              <div className="text-xs text-slate-400">
                {clickedEmails.size} clicks
              </div>
            </div>
            <div className="card">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Total events
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {events.length}
              </div>
              <div className="text-xs text-slate-400">
                {opens.length} opens · {clicks.length} clicks
              </div>
            </div>
          </div>
        );
      })()}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Sent" value={sent.length} />
        <Stat label="Replies" value={replied.length} />
        <Stat
          label="Reply rate"
          value={`${rate(sent.length, replied.length)}%`}
        />
        <Stat
          label="Avg time-to-reply"
          value={(() => {
            const diffs = replied
              .map((e) => {
                if (!e.sentAt || !e.repliedAt) return null;
                return (
                  new Date(e.repliedAt).getTime() -
                  new Date(e.sentAt).getTime()
                );
              })
              .filter((n): n is number => typeof n === "number" && n > 0);
            if (diffs.length === 0) return "—";
            const avg = diffs.reduce((s, n) => s + n, 0) / diffs.length;
            const hours = avg / 3600000;
            return hours < 24
              ? `${hours.toFixed(1)}h`
              : `${(hours / 24).toFixed(1)}d`;
          })()}
        />
        <Stat
          label="AI-generated"
          value={`${ai.length} (${
            ai.length ? Math.round((ai.length / sent.length) * 100) : 0
          }%)`}
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Pipeline forecast
      </h2>
      {(() => {
        // Stage probabilities (loose industry defaults).
        const PROB: Record<string, number> = {
          new: 0.05,
          contacted: 0.15,
          engaged: 0.3,
          qualified: 0.5,
          won: 1,
          lost: 0,
        };
        const byStage = new Map<string, { value: number; weighted: number; count: number }>();
        for (const l of leads) {
          const v = Number(l.value || 0);
          const p = PROB[l.stage] ?? 0;
          const cur = byStage.get(l.stage) ?? { value: 0, weighted: 0, count: 0 };
          cur.value += v;
          cur.weighted += v * p;
          cur.count += 1;
          byStage.set(l.stage, cur);
        }
        const stages = LEAD_STAGES.filter((s) => s !== "won" && s !== "lost");
        const totalWeighted = stages.reduce(
          (sum, s) => sum + (byStage.get(s)?.weighted ?? 0),
          0,
        );
        const totalRaw = stages.reduce(
          (sum, s) => sum + (byStage.get(s)?.value ?? 0),
          0,
        );
        return (
          <div className="card">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Open pipeline ($) · weighted by typical close probability
              </span>
              <span className="font-semibold">
                ${Math.round(totalWeighted / 1000).toLocaleString()}k weighted
                <span className="ml-2 text-slate-400">
                  / ${Math.round(totalRaw / 1000).toLocaleString()}k raw
                </span>
              </span>
            </div>
            <div className="space-y-2">
              {stages.map((s) => {
                const b = byStage.get(s) ?? {
                  value: 0,
                  weighted: 0,
                  count: 0,
                };
                const pct =
                  totalRaw === 0 ? 0 : (b.value / totalRaw) * 100;
                return (
                  <div key={s} className="flex items-center gap-3 text-sm">
                    <div className="w-20 text-xs uppercase tracking-wide text-slate-500">
                      {s}
                    </div>
                    <div className="h-5 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded bg-leo-500"
                        style={{
                          width: `${pct}%`,
                          opacity: 0.4 + (PROB[s] ?? 0) * 0.6,
                        }}
                      />
                    </div>
                    <div className="w-32 text-right text-xs text-slate-500">
                      ${Math.round(b.value / 1000).toLocaleString()}k ·{" "}
                      <span className="text-leo-600">
                        ${Math.round(b.weighted / 1000).toLocaleString()}k
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Probabilities: new 5% · contacted 15% · engaged 30% · qualified 50%
            </p>
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Pipeline funnel
      </h2>
      <div className="card space-y-2">
        {funnel.map((f) => (
          <div key={f.stage} className="flex items-center gap-3">
            <div className="w-20 text-xs uppercase tracking-wide text-slate-500">
              {f.stage}
            </div>
            <div className="h-6 flex-1 rounded bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded bg-leo-500"
                style={{ width: `${(f.count / funnelMax) * 100}%` }}
              />
            </div>
            <div className="w-10 text-right text-sm font-medium">
              {f.count}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        AI vs non-AI reply rate
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            AI-generated
          </div>
          <div className="mt-1 text-3xl font-semibold">
            {rate(ai.length, aiReplied.length)}%
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {aiReplied.length} replies / {ai.length} sent
          </div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Non-AI
          </div>
          <div className="mt-1 text-3xl font-semibold">
            {rate(nonAi.length, nonAiReplied.length)}%
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {nonAiReplied.length} replies / {nonAi.length} sent
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        A/B subject test
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Variant A
          </div>
          <div className="mt-1 text-3xl font-semibold">{aRate}%</div>
          <div className="text-xs text-slate-400">
            {variantA.length} sent
          </div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Variant B
          </div>
          <div className="mt-1 text-3xl font-semibold">{bRate}%</div>
          <div className="text-xs text-slate-400">
            {variantB.length} sent
          </div>
        </div>
      </div>
      {variantA.length === 0 && variantB.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">
          No A/B tests yet — toggle &quot;A/B test subject lines&quot; in
          Compose.
        </p>
      ) : null}

      {(() => {
        const dowReplyRate = days.map((label, i) => ({
          label,
          rate: dow[i] ? Math.round((dowReplies[i] / dow[i]) * 100) : 0,
          sent: dow[i],
        }));
        const ranked = dowReplyRate
          .filter((d) => d.sent >= 1)
          .sort((a, b) => b.rate - a.rate);
        const best = ranked[0];
        if (!best) return null;
        return (
          <div className="card mt-4 flex items-center gap-3 border-leo-200 bg-leo-50 text-sm dark:border-leo-900 dark:bg-leo-900/30">
            <span className="badge bg-leo-600 text-white">Insight</span>
            <span>
              <span className="font-semibold">{best.label}</span> has your
              highest reply rate ({best.rate}% across {best.sent} sends). Try
              concentrating outreach there.
            </span>
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Sends by day of week
      </h2>
      <div className="card">
        <div className="grid grid-cols-7 gap-2">
          {days.map((label, i) => (
            <div key={label} className="text-center">
              <div className="text-xs text-slate-500">{label}</div>
              <div
                className="mx-auto mt-2 rounded bg-leo-500"
                style={{
                  height: `${Math.max(8, (dow[i] / dowMax) * 80)}px`,
                  width: "100%",
                  opacity: dow[i] === 0 ? 0.15 : 0.4 + (dow[i] / dowMax) * 0.6,
                }}
                title={`${dow[i]} sends, ${dowReplies[i]} replies`}
              />
              <div className="mt-1 text-xs">{dow[i]}</div>
              <div className="text-[10px] text-slate-400">
                ↩ {dowReplies[i]}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Forecast by month (deals)
      </h2>
      {(() => {
        if (deals.length === 0)
          return (
            <div className="card text-sm text-slate-500">
              No deals yet — head to Deals to add some.
            </div>
          );
        const buckets = new Map<
          string,
          { weighted: number; raw: number; count: number; won: number }
        >();
        for (const d of deals) {
          if (!d.expectedCloseDate || d.stage === "lost") continue;
          const month = d.expectedCloseDate.slice(0, 7);
          const cur = buckets.get(month) ?? {
            weighted: 0,
            raw: 0,
            count: 0,
            won: 0,
          };
          cur.raw += Number(d.value || 0);
          cur.weighted += Number(d.value || 0) * Number(d.probability || 0);
          cur.count++;
          if (d.stage === "won") cur.won += Number(d.value || 0);
          buckets.set(month, cur);
        }
        const months = Array.from(buckets.keys()).sort();
        const max = Math.max(1, ...months.map((m) => buckets.get(m)!.raw));
        return (
          <div className="card space-y-2">
            {months.map((m) => {
              const b = buckets.get(m)!;
              return (
                <div key={m} className="flex items-center gap-3 text-sm">
                  <div className="w-20 text-xs text-slate-500">{m}</div>
                  <div className="h-5 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded bg-leo-500"
                      style={{ width: `${(b.raw / max) * 100}%`, opacity: 0.5 }}
                    />
                    <div
                      className="-mt-5 h-5 rounded bg-emerald-500"
                      style={{ width: `${(b.weighted / max) * 100}%` }}
                    />
                  </div>
                  <div className="w-40 text-right text-xs">
                    ${Math.round(b.raw / 1000).toLocaleString()}k raw ·{" "}
                    <span className="text-emerald-600">
                      ${Math.round(b.weighted / 1000).toLocaleString()}k
                    </span>
                  </div>
                </div>
              );
            })}
            <p className="text-[11px] text-slate-400">
              Bar = open pipeline; green = weighted by deal probability.
            </p>
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Stale-deal SLA alerts
      </h2>
      {(() => {
        const stale = deals.filter(
          (d) =>
            d.stage !== "won" &&
            d.stage !== "lost" &&
            d.stageEnteredAt &&
            Date.now() - new Date(d.stageEnteredAt).getTime() >
              14 * 24 * 3600 * 1000,
        );
        if (stale.length === 0)
          return (
            <div className="card text-sm text-emerald-700 dark:text-emerald-300">
              All deals moved within the last 14 days. ✓
            </div>
          );
        return (
          <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
            {stale.map((d) => {
              const days = Math.round(
                (Date.now() - new Date(d.stageEnteredAt).getTime()) /
                  (24 * 3600 * 1000),
              );
              return (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-3 text-sm"
                >
                  <span className="badge bg-rose-100 text-rose-700">
                    {days}d in {d.stage}
                  </span>
                  <a
                    href={`/deals/${d.id}`}
                    className="font-medium hover:text-leo-600"
                  >
                    {d.name}
                  </a>
                  <span className="ml-auto text-xs text-slate-500">
                    ${Number(d.value || 0).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Lead source ROI
      </h2>
      {(() => {
        const bySource = new Map<
          string,
          { leads: number; contacted: number; engaged: number; won: number; pipeline: number }
        >();
        for (const l of leads) {
          const s = l.source || "(none)";
          const cur =
            bySource.get(s) ?? {
              leads: 0,
              contacted: 0,
              engaged: 0,
              won: 0,
              pipeline: 0,
            };
          cur.leads += 1;
          if (l.stage === "contacted") cur.contacted += 1;
          if (l.stage === "engaged" || l.stage === "qualified") cur.engaged += 1;
          if (l.stage === "won") cur.won += 1;
          if (l.stage !== "lost") cur.pipeline += Number(l.value || 0);
          bySource.set(s, cur);
        }
        const rows = Array.from(bySource.entries()).sort(
          (a, b) => b[1].leads - a[1].leads,
        );
        if (rows.length === 0) return null;
        return (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="p-2 text-left">Source</th>
                  <th className="p-2 text-right">Leads</th>
                  <th className="p-2 text-right">Engaged+</th>
                  <th className="p-2 text-right">Won</th>
                  <th className="p-2 text-right">Conv. %</th>
                  <th className="p-2 text-right">Pipeline $</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([source, s]) => (
                  <tr
                    key={source}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="p-2 font-medium">{source}</td>
                    <td className="p-2 text-right">{s.leads}</td>
                    <td className="p-2 text-right">{s.engaged}</td>
                    <td className="p-2 text-right">{s.won}</td>
                    <td className="p-2 text-right">
                      {s.leads
                        ? Math.round(
                            ((s.engaged + s.won) / s.leads) * 100,
                          )
                        : 0}
                      %
                    </td>
                    <td className="p-2 text-right">
                      ${Math.round(s.pipeline / 1000).toLocaleString()}k
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Activity heatmap (last 60 days)
      </h2>
      {(() => {
        const days = 60;
        const counts = new Map<string, number>();
        for (const e of sent) {
          const d = (e.sentAt || "").slice(0, 10);
          if (!d) continue;
          counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        const cells: { date: string; count: number }[] = [];
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const k = d.toISOString().slice(0, 10);
          cells.push({ date: k, count: counts.get(k) ?? 0 });
        }
        const max = Math.max(1, ...cells.map((c) => c.count));
        return (
          <div className="card">
            <div className="grid grid-cols-[repeat(60,minmax(0,1fr))] gap-[2px]">
              {cells.map((c) => {
                const intensity = c.count === 0 ? 0 : 0.2 + (c.count / max) * 0.8;
                return (
                  <div
                    key={c.date}
                    title={`${c.date}: ${c.count} sent`}
                    className="aspect-square rounded-sm bg-leo-500"
                    style={{ opacity: c.count === 0 ? 0.08 : intensity }}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              Each square is a day. Brighter = more sent.
            </p>
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Sales velocity
      </h2>
      {(() => {
        const won = deals.filter((d) => d.stage === "won" && d.closedAt);
        if (won.length === 0)
          return (
            <div className="card text-sm text-slate-500">
              No won deals to compute velocity.
            </div>
          );
        const days = won.map(
          (d) =>
            (new Date(d.closedAt).getTime() -
              new Date(d.createdAt).getTime()) /
            (24 * 3600 * 1000),
        );
        const avg = days.reduce((s, n) => s + n, 0) / days.length;
        const median = days.slice().sort((a, b) => a - b)[
          Math.floor(days.length / 2)
        ];
        return (
          <div className="card grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Avg days to close</div>
              <div className="text-xl font-semibold">{avg.toFixed(1)}d</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Median days</div>
              <div className="text-xl font-semibold">{median.toFixed(0)}d</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Won deals</div>
              <div className="text-xl font-semibold">{won.length}</div>
            </div>
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Reply-time decay
      </h2>
      {(() => {
        const buckets = [
          { lt: 1, label: "<1h" },
          { lt: 4, label: "<4h" },
          { lt: 24, label: "<24h" },
          { lt: 72, label: "<3d" },
          { lt: Infinity, label: "3d+" },
        ];
        const counts = buckets.map(() => 0);
        for (const e of replied) {
          if (!e.sentAt || !e.repliedAt) continue;
          const hours =
            (new Date(e.repliedAt).getTime() -
              new Date(e.sentAt).getTime()) /
            3600000;
          for (let i = 0; i < buckets.length; i++) {
            if (hours < buckets[i].lt) {
              counts[i]++;
              break;
            }
          }
        }
        const max = Math.max(1, ...counts);
        return (
          <div className="card space-y-1">
            {buckets.map((b, i) => (
              <div key={b.label} className="flex items-center gap-3 text-sm">
                <div className="w-12 text-xs text-slate-500">{b.label}</div>
                <div className="h-4 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded bg-leo-500"
                    style={{ width: `${(counts[i] / max) * 100}%` }}
                  />
                </div>
                <div className="w-10 text-right text-xs">{counts[i]}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Lost-reason breakdown
      </h2>
      {(() => {
        const lost = deals.filter((d) => d.stage === "lost" && d.lostReason);
        if (lost.length === 0)
          return (
            <div className="card text-sm text-slate-500">
              No lost deals with reasons recorded.
            </div>
          );
        const counts = new Map<string, number>();
        for (const d of lost) {
          const key = d.lostReason.split(" ").slice(0, 4).join(" ") || "(blank)";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const total = lost.length;
        return (
          <div className="card space-y-1 text-sm">
            {Array.from(counts.entries()).map(([k, n]) => (
              <div key={k} className="flex items-center gap-3">
                <div className="w-48 truncate text-xs text-slate-500">
                  {k}
                </div>
                <div className="h-4 flex-1 rounded bg-slate-100 dark:bg-slate-800">
                  <div
                    className="h-full rounded bg-rose-500"
                    style={{ width: `${(n / total) * 100}%` }}
                  />
                </div>
                <div className="w-8 text-right text-xs">{n}</div>
              </div>
            ))}
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Rep leaderboard
      </h2>
      {(() => {
        const by = new Map<
          string,
          { sent: number; replied: number; won: number; wonValue: number }
        >();
        for (const e of sent) {
          const k = "you@yourco.example";
          const cur = by.get(k) ?? {
            sent: 0,
            replied: 0,
            won: 0,
            wonValue: 0,
          };
          cur.sent++;
          if (e.repliedAt) cur.replied++;
          by.set(k, cur);
        }
        for (const d of deals) {
          const k = d.owner || "—";
          const cur = by.get(k) ?? {
            sent: 0,
            replied: 0,
            won: 0,
            wonValue: 0,
          };
          if (d.stage === "won") {
            cur.won++;
            cur.wonValue += Number(d.value || 0);
          }
          by.set(k, cur);
        }
        const rows = Array.from(by.entries()).sort(
          (a, b) => b[1].wonValue - a[1].wonValue,
        );
        return (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
                <tr>
                  <th className="p-2 text-left">Member</th>
                  <th className="p-2 text-right">Sent</th>
                  <th className="p-2 text-right">Replies</th>
                  <th className="p-2 text-right">Reply %</th>
                  <th className="p-2 text-right">Won deals</th>
                  <th className="p-2 text-right">$ won</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([k, s]) => (
                  <tr
                    key={k}
                    className="border-t border-slate-100 dark:border-slate-800"
                  >
                    <td className="p-2 font-medium">{k}</td>
                    <td className="p-2 text-right">{s.sent}</td>
                    <td className="p-2 text-right">{s.replied}</td>
                    <td className="p-2 text-right">
                      {s.sent
                        ? Math.round((s.replied / s.sent) * 100)
                        : 0}
                      %
                    </td>
                    <td className="p-2 text-right">{s.won}</td>
                    <td className="p-2 text-right">
                      ${Math.round(s.wonValue / 1000).toLocaleString()}k
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
        Best hour-of-day
      </h2>
      {(() => {
        const sentByHour = new Array(24).fill(0);
        const replyByHour = new Array(24).fill(0);
        for (const e of sent) {
          if (!e.sentAt) continue;
          const h = new Date(e.sentAt).getHours();
          sentByHour[h]++;
          if (e.repliedAt) replyByHour[h]++;
        }
        const max = Math.max(1, ...sentByHour);
        return (
          <div className="card">
            <div className="grid grid-cols-12 gap-1 text-[10px]">
              {sentByHour.map((n, h) => (
                <div key={h} className="text-center">
                  <div className="text-slate-400">{h}</div>
                  <div
                    className="mx-auto mt-1 rounded bg-leo-500"
                    style={{
                      height: `${Math.max(4, (n / max) * 60)}px`,
                      opacity: n === 0 ? 0.1 : 0.4 + (n / max) * 0.6,
                    }}
                    title={`${h}:00 — ${n} sends, ${replyByHour[h]} replies`}
                  />
                  <div className="mt-1 text-emerald-600">
                    {replyByHour[h] || ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {campaigns.length > 0 ? (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold text-slate-500">
            By campaign
          </h2>
          <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="grid grid-cols-4 items-center gap-2 p-3 text-sm"
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-slate-500">Sent: {c.sentCount}</div>
                <div className="text-slate-500">Replied: {c.repliedCount}</div>
                <div className="text-slate-500">
                  {rate(Number(c.sentCount), Number(c.repliedCount))}%
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function rate(total: number, hits: number) {
  if (!total) return 0;
  return Math.round((hits / total) * 100);
}
