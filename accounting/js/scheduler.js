// Recurring deal-template scheduler. Runs once on app load.
// For every active template, if `lastRunAt` was a full cadence ago (or null),
// materialize a new deal and update lastRunAt.

import { Deals, DealTemplates, uid } from "./store.js";
import { todayISO, addDays } from "./utils.js";

const CADENCE_DAYS = { weekly: 7, monthly: 30, yearly: 365 };

export function runScheduler() {
  const now = Date.now();
  const created = [];
  for (const t of DealTemplates.all()) {
    if (!t.active) continue;
    const cadenceMs = (CADENCE_DAYS[t.cadence] || 30) * 86400000;
    const lastMs = t.lastRunAt ? Number(t.lastRunAt) : 0;
    if (lastMs && now - lastMs < cadenceMs * 0.95) continue;
    const today = new Date();
    let serviceDate = todayISO();
    if (t.cadence === "monthly" && t.dayOfMonth) {
      const yr = today.getFullYear(); const mo = today.getMonth();
      // Pick this month's dayOfMonth, or next month if already past
      const candidate = new Date(yr, mo, +t.dayOfMonth);
      if (candidate < today) candidate.setMonth(mo + 1);
      serviceDate = candidate.toISOString().slice(0, 10);
    }
    const deal = {
      id: uid(),
      contactId: t.contactId || "",
      company: t.company || "",
      svc: t.svc || "p",
      fee: +t.fee || 0,
      partnerFeePct: +t.partnerFeePct || 0,
      paid: false,
      paidDate: "",
      paidAmount: 0,
      payMethod: "",
      serviceDate,
      postDate: "",
      draftDue: addDays(serviceDate, -3),
      contractUrl: "", briefUrl: "", draftUrl: "", portalUrl: "", notesUrl: "",
      invoiceNumber: "", invoiceDate: "", invoiceUrl: "",
      invoiceTo: t.invoiceTo || "",
      transactionId: "", terms: t.terms || 30,
      deliverables: (t.deliverables || []).map((d) => ({ ...d, done: false })),
      partials: [],
      notes: `[from template: ${t.name || "Retainer"}] ${t.notes || ""}`.trim(),
      year: +serviceDate.slice(0, 4),
      fromTemplate: t.id,
    };
    Deals.save(deal);
    DealTemplates.save({ id: t.id, lastRunAt: now });
    created.push(deal);
  }
  return created;
}
