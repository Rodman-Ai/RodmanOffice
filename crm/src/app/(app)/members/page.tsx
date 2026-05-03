"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import { useUI } from "@/components/ui/UIProvider";
import { avatarClasses, avatarInitials } from "@/lib/ui";
import type { Member, MemberRole } from "@/lib/types";

const ROLES: MemberRole[] = ["admin", "rep", "viewer"];
const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    email: "",
    name: "",
    role: "rep" as MemberRole,
    timezone: "UTC",
  });
  const ui = useUI();

  async function load() {
    setMembers(await api.get<Member[]>("/api/members"));
  }
  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!form.email) return;
    await api.post("/api/members", form);
    setShowAdd(false);
    setForm({ email: "", name: "", role: "rep", timezone: "UTC" });
    ui.toast("Member invited", { kind: "success" });
    await load();
  }

  async function patch(id: string, body: Record<string, string>) {
    await api.patch(`/api/members/${id}`, body);
    await load();
  }

  async function remove(m: Member) {
    const okGo = await ui.confirm(`Remove ${m.name || m.email}?`, {
      danger: true,
      confirmLabel: "Remove",
    });
    if (!okGo) return;
    await api.del(`/api/members/${m.id}`);
    ui.toast("Member removed", { kind: "success" });
    await load();
  }

  return (
    <div>
      <PageHeader
        title="Team members"
        description="Invite teammates, assign leads to them, and gate destructive actions by role."
        actions={
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            Invite member
          </button>
        }
      />

      <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 p-3">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${avatarClasses(m.id)}`}
            >
              {avatarInitials(m.name || m.email)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.name || m.email}
              </div>
              <div className="truncate text-xs text-slate-500">{m.email}</div>
            </div>
            <select
              value={m.role}
              onChange={(e) => patch(m.id, { role: e.target.value })}
              className="input w-auto py-1 text-xs"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={m.timezone}
              onChange={(e) => patch(m.id, { timezone: e.target.value })}
              className="input w-auto py-1 text-xs"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <button
              onClick={() => patch(m.id, { active: m.active === "yes" ? "no" : "yes" })}
              className={`badge ${m.active === "yes" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
            >
              {m.active === "yes" ? "active" : "inactive"}
            </button>
            <button
              onClick={() => remove(m)}
              className="text-xs text-rose-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        {members.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No team members yet.
          </div>
        ) : null}
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
            <h2 className="mb-3 text-lg font-semibold">Invite teammate</h2>
            <div className="space-y-2">
              <input
                className="input"
                placeholder="email@yourco.com"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <input
                className="input"
                placeholder="Display name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as MemberRole })
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  className="input"
                  value={form.timezone}
                  onChange={(e) =>
                    setForm({ ...form, timezone: e.target.value })
                  }
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAdd(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!form.email}
                  className="btn-primary"
                >
                  Invite
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
