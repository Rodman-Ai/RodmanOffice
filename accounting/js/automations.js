// Automation engine: detect patterns in user's data and propose rules.
// Rules can be enabled and applied; applied changes write back via the store.

import { Deals, Bills, Contacts, Settings } from "./store.js";
import { netFee } from "./utils.js";

const RULES_KEY = "rodbooks:rules";

export function getRules() {
  try { return JSON.parse(localStorage.getItem(RULES_KEY)) || {}; } catch { return {}; }
}
export function setRule(id, value) {
  const rules = getRules();
  rules[id] = value;
  localStorage.setItem(RULES_KEY, JSON.stringify(rules));
}

// --- Proposal generators ---
// Each returns { id, title, description, severity, count, apply, preview }.

export function generateProposals() {
  const proposals = [];
  const today = new Date();
  const todayMs = today.getTime();

  const deals = Deals.all();
  const bills = Bills.all();
  const contacts = Contacts.all();
  const rules = getRules();

  // 1. Overdue invoices (>30 days unpaid, has invoiceDate or serviceDate)
  const overdue = deals.filter((d) => {
    if (d.paid) return false;
    const ref = d.invoiceDate || d.serviceDate;
    if (!ref) return false;
    return (todayMs - new Date(ref).getTime()) / 86400000 > 30;
  });
  if (overdue.length) {
    proposals.push({
      id: "overdue-flag",
      title: `Flag ${overdue.length} overdue invoice${overdue.length === 1 ? "" : "s"}`,
      description: "Mark invoices unpaid >30 days as overdue and add a reminder note.",
      severity: "high",
      count: overdue.length,
      preview: overdue.slice(0, 5).map((d) => `${d.company} · ${d.invoiceNumber || "—"}`),
      apply() {
        overdue.forEach((d) => {
          const note = (d.notes || "").includes("[overdue]") ? d.notes : `[overdue] ${d.notes || ""}`.trim();
          Deals.save({ id: d.id, notes: note });
        });
      },
    });
  }

  // 2. Recurring bills missing for current month
  const recurringTemplates = {};
  bills.filter((b) => b.recurring === "monthly").forEach((b) => {
    if (!recurringTemplates[b.vendor] || (b.date || "") > recurringTemplates[b.vendor].date) {
      recurringTemplates[b.vendor] = b;
    }
  });
  const ym = today.toISOString().slice(0, 7);
  const missing = Object.values(recurringTemplates).filter((b) => {
    return !bills.some((x) => x.vendor === b.vendor && (x.date || "").startsWith(ym));
  });
  if (missing.length) {
    proposals.push({
      id: "recurring-fill",
      title: `Create ${missing.length} recurring bill${missing.length === 1 ? "" : "s"} for ${today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`,
      description: "Auto-generate this month's recurring software & subscription charges from prior months.",
      severity: "medium",
      count: missing.length,
      preview: missing.slice(0, 5).map((b) => `${b.vendor} · $${b.amount}`),
      apply() {
        missing.forEach((b) => {
          Bills.save({
            vendor: b.vendor, category: b.category, amount: b.amount,
            date: today.toISOString().slice(0, 10),
            paid: false, paidDate: "", payMethod: b.payMethod, recurring: "monthly", notes: "auto-generated",
          });
        });
      },
    });
  }

  // 3. Repeat brands (3+ paid deals) → suggest "Tier 1" tag
  const byBrand = {};
  deals.forEach((d) => { byBrand[d.company] = (byBrand[d.company] || 0) + (d.paid ? 1 : 0); });
  const tierOne = Object.entries(byBrand).filter(([_, c]) => c >= 3).map(([b]) => b);
  if (tierOne.length) {
    proposals.push({
      id: "tier-one",
      title: `Tag ${tierOne.length} repeat brand${tierOne.length === 1 ? "" : "s"} as Tier 1`,
      description: "Brands with 3+ paid deals get an internal Tier 1 tag for prioritization.",
      severity: "info",
      count: tierOne.length,
      preview: tierOne.slice(0, 6),
      apply() {
        tierOne.forEach((name) => {
          const c = contacts.find((x) => (x.name || "").toLowerCase() === name.toLowerCase() || x.company === name);
          if (c) Contacts.save({ id: c.id, notes: ((c.notes || "") + " #tier1").trim() });
        });
      },
    });
  }

  // 4. Drafts due in next 7 days — surface reminders
  const upcoming = deals.filter((d) => {
    if (d.paid || !d.draftDue) return false;
    const dt = new Date(d.draftDue);
    const days = (dt - today) / 86400000;
    return days >= 0 && days <= 7;
  });
  if (upcoming.length) {
    proposals.push({
      id: "draft-reminder",
      title: `Set reminders for ${upcoming.length} upcoming draft${upcoming.length === 1 ? "" : "s"}`,
      description: "Drafts due within the next 7 days. (Reminders surface in the dashboard.)",
      severity: "high",
      count: upcoming.length,
      preview: upcoming.slice(0, 6).map((d) => `${d.company} · due ${d.draftDue}`),
      apply() { /* no-op — drafts are surfaced on the dashboard already */ },
    });
  }

  // 5. Paid deals missing invoice numbers
  const paidNoInv = deals.filter((d) => d.paid && !d.invoiceNumber);
  if (paidNoInv.length) {
    proposals.push({
      id: "backfill-invoice-numbers",
      title: `Backfill invoice numbers on ${paidNoInv.length} paid deal${paidNoInv.length === 1 ? "" : "s"}`,
      description: "Auto-assign sequential invoice numbers using your prefix.",
      severity: "medium",
      count: paidNoInv.length,
      preview: paidNoInv.slice(0, 5).map((d) => `${d.company} · ${d.paidDate || "—"}`),
      apply() {
        const prefix = (Settings.get().invoicePrefix) || "INV";
        paidNoInv.forEach((d) => {
          const n = Settings.nextInvoiceNumber();
          Deals.save({ id: d.id, invoiceNumber: `${prefix}-${n}`, invoiceDate: d.invoiceDate || d.paidDate });
        });
      },
    });
  }

  // 6. Suggest renewal: brand with last deal >90d ago and lifetime > $X
  const ninety = todayMs - 90 * 86400000;
  const renewals = [];
  Object.entries(byBrand).forEach(([brand]) => {
    const ds = deals.filter((d) => d.company === brand);
    const last = ds.map((d) => d.serviceDate || d.paidDate || "").sort().slice(-1)[0];
    const lifetime = ds.reduce((s, d) => s + (Number(d.fee) || 0), 0);
    if (last && new Date(last).getTime() < ninety && lifetime >= 1500 && ds.length >= 2) {
      renewals.push({ brand, last, lifetime });
    }
  });
  if (renewals.length) {
    proposals.push({
      id: "renewal-outreach",
      title: `Re-engage ${renewals.length} dormant brand${renewals.length === 1 ? "" : "s"}`,
      description: "Brands with $1.5k+ lifetime that haven't booked in 90+ days. Add a follow-up note to each.",
      severity: "info",
      count: renewals.length,
      preview: renewals.slice(0, 6).map((r) => `${r.brand} · last ${r.last}`),
      apply() {
        renewals.forEach((r) => {
          const c = contacts.find((x) => x.company === r.brand || x.name === r.brand);
          if (c) Contacts.save({ id: c.id, notes: ((c.notes || "") + " · renewal-outreach").trim() });
        });
      },
    });
  }

  // 7. Standardize service codes (lowercase, trimmed)
  const malformed = deals.filter((d) => d.svc && d.svc !== d.svc.toLowerCase().trim());
  if (malformed.length) {
    proposals.push({
      id: "normalize-svc",
      title: `Normalize ${malformed.length} service code${malformed.length === 1 ? "" : "s"}`,
      description: "Lowercase and trim service-type codes for consistent grouping & filtering.",
      severity: "info",
      count: malformed.length,
      preview: malformed.slice(0, 5).map((d) => `${d.company} · "${d.svc}"`),
      apply() { malformed.forEach((d) => Deals.save({ id: d.id, svc: d.svc.toLowerCase().trim() })); },
    });
  }

  // 9. Subscription price-change tracker (#20)
  const subsByVendor = {};
  bills.filter((b) => b.recurring === "monthly").forEach((b) => {
    if (!subsByVendor[b.vendor]) subsByVendor[b.vendor] = [];
    subsByVendor[b.vendor].push(b);
  });
  const priceChanges = [];
  Object.entries(subsByVendor).forEach(([vendor, list]) => {
    if (list.length < 2) return;
    const sorted = list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const latest = sorted[0];
    const prev = sorted.find((b) => b.id !== latest.id && +b.amount !== +latest.amount);
    if (prev && Math.abs(+latest.amount - +prev.amount) > 0.5) {
      priceChanges.push({ vendor, from: +prev.amount, to: +latest.amount, sinceDate: prev.date });
    }
  });
  if (priceChanges.length) {
    proposals.push({
      id: "sub-price-change",
      title: `Detected ${priceChanges.length} subscription price change${priceChanges.length === 1 ? "" : "s"}`,
      description: "Recurring vendor charges that changed since the prior cycle. Review and cancel/downgrade if undesired.",
      severity: priceChanges.some((p) => p.to > p.from) ? "medium" : "info",
      count: priceChanges.length,
      preview: priceChanges.slice(0, 6).map((p) => `${p.vendor}: $${p.from} → $${p.to}${p.to > p.from ? " ↑" : " ↓"}`),
      apply() {
        priceChanges.forEach((p) => {
          const v = contacts.find((c) => (c.name || "").toLowerCase() === p.vendor.toLowerCase());
          // No-op on contact since vendor is just a string here; just acknowledge.
        });
        setRule("sub-price-change-ack", { enabled: true, ackedAt: Date.now() });
      },
    });
  }

  // 10. Anomaly detection (#87): unusually large single bill or sudden 3x dollar spike vs trailing-3-month avg.
  const anomalies = [];
  const billsByMonth = {};
  bills.forEach((b) => { const k = (b.date || "").slice(0, 7); if (!k) return; (billsByMonth[k] = billsByMonth[k] || []).push(b); });
  const months = Object.keys(billsByMonth).sort();
  if (months.length >= 4) {
    const last = months[months.length - 1];
    const prev3 = months.slice(-4, -1);
    const lastTotal = billsByMonth[last].reduce((s, b) => s + (+b.amount || 0), 0);
    const prevAvg = prev3.reduce((s, m) => s + billsByMonth[m].reduce((ss, b) => ss + (+b.amount || 0), 0), 0) / 3;
    if (lastTotal > prevAvg * 2 && lastTotal - prevAvg > 500) {
      anomalies.push({ kind: "monthly_spike", desc: `${last}: $${lastTotal.toFixed(0)} vs trailing-3 avg $${prevAvg.toFixed(0)}` });
    }
  }
  // Single-bill outlier: amount > 5x median bill in last 12 months
  const recent = bills.filter((b) => {
    const dt = new Date(b.date); return !isNaN(dt) && Date.now() - dt < 365 * 86400000;
  });
  if (recent.length > 10) {
    const sortedAmts = recent.map((b) => +b.amount || 0).sort((a, b) => a - b);
    const median = sortedAmts[Math.floor(sortedAmts.length / 2)] || 0;
    const outliers = recent.filter((b) => (+b.amount || 0) > Math.max(500, median * 5));
    outliers.forEach((b) => anomalies.push({ kind: "outlier", desc: `${b.vendor}: $${(+b.amount || 0).toFixed(0)} on ${b.date}` }));
  }
  if (anomalies.length) {
    proposals.push({
      id: "anomalies",
      title: `Spotted ${anomalies.length} expense anomal${anomalies.length === 1 ? "y" : "ies"}`,
      description: "Single bills or monthly totals that diverge from your norm.",
      severity: "medium",
      count: anomalies.length,
      preview: anomalies.slice(0, 6).map((a) => a.desc),
      apply() { setRule("anomalies-ack", { enabled: true, ackedAt: Date.now() }); },
    });
  }

  // 12. Exclusivity overlap (#64): warn if two brands' exclusivity windows overlap.
  const exclusiveDeals = deals.filter((d) => d.exclusivityFrom && d.exclusivityTo);
  const overlaps = [];
  for (let i = 0; i < exclusiveDeals.length; i++) {
    for (let j = i + 1; j < exclusiveDeals.length; j++) {
      const a = exclusiveDeals[i], b = exclusiveDeals[j];
      if (a.company === b.company) continue;
      const aFrom = new Date(a.exclusivityFrom), aTo = new Date(a.exclusivityTo);
      const bFrom = new Date(b.exclusivityFrom), bTo = new Date(b.exclusivityTo);
      if (aFrom <= bTo && bFrom <= aTo) {
        overlaps.push({ a: a.company, b: b.company, from: a.exclusivityFrom > b.exclusivityFrom ? a.exclusivityFrom : b.exclusivityFrom, to: a.exclusivityTo < b.exclusivityTo ? a.exclusivityTo : b.exclusivityTo });
      }
    }
  }
  if (overlaps.length) {
    proposals.push({
      id: "exclusivity-overlap",
      title: `Exclusivity windows overlap: ${overlaps.length} pair${overlaps.length === 1 ? "" : "s"}`,
      description: "Two or more brands have overlapping exclusivity windows. Confirm you're not violating either contract.",
      severity: "high",
      count: overlaps.length,
      preview: overlaps.slice(0, 5).map((o) => `${o.a} ⨯ ${o.b} from ${o.from} to ${o.to}`),
      apply() { setRule("exclusivity-overlap-ack", { enabled: true, ackedAt: Date.now() }); },
    });
  }

  // 13. Usage rights expiring soon (#65): within 30 days.
  const expiringSoon = deals.filter((d) => {
    if (!d.usageRightsUntil) return false;
    const until = new Date(d.usageRightsUntil);
    const days = (until.getTime() - todayMs) / 86400000;
    return days >= 0 && days <= 30;
  });
  if (expiringSoon.length) {
    proposals.push({
      id: "usage-rights-expiring",
      title: `${expiringSoon.length} usage-rights window${expiringSoon.length === 1 ? "" : "s"} expiring within 30 days`,
      description: "Decide whether to extend (charge a renewal fee) or take the content down on the brand's side.",
      severity: "medium",
      count: expiringSoon.length,
      preview: expiringSoon.slice(0, 6).map((d) => `${d.company}: ${d.usageRightsUntil}`),
      apply() { setRule("usage-rights-ack", { enabled: true, ackedAt: Date.now() }); },
    });
  }

  // 11. Smart paid-date inference (#88) lives in views/banking.js (transaction
  // matcher / quick-link). When the user confirms a bank-deposit match there,
  // we mark the linked deal paid with the deposit's date. There is no passive
  // automation proposal for it — without bank context we'd be guessing.

  // 8. Tax reserve alert — if estimated tax > current cash collected * 30%
  const yyyy = today.getFullYear();
  const yDeals = deals.filter((d) => d.paid && (d.paidDate || "").startsWith(String(yyyy)));
  // Use netFee as fallback when paidAmount is empty (older / imported deals).
  const collected = yDeals.reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
  const taxReserve = collected * (Settings.get().taxRate || 0.3);
  if (taxReserve > 1000 && !rules["tax-reserve-ack"]) {
    proposals.push({
      id: "tax-reserve",
      title: `Set aside ~${formatMoneyShort(taxReserve)} for taxes (${yyyy})`,
      description: `Based on ${formatMoneyShort(collected)} collected this year and a ${Math.round((Settings.get().taxRate || 0.3) * 100)}% reserve rate.`,
      severity: "high",
      count: 1,
      preview: [`Cash collected ${yyyy}: ${formatMoneyShort(collected)}`, `Reserve rate: ${Math.round((Settings.get().taxRate || 0.3) * 100)}%`],
      apply() { setRule("tax-reserve-ack", true); },
    });
  }

  return proposals;
}

function formatMoneyShort(n) {
  const v = Math.abs(n);
  if (v >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
