"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { Contact, EmailRecord } from "@/lib/types";

export default function InboxPage() {
  const [emails, setEmails] = useState<EmailRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<"all" | "replied" | "open">("all");

  useEffect(() => {
    Promise.all([
      api.get<EmailRecord[]>("/api/emails"),
      api.get<Contact[]>("/api/contacts"),
    ]).then(([e, c]) => {
      setEmails(e);
      setContacts(c);
    });
  }, []);

  const threads = useMemo(() => {
    const map = new Map<string, EmailRecord[]>();
    for (const e of emails) {
      const k = e.threadId || `solo-${e.id}`;
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    return Array.from(map.entries())
      .map(([k, msgs]) => ({
        key: k,
        msgs: msgs
          .slice()
          .sort((a, b) =>
            (a.sentAt || "").localeCompare(b.sentAt || ""),
          ),
      }))
      .sort((a, b) =>
        (b.msgs[b.msgs.length - 1].sentAt || "").localeCompare(
          a.msgs[a.msgs.length - 1].sentAt || "",
        ),
      );
  }, [emails]);

  const filtered = threads.filter((t) => {
    if (filter === "all") return true;
    const replied = t.msgs.some((m) => m.repliedAt);
    if (filter === "replied") return replied;
    if (filter === "open") return !replied;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Inbox"
        description="Email threads grouped by conversation. Click reply to compose into the same thread."
      />
      <div className="mb-3 flex gap-2 text-sm">
        {(["all", "replied", "open"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 ${
              filter === f
                ? "bg-leo-600 text-white"
                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="card divide-y divide-slate-200 p-0 dark:divide-slate-800">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            No threads.
          </div>
        ) : (
          filtered.map((t) => {
            const head = t.msgs[0];
            const last = t.msgs[t.msgs.length - 1];
            const c = contacts.find((c) => c.id === head.contactId);
            const replied = t.msgs.some((m) => m.repliedAt);
            return (
              <div key={t.key} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {head.subject}
                    </p>
                    {replied ? (
                      <span className="badge bg-emerald-100 text-emerald-700">
                        replied
                      </span>
                    ) : null}
                    <span className="text-xs text-slate-400">
                      {t.msgs.length} msg{t.msgs.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {c ? (
                      <Link
                        href={`/contacts/${c.id}`}
                        className="hover:text-leo-600"
                      >
                        {c.name || c.email}
                      </Link>
                    ) : (
                      "Unknown"
                    )}
                    {" · "}
                    {last.sentAt
                      ? new Date(last.sentAt).toLocaleString()
                      : ""}
                  </div>
                </div>
                {c ? (
                  <Link
                    href={`/compose?contactId=${c.id}`}
                    className="btn-secondary py-1 text-xs"
                  >
                    Reply
                  </Link>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
