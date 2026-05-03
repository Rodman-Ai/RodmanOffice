"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface PublicForm {
  name: string;
  slug: string;
  fields: string[];
  redirectUrl?: string;
}

const LABELS: Record<string, string> = {
  name: "Your name",
  email: "Email",
  company: "Company",
  role: "Role",
  phone: "Phone",
  linkedin: "LinkedIn URL",
  notes: "Anything else?",
};

export default function PublicFormPage() {
  const params = useParams<{ slug: string }>();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/forms/public?slug=${encodeURIComponent(params.slug)}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json()) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<PublicForm>;
      })
      .then(setForm)
      .catch((e) => setError((e as Error).message));
  }, [params.slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: params.slug, values }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        redirectUrl?: string;
      };
      if (!res.ok || !j.ok) {
        throw new Error(j.error ?? "Failed");
      }
      if (j.redirectUrl) {
        window.location.href = j.redirectUrl;
        return;
      }
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-leo-50 via-white to-leo-100 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-leo-900/40">
      <div className="card w-full max-w-md">
        {error ? (
          <div className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {done ? (
          <div className="text-center">
            <h1 className="text-xl font-semibold">Thanks!</h1>
            <p className="mt-2 text-sm text-slate-500">
              Your submission was received.
            </p>
          </div>
        ) : !form ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <h1 className="text-xl font-semibold">{form.name}</h1>
            {form.fields.map((f) => (
              <label key={f} className="block">
                <span className="label">
                  {LABELS[f] ?? f}
                  {f === "email" ? " *" : ""}
                </span>
                {f === "notes" ? (
                  <textarea
                    className="input min-h-[80px]"
                    value={values[f] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [f]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    type={f === "email" ? "email" : "text"}
                    required={f === "email"}
                    className="input"
                    value={values[f] ?? ""}
                    onChange={(e) =>
                      setValues({ ...values, [f]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
            <button
              type="submit"
              disabled={busy}
              className="btn-primary w-full"
            >
              {busy ? "Sending…" : "Submit"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
