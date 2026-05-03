"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/client";
import type { Company, Contact, Lead, Task } from "@/lib/types";

type Hit =
  | { kind: "contact"; href: string; title: string; sub: string }
  | { kind: "company"; href: string; title: string; sub: string }
  | { kind: "task"; href: string; title: string; sub: string }
  | { kind: "page"; href: string; title: string; sub: string };

const PAGES: Hit[] = [
  { kind: "page", href: "/", title: "Dashboard", sub: "" },
  { kind: "page", href: "/contacts", title: "Contacts", sub: "" },
  { kind: "page", href: "/companies", title: "Companies", sub: "" },
  { kind: "page", href: "/leads", title: "Pipeline", sub: "" },
  { kind: "page", href: "/sequences", title: "Sequences", sub: "" },
  { kind: "page", href: "/campaigns", title: "Campaigns", sub: "" },
  { kind: "page", href: "/compose", title: "AI Compose", sub: "" },
  { kind: "page", href: "/tasks", title: "Tasks", sub: "" },
  { kind: "page", href: "/reports", title: "Reports", sub: "" },
  { kind: "page", href: "/templates", title: "Templates", sub: "" },
  { kind: "page", href: "/forms", title: "Public forms", sub: "" },
  { kind: "page", href: "/settings", title: "Settings", sub: "" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [c, co, t, l] = await Promise.all([
        api.get<Contact[]>("/api/contacts"),
        api.get<Company[]>("/api/companies"),
        api.get<Task[]>("/api/tasks"),
        api.get<Lead[]>("/api/leads"),
      ]);
      setContacts(c);
      setCompanies(co);
      setTasks(t);
      setLeads(l);
    })();
  }, [open]);

  const hits: Hit[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const out: Hit[] = [];
    if (!term) return PAGES;
    for (const c of contacts) {
      if (
        [c.name, c.email, c.company, c.role, c.tags]
          .join(" ")
          .toLowerCase()
          .includes(term)
      ) {
        const lead = leads.find((l) => l.contactId === c.id);
        out.push({
          kind: "contact",
          href: `/contacts/${c.id}`,
          title: c.name || c.email,
          sub: [c.role, c.company, lead ? `score ${lead.score}` : ""]
            .filter(Boolean)
            .join(" · "),
        });
      }
    }
    for (const co of companies) {
      const name = (co as unknown as { name: string }).name;
      if (name && name.toLowerCase().includes(term)) {
        out.push({
          kind: "company",
          href: `/companies`,
          title: name,
          sub: "Company",
        });
      }
    }
    for (const t of tasks) {
      if (t.title.toLowerCase().includes(term)) {
        out.push({
          kind: "task",
          href: t.contactId ? `/contacts/${t.contactId}` : "/tasks",
          title: t.title,
          sub: `Task · ${t.status}`,
        });
      }
    }
    const pageHits = PAGES.filter((p) => p.title.toLowerCase().includes(term));
    return [...pageHits, ...out].slice(0, 25);
  }, [q, contacts, companies, tasks, leads]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setOpen(false)}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto mt-[10vh] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
      >
        <input
          autoFocus
          className="w-full border-b border-slate-200 bg-transparent px-4 py-3 text-base outline-none dark:border-slate-700"
          placeholder="Search contacts, companies, tasks, pages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="max-h-[60vh] overflow-y-auto p-1">
          {hits.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              No matches.
            </div>
          ) : (
            hits.map((h, i) => (
              <Link
                key={`${h.kind}-${h.href}-${i}`}
                href={h.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-leo-50 dark:hover:bg-leo-900/30"
              >
                <span className="badge bg-slate-100 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                  {h.kind}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{h.title}</div>
                  <div className="truncate text-xs text-slate-500">{h.sub}</div>
                </div>
              </Link>
            ))
          )}
        </div>
        <div className="border-t border-slate-200 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-700">
          ⌘K to toggle · Esc to close
        </div>
      </div>
    </div>
  );
}
