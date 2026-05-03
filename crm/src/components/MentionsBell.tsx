"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import type { Activity, Contact } from "@/lib/types";

const READ_KEY = "leocrm.mentions.lastRead";

function parseMentions(s: string): string[] {
  const out: string[] = [];
  const re = /@\[([^\]]+)\]/g;
  let m;
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

export function MentionsBell() {
  const [open, setOpen] = useState(false);
  const [acts, setActs] = useState<Activity[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lastRead, setLastRead] = useState("0");

  useEffect(() => {
    setLastRead(window.localStorage.getItem(READ_KEY) ?? "0");
    api
      .get<Activity[]>("/api/activity")
      .then(setActs)
      .catch(() => {});
    api
      .get<Contact[]>("/api/contacts")
      .then(setContacts)
      .catch(() => {});
  }, []);

  const me = "you@yourco.example";
  const myDisplay = "You (Demo)";

  // Find activity rows whose summary or note contains an @[Me] mention.
  const mentions = acts.filter((a) => {
    if (a.type !== "note") return false;
    const targets = parseMentions(a.summary || "");
    return (
      targets.includes(myDisplay) ||
      targets.includes(me) ||
      targets.some((t) => t.toLowerCase() === "you")
    );
  });

  const unreadCount = mentions.filter(
    (a) => (a.createdAt || "") > lastRead,
  ).length;

  function markRead() {
    const ts = new Date().toISOString();
    window.localStorage.setItem(READ_KEY, ts);
    setLastRead(ts);
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!open) markRead();
        }}
        className="relative h-9 w-9 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        aria-label="Mentions"
        title="Mentions"
      >
        🔔
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 mt-1 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700">
            Mentions
          </div>
          {mentions.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              No mentions yet. Use{" "}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                @[Name]
              </code>{" "}
              in any contact's notes.
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {mentions.slice(0, 20).map((a) => {
                const c = contacts.find((c) => c.id === a.contactId);
                return (
                  <li
                    key={a.id}
                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                  >
                    <Link
                      href={c ? `/contacts/${c.id}` : "/"}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <div className="text-sm">{a.summary}</div>
                      <div className="text-[11px] text-slate-400">
                        {c ? `${c.name || c.email} · ` : ""}
                        {a.createdAt
                          ? new Date(a.createdAt).toLocaleString()
                          : ""}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
