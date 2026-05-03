// Accountant share-link bundle (#27): ZIP with audit-style HTML + CSV exports + raw JSON.
// JSZip is loaded via CDN in index.html.

import { Deals, Bills, Contacts, Mileage, Settings, Assets, TaxPayments, SalesTax, exportJSON, downloadFile, toCSV } from "./store.js";
import { fmtMoney, fmtDate, todayISO, netFee } from "./utils.js";

export async function buildShareBundle({ year, includeReceipts = false } = {}) {
  if (!window.JSZip) throw new Error("JSZip not loaded");
  const zip = new window.JSZip();
  const yyyy = String(year || new Date().getFullYear());
  const settings = Settings.get();

  // 1) Pretty HTML summary report
  const deals = Deals.all().filter((d) => (d.paidDate || d.serviceDate || "").startsWith(yyyy));
  const bills = Bills.all().filter((b) => (b.date || "").startsWith(yyyy));
  const mileage = Mileage.all().filter((m) => (m.date || "").startsWith(yyyy));
  const taxPayments = TaxPayments.all().filter((p) => String(p.year) === yyyy);
  const salesTax = SalesTax.all().filter((e) => (e.date || "").startsWith(yyyy));

  const grossIncome = deals.reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
  const totalBills = bills.reduce((s, b) => s + (+b.amount || 0), 0);
  const mileageDed = mileage.reduce((s, m) => s + (+m.miles || 0), 0) * (settings.mileageRate || 0.67);
  const totalDed = totalBills + mileageDed;
  const netSE = grossIncome - totalDed;

  const escape = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const html = `<!doctype html>
<html><head><meta charset="utf-8"/>
<title>RodBooks · ${yyyy} share bundle</title>
<style>
body{font:14px/1.5 -apple-system,sans-serif;background:#fafafa;color:#111;margin:0;padding:32px;max-width:960px;margin:auto}
h1{font-size:22px;margin:0 0 4px}h2{font-size:16px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.muted{color:#666;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}
th,td{padding:6px 10px;text-align:left;border-bottom:1px solid #eee}
th{font-weight:600;color:#555;background:#fafafa}
.num{text-align:right;font-variant-numeric:tabular-nums}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin:12px 0}
.card{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px}
.kpi .v{font-size:20px;font-weight:700}
.kpi .l{font-size:11px;color:#666;text-transform:uppercase}
</style></head><body>
<h1>${escape(settings.businessName || "Creator business")}</h1>
<div class="muted">Tax year ${yyyy} · generated ${new Date().toLocaleString()}${settings.invoiceTemplate?.taxId ? " · " + escape(settings.invoiceTemplate.taxId) : ""}</div>

<h2>Summary</h2>
<div class="kpi">
  <div class="card"><div class="l">Gross income (cash)</div><div class="v">${fmtMoney(grossIncome)}</div></div>
  <div class="card"><div class="l">Bills</div><div class="v">${fmtMoney(totalBills)}</div></div>
  <div class="card"><div class="l">Mileage deduction</div><div class="v">${fmtMoney(mileageDed)}</div><div class="muted">${(mileage.reduce((s, m) => s + (+m.miles || 0), 0)).toLocaleString()} mi @ $${(settings.mileageRate || 0.67).toFixed(2)}</div></div>
  <div class="card"><div class="l">Net SE income</div><div class="v">${fmtMoney(netSE)}</div></div>
</div>

<h2>Income (${deals.length} deals)</h2>
<table>
<thead><tr><th>Date</th><th>Brand</th><th>Service</th><th class="num">Fee</th><th class="num">Paid</th><th>Status</th></tr></thead>
<tbody>
${deals.sort((a, b) => (a.paidDate || a.serviceDate || "").localeCompare(b.paidDate || b.serviceDate || "")).map((d) => `
  <tr>
    <td>${escape(d.paidDate || d.serviceDate || "")}</td>
    <td>${escape(d.company)}</td>
    <td>${escape(d.svc || "")}</td>
    <td class="num">${fmtMoney(d.fee)}</td>
    <td class="num">${fmtMoney(d.paidAmount || 0)}</td>
    <td>${d.paid ? "PAID" : "DUE"}</td>
  </tr>`).join("")}
</tbody>
</table>

<h2>Expenses by category</h2>
<table>
<thead><tr><th>Category</th><th class="num">Amount</th></tr></thead>
<tbody>
${(function () {
  const byCat = {};
  bills.forEach((b) => { byCat[b.category || "Other"] = (byCat[b.category || "Other"] || 0) + (+b.amount || 0); });
  return Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<tr><td>${escape(k)}</td><td class="num">${fmtMoney(v)}</td></tr>`).join("");
})()}
</tbody>
</table>

<h2>Estimated tax payments (${taxPayments.length})</h2>
<table><thead><tr><th>Date</th><th>Quarter</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>
${taxPayments.map((p) => `<tr><td>${escape(p.date)}</td><td>Q${p.quarter}</td><td>${escape(p.method)}</td><td class="num">${fmtMoney(p.amount)}</td></tr>`).join("")}
</tbody></table>

${salesTax.length ? `
<h2>Sales tax (${salesTax.length})</h2>
<table><thead><tr><th>Date</th><th>State</th><th class="num">Sales</th><th class="num">Rate</th><th class="num">Tax</th><th>Status</th></tr></thead><tbody>
${salesTax.map((e) => `<tr><td>${escape(e.date)}</td><td>${escape(e.state)}</td><td class="num">${fmtMoney(e.taxableSales)}</td><td class="num">${(+e.ratePct || 0).toFixed(2)}%</td><td class="num">${fmtMoney(e.taxCollected)}</td><td>${e.paid ? "Remitted" : "Owed"}</td></tr>`).join("")}
</tbody></table>` : ""}

<h2>Mileage (${mileage.length} trips)</h2>
<table><thead><tr><th>Date</th><th>Purpose</th><th>Route</th><th class="num">Miles</th></tr></thead><tbody>
${mileage.map((m) => `<tr><td>${escape(m.date)}</td><td>${escape(m.purpose)}</td><td>${escape(m.fromTo || (m.fromAddr + " → " + m.toAddr))}</td><td class="num">${(+m.miles || 0).toLocaleString()}</td></tr>`).join("")}
</tbody></table>

<div class="muted" style="margin-top:32px;text-align:center">Generated by RodBooks · all source files are in this bundle.</div>
</body></html>`;

  zip.file("00-summary.html", html);

  // 2) CSVs
  zip.file("deals.csv", toCSV(deals, [
    { key: "company", label: "Brand" }, { key: "svc", label: "Service" },
    { key: "fee", label: "Fee" }, { key: "paidAmount", label: "Paid Amount" },
    { key: "paidDate", label: "Paid Date" }, { key: "invoiceNumber", label: "Invoice #" },
    { key: "invoiceDate", label: "Invoice Date" }, { key: "transactionId", label: "Transaction" },
    { key: "currency", label: "Currency" }, { key: "fxRate", label: "FX rate" },
    { key: "notes", label: "Notes" },
  ]));
  zip.file("bills.csv", toCSV(bills, [
    { key: "date", label: "Date" }, { key: "vendor", label: "Vendor" },
    { key: "category", label: "Category" }, { key: "amount", label: "Amount" },
    { key: "payMethod", label: "Method" }, { key: "receiptUrl", label: "Receipt" },
    { key: "notes", label: "Notes" },
  ]));
  zip.file("mileage.csv", toCSV(mileage, [
    { key: "date", label: "Date" }, { key: "miles", label: "Miles" },
    { key: "purpose", label: "Purpose" }, { key: "fromAddr", label: "From" }, { key: "toAddr", label: "To" },
  ]));
  zip.file("tax-payments.csv", toCSV(taxPayments, [
    { key: "date", label: "Date" }, { key: "quarter", label: "Quarter" },
    { key: "amount", label: "Amount" }, { key: "method", label: "Method" }, { key: "notes", label: "Notes" },
  ]));
  if (salesTax.length) {
    zip.file("sales-tax.csv", toCSV(salesTax, [
      { key: "date", label: "Date" }, { key: "state", label: "State" },
      { key: "taxableSales", label: "Sales" }, { key: "ratePct", label: "Rate %" },
      { key: "taxCollected", label: "Tax" }, { key: "paid", label: "Paid", value: (e) => e.paid ? "yes" : "no" }, { key: "paidDate", label: "Paid Date" },
    ]));
  }

  // 3) Raw JSON
  zip.file("raw.json", exportJSON());

  // 4) Receipts (optional)
  if (includeReceipts) {
    const folder = zip.folder("receipts");
    bills.filter((b) => b.receiptUrl?.startsWith("data:image/")).forEach((b, i) => {
      const m = b.receiptUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!m) return;
      const ext = m[1].split("/")[1];
      folder.file(`${(b.date || "").replace(/-/g, "")}-${(b.vendor || "vendor").replace(/[^A-Za-z0-9]/g, "")}-${i + 1}.${ext}`, m[2], { base64: true });
    });
  }

  const blob = await zip.generateAsync({ type: "blob" });
  return blob;
}

export async function downloadShareBundle(opts = {}) {
  const blob = await buildShareBundle(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rodbooks-${opts.year || new Date().getFullYear()}-share.zip`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}
