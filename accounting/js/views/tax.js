// Tax workbench: Schedule C box totals, SE tax, state tax, quarterly payment log, 1099 payer tracker.

import { el, fmtMoney, fmtDate, fmtDateShort, todayISO, netFee, parseDate, escapeHtml, kpi, field } from "../utils.js";
import { Deals, Bills, Settings, TaxPayments, Assets, SalesTax, subscribe, downloadFile, toCSV } from "../store.js";
import { openModal, toast, confirmDialog } from "../ui.js";
import { withHtml2Pdf } from "../pdf.js";

// 5-year MACRS half-year convention (cameras, computers, lights). Approximate.
const MACRS_5 = [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576];

// Map our bill categories to Schedule C box numbers (approximate, common-case).
const SCHED_C = {
  "Marketing": { box: 8, label: "Advertising (Box 8)" },
  "Contractors": { box: 11, label: "Contract labor (Box 11)" },
  "Equipment": { box: 13, label: "Depreciation (Box 13)" },
  "Software": { box: 18, label: "Office expense (Box 18)" },
  "Subscriptions": { box: 18, label: "Office expense (Box 18)" },
  "Office": { box: 18, label: "Office expense (Box 18)" },
  "Meals": { box: 24, label: "Meals — 50% deductible (Box 24b)" },
  "Travel": { box: 24, label: "Travel (Box 24a)" },
  "Education": { box: 27, label: "Other expenses (Box 27a)" },
  "Phone & Internet": { box: 25, label: "Utilities (Box 25)" },
  "Home Office": { box: 30, label: "Home office (Box 30)" },
  "Other": { box: 27, label: "Other expenses (Box 27a)" },
};

const Q_DUE = ["Apr 15", "Jun 15", "Sep 15", "Jan 15"];
const Q_PERIOD = ["Jan–Mar (Q1)", "Apr–May (Q2)", "Jun–Aug (Q3)", "Sep–Dec (Q4)"];

export default function taxView() {
  const node = el("div", {});
  let year = String(new Date().getFullYear());

  const render = () => {
    const settings = Settings.get();
    const allDeals = Deals.all();
    const allBills = Bills.all();
    const allPayments = TaxPayments.all();

    const yearsSet = new Set([year]);
    allDeals.forEach((d) => { const y = (d.paidDate || d.serviceDate || d.invoiceDate || "").slice(0, 4); if (y) yearsSet.add(y); });
    allBills.forEach((b) => { const y = (b.date || "").slice(0, 4); if (y) yearsSet.add(y); });
    allPayments.forEach((p) => { if (p.year) yearsSet.add(String(p.year)); });
    const years = Array.from(yearsSet).sort().reverse();

    const yDeals = allDeals.filter((d) => d.paid && (d.paidDate || "").startsWith(year));
    const yBills = allBills.filter((b) => (b.date || "").startsWith(year));
    const yPayments = allPayments.filter((p) => String(p.year) === year);

    // Box-by-box totals (#32). Skip bills explicitly flagged personal or
    // pre-tax — those don't belong in Schedule C deductions.
    const boxes = {};
    yBills.forEach((b) => {
      if (b.taxStatus === "personal" || b.taxStatus === "preTax") return;
      const meta = SCHED_C[b.category] || SCHED_C.Other;
      const amt = +b.amount || 0;
      // Meals are 50% deductible
      const deductible = b.category === "Meals" ? amt * 0.5 : amt;
      boxes[meta.label] = (boxes[meta.label] || 0) + deductible;
    });

    const grossIncome = yDeals.reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
    const totalDeductions = Object.values(boxes).reduce((a, b) => a + b, 0);
    const netSE = Math.max(0, grossIncome - totalDeductions);

    // SE tax (#34): 92.35% × 15.3% on first $168,600 (2024 SS wage base; OK approx)
    const seBase = netSE * 0.9235;
    const ssWageBase = 168600;
    const ssTax = Math.min(seBase, ssWageBase) * 0.124;
    const medicareTax = seBase * 0.029;
    const additionalMedicare = Math.max(0, seBase - 200000) * 0.009;
    const seTax = ssTax + medicareTax + additionalMedicare;
    const seDeduction = seTax / 2;

    const stateTax = netSE * (settings.stateRate || 0.05);
    const federalIncomeApprox = Math.max(0, (netSE - seDeduction)) * (settings.taxRate || 0.3);
    const totalEstTax = seTax + federalIncomeApprox + stateTax;

    // 1099-NEC payer tracker (#31): brands you got paid >= $600 from this year.
    const byPayer = {};
    yDeals.forEach((d) => {
      const k = d.company || "—";
      byPayer[k] = (byPayer[k] || 0) + (+d.paidAmount || netFee(d));
    });
    const owedForms = Object.entries(byPayer).filter(([, v]) => v >= 600).sort((a, b) => b[1] - a[1]);

    // Quarterly: Q1=Jan-Mar, Q2=Apr-May, Q3=Jun-Aug, Q4=Sep-Dec
    const qBuckets = [0, 0, 0, 0];
    yDeals.forEach((d) => {
      const m = +(d.paidDate || "").slice(5, 7) - 1;
      const q = m <= 2 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
      if (m >= 0) qBuckets[q] += (+d.paidAmount || netFee(d));
    });
    const qBillBuckets = [0, 0, 0, 0];
    yBills.forEach((b) => {
      const m = +(b.date || "").slice(5, 7) - 1;
      const q = m <= 2 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
      if (m >= 0) qBillBuckets[q] += (+b.amount || 0);
    });
    const qNet = qBuckets.map((v, i) => v - qBillBuckets[i]);
    const reserveRate = settings.taxRate || 0.3;
    const qReserve = qNet.map((v) => Math.max(0, v) * reserveRate);
    const qPaid = [0, 0, 0, 0];
    yPayments.forEach((p) => { if (p.quarter >= 1 && p.quarter <= 4) qPaid[p.quarter - 1] += (+p.amount || 0); });

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Tax workbench"),
          el("div", { class: "sub" }, `Schedule C totals · SE tax · quarterly log · 1099 tracker — ${year}`),
        ),
        el("div", { class: "row" },
          (function () {
            const s = el("select", { class: "select" });
            for (const y of years) {
              const o = el("option", { value: y }, y);
              if (y === year) o.selected = true;
              s.append(o);
            }
            s.addEventListener("change", () => { year = s.value; render(); });
            return s;
          })(),
          el("button", { class: "btn", onclick: () => exportAuditPack(year) }, "Export audit pack"),
          el("button", { class: "btn", onclick: () => downloadYearEndPdf(year) }, "Year-end tax PDF"),
          el("button", { class: "btn primary", onclick: () => openTaxPaymentForm({ year: +year }) }, "+ Log estimated payment"),
        ),
      ),

      el("div", { class: "kpi-grid" },
        kpi("Gross income (cash)", fmtMoney(grossIncome)),
        kpi("Total deductions", fmtMoney(totalDeductions)),
        kpi("Net SE income", fmtMoney(netSE)),
        kpi("SE tax (15.3%)", fmtMoney(seTax), null, `Half deductible: ${fmtMoney(seDeduction)}`),
        kpi("Total est. federal+state", fmtMoney(totalEstTax)),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Schedule C — box-by-box totals"),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Schedule C box"),
            el("th", { class: "num" }, "Deductible"),
          )),
          el("tbody", {},
            ...Object.entries(boxes).sort((a, b) => b[1] - a[1]).map(([label, v]) => el("tr", {},
              el("td", {}, label),
              el("td", { class: "num" }, fmtMoney(v)),
            )),
            el("tr", { style: { borderTop: "2px solid var(--line-2)" } },
              el("td", { style: { fontWeight: 700 } }, "Total deductions"),
              el("td", { class: "num", style: { fontWeight: 700 } }, fmtMoney(totalDeductions)),
            ),
          ),
        ),
        el("div", { class: "small muted", style: { marginTop: 8 } }, "Approximate IRS box mappings. Verify with your CPA."),
      ),

      el("div", { class: "card" },
        el("h3", {}, "SE tax breakdown"),
        el("table", { class: "data" },
          el("tbody", {},
            tr2("Net SE income", fmtMoney(netSE)),
            tr2("× 92.35% (SE base)", fmtMoney(seBase)),
            tr2("Social Security 12.4% (capped)", fmtMoney(ssTax)),
            tr2("Medicare 2.9%", fmtMoney(medicareTax)),
            additionalMedicare > 0 ? tr2("Additional Medicare 0.9% (>$200k)", fmtMoney(additionalMedicare)) : null,
            tr2("Total SE tax", fmtMoney(seTax), true),
            tr2("Half deductible against income", fmtMoney(seDeduction)),
          ),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Quarterly estimated payments"),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Quarter"),
            el("th", {}, "Period"),
            el("th", {}, "Due"),
            el("th", { class: "num" }, "Net (cash)"),
            el("th", { class: "num" }, "Reserve"),
            el("th", { class: "num" }, "Paid"),
            el("th", { class: "num" }, "Balance"),
          )),
          el("tbody", {}, ...[0, 1, 2, 3].map((i) => {
            const balance = qReserve[i] - qPaid[i];
            return el("tr", {},
              el("td", { style: { fontWeight: 600 } }, `Q${i + 1}`),
              el("td", { class: "small muted" }, Q_PERIOD[i]),
              el("td", { class: "small muted" }, Q_DUE[i] + (i === 3 ? " (next yr)" : "")),
              el("td", { class: "num" }, fmtMoney(qNet[i])),
              el("td", { class: "num" }, fmtMoney(qReserve[i])),
              el("td", { class: "num" }, fmtMoney(qPaid[i])),
              el("td", { class: "num", style: { color: balance > 0 ? "var(--warn)" : "var(--accent)", fontWeight: 600 } }, fmtMoney(balance)),
            );
          })),
        ),
        yPayments.length > 0 && el("div", { style: { marginTop: 12 } },
          el("h4", { style: { fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", margin: "8px 0" } }, "Logged payments"),
          el("table", { class: "data" },
            el("thead", {}, el("tr", {},
              el("th", {}, "Date"), el("th", {}, "Quarter"), el("th", {}, "Method"), el("th", { class: "num" }, "Amount"), el("th", {}, "Notes"), el("th", {}, ""),
            )),
            el("tbody", {}, ...yPayments.sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((p) => el("tr", {},
              el("td", { class: "small muted" }, fmtDate(p.date)),
              el("td", {}, `Q${p.quarter}`),
              el("td", { class: "small muted" }, p.method || "—"),
              el("td", { class: "num" }, fmtMoney(p.amount)),
              el("td", { class: "small muted truncate" }, p.notes || "—"),
              el("td", {}, el("button", { class: "btn sm", onclick: () => openTaxPaymentForm(p) }, "Edit")),
            ))),
          ),
        ),
      ),

      // Home-office calculator (#17)
      (function () {
        const ho = settings.homeOffice || { sqft: 0, totalSqft: 0, monthlyUtilities: 0 };
        const pct = ho.totalSqft > 0 ? (ho.sqft / ho.totalSqft) : 0;
        const yearlyUtilities = (+ho.monthlyUtilities || 0) * 12;
        const deduction = yearlyUtilities * pct;
        const sqft = el("input", { class: "input", type: "number", min: "0", value: ho.sqft || "" });
        const totalSqft = el("input", { class: "input", type: "number", min: "0", value: ho.totalSqft || "" });
        const monthlyUtilities = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: ho.monthlyUtilities || "" });
        const out = el("div", { class: "small muted", style: { marginTop: 8 } });
        const refresh = () => {
          const p = (+totalSqft.value || 0) > 0 ? (+sqft.value / +totalSqft.value) : 0;
          const yu = (+monthlyUtilities.value || 0) * 12;
          out.textContent = `Business-use %: ${(p * 100).toFixed(1)}% · Annual utilities: ${fmtMoney(yu)} · Deduction: ${fmtMoney(yu * p)}`;
        };
        [sqft, totalSqft, monthlyUtilities].forEach((i) => i.addEventListener("input", refresh));
        refresh();
        const save = () => {
          Settings.update({ homeOffice: { sqft: +sqft.value || 0, totalSqft: +totalSqft.value || 0, monthlyUtilities: +monthlyUtilities.value || 0 } });
          toast("Home-office updated");
        };
        return el("div", { class: "card" },
          el("h3", {}, "Home-office deduction"),
          el("div", { class: "small muted", style: { marginBottom: 8 } }, "IRS regular method: business-use % × utilities. (Simplified method = $5 × sq ft, max $1,500.)"),
          el("div", { class: "form-grid" },
            field("Office sq ft", sqft),
            field("Total home sq ft", totalSqft),
            field("Monthly utilities ($)", monthlyUtilities),
          ),
          out,
          el("div", { style: { marginTop: 12 } }, el("button", { class: "btn", onclick: save }, "Save")),
        );
      })(),

      // Equipment depreciation schedule (#18)
      (function () {
        const assets = Assets.all();
        const yyyy = +year;
        const rows = assets.map((a) => {
          const buyYear = +(a.purchaseDate || "").slice(0, 4) || 0;
          const yearsIn = yyyy - buyYear;
          let depThisYr = 0;
          if (a.life === "MACRS-5" && yearsIn >= 0 && yearsIn < MACRS_5.length) {
            depThisYr = (+a.cost || 0) * MACRS_5[yearsIn];
          } else if (a.life === "Section179" && yearsIn === 0) {
            depThisYr = +a.cost || 0;
          }
          return { ...a, depThisYr, yearsIn };
        });
        const total = rows.reduce((s, r) => s + r.depThisYr, 0);
        return el("div", { class: "card" },
          el("div", { class: "spread" },
            el("h3", {}, `Equipment depreciation · ${year}`),
            el("button", { class: "btn primary", onclick: () => openAssetForm() }, "+ Asset"),
          ),
          el("div", { class: "small muted", style: { marginBottom: 8 } }, "5-yr MACRS half-year convention. Section 179 = full expense in year acquired."),
          rows.length === 0
            ? el("div", { class: "empty small" }, "No depreciable assets yet. Add cameras/computers/lights for automated schedule.")
            : el("table", { class: "data" },
                el("thead", {}, el("tr", {},
                  el("th", {}, "Asset"), el("th", {}, "Purchased"),
                  el("th", { class: "num" }, "Cost"), el("th", {}, "Method"),
                  el("th", { class: "num" }, "Year " + Math.max(0, rows[0]?.yearsIn || 0)),
                  el("th", { class: "num" }, "Deduction"),
                  el("th", {}, ""),
                )),
                el("tbody", {},
                  ...rows.map((r) => el("tr", {},
                    el("td", {}, r.name),
                    el("td", { class: "small muted" }, fmtDateShort(r.purchaseDate)),
                    el("td", { class: "num" }, fmtMoney(r.cost)),
                    el("td", {}, el("span", { class: "pill gray" }, r.life)),
                    el("td", { class: "small muted" }, r.yearsIn >= 0 ? `Y${r.yearsIn + 1}` : "—"),
                    el("td", { class: "num" }, fmtMoney(r.depThisYr)),
                    el("td", {}, el("button", { class: "btn sm", onclick: () => openAssetForm(r) }, "Edit")),
                  )),
                  el("tr", { style: { borderTop: "2px solid var(--line-2)" } },
                    el("td", { style: { fontWeight: 700 }, colspan: "5" }, `Total ${year}`),
                    el("td", { class: "num", style: { fontWeight: 700 } }, fmtMoney(total)),
                    el("td", {}, ""),
                  ),
                ),
              ),
        );
      })(),

      // Sales-tax tracker (#36)
      (function () {
        const yEntries = SalesTax.all().filter((e) => (e.date || "").startsWith(year)).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        const collected = yEntries.reduce((s, e) => s + (+e.taxCollected || 0), 0);
        const remitted = yEntries.filter((e) => e.paid).reduce((s, e) => s + (+e.taxCollected || 0), 0);
        const owed = collected - remitted;
        const byState = {};
        yEntries.forEach((e) => {
          const k = e.state || "—";
          if (!byState[k]) byState[k] = { state: k, sales: 0, tax: 0, owed: 0 };
          byState[k].sales += +e.taxableSales || 0;
          byState[k].tax += +e.taxCollected || 0;
          if (!e.paid) byState[k].owed += +e.taxCollected || 0;
        });
        return el("div", { class: "card" },
          el("div", { class: "spread" },
            el("h3", {}, `Sales-tax tracker · ${year}`),
            el("button", { class: "btn primary", onclick: () => openSalesTaxForm({}) }, "+ Log taxable sale"),
          ),
          el("div", { class: "small muted", style: { marginBottom: 8 } }, "For digital products, merch, or workshops sold across state nexus. Track per-state and remit on schedule."),
          el("div", { class: "kpi-grid" },
            kpi("Collected", fmtMoney(collected)),
            kpi("Remitted", fmtMoney(remitted)),
            kpi("Outstanding", fmtMoney(owed), owed > 0 ? "down" : "up"),
            kpi("States", String(Object.keys(byState).length)),
          ),
          Object.keys(byState).length === 0
            ? el("div", { class: "empty small" }, "No taxable sales logged yet.")
            : el("table", { class: "data" },
                el("thead", {}, el("tr", {},
                  el("th", {}, "State"),
                  el("th", { class: "num" }, "Taxable sales"),
                  el("th", { class: "num" }, "Tax collected"),
                  el("th", { class: "num" }, "Outstanding"),
                )),
                el("tbody", {}, ...Object.values(byState).sort((a, b) => b.tax - a.tax).map((r) => el("tr", {},
                  el("td", { style: { fontWeight: 600 } }, r.state),
                  el("td", { class: "num" }, fmtMoney(r.sales)),
                  el("td", { class: "num" }, fmtMoney(r.tax)),
                  el("td", { class: "num", style: r.owed > 0 ? { color: "var(--warn)" } : null }, fmtMoney(r.owed)),
                ))),
              ),
          yEntries.length > 0 && el("div", { style: { marginTop: 12 } },
            el("h4", { style: { fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", margin: "8px 0" } }, "Entries"),
            el("table", { class: "data" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Date"), el("th", {}, "State"),
                el("th", { class: "num" }, "Sales"), el("th", { class: "num" }, "Rate"),
                el("th", { class: "num" }, "Tax"), el("th", {}, "Status"), el("th", {}, ""),
              )),
              el("tbody", {}, ...yEntries.map((e) => el("tr", {},
                el("td", { class: "small muted" }, fmtDate(e.date)),
                el("td", {}, e.state || "—"),
                el("td", { class: "num small muted" }, fmtMoney(e.taxableSales)),
                el("td", { class: "num small muted" }, `${(+e.ratePct || 0).toFixed(2)}%`),
                el("td", { class: "num" }, fmtMoney(e.taxCollected)),
                el("td", {}, el("span", { class: `pill ${e.paid ? "green" : "amber"}` }, e.paid ? "Remitted" : "Owed")),
                el("td", {}, el("button", { class: "btn sm", onclick: () => openSalesTaxForm(e) }, "Edit")),
              ))),
            ),
          ),
        );
      })(),

      el("div", { class: "card" },
        el("div", { class: "spread" },
          el("h3", {}, `1099-NEC tracker · ${year}`),
          owedForms.length ? el("button", { class: "btn", onclick: () => generate1099Pdfs(owedForms, year) }, "Generate 1099 PDFs") : null,
        ),
        el("div", { class: "small muted", style: { marginBottom: 8 } }, `Brands that paid you ≥ $600 owe you a 1099-NEC by Jan 31, ${+year + 1}.`),
        owedForms.length === 0
          ? el("div", { class: "empty small" }, "No payers crossed the $600 threshold yet.")
          : el("table", { class: "data" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Payer"),
                el("th", { class: "num" }, "Paid"),
                el("th", {}, "Status"),
              )),
              el("tbody", {}, ...owedForms.map(([name, total]) => el("tr", {},
                el("td", {}, name),
                el("td", { class: "num" }, fmtMoney(total)),
                el("td", {}, el("span", { class: "pill amber" }, "Form due")),
              ))),
            ),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function tr2(k, v, bold) {
  return el("tr", {},
    el("td", { style: bold ? { fontWeight: 700, borderTop: "1px solid var(--line-2)" } : null }, k),
    el("td", { class: "num", style: { ...(bold ? { fontWeight: 700, borderTop: "1px solid var(--line-2)" } : {}) } }, v),
  );
}


function openTaxPaymentForm(payment) {
  const isNew = !payment?.id;
  const p = payment || { date: todayISO(), quarter: 1, year: new Date().getFullYear(), amount: 0, method: "EFTPS", notes: "" };
  const date = el("input", { class: "input", type: "date", value: p.date || todayISO() });
  const quarter = el("select", { class: "select" });
  [1, 2, 3, 4].forEach((q) => {
    const o = el("option", { value: String(q) }, `Q${q}`);
    if (+q === +p.quarter) o.selected = true;
    quarter.append(o);
  });
  const year = el("input", { class: "input", type: "number", value: p.year || new Date().getFullYear() });
  const amount = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: p.amount || "" });
  const method = el("input", { class: "input", value: p.method || "EFTPS", placeholder: "EFTPS, IRS Direct Pay, state…" });
  const notes = el("textarea", { class: "textarea" }, p.notes || "");

  const body = el("div", { class: "form-grid" },
    field("Date", date),
    field("Quarter", quarter),
    field("Tax year", year),
    field("Amount", amount),
    field("Method", method),
    field("Notes", notes, true),
  );
  let m;
  const save = () => {
    if (!amount.value) { toast("Amount required", "warn"); return; }
    TaxPayments.save({
      id: p.id,
      date: date.value,
      quarter: +quarter.value,
      year: +year.value,
      amount: +amount.value || 0,
      method: method.value,
      notes: notes.value,
    });
    toast(isNew ? "Payment logged" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete payment?", danger: true, confirmLabel: "Delete" });
      if (ok) { TaxPayments.remove(p.id); toast("Deleted"); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Log payment" : "Save"),
  );
  m = openModal({ title: isNew ? "Log estimated payment" : "Edit payment", body, footer });
  setTimeout(() => amount.focus(), 30);
}

function openSalesTaxForm(entry) {
  const isNew = !entry?.id;
  const e = entry || { date: todayISO(), state: "CA", taxableSales: 0, ratePct: 7.25, taxCollected: 0, paid: false, paidDate: "", notes: "" };
  const date = el("input", { class: "input", type: "date", value: e.date || todayISO() });
  const state = el("input", { class: "input", value: e.state || "CA", placeholder: "State (e.g. CA)" });
  const taxableSales = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: e.taxableSales || "" });
  const ratePct = el("input", { class: "input", type: "number", step: "0.001", min: "0", value: e.ratePct || "" });
  const taxCollected = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: e.taxCollected || "" });
  const paid = el("input", { type: "checkbox" }); paid.checked = !!e.paid;
  const paidDate = el("input", { class: "input", type: "date", value: e.paidDate || "" });
  const notes = el("textarea", { class: "textarea" }, e.notes || "");

  const recalc = () => {
    if (!taxCollected.value) {
      const v = (+taxableSales.value || 0) * ((+ratePct.value || 0) / 100);
      if (v) taxCollected.value = v.toFixed(2);
    }
  };
  taxableSales.addEventListener("input", recalc);
  ratePct.addEventListener("input", recalc);

  const body = el("div", { class: "form-grid" },
    field("Date", date),
    field("State", state),
    field("Taxable sales ($)", taxableSales),
    field("Rate %", ratePct),
    field("Tax collected ($)", taxCollected),
    el("div", { class: "field" }, el("label", {}, "Remitted?"), el("div", {}, paid)),
    field("Paid date", paidDate),
    field("Notes", notes, true),
  );
  let m;
  const save = () => {
    if (!taxableSales.value && !taxCollected.value) { toast("Sales or tax required", "warn"); return; }
    SalesTax.save({
      id: e.id, date: date.value, state: state.value.trim().toUpperCase(),
      taxableSales: +taxableSales.value || 0, ratePct: +ratePct.value || 0, taxCollected: +taxCollected.value || 0,
      paid: paid.checked, paidDate: paidDate.value, notes: notes.value,
    });
    toast(isNew ? "Logged" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete entry?", danger: true, confirmLabel: "Delete" });
      if (ok) { SalesTax.remove(e.id); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Log entry" : "Save"),
  );
  m = openModal({ title: isNew ? "Log taxable sale" : "Edit entry", body, footer });
  setTimeout(() => taxableSales.focus(), 30);
}

function openAssetForm(asset) {
  const isNew = !asset?.id;
  const a = asset || { name: "", category: "Equipment", purchaseDate: todayISO(), cost: 0, life: "MACRS-5", notes: "" };
  const name = el("input", { class: "input", value: a.name || "", placeholder: "Sony A7iv body" });
  const category = el("input", { class: "input", value: a.category || "Equipment", placeholder: "Equipment / Computer / Lighting" });
  const purchaseDate = el("input", { class: "input", type: "date", value: a.purchaseDate || todayISO() });
  const cost = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: a.cost || "" });
  const life = el("select", { class: "select" });
  ["MACRS-5", "Section179"].forEach((k) => {
    const o = el("option", { value: k }, k === "MACRS-5" ? "MACRS 5-year (cameras, computers, lights)" : "Section 179 (full expense year 1)");
    if (k === a.life) o.selected = true;
    life.append(o);
  });
  const notes = el("textarea", { class: "textarea" }, a.notes || "");
  const body = el("div", { class: "form-grid" },
    field("Name", name, true),
    field("Category", category),
    field("Purchase date", purchaseDate),
    field("Cost ($)", cost),
    field("Method", life),
    field("Notes", notes, true),
  );
  let m;
  const save = () => {
    if (!name.value.trim()) { toast("Name required", "warn"); return; }
    if (!cost.value) { toast("Cost required", "warn"); return; }
    Assets.save({ id: a.id, name: name.value.trim(), category: category.value, purchaseDate: purchaseDate.value, cost: +cost.value || 0, life: life.value, notes: notes.value });
    toast(isNew ? "Asset added" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete asset?", danger: true, confirmLabel: "Delete" });
      if (ok) { Assets.remove(a.id); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add asset" : "Save"),
  );
  m = openModal({ title: isNew ? "New depreciable asset" : "Edit asset", body, footer });
  setTimeout(() => name.focus(), 30);
}


// 1099-NEC PDF generator (#38): one printable summary per payer.
async function generate1099Pdfs(owedForms, year) {
  const s = Settings.get();
  // Build a single multi-page document; each payer gets its own page.
  const wrapper = document.createElement("div");
  owedForms.forEach(([payer, total], idx) => {
    const html = `
      <div style="background:#fff;color:#111;padding:36px;font-family:-apple-system,sans-serif;line-height:1.5;${idx > 0 ? "page-break-before:always;" : ""}">
        <div style="border:2px solid #111;padding:18px;border-radius:8px">
          <div style="display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:14px">
            <div>
              <div style="font-size:18px;font-weight:800">FORM 1099-NEC SUMMARY · ${year}</div>
              <div style="color:#444;font-size:12px">For nonemployee compensation. Submit official IRS form to the recipient by Jan 31.</div>
            </div>
            <div style="text-align:right;font-size:11px;color:#444">
              Generated ${new Date().toLocaleDateString()}
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:18px">
            <div>
              <div style="font-size:10px;color:#666;text-transform:uppercase">Payer (you)</div>
              <div style="font-weight:700">${(s.businessName || "[Your business]").replace(/</g, "&lt;")}</div>
              <div style="white-space:pre-wrap;color:#444;font-size:13px">${(s.address || "[address]").replace(/</g, "&lt;")}</div>
              <div style="color:#444;font-size:13px">${(s.email || "").replace(/</g, "&lt;")}</div>
              ${s.invoiceTemplate?.taxId ? `<div style="font-size:12px;margin-top:4px">EIN: ${s.invoiceTemplate.taxId.replace(/</g, "&lt;")}</div>` : ""}
            </div>
            <div>
              <div style="font-size:10px;color:#666;text-transform:uppercase">Recipient</div>
              <div style="font-weight:700">${payer.replace(/</g, "&lt;")}</div>
              <div style="color:#444;font-size:13px">[recipient address — fill in on official form]</div>
              <div style="color:#444;font-size:13px">[recipient TIN]</div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;margin-top:8px">
            <tr style="background:#f3f3f3">
              <td style="padding:10px;border:1px solid #ccc;width:60%"><strong>Box 1 — Nonemployee compensation</strong></td>
              <td style="padding:10px;border:1px solid #ccc;text-align:right;font-size:18px"><strong>$${total.toFixed(2)}</strong></td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #ccc">Box 4 — Federal income tax withheld</td>
              <td style="padding:10px;border:1px solid #ccc;text-align:right">$0.00</td>
            </tr>
          </table>
          <div style="margin-top:18px;font-size:11px;color:#666">
            This is an internal summary (RodBooks). File the official IRS Form 1099-NEC at <em>irs.gov/forms-pubs/about-form-1099-nec</em> or via your filing service. Recipient TIN required on the official form.
          </div>
        </div>
      </div>
    `;
    const div = document.createElement("div");
    div.innerHTML = html;
    wrapper.append(div.firstElementChild);
  });
  toast(`Generating ${owedForms.length} 1099 summar${owedForms.length === 1 ? "y" : "ies"}…`);
  try {
    await withHtml2Pdf((html2pdf) => html2pdf().set({
      margin: 8,
      filename: `1099-NEC-${year}.pdf`,
      html2canvas: { scale: 2, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    }).from(wrapper).save());
  } catch (e) { toast(e.message, "warn", 4000); }
}

// Year-end tax PDF (#39). Single printable doc with P&L, Schedule C totals,
// SE-tax breakdown, mileage, depreciation, sales tax, 1099 summary.
async function downloadYearEndPdf(yyyy) {
  const settings = Settings.get();
  const allDeals = Deals.all();
  const allBills = Bills.all();
  const yDeals = allDeals.filter((d) => d.paid && (d.paidDate || "").startsWith(yyyy));
  const yBills = allBills.filter((b) => (b.date || "").startsWith(yyyy));
  const grossIncome = yDeals.reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
  const totalBills = yBills.reduce((s, b) => s + (+b.amount || 0), 0);
  // Box totals — skip personal / pre-tax bills (same rule as the live view).
  const boxes = {};
  yBills.forEach((b) => {
    if (b.taxStatus === "personal" || b.taxStatus === "preTax") return;
    const meta = SCHED_C[b.category] || SCHED_C.Other;
    const amt = b.category === "Meals" ? (+b.amount || 0) * 0.5 : (+b.amount || 0);
    boxes[meta.label] = (boxes[meta.label] || 0) + amt;
  });
  const totalDed = Object.values(boxes).reduce((a, b) => a + b, 0);
  const netSE = Math.max(0, grossIncome - totalDed);
  const seBase = netSE * 0.9235;
  const seTax = Math.min(seBase, 168600) * 0.124 + seBase * 0.029 + Math.max(0, seBase - 200000) * 0.009;
  const totalEst = seTax + Math.max(0, netSE - seTax / 2) * (settings.taxRate || 0.3) + netSE * (settings.stateRate || 0.05);
  const mileage = (window.localStorage.getItem("rodbooks:v1") ? null : null); // not used
  const html = `
    <div style="background:#fff;color:#111;padding:36px;font-family:-apple-system,sans-serif;line-height:1.5">
      <div style="display:flex;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:14px;margin-bottom:18px">
        <div>
          <div style="font-size:22px;font-weight:800">${escapeHtml(settings.businessName || "Creator business")}</div>
          <div style="color:#666;font-size:12px">${escapeHtml(settings.email || "")}</div>
          <div style="color:#666;font-size:12px;white-space:pre-wrap">${escapeHtml(settings.address || "")}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:800;color:#22c55e">YEAR-END TAX SUMMARY</div>
          <div style="color:#666;font-size:13px">Tax year ${yyyy}</div>
          ${settings.invoiceTemplate?.taxId ? `<div style="font-size:11px;color:#666">${escapeHtml(settings.invoiceTemplate.taxId)}</div>` : ""}
        </div>
      </div>

      <h2 style="font-size:14px;text-transform:uppercase;color:#666;margin:0 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px">Income</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td>Gross income (cash)</td><td style="text-align:right">${fmtMoney(grossIncome)}</td></tr>
        <tr><td>Total expenses</td><td style="text-align:right">${fmtMoney(totalBills)}</td></tr>
        <tr style="border-top:2px solid #111"><td style="font-weight:700">Net SE income</td><td style="text-align:right;font-weight:700">${fmtMoney(netSE)}</td></tr>
      </table>

      <h2 style="font-size:14px;text-transform:uppercase;color:#666;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px">Schedule C — box totals</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${Object.entries(boxes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${fmtMoney(v)}</td></tr>`).join("")}
        <tr style="border-top:2px solid #111"><td style="font-weight:700">Total deductions</td><td style="text-align:right;font-weight:700">${fmtMoney(totalDed)}</td></tr>
      </table>

      <h2 style="font-size:14px;text-transform:uppercase;color:#666;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px">Self-employment tax</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td>SE base (Net × 92.35%)</td><td style="text-align:right">${fmtMoney(seBase)}</td></tr>
        <tr><td>SE tax</td><td style="text-align:right">${fmtMoney(seTax)}</td></tr>
        <tr style="border-top:2px solid #111"><td style="font-weight:700">Total estimated federal + state</td><td style="text-align:right;font-weight:700">${fmtMoney(totalEst)}</td></tr>
      </table>

      <h2 style="font-size:14px;text-transform:uppercase;color:#666;margin:18px 0 6px;border-bottom:1px solid #ddd;padding-bottom:4px">Top brands (paid)</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        ${(function () {
          const m = {};
          yDeals.forEach((d) => { m[d.company] = (m[d.company] || 0) + (+d.paidAmount || netFee(d)); });
          return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td style="text-align:right">${fmtMoney(v)}</td></tr>`).join("");
        })()}
      </table>

      <div style="margin-top:32px;color:#999;font-size:11px;text-align:center">Generated by RodBooks · ${new Date().toLocaleString()}</div>
    </div>
  `;
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  try {
    await withHtml2Pdf((html2pdf) => html2pdf().set({
      margin: 8,
      filename: `rodbooks-yearend-${yyyy}.pdf`,
      html2canvas: { scale: 2, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    }).from(wrapper).save());
    toast(`Year-end ${yyyy} PDF exported`);
  } catch (e) { toast(e.message, "warn", 4000); }
}

// Audit pack export (#40): bundle CSVs of deals/bills/mileage/payments + a summary as JSON download.
function exportAuditPack(year) {
  const deals = Deals.all().filter((d) => (d.paidDate || d.serviceDate || "").startsWith(year));
  const bills = Bills.all().filter((b) => (b.date || "").startsWith(year));
  const payments = TaxPayments.all().filter((p) => String(p.year) === year);

  const dealsCsv = toCSV(deals, [
    { key: "company", label: "Brand" },
    { key: "svc", label: "Service" },
    { key: "fee", label: "Fee" },
    { key: "paidAmount", label: "Paid" },
    { key: "paidDate", label: "Paid Date" },
    { key: "invoiceNumber", label: "Invoice #" },
    { key: "invoiceDate", label: "Invoice Date" },
    { key: "transactionId", label: "Transaction" },
    { key: "contractUrl", label: "Contract" },
    { key: "invoiceUrl", label: "Invoice URL" },
  ]);
  const billsCsv = toCSV(bills, [
    { key: "date", label: "Date" }, { key: "vendor", label: "Vendor" }, { key: "category", label: "Category" },
    { key: "amount", label: "Amount" }, { key: "payMethod", label: "Method" }, { key: "receiptUrl", label: "Receipt" },
  ]);
  const paymentsCsv = toCSV(payments, [
    { key: "date", label: "Date" }, { key: "quarter", label: "Quarter" }, { key: "amount", label: "Amount" },
    { key: "method", label: "Method" }, { key: "notes", label: "Notes" },
  ]);

  const bundle = `RodBooks audit pack · ${year}\n` +
    `Generated: ${new Date().toISOString()}\n` +
    `\n=== DEALS (${deals.length}) ===\n` + dealsCsv +
    `\n\n=== BILLS (${bills.length}) ===\n` + billsCsv +
    `\n\n=== ESTIMATED TAX PAYMENTS (${payments.length}) ===\n` + paymentsCsv;

  downloadFile(`rodbooks-audit-pack-${year}.txt`, bundle, "text/plain");
  toast(`Audit pack ${year} exported`);
}
