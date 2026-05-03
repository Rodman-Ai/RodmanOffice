import { el, fmtMoney, fmtDate, fmtDateShort, debounce, todayISO } from "../utils.js";
import { Bills, subscribe, toCSV, downloadFile } from "../store.js";
import { openBillForm } from "../forms.js";
import { openModal, confirmDialog, toast } from "../ui.js";

const FILTER_KEY = "rodbooks:filters:bills";
function loadFilters() { try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; } }
function saveFilters(f) { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); }

export default function bills() {
  const node = el("div", {});
  let filters = { search: "", category: "all", year: "all", sort: "date:desc", ...loadFilters() };

  const render = () => {
    const all = Bills.all();
    const cats = Array.from(new Set(all.map((b) => b.category).filter(Boolean))).sort();
    const years = Array.from(new Set(all.map((b) => (b.date || "").slice(0, 4)).filter(Boolean))).sort().reverse();

    const filtered = all.filter((b) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!`${b.vendor} ${b.notes} ${b.category}`.toLowerCase().includes(q)) return false;
      }
      if (filters.category !== "all" && b.category !== filters.category) return false;
      if (filters.year !== "all" && (b.date || "").slice(0, 4) !== filters.year) return false;
      return true;
    });
    const [sortKey, sortDir] = filters.sort.split(":");
    filtered.sort((a, b) => {
      const av = sortKey === "amount" ? +a.amount : a[sortKey] || "";
      const bv = sortKey === "amount" ? +b.amount : b[sortKey] || "";
      const c = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -c : c;
    });

    const total = filtered.reduce((s, b) => s + (+b.amount || 0), 0);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Bills & Expenses"),
          el("div", { class: "sub" }, `${filtered.length} of ${all.length} · Total ${fmtMoney(total)}`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => openReceiptGallery() }, "Receipt gallery"),
          el("button", { class: "btn", onclick: () => exportCsv() }, "Export CSV"),
          el("button", { class: "btn primary", onclick: () => openBillForm() }, "+ New bill"),
        ),
      ),
      el("div", { class: "table-wrap" },
        el("div", { class: "table-toolbar" },
          (function () {
            const i = el("input", { class: "input search", placeholder: "Search vendor or category", value: filters.search });
            i.addEventListener("input", debounce((e) => { filters.search = e.target.value; saveFilters(filters); render(); }, 150));
            return i;
          })(),
          (function () {
            const s = el("select", { class: "select" });
            for (const o of [{ value: "all", label: "All categories" }, ...cats.map((c) => ({ value: c, label: c }))]) {
              const opt = el("option", { value: o.value }, o.label);
              if (o.value === filters.category) opt.selected = true;
              s.append(opt);
            }
            s.addEventListener("change", () => { filters.category = s.value; saveFilters(filters); render(); });
            return s;
          })(),
          (function () {
            const s = el("select", { class: "select" });
            for (const o of [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: y, label: y }))]) {
              const opt = el("option", { value: o.value }, o.label);
              if (o.value === filters.year) opt.selected = true;
              s.append(opt);
            }
            s.addEventListener("change", () => { filters.year = s.value; saveFilters(filters); render(); });
            return s;
          })(),
        ),
        el("div", { class: "table-scroll" },
          filtered.length === 0
            ? el("div", { class: "empty" },
                el("div", { class: "ico" }, "↧"),
                el("div", {}, "No bills match. Add one to start tracking expenses."),
                el("div", { style: { marginTop: 12 } }, el("button", { class: "btn primary", onclick: () => openBillForm() }, "+ Add a bill")),
              )
            : (function () {
                const t = el("table", { class: "data" });
                const arrow = (k) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
                const setSort = (k) => { const dir = filters.sort === `${k}:asc` ? "desc" : "asc"; filters.sort = `${k}:${dir}`; saveFilters(filters); render(); };
                t.append(el("thead", {}, el("tr", {},
                  el("th", { onclick: () => setSort("date") }, "Date" + arrow("date")),
                  el("th", { onclick: () => setSort("vendor") }, "Vendor" + arrow("vendor")),
                  el("th", { onclick: () => setSort("category") }, "Category" + arrow("category")),
                  el("th", {}, "Recurring"),
                  el("th", { class: "num", onclick: () => setSort("amount") }, "Amount" + arrow("amount")),
                  el("th", {}, "Paid"),
                  el("th", {}, "Method"),
                  el("th", {}, ""),
                )));
                const tbody = el("tbody");
                filtered.forEach((b) => {
                  tbody.append(el("tr", { onclick: () => openBillForm(b) },
                    el("td", { class: "small muted" }, fmtDate(b.date) || "—"),
                    el("td", {}, b.vendor),
                    el("td", {}, el("span", { class: "pill gray" }, b.category || "—")),
                    el("td", { class: "small muted" }, b.recurring || "—"),
                    el("td", { class: "num" }, fmtMoney(b.amount)),
                    el("td", {}, el("span", { class: `pill ${b.paid ? "green" : "amber"}` }, b.paid ? "Paid" : "Due")),
                    el("td", { class: "small muted" }, b.payMethod || "—"),
                    el("td", {},
                      el("button", { class: "btn sm danger", onclick: async (e) => {
                        e.stopPropagation();
                        const ok = await confirmDialog({ title: "Delete bill?", body: `Remove "${b.vendor}"?`, danger: true, confirmLabel: "Delete" });
                        if (ok) { Bills.remove(b.id); toast("Deleted"); }
                      } }, "Delete"),
                    ),
                  ));
                });
                t.append(tbody);
                return t;
              })(),
        ),
      ),
    );
  };

  function exportCsv() {
    const csv = toCSV(Bills.all(), [
      { key: "date", label: "Date" },
      { key: "vendor", label: "Vendor" },
      { key: "category", label: "Category" },
      { key: "amount", label: "Amount" },
      { key: "paid", label: "Paid", value: (b) => b.paid ? "yes" : "no" },
      { key: "paidDate", label: "Paid Date" },
      { key: "payMethod", label: "Pay Method" },
      { key: "recurring", label: "Recurring" },
      { key: "receiptUrl", label: "Receipt" },
      { key: "notes", label: "Notes" },
    ]);
    downloadFile(`rodbooks-bills-${todayISO()}.csv`, csv, "text/csv");
    toast("Exported bills CSV");
  }

  function openReceiptGallery() {
    const withReceipts = Bills.all().filter((b) => b.receiptUrl).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const grid = el("div", { class: "receipt-grid" });
    if (withReceipts.length === 0) {
      grid.append(el("div", { class: "empty small" }, "No receipts attached yet. Add a receipt URL to a bill to surface it here."));
    } else {
      withReceipts.forEach((b) => {
        const isImg = /^data:image\//.test(b.receiptUrl) || /\.(png|jpe?g|gif|webp|heic|avif)$/i.test(b.receiptUrl);
        grid.append(el("div", { class: "receipt-card", onclick: () => openBillForm(b) },
          isImg
            ? el("img", { src: b.receiptUrl, loading: "lazy", style: { width: "100%", height: "120px", objectFit: "cover", borderRadius: "6px" } })
            : el("div", { class: "receipt-doc" }, "📄"),
          el("div", { class: "small", style: { marginTop: 6, fontWeight: 600 } }, b.vendor),
          el("div", { class: "small muted" }, `${fmtDateShort(b.date)} · ${fmtMoney(b.amount)}`),
          el("a", { class: "small muted", href: b.receiptUrl, target: "_blank", rel: "noreferrer", onclick: (e) => e.stopPropagation() }, "Open ↗"),
        ));
      });
    }
    openModal({ title: `Receipts (${withReceipts.length})`, body: grid, wide: true });
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}
