"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import { useUI } from "@/components/ui/UIProvider";
import type { Automation, AutomationTrigger } from "@/lib/types";

const TRIGGERS: { key: AutomationTrigger; label: string }[] = [
  { key: "lead_stage_changed", label: "Lead stage changed" },
  { key: "deal_stage_changed", label: "Deal stage changed" },
  { key: "form_submitted", label: "Form submitted" },
  { key: "email_replied", label: "Email replied" },
  { key: "score_threshold", label: "AI score crosses threshold" },
];

const ACTIONS = [
  { key: "create_task", label: "Create task" },
  { key: "enroll_sequence", label: "Enroll in sequence" },
  { key: "webhook", label: "POST to webhook" },
  { key: "bump_score", label: "Bump AI score" },
];

export default function AutomationsPage() {
  const ui = useUI();
  const [rows, setRows] = useState<Automation[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    trigger: "lead_stage_changed" as AutomationTrigger,
    action: "create_task",
    condition: "{}",
    config: "{}",
  });

  async function load() {
    setRows(await api.get<Automation[]>("/api/automations"));
  }
  useEffect(() => {
    load();
  }, []);

  async function toggle(a: Automation) {
    // Best-effort: requires PATCH route which we haven't built yet, so
    // re-create on toggle.
    await api.post("/api/automations", {
      ...a,
      active: a.active === "yes" ? "no" : "yes",
    });
    ui.toast(a.active === "yes" ? "Disabled" : "Enabled");
    await load();
  }

  async function submit() {
    if (!form.name) return;
    await api.post("/api/automations", form);
    setShowAdd(false);
    setForm({
      name: "",
      trigger: "lead_stage_changed",
      action: "create_task",
      condition: "{}",
      config: "{}",
    });
    ui.toast("Automation created", { kind: "success" });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Automations"
        description="When X happens, do Y. Triggers fire on stage changes, form submissions, replies, and AI score thresholds."
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            New automation
          </button>
        }
      />

      <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No automations yet.
          </div>
        ) : (
          rows.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-3">
              <button
                onClick={() => toggle(a)}
                className={`mt-1 h-5 w-9 rounded-full transition ${
                  a.active === "yes" ? "bg-leo-600" : "bg-slate-300"
                }`}
                aria-label="Toggle automation"
              >
                <span
                  className={`block h-4 w-4 translate-y-0.5 rounded-full bg-white transition ${
                    a.active === "yes" ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{a.name}</div>
                <div className="mt-1 text-xs text-slate-500">
                  When{" "}
                  <span className="font-mono">
                    {TRIGGERS.find((t) => t.key === a.trigger)?.label ??
                      a.trigger}
                  </span>{" "}
                  → do{" "}
                  <span className="font-mono">
                    {ACTIONS.find((x) => x.key === a.action)?.label ??
                      a.action}
                  </span>
                </div>
                {a.condition && a.condition !== "{}" ? (
                  <div className="mt-1 text-[11px] font-mono text-slate-400">
                    if {a.condition}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>

      {showAdd ? (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-6"
          onClick={() => setShowAdd(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 dark:bg-slate-900 md:rounded-2xl"
          >
            <h2 className="mb-3 text-lg font-semibold">New automation</h2>
            <div className="space-y-2">
              <input
                className="input"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <select
                className="input"
                value={form.trigger}
                onChange={(e) =>
                  setForm({
                    ...form,
                    trigger: e.target.value as AutomationTrigger,
                  })
                }
              >
                {TRIGGERS.map((t) => (
                  <option key={t.key} value={t.key}>
                    {t.label}
                  </option>
                ))}
              </select>
              <select
                className="input"
                value={form.action}
                onChange={(e) => setForm({ ...form, action: e.target.value })}
              >
                {ACTIONS.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
              <input
                className="input font-mono text-xs"
                placeholder='Condition JSON, e.g. {"min":80}'
                value={form.condition}
                onChange={(e) =>
                  setForm({ ...form, condition: e.target.value })
                }
              />
              <input
                className="input font-mono text-xs"
                placeholder='Config JSON, e.g. {"sequenceId":"seq_demo_001"}'
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button onClick={submit} className="btn-primary">
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
