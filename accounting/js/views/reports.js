import { el, fmtMoney, fmtMoneyShort, monthKey, monthLabel, netFee, serviceMeta, dsoOf, agingBucket, dueDate, daysPastDue, kpi } from "../utils.js";
import { Deals, Bills, Settings, subscribe } from "../store.js";

export default function reports() {
  const node = el("div", {});
  let chart;
  let year = String(new Date().getFullYear());

  const render = () => {
    const deals = Deals.all();
    const bills = Bills.all();
    const settings = Settings.get();

    const yearsSet = new Set([year]);
    deals.forEach((d) => { const y = (d.serviceDate || d.paidDate || d.invoiceDate || "").slice(0, 4); if (y) yearsSet.add(y); });
    bills.forEach((b) => { const y = (b.date || "").slice(0, 4); if (y) yearsSet.add(y); });
    const years = Array.from(yearsSet).sort().reverse();

    const yDeals = deals.filter((d) => (d.serviceDate || d.paidDate || d.invoiceDate || "").startsWith(year));
    const yBills = bills.filter((b) => (b.date || "").startsWith(year));

    const grossIncome = yDeals.reduce((s, d) => s + (+d.fee || 0), 0);
    const partnerFees = yDeals.reduce((s, d) => s + (+d.fee || 0) * ((+d.partnerFeePct || 0) / 100), 0);
    const netIncome = yDeals.reduce((s, d) => s + netFee(d), 0);
    const collected = yDeals.filter((d) => d.paid).reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
    const expenses = yBills.reduce((s, b) => s + (+b.amount || 0), 0);
    const profit = collected - expenses;
    const taxReserve = profit * (settings.taxRate || 0.3);

    // Income by brand
    const byBrand = {};
    yDeals.forEach((d) => { byBrand[d.company] = (byBrand[d.company] || 0) + netFee(d); });
    const brandRows = Object.entries(byBrand).sort((a, b) => b[1] - a[1]);

    // Expense by category
    const byCat = {};
    yBills.forEach((b) => { byCat[b.category || "Other"] = (byCat[b.category || "Other"] || 0) + (+b.amount || 0); });
    const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

    // Monthly profit
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
    const incMonth = Object.fromEntries(months.map((m) => [m, 0]));
    const expMonth = Object.fromEntries(months.map((m) => [m, 0]));
    yDeals.forEach((d) => { const k = monthKey(d.paidDate || d.serviceDate || d.invoiceDate); if (k in incMonth) incMonth[k] += netFee(d); });
    yBills.forEach((b) => { const k = monthKey(b.date); if (k in expMonth) expMonth[k] += (+b.amount || 0); });

    // Quarterly cash collected & estimated tax
    const qData = quarterlyBreakdown(deals.filter((d) => d.paid && (d.paidDate || "").startsWith(year)), settings.taxRate || 0.3);
    // Margin by service
    const svcMargin = serviceMargin(yDeals, yBills);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Reports"),
          el("div", { class: "sub" }, "Profit & loss, expense breakdown, and tax estimates."),
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
          el("a", { class: "btn", href: "#/reports/custom" }, "Custom pivot →"),
          el("button", { class: "btn", title: "AI suggestions for next week", onclick: async () => {
            const { openCoachMode } = await import("../aiActions.js");
            openCoachMode();
          } }, "Coach mode"),
          el("button", { class: "btn", onclick: async () => {
            const { previewDigest } = await import("../digest.js");
            previewDigest();
          } }, "Weekly digest"),
          el("button", { class: "btn", onclick: async () => {
            const { downloadDigestPdf } = await import("../digest.js");
            try { await downloadDigestPdf(); } catch (e) { (await import("../ui.js")).toast(e.message, "warn"); }
          } }, "Download digest PDF"),
          el("button", { class: "btn", onclick: () => window.print() }, "Print"),
        ),
      ),

      el("div", { class: "kpi-grid" },
        kpi("Gross income", fmtMoney(grossIncome)),
        kpi("Partner fees", `−${fmtMoney(partnerFees)}`),
        kpi("Net income (booked)", fmtMoney(netIncome)),
        kpi("Cash collected", fmtMoney(collected)),
        kpi("Expenses", `−${fmtMoney(expenses)}`),
        kpi("Profit (cash − exp)", fmtMoney(profit), profit >= 0 ? "up" : "down"),
        kpi("Tax reserve", fmtMoney(taxReserve), null, `at ${Math.round((settings.taxRate || .3) * 100)}%`),
      ),

      el("div", { class: "card" },
        el("h3", {}, `Profit & Loss · ${year}`),
        el("table", { class: "data", style: { minWidth: "0" } },
          el("tbody", {},
            row2("Gross income", fmtMoney(grossIncome)),
            row2("Less: partner fees", `−${fmtMoney(partnerFees)}`, true),
            row2("Net revenue", fmtMoney(netIncome), true),
            row2("Operating expenses", `−${fmtMoney(expenses)}`),
            row2("Net profit (booked)", fmtMoney(netIncome - expenses), true, true),
            row2("Cash collected", fmtMoney(collected)),
            row2("Cash profit", fmtMoney(profit), true, true),
          ),
        ),
      ),

      el("div", { class: "dash-grid" },
        el("div", { class: "card" },
          el("h3", {}, "Income by brand"),
          brandRows.length === 0 ? el("div", { class: "empty small" }, "No income yet.")
            : el("table", { class: "data" },
                el("tbody", {}, ...brandRows.map(([k, v]) => el("tr", {},
                  el("td", {}, k || "—"),
                  el("td", { class: "num" }, fmtMoney(v)),
                  el("td", { class: "num small muted" }, `${Math.round((v / Math.max(1, netIncome)) * 100)}%`),
                ))),
              ),
        ),
        el("div", { class: "card" },
          el("h3", {}, "Expenses by category"),
          catRows.length === 0 ? el("div", { class: "empty small" }, "No expenses yet.")
            : el("table", { class: "data" },
                el("tbody", {}, ...catRows.map(([k, v]) => el("tr", {},
                  el("td", {}, k),
                  el("td", { class: "num" }, fmtMoney(v)),
                  el("td", { class: "num small muted" }, `${Math.round((v / Math.max(1, expenses)) * 100)}%`),
                ))),
              ),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, `Monthly net · ${year}`),
        el("div", { class: "chart-wrap" }, el("canvas", { id: "monthly-chart" })),
      ),

      el("div", { class: "card" },
        el("h3", {}, `Quarterly estimated tax · ${year}`),
        el("div", { class: "small muted", style: { marginBottom: 8 } }, `Reserve rate ${Math.round((settings.taxRate || 0.3) * 100)}% of cash collected. US estimated-tax due dates shown for reference.`),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Quarter"),
            el("th", {}, "Period"),
            el("th", {}, "Due"),
            el("th", { class: "num" }, "Cash collected"),
            el("th", { class: "num" }, "Reserve"),
          )),
          el("tbody", {}, ...qData.map((q) => el("tr", {},
            el("td", { style: { fontWeight: 600 } }, q.label),
            el("td", { class: "small muted" }, q.period),
            el("td", { class: "small muted" }, q.due),
            el("td", { class: "num" }, fmtMoney(q.collected)),
            el("td", { class: "num" }, fmtMoney(q.reserve)),
          ))),
        ),
      ),

      // Quarterly profit attribution stack (#77)
      (function () {
        const yyyy = year;
        const dealsY = Deals.all().filter((d) => d.paid && (d.paidDate || "").startsWith(yyyy));
        const billsY = Bills.all().filter((b) => (b.date || "").startsWith(yyyy));
        const labels = ["Q1", "Q2", "Q3", "Q4"];
        const incomeQ = [0, 0, 0, 0];
        const expenseQ = [0, 0, 0, 0];
        dealsY.forEach((d) => {
          const m = +(d.paidDate || "").slice(5, 7) - 1;
          const q = m <= 2 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
          if (m >= 0) incomeQ[q] += (+d.paidAmount || netFee(d));
        });
        billsY.forEach((b) => {
          const m = +(b.date || "").slice(5, 7) - 1;
          const q = m <= 2 ? 0 : m <= 4 ? 1 : m <= 7 ? 2 : 3;
          if (m >= 0) expenseQ[q] += (+b.amount || 0);
        });
        const profitQ = incomeQ.map((v, i) => v - expenseQ[i]);
        const max = Math.max(1, ...incomeQ, ...expenseQ);
        return el("div", { class: "card" },
          el("h3", {}, `Quarterly profit attribution · ${year}`),
          el("div", { class: "small muted", style: { marginBottom: 8 } }, "Cash income vs. expenses by quarter, with net profit overlay."),
          el("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "10px" } },
            ...labels.map((l, i) => el("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" } },
              el("div", { style: { display: "flex", height: "120px", alignItems: "flex-end", gap: "4px", width: "100%", justifyContent: "center" } },
                el("div", { style: { width: "30%", height: `${(incomeQ[i] / max) * 100}%`, background: "var(--accent)", borderRadius: "4px 4px 0 0" }, title: fmtMoney(incomeQ[i]) }),
                el("div", { style: { width: "30%", height: `${(expenseQ[i] / max) * 100}%`, background: "var(--danger)", borderRadius: "4px 4px 0 0" }, title: fmtMoney(expenseQ[i]) }),
              ),
              el("div", { style: { fontWeight: 600, fontSize: "12px" } }, l),
              el("div", { class: "small", style: { color: profitQ[i] >= 0 ? "var(--accent)" : "var(--danger)", fontWeight: 600 } }, fmtMoney(profitQ[i])),
              el("div", { class: "small muted" }, `+${fmtMoneyShort(incomeQ[i])} -${fmtMoneyShort(expenseQ[i])}`),
            )),
          ),
        );
      })(),

      el("div", { class: "card" },
        el("h3", {}, "Margin by service type"),
        el("div", { class: "small muted", style: { marginBottom: 8 } }, "Allocates expenses pro-rata by income share. Use as a rough guide."),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {},
            el("th", {}, "Service"),
            el("th", { class: "num" }, "Deals"),
            el("th", { class: "num" }, "Net income"),
            el("th", { class: "num" }, "Allocated cost"),
            el("th", { class: "num" }, "Profit"),
            el("th", { class: "num" }, "Margin"),
          )),
          el("tbody", {}, ...svcMargin.map((r) => el("tr", {},
            el("td", {}, r.label),
            el("td", { class: "num" }, r.count),
            el("td", { class: "num" }, fmtMoney(r.income)),
            el("td", { class: "num muted" }, fmtMoney(r.cost)),
            el("td", { class: "num" }, fmtMoney(r.profit)),
            el("td", { class: "num" }, `${r.margin.toFixed(0)}%`),
          ))),
        ),
      ),

      // ---- DSO trend (#74) + Aging buckets (#76) ----
      (function () {
        const dso = dsoOf(yDeals);
        const open = deals.filter((d) => !d.paid && d.invoiceDate);
        const buckets = { current: 0, "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
        open.forEach((d) => { const k = agingBucket(d); if (k && buckets[k] != null) buckets[k] += netFee(d); });
        const totalOpen = Object.values(buckets).reduce((a, b) => a + b, 0);
        return el("div", { class: "dash-grid" },
          el("div", { class: "card" },
            el("h3", {}, `Days Sales Outstanding · ${year}`),
            el("div", { class: "kpi-value" }, `${dso}d`),
            el("div", { class: "kpi-sub" }, `Median days from invoice to paid (n=${yDeals.filter((d) => d.paid && d.invoiceDate && d.paidDate).length})`),
          ),
          el("div", { class: "card" },
            el("h3", {}, "Invoice aging (open)"),
            el("table", { class: "data" },
              el("tbody", {}, ...Object.entries(buckets).map(([k, v]) =>
                el("tr", {},
                  el("td", {}, el("span", { class: `pill ${k === "current" ? "blue" : k === "90+" ? "red" : k.startsWith("6") ? "amber" : "gray"}` }, k)),
                  el("td", { class: "num" }, fmtMoney(v)),
                  el("td", { class: "num small muted" }, totalOpen ? `${Math.round((v / totalOpen) * 100)}%` : "—"),
                ),
              )),
            ),
          ),
        );
      })(),

      // ---- Brand cohort retention (#71) + Concentration (#72) ----
      (function () {
        const allDeals = Deals.all();
        const acquiredByYear = {};
        const brandFirst = {};
        allDeals.forEach((d) => {
          const sd = (d.serviceDate || d.paidDate || "").slice(0, 4);
          if (!sd) return;
          if (!brandFirst[d.company] || sd < brandFirst[d.company]) brandFirst[d.company] = sd;
        });
        Object.entries(brandFirst).forEach(([brand, firstYr]) => {
          (acquiredByYear[firstYr] = acquiredByYear[firstYr] || []).push(brand);
        });
        const cohortYears = Object.keys(acquiredByYear).sort();
        const horizon = ["+0", "+1", "+2", "+3", "+4", "+5"];

        const cohortRows = cohortYears.map((cy) => {
          const cohortBrands = acquiredByYear[cy];
          const row = { cohort: cy, size: cohortBrands.length };
          horizon.forEach((h, i) => {
            const targetYr = +cy + i;
            const active = cohortBrands.filter((b) => allDeals.some((d) => d.company === b && (d.serviceDate || "").startsWith(String(targetYr)))).length;
            row[h] = cohortBrands.length ? Math.round((active / cohortBrands.length) * 100) : 0;
          });
          return row;
        });

        const yearTotals = {};
        yDeals.forEach((d) => { yearTotals[d.company] = (yearTotals[d.company] || 0) + netFee(d); });
        const sortedTotals = Object.values(yearTotals).sort((a, b) => b - a);
        const totalY = sortedTotals.reduce((a, b) => a + b, 0);
        const top1 = sortedTotals[0] || 0;
        const top3 = sortedTotals.slice(0, 3).reduce((a, b) => a + b, 0);
        const hhi = Math.round(sortedTotals.reduce((s, v) => s + Math.pow(v / Math.max(1, totalY) * 100, 2), 0));
        const concPct = totalY ? Math.round((top1 / totalY) * 100) : 0;
        const concClass = concPct >= 40 ? "red" : concPct >= 25 ? "amber" : "green";

        return el("div", { class: "dash-grid" },
          el("div", { class: "card" },
            el("h3", {}, "Brand-cohort retention (% of cohort active)"),
            cohortYears.length === 0
              ? el("div", { class: "empty small" }, "No deals yet.")
              : el("table", { class: "data" },
                  el("thead", {}, el("tr", {},
                    el("th", {}, "Cohort"),
                    el("th", { class: "num" }, "Brands"),
                    ...horizon.map((h) => el("th", { class: "num" }, h)),
                  )),
                  el("tbody", {}, ...cohortRows.map((r) =>
                    el("tr", {},
                      el("td", { style: { fontWeight: 600 } }, r.cohort),
                      el("td", { class: "num" }, r.size),
                      ...horizon.map((h) => {
                        const v = r[h];
                        const sat = Math.min(1, v / 100);
                        return el("td", { class: "num", style: { background: `rgba(34,197,94,${sat * 0.3})`, color: v ? "var(--text)" : "var(--muted)" } }, v ? `${v}%` : "—");
                      }),
                    ),
                  )),
                ),
          ),
          el("div", { class: "card" },
            el("h3", {}, `Revenue concentration · ${year}`),
            el("div", { class: "kpi-value" }, `${concPct}%`),
            el("div", { class: "kpi-sub" }, "Share from top brand"),
            el("div", { style: { marginTop: 12 } },
              el("div", { class: "spread small" }, el("span", { class: "muted" }, "Top 3 share"), el("strong", {}, `${totalY ? Math.round(top3 / totalY * 100) : 0}%`)),
              el("div", { class: "spread small" }, el("span", { class: "muted" }, "Herfindahl–Hirschman index"), el("strong", {}, String(hhi))),
              el("div", { class: "spread small" }, el("span", { class: "muted" }, "Brand count"), el("strong", {}, String(sortedTotals.length))),
            ),
            el("div", { style: { marginTop: 10 } },
              el("span", { class: `pill ${concClass}` },
                concPct >= 40 ? "High concentration risk"
                : concPct >= 25 ? "Moderate concentration"
                : "Healthy diversification"),
            ),
          ),
        );
      })(),
    );

    requestAnimationFrame(() => {
      if (chart) chart.destroy();
      const ctx = node.querySelector("#monthly-chart");
      if (!ctx || !window.Chart) return;
      chart = new window.Chart(ctx, {
        type: "bar",
        data: {
          labels: months.map(monthLabel),
          datasets: [
            { label: "Income", data: months.map((m) => incMonth[m]), backgroundColor: "#22c55e", borderRadius: 4 },
            { label: "Expenses", data: months.map((m) => -expMonth[m]), backgroundColor: "#ef4444", borderRadius: 4 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: "#8a93a6" } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmtMoney(Math.abs(c.parsed.y))}` } } },
          scales: {
            x: { grid: { color: "#232936" }, ticks: { color: "#8a93a6" } },
            y: { grid: { color: "#232936" }, ticks: { color: "#8a93a6", callback: (v) => fmtMoneyShort(v) } },
          },
        },
      });
    });
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: () => { unsub(); if (chart) chart.destroy(); } };
}


function quarterlyBreakdown(paidDeals, rate) {
  const Q = [
    { label: "Q1", months: [0, 1, 2], period: "Jan–Mar", due: "Apr 15" },
    { label: "Q2", months: [3, 4], period: "Apr–May", due: "Jun 15" },
    { label: "Q3", months: [5, 6, 7], period: "Jun–Aug", due: "Sep 15" },
    { label: "Q4", months: [8, 9, 10, 11], period: "Sep–Dec", due: "Jan 15" },
  ];
  return Q.map((q) => {
    const collected = paidDeals.filter((d) => {
      const m = +(d.paidDate || "").slice(5, 7) - 1;
      return q.months.includes(m);
    }).reduce((s, d) => s + (+d.paidAmount || 0), 0);
    return { ...q, collected, reserve: collected * rate };
  });
}

function serviceMargin(deals, bills) {
  const groups = {};
  deals.forEach((d) => {
    const k = d.svc || "—";
    if (!groups[k]) groups[k] = { svc: k, count: 0, income: 0 };
    groups[k].count += 1;
    groups[k].income += netFee(d);
  });
  const totalIncome = Object.values(groups).reduce((s, g) => s + g.income, 0);
  const totalCost = bills.reduce((s, b) => s + (+b.amount || 0), 0);
  return Object.values(groups).map((g) => {
    const cost = totalIncome ? totalCost * (g.income / totalIncome) : 0;
    const profit = g.income - cost;
    return {
      label: serviceMeta(g.svc).label,
      count: g.count,
      income: g.income,
      cost,
      profit,
      margin: g.income ? (profit / g.income) * 100 : 0,
    };
  }).sort((a, b) => b.income - a.income);
}

function row2(k, v, bold, big) {
  return el("tr", { style: bold ? { borderTop: "1px solid #2c3342" } : null },
    el("td", { style: bold ? { fontWeight: 600 } : null }, k),
    el("td", { class: "num", style: { ...(bold ? { fontWeight: 700 } : {}), ...(big ? { fontSize: "16px" } : {}) } }, v),
  );
}
