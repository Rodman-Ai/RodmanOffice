/**
 * @file Weekly digest (#80). Renders a printable HTML summary of the past
 * 7 days; previewable in a new tab or downloadable as PDF via html2pdf.
 *
 * @module digest
 */

import { Deals, Bills, Settings, TaxPayments } from "./store.js";
import { fmtMoney, fmtDate, netFee, brandWarmth, escapeHtml } from "./utils.js";
import { withHtml2Pdf } from "./pdf.js";

export function buildDigestHtml() {
  const since = Date.now() - 7 * 86400000;
  const sinceIso = new Date(since).toISOString().slice(0, 10);
  const settings = Settings.get();
  const deals = Deals.all();
  const bills = Bills.all();

  const newDeals = deals.filter((d) => (d.createdAt || 0) >= since);
  const paidThisWeek = deals.filter((d) => d.paidDate && d.paidDate >= sinceIso);
  const billsThisWeek = bills.filter((b) => (b.date || "") >= sinceIso);
  const upcomingDrafts = deals.filter((d) => !d.paid && d.draftDue && d.draftDue >= new Date().toISOString().slice(0, 10) && d.draftDue <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const overdue = deals.filter((d) => {
    if (d.paid) return false;
    const issue = d.invoiceDate || d.serviceDate;
    if (!issue) return false;
    const due = new Date(issue); due.setDate(due.getDate() + (d.terms || settings.defaultTerms || 30));
    return due.getTime() < Date.now();
  });

  const collected = paidThisWeek.reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
  const billsTotal = billsThisWeek.reduce((s, b) => s + (+b.amount || 0), 0);

  const wkLabel = `${new Date(since).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return `<!doctype html>
<html><head><meta charset="utf-8"/><title>RodBooks weekly digest</title>
<style>
body{font:14px/1.5 -apple-system,sans-serif;background:#fafafa;color:#111;margin:0;padding:32px;max-width:840px;margin:auto}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:14px;margin:20px 0 6px;text-transform:uppercase;letter-spacing:0.06em;color:#666;border-bottom:1px solid #ddd;padding-bottom:4px}
.muted{color:#666;font-size:12.5px}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin:14px 0}
.card{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px}
.card .v{font-size:20px;font-weight:700}
.card .l{font-size:11px;color:#666;text-transform:uppercase;letter-spacing:.05em}
.row{display:grid;grid-template-columns:1fr auto;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #f0f0f0}
.row:last-child{border-bottom:0}
.muted-em{color:#999}
.tag{display:inline-block;background:#f3f4f6;color:#374151;padding:1px 8px;border-radius:999px;font-size:11px;margin-right:6px}
@media print{body{background:#fff;padding:8px}}
</style></head><body>
<h1>${escapeHtml(settings.businessName || "Weekly digest")}</h1>
<div class="muted">${wkLabel}</div>

<div class="kpi">
  <div class="card"><div class="l">Cash collected</div><div class="v">${fmtMoney(collected)}</div><div class="muted">${paidThisWeek.length} payment${paidThisWeek.length === 1 ? "" : "s"}</div></div>
  <div class="card"><div class="l">New deals</div><div class="v">${newDeals.length}</div></div>
  <div class="card"><div class="l">Bills logged</div><div class="v">${fmtMoney(billsTotal)}</div></div>
  <div class="card"><div class="l">Drafts due (next 7d)</div><div class="v">${upcomingDrafts.length}</div></div>
  <div class="card"><div class="l">Overdue invoices</div><div class="v">${overdue.length}</div></div>
</div>

<h2>Paid this week</h2>
${paidThisWeek.length === 0 ? `<div class="muted">Nothing settled yet.</div>` :
  paidThisWeek.map((d) => `<div class="row"><div><strong>${escapeHtml(d.company)}</strong> <span class="tag">${escapeHtml(d.svc || "—")}</span> <span class="muted">${escapeHtml(fmtDate(d.paidDate))}</span></div><div>${fmtMoney(+d.paidAmount || netFee(d))}</div></div>`).join("")}

<h2>Drafts due in the next 7 days</h2>
${upcomingDrafts.length === 0 ? `<div class="muted">All clear.</div>` :
  upcomingDrafts.map((d) => `<div class="row"><div><strong>${escapeHtml(d.company)}</strong> <span class="muted">${escapeHtml(fmtDate(d.draftDue))}</span></div><div>${fmtMoney(netFee(d))}</div></div>`).join("")}

<h2>Overdue invoices</h2>
${overdue.length === 0 ? `<div class="muted">Nothing past due.</div>` :
  overdue.slice(0, 12).map((d) => {
    const issue = d.invoiceDate || d.serviceDate;
    const due = new Date(issue); due.setDate(due.getDate() + (d.terms || settings.defaultTerms || 30));
    const dpd = Math.round((Date.now() - due.getTime()) / 86400000);
    return `<div class="row"><div><strong>${escapeHtml(d.company)}</strong> <span class="tag">${dpd}d past due</span> <span class="muted">${escapeHtml(d.invoiceNumber || "")}</span></div><div>${fmtMoney(netFee(d))}</div></div>`;
  }).join("")}

<h2>New deals</h2>
${newDeals.length === 0 ? `<div class="muted">No new deals booked.</div>` :
  newDeals.map((d) => `<div class="row"><div><strong>${escapeHtml(d.company)}</strong> <span class="tag">${escapeHtml(d.svc || "—")}</span></div><div>${fmtMoney(d.fee)}</div></div>`).join("")}

<div class="muted-em" style="margin-top:32px;text-align:center;font-size:11px">Generated by RodBooks</div>
</body></html>`;
}

export async function downloadDigestPdf() {
  const html = buildDigestHtml();
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html.replace(/^<!doctype[^>]*>/, "").replace(/<\/?html[^>]*>|<\/?head[^>]*>|<\/?body[^>]*>|<title>[^<]*<\/title>|<meta[^>]*>/gi, "");
  return withHtml2Pdf((html2pdf) => html2pdf().set({
    margin: 8,
    filename: `rodbooks-digest-${new Date().toISOString().slice(0, 10)}.pdf`,
    html2canvas: { scale: 2, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
  }).from(wrapper).save());
}

export function previewDigest() {
  const w = window.open("", "_blank", "width=900,height=1100");
  if (!w) return;
  w.document.open();
  w.document.write(buildDigestHtml());
  w.document.close();
}
