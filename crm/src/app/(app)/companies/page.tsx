"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { api } from "@/lib/client";
import type { Contact } from "@/lib/types";

interface CompanyRow {
  id: string;
  name: string;
  domain: string;
  industry: string;
  size: string;
  website: string;
  notes: string;
  contactCount: number;
}

export default function CompaniesPage() {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");

  async function load() {
    const [r, c] = await Promise.all([
      api.get<CompanyRow[]>("/api/companies"),
      api.get<Contact[]>("/api/contacts"),
    ]);
    setRows(r);
    setContacts(c);
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.domain.toLowerCase().includes(q) ||
        r.industry.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Auto-grouped from your contacts by company name."
      />
      <input
        className="input mb-3"
        placeholder="Search companies…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => {
          const companyContacts = contacts.filter(
            (c) =>
              c.company.toLowerCase() === r.name.toLowerCase(),
          );
          return (
            <div key={r.name} className="card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">
                    {r.name}
                  </h3>
                  <p className="truncate text-xs text-slate-500">
                    {r.domain || "—"}
                  </p>
                </div>
                <span className="badge bg-leo-100 text-leo-700">
                  {r.contactCount}
                </span>
              </div>
              {(r.industry || r.size) && (
                <p className="mt-1 text-xs text-slate-500">
                  {[r.industry, r.size].filter(Boolean).join(" · ")}
                </p>
              )}
              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
                {companyContacts.slice(0, 4).map((c) => (
                  <Link
                    key={c.id}
                    href={`/contacts/${c.id}`}
                    className="block truncate text-slate-600 hover:text-leo-600 dark:text-slate-300"
                  >
                    {c.name || c.email}
                    {c.role ? ` · ${c.role}` : ""}
                  </Link>
                ))}
                {companyContacts.length > 4 ? (
                  <p className="text-xs text-slate-400">
                    +{companyContacts.length - 4} more
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <div className="card text-center text-sm text-slate-500">
            No companies yet — add contacts with a company field.
          </div>
        ) : null}
      </div>
    </div>
  );
}
