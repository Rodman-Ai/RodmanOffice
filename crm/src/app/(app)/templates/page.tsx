"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { Template } from "@/lib/types";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    body: "",
    aiPrompt: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setTemplates(await api.get<Template[]>("/api/templates"));
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!form.name) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/templates", form);
      setForm({ name: "", subject: "", body: "", aiPrompt: "" });
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
        title="Templates"
        description="Reusable email skeletons. The AI prompt seeds the goal in Compose."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold">New template</h2>
          <label className="block">
            <span className="label">Name</span>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Subject</span>
            <input
              className="input"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Body (use {"{{name}}"} for tokens)</span>
            <textarea
              className="input min-h-[160px] font-mono text-sm"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">AI prompt (used as goal in Compose)</span>
            <textarea
              className="input min-h-[80px]"
              value={form.aiPrompt}
              onChange={(e) =>
                setForm({ ...form, aiPrompt: e.target.value })
              }
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            className="btn-primary w-full"
            disabled={busy || !form.name}
            onClick={save}
          >
            {busy ? "Saving…" : "Save template"}
          </button>
        </div>
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="card text-center text-sm text-slate-500">
              No templates yet.
            </div>
          ) : (
            templates.map((t) => (
              <div key={t.id} className="card">
                <div className="text-base font-semibold">{t.name}</div>
                <div className="text-sm text-slate-500">{t.subject}</div>
                <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">
                  {t.body}
                </pre>
                {t.aiPrompt ? (
                  <p className="mt-2 text-xs text-slate-400">
                    AI prompt: {t.aiPrompt}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
