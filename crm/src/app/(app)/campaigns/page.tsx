"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { Campaign } from "@/lib/types";

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    goal: "",
    audience: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setCampaigns(await api.get<Campaign[]>("/api/campaigns"));
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/campaigns", form);
      setShowAdd(false);
      setForm({ name: "", goal: "", audience: "" });
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
        title="Campaigns"
        description="Group AI emails by goal and audience to track reply rates."
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            New campaign
          </button>
        }
      />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {campaigns.map((c) => (
          <div key={c.id} className="card">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold">{c.name}</h3>
              <span className="badge bg-leo-100 text-leo-700">{c.status}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{c.goal}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-slate-400">Audience</dt>
                <dd>{c.audience || "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Sent</dt>
                <dd>{c.sentCount}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Replied</dt>
                <dd>{c.repliedCount}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Created</dt>
                <dd>
                  {c.createdAt
                    ? new Date(c.createdAt).toLocaleDateString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        ))}
        {campaigns.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            No campaigns yet.
          </div>
        ) : null}
      </div>

      {showAdd ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 dark:bg-slate-900 md:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New campaign</h2>
              <button
                onClick={() => setShowAdd(false)}
                className="text-sm text-slate-400"
              >
                Close
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="label">Name</span>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="label">Goal</span>
                <textarea
                  className="input min-h-[80px]"
                  value={form.goal}
                  onChange={(e) =>
                    setForm({ ...form, goal: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="label">Audience description</span>
                <input
                  className="input"
                  value={form.audience}
                  onChange={(e) =>
                    setForm({ ...form, audience: e.target.value })
                  }
                />
              </label>
              {error ? (
                <p className="text-sm text-red-600">{error}</p>
              ) : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  disabled={busy || !form.name}
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
