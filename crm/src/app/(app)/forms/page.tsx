"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import { useUI } from "@/components/ui/UIProvider";
import type { Activity, FormDef, Sequence } from "@/lib/types";

const ALL_FIELDS = [
  "name",
  "email",
  "company",
  "role",
  "phone",
  "linkedin",
  "notes",
];

export default function FormsPage() {
  const [forms, setForms] = useState<FormDef[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const ui = useUI();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    fields: ["name", "email"] as string[],
    redirectUrl: "",
    tags: "form",
    sequenceId: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [f, s, a] = await Promise.all([
      api.get<FormDef[]>("/api/forms"),
      api.get<Sequence[]>("/api/sequences"),
      api.get<Activity[]>("/api/activity"),
    ]);
    setForms(f);
    setSequences(s);
    setActivity(a);
  }
  const submissionCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of activity) {
      if (a.type !== "form_submission") continue;
      try {
        const meta = a.meta ? (JSON.parse(a.meta) as { slug?: string }) : {};
        if (!meta.slug) continue;
        m.set(meta.slug, (m.get(meta.slug) ?? 0) + 1);
      } catch {
        // ignore
      }
    }
    return m;
  }, [activity]);
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!form.name || !form.slug) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/forms", form);
      setShowAdd(false);
      setForm({
        name: "",
        slug: "",
        fields: ["name", "email"],
        redirectUrl: "",
        tags: "form",
        sequenceId: "",
      });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleField(f: string) {
    setForm((s) => ({
      ...s,
      fields: s.fields.includes(f)
        ? s.fields.filter((x) => x !== f)
        : [...s.fields, f],
    }));
  }

  return (
    <div>
      <PageHeader
        title="Public forms"
        description="Capture leads from anywhere — embed or share the public URL."
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            New form
          </button>
        }
      />

      <div className="grid gap-3 md:grid-cols-2">
        {forms.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            No forms yet.
          </div>
        ) : (
          forms.map((f) => {
            const url =
              typeof window !== "undefined"
                ? `${window.location.origin}/f/${f.slug}`
                : `/f/${f.slug}`;
            return (
              <div key={f.id} className="card">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{f.name}</h3>
                  <a
                    href={`/f/${f.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-leo-600 hover:underline"
                  >
                    Open ↗
                  </a>
                </div>
                <p className="mt-1 text-xs text-slate-500">/f/{f.slug}</p>
                <div className="mt-2 break-all rounded-lg bg-slate-50 p-2 font-mono text-xs dark:bg-slate-800">
                  {url}
                </div>
                <button
                  onClick={() => navigator.clipboard?.writeText(url)}
                  className="mt-2 text-xs text-leo-600 hover:underline"
                >
                  Copy link
                </button>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="badge bg-emerald-100 text-emerald-700">
                    {submissionCount.get(f.slug) ?? 0} submission
                    {(submissionCount.get(f.slug) ?? 0) === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() => {
                      const code = `<iframe src="${url}" width="480" height="600" frameborder="0"></iframe>`;
                      navigator.clipboard?.writeText(code);
                      ui.toast("Embed snippet copied", { kind: "success" });
                    }}
                    className="text-leo-600 hover:underline"
                  >
                    Copy embed
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Fields: {(() => {
                    try {
                      return (JSON.parse(f.fields) as string[]).join(", ");
                    } catch {
                      return f.fields;
                    }
                  })()}
                </p>
                {f.sequenceId ? (
                  <p className="mt-1 text-xs text-slate-400">
                    Auto-enrolls in:{" "}
                    {sequences.find((s) => s.id === f.sequenceId)?.name ??
                      f.sequenceId}
                  </p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="card mt-6 text-sm text-slate-500">
        <p className="font-semibold text-slate-700 dark:text-slate-200">
          Public forms need owner credentials configured.
        </p>
        <p className="mt-2">
          Public submissions are unauthenticated, so the server uses your
          stored OAuth refresh token to write into your spreadsheet. Set these
          three env vars in your deployment (see /settings for the values
          after first login):
        </p>
        <ul className="mt-2 list-inside list-disc font-mono text-xs">
          <li>LEOCRM_OWNER_REFRESH_TOKEN</li>
          <li>LEOCRM_OWNER_EMAIL</li>
          <li>LEOCRM_SPREADSHEET_ID</li>
        </ul>
      </div>

      {showAdd ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6">
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 dark:bg-slate-900 md:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">New form</h2>
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
                <span className="label">URL slug</span>
                <input
                  className="input"
                  placeholder="contact-us"
                  value={form.slug}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      slug: e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "-"),
                    })
                  }
                />
              </label>
              <div>
                <span className="label">Fields</span>
                <div className="flex flex-wrap gap-2">
                  {ALL_FIELDS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => toggleField(f)}
                      className={`rounded-full px-3 py-1 text-xs ${
                        form.fields.includes(f)
                          ? "bg-leo-600 text-white"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <label className="block">
                <span className="label">Tags applied to created contacts</span>
                <input
                  className="input"
                  value={form.tags}
                  onChange={(e) =>
                    setForm({ ...form, tags: e.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="label">Auto-enroll in sequence (optional)</span>
                <select
                  className="input"
                  value={form.sequenceId}
                  onChange={(e) =>
                    setForm({ ...form, sequenceId: e.target.value })
                  }
                >
                  <option value="">— None —</option>
                  {sequences.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="label">Redirect URL after submit (optional)</span>
                <input
                  className="input"
                  placeholder="https://example.com/thanks"
                  value={form.redirectUrl}
                  onChange={(e) =>
                    setForm({ ...form, redirectUrl: e.target.value })
                  }
                />
              </label>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={busy || !form.name || !form.slug}
                  className="btn-primary"
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
