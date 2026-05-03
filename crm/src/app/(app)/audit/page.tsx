"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { AuditEntry } from "@/lib/types";

export default function AuditPage() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setRows(await api.get<AuditEntry[]>("/api/audit"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every create / update / delete across the workspace, newest first."
      />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="p-2 text-left">When</th>
              <th className="p-2 text-left">Actor</th>
              <th className="p-2 text-left">Action</th>
              <th className="p-2 text-left">Entity</th>
              <th className="p-2 text-left">Diff</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  Nothing logged yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-slate-100 dark:border-slate-800"
                >
                  <td className="p-2 text-xs text-slate-500">
                    {r.createdAt
                      ? new Date(r.createdAt).toLocaleString()
                      : ""}
                  </td>
                  <td className="p-2">{r.actor}</td>
                  <td className="p-2">
                    <span
                      className={`badge ${
                        r.action === "delete"
                          ? "bg-rose-100 text-rose-700"
                          : r.action === "create"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td className="p-2">
                    {r.entity}
                    {r.entityId ? (
                      <span className="ml-1 text-xs text-slate-400">
                        {r.entityId.slice(0, 12)}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-2 text-xs text-slate-500">
                    <code className="break-all">{r.diff || "—"}</code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
