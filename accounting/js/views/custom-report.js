// Custom report builder (#78): pivot deals by chosen dimensions × measures.
// Save/load report presets via store.ReportPresets.

import { el, fmtMoney, fmtMoneyShort, monthKey, monthLabel, netFee } from "../utils.js";
import { Deals, Bills, ReportPresets, subscribe, downloadFile, toCSV } from "../store.js";
import { toast, confirmDialog } from "../ui.js";

const DIMENSIONS = {
  brand: { label: "Brand", get: (d) => d.company || "—" },
  year: { label: "Year", get: (d) => (d.serviceDate || d.paidDate || d.invoiceDate || "").slice(0, 4) || "—" },
  month: { label: "Month", get: (d) => monthKey(d.serviceDate || d.paidDate || d.invoiceDate) || "—" },
  service: { label: "Service", get: (d) => d.svc || "—" },
  paid: { label: "Paid?", get: (d) => d.paid ? "Paid" : "Outstanding" },
  payMethod: { label: "Pay method", get: (d) => d.payMethod || "—" },
};

const MEASURES = {
  count: { label: "# Deals", agg: (deals) => deals.length, fmt: (v) => String(v) },
  fee: { label: "Sum of fee", agg: (deals) => deals.reduce((s, d) => s + (+d.fee || 0), 0), fmt: fmtMoney },
  net: { label: "Sum net", agg: (deals) => deals.reduce((s, d) => s + netFee(d), 0), fmt: fmtMoney },
  avgFee: { label: "Avg fee", agg: (deals) => deals.length ? deals.reduce((s, d) => s + (+d.fee || 0), 0) / deals.length : 0, fmt: fmtMoney },
  paidCount: { label: "# Paid", agg: (deals) => deals.filter((d) => d.paid).length, fmt: (v) => String(v) },
  collected: { label: "Sum collected", agg: (deals) => deals.filter((d) => d.paid).reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0), fmt: fmtMoney },
  outstanding: { label: "Sum outstanding", agg: (deals) => deals.filter((d) => !d.paid).reduce((s, d) => s + netFee(d), 0), fmt: fmtMoney },
};

export default function customReportView() {
  const node = el("div", {});
  let row = "brand"; // dimension keys
  let col = "year";
  let measure = "net";

  const render = () => {
    const all = Deals.all();
    const presets = ReportPresets.all();

    const rowDim = DIMENSIONS[row];
    const colDim = DIMENSIONS[col];
    const meas = MEASURES[measure];

    // Build pivot
    const rowKeys = new Set(); const colKeys = new Set();
    const buckets = {};
    for (const d of all) {
      const r = rowDim.get(d); const c = colDim.get(d);
      rowKeys.add(r); colKeys.add(c);
      const k = `${r}${c}`;
      (buckets[k] = buckets[k] || []).push(d);
    }
    const sortedRows = Array.from(rowKeys).sort();
    const sortedCols = Array.from(colKeys).sort();

    const cellVal = (r, c) => meas.agg(buckets[`${r}${c}`] || []);
    const rowTotal = (r) => meas.agg(all.filter((d) => rowDim.get(d) === r));
    const colTotal = (c) => meas.agg(all.filter((d) => colDim.get(d) === c));
    const grandTotal = meas.agg(all);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Custom report"),
          el("div", { class: "sub" }, "Pivot deals by any two dimensions × measure. Save the layout as a preset for one-click recall."),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => downloadCsv(rowDim, colDim, meas, sortedRows, sortedCols, cellVal, rowTotal, colTotal, grandTotal) }, "Export CSV"),
          el("button", { class: "btn primary", onclick: () => savePreset() }, "Save preset"),
        ),
      ),
      el("div", { class: "card" },
        el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px", marginBottom: "8px" } },
          dimensionSelect("Rows", row, (v) => { row = v; render(); }),
          dimensionSelect("Columns", col, (v) => { col = v; render(); }),
          measureSelect("Measure", measure, (v) => { measure = v; render(); }),
        ),
        presets.length > 0 && el("div", { class: "row", style: { flexWrap: "wrap", gap: "6px", marginBottom: "8px" } },
          el("span", { class: "small muted" }, "Presets:"),
          ...presets.map((p) => el("span", { class: "view-chip" },
            el("button", { class: "view-chip-btn", onclick: () => { row = p.dimensions.row; col = p.dimensions.col; measure = p.measures[0]; render(); } }, p.name),
            el("button", { class: "view-chip-x", onclick: async () => {
              const ok = await confirmDialog({ title: `Delete "${p.name}"?`, danger: true, confirmLabel: "Delete" });
              if (ok) { ReportPresets.remove(p.id); render(); }
            } }, "×"),
          )),
        ),
        el("div", { class: "table-scroll" },
          (function () {
            const t = el("table", { class: "data" });
            const head = el("thead", {});
            const tr = el("tr", {}, el("th", {}, `${rowDim.label} \\ ${colDim.label}`));
            sortedCols.forEach((c) => tr.append(el("th", { class: "num" }, c === c.match(/^\d{4}-\d{2}$/) ? monthLabel(c) : c)));
            tr.append(el("th", { class: "num", style: { fontWeight: 700 } }, "Total"));
            head.append(tr);
            t.append(head);
            const body = el("tbody", {});
            sortedRows.forEach((r) => {
              const trr = el("tr", {});
              trr.append(el("td", { style: { fontWeight: 600 } }, r));
              sortedCols.forEach((c) => {
                const v = cellVal(r, c);
                trr.append(el("td", { class: "num", style: v && measure === "net" ? { background: `rgba(34,197,94,${Math.min(0.5, v / Math.max(1, grandTotal) * 4)})` } : null }, v ? meas.fmt(v) : "—"));
              });
              trr.append(el("td", { class: "num", style: { fontWeight: 700 } }, meas.fmt(rowTotal(r))));
              body.append(trr);
            });
            // Grand totals
            const tt = el("tr", { style: { borderTop: "2px solid var(--line-2)" } });
            tt.append(el("td", { style: { fontWeight: 700 } }, "Total"));
            sortedCols.forEach((c) => tt.append(el("td", { class: "num", style: { fontWeight: 700 } }, meas.fmt(colTotal(c)))));
            tt.append(el("td", { class: "num", style: { fontWeight: 700, fontSize: "15px" } }, meas.fmt(grandTotal)));
            body.append(tt);
            t.append(body);
            return t;
          })(),
        ),
      ),
    );
  };

  function savePreset() {
    const name = prompt("Name this preset");
    if (!name) return;
    ReportPresets.save({ name: name.trim(), dimensions: { row, col }, measures: [measure] });
    toast("Preset saved");
  }

  function downloadCsv(rowDim, colDim, meas, sortedRows, sortedCols, cellVal, rowTotal, colTotal, grandTotal) {
    const esc = (v) => typeof v === "number" ? String(v) : `"${String(v).replace(/"/g, '""')}"`;
    const header = [`${rowDim.label} \\ ${colDim.label}`, ...sortedCols, "Total"];
    const lines = [header.map(esc).join(",")];
    sortedRows.forEach((r) => {
      const cells = [r, ...sortedCols.map((c) => cellVal(r, c)), rowTotal(r)];
      lines.push(cells.map(esc).join(","));
    });
    lines.push(["Total", ...sortedCols.map((c) => colTotal(c)), grandTotal].map(esc).join(","));
    downloadFile(`rodbooks-pivot-${rowDim.label.toLowerCase()}-by-${colDim.label.toLowerCase()}.csv`, lines.join("\n"), "text/csv");
    toast("Pivot exported");
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function dimensionSelect(label, value, onChange) {
  const s = el("select", { class: "select" });
  Object.entries(DIMENSIONS).forEach(([k, d]) => {
    const o = el("option", { value: k }, d.label);
    if (k === value) o.selected = true;
    s.append(o);
  });
  s.addEventListener("change", () => onChange(s.value));
  return el("div", { class: "field" }, el("label", {}, label), s);
}
function measureSelect(label, value, onChange) {
  const s = el("select", { class: "select" });
  Object.entries(MEASURES).forEach(([k, m]) => {
    const o = el("option", { value: k }, m.label);
    if (k === value) o.selected = true;
    s.append(o);
  });
  s.addEventListener("change", () => onChange(s.value));
  return el("div", { class: "field" }, el("label", {}, label), s);
}
