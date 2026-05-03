"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function QuickAdd() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    company: "",
    role: "",
  });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Avoid hijacking when an input is focused.
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (!inField && e.key.toLowerCase() === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submit() {
    if (!form.email) return;
    setBusy(true);
    try {
      const created = await api.post<{ id: string }>("/api/contacts", form);
      await api.post("/api/leads", {
        contactId: created.id,
        source: "quick-add",
        stage: "new",
      });
      setOpen(false);
      setForm({ name: "", email: "", company: "", role: "" });
      router.push(`/contacts/${created.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:border-leo-300 hover:text-leo-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 sm:flex"
        title="Quick-add contact (n)"
      >
        + New
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-slate-900 md:rounded-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Quick-add contact</h2>
              <span className="text-[11px] text-slate-400">press n</span>
            </div>
            <div className="space-y-2">
              <input
                autoFocus
                className="input"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <input
                className="input"
                type="email"
                placeholder="email@example.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="input"
                  placeholder="Company"
                  value={form.company}
                  onChange={(e) =>
                    setForm({ ...form, company: e.target.value })
                  }
                />
                <input
                  className="input"
                  placeholder="Role"
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setOpen(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={busy || !form.email}
                  className="btn-primary"
                >
                  {busy ? "Saving…" : "Add + open"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
