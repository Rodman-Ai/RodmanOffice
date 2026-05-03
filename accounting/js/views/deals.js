import { el, fmtMoney, fmtDate, fmtDateShort, netFee, dealStatus, serviceMeta, escHtml, debounce, todayISO, parseDate, parseSearchOperators, dealStageAge, dueDate, daysPastDue, lateFee } from "../utils.js";
import { Deals, Contacts, Settings, DealTemplates, Agents, subscribe, downloadFile, toCSV } from "../store.js";
import { go, getQuery, setQuery } from "../router.js";
import { openDealForm } from "../forms.js";
import { confirmDialog, toast } from "../ui.js";
import { dealStageTracker } from "./timeline.js";
import { getSavedViews, saveView, deleteView } from "../prefs.js";

const FILTER_KEY = "rodbooks:filters:deals";

function loadFilters() {
  try { return JSON.parse(localStorage.getItem(FILTER_KEY)) || {}; } catch { return {}; }
}
function saveFilters(f) { localStorage.setItem(FILTER_KEY, JSON.stringify(f)); }

export function dealsList(_params, ctx = {}) {
  const node = el("div", {});
  // Filter precedence: URL query > localStorage > defaults
  const urlQ = ctx.query || getQuery();
  let filters = {
    search: "", status: "all", year: "all", svc: "all", sort: "serviceDate:desc",
    ...loadFilters(),
    ...Object.fromEntries(Object.entries(urlQ).filter(([k]) => ["search","status","year","svc","sort"].includes(k))),
  };
  let selected = new Set();

  const persist = () => {
    saveFilters(filters);
    setQuery({ search: filters.search || "", status: filters.status === "all" ? "" : filters.status, year: filters.year === "all" ? "" : filters.year, svc: filters.svc === "all" ? "" : filters.svc, sort: filters.sort === "serviceDate:desc" ? "" : filters.sort }, { replace: true });
  };

  const renderTable = () => {
    const all = Deals.all();
    const years = Array.from(new Set(all.map((d) => (d.serviceDate || d.invoiceDate || d.paidDate || "").slice(0, 4)).filter(Boolean))).sort().reverse();
    const services = Array.from(new Set(all.map((d) => d.svc).filter(Boolean)));

    const parsed = parseSearchOperators(filters.search);
    const filtered = all.filter((d) => {
      if (parsed.text) {
        const hay = `${d.company} ${d.notes} ${d.invoiceNumber} ${d.payMethod}`.toLowerCase();
        if (!hay.includes(parsed.text.toLowerCase())) return false;
      }
      const f = parsed.filters;
      if (f.brand && !(d.company || "").toLowerCase().includes(f.brand)) return false;
      if (f.svc && (d.svc || "").toLowerCase() !== f.svc) return false;
      if (typeof f.paid === "boolean" && d.paid !== f.paid) return false;
      if (f.year && (d.serviceDate || d.invoiceDate || d.paidDate || "").slice(0, 4) !== f.year) return false;
      if (f.method && !(d.payMethod || "").toLowerCase().includes(f.method)) return false;
      if (f.min != null && netFee(d) < f.min) return false;
      if (f.max != null && netFee(d) > f.max) return false;
      if (filters.status === "paid" && !d.paid) return false;
      if (filters.status === "unpaid" && d.paid) return false;
      if (filters.status === "invoiced" && !(d.invoiceDate || d.invoiceNumber)) return false;
      if (filters.status === "no_invoice" && (d.invoiceDate || d.invoiceNumber)) return false;
      if (filters.year !== "all" && (d.serviceDate || d.invoiceDate || d.paidDate || "").slice(0, 4) !== filters.year) return false;
      if (filters.svc !== "all" && (d.svc || "") !== filters.svc) return false;
      return true;
    });

    const [sortKey, sortDir] = filters.sort.split(":");
    filtered.sort((a, b) => {
      const av = sortKey === "fee" ? netFee(a) : a[sortKey] || "";
      const bv = sortKey === "fee" ? netFee(b) : b[sortKey] || "";
      const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === "desc" ? -cmp : cmp;
    });

    const totalNet = filtered.reduce((s, d) => s + netFee(d), 0);
    const totalUnpaid = filtered.filter((d) => !d.paid).reduce((s, d) => s + netFee(d), 0);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Brand Deals"),
          el("div", { class: "sub" }, `${filtered.length} of ${all.length} · Net total ${fmtMoney(totalNet)} · Unpaid ${fmtMoney(totalUnpaid)}`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => copyShareLink() }, "Share view"),
          el("button", { class: "btn", onclick: exportCsv }, "Export CSV"),
          el("button", { class: "btn primary", onclick: () => openDealForm() }, "+ New deal"),
        ),
      ),
      savedViewsBar(),
      el("div", { class: "table-wrap" },
        el("div", { class: "table-toolbar" },
          searchInput(filters.search, (v) => { filters.search = v; persist(); renderTable(); }),
          select(filters.status, [
            { value: "all", label: "All status" },
            { value: "paid", label: "Paid only" },
            { value: "unpaid", label: "Unpaid" },
            { value: "invoiced", label: "Invoiced" },
            { value: "no_invoice", label: "No invoice" },
          ], (v) => { filters.status = v; persist(); renderTable(); }),
          select(filters.year, [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: y, label: y }))],
            (v) => { filters.year = v; persist(); renderTable(); }),
          select(filters.svc, [{ value: "all", label: "All services" }, ...services.map((s) => ({ value: s, label: serviceMeta(s).label }))],
            (v) => { filters.svc = v; persist(); renderTable(); }),
          el("div", { class: "spacer" }),
          el("button", { class: "btn sm", onclick: () => promptSaveView() }, "Save view"),
        ),
        bulkBar(filtered),
        el("div", { class: "table-scroll" }, table(filtered, sortKey, sortDir, selected, {
          onSort: (k) => {
            const dir = filters.sort === `${k}:asc` ? "desc" : "asc";
            filters.sort = `${k}:${dir}`; persist(); renderTable();
          },
          onToggle: (id, on) => { if (on) selected.add(id); else selected.delete(id); renderTable(); },
          onSelectAll: (ids, on) => { if (on) ids.forEach((i) => selected.add(i)); else ids.forEach((i) => selected.delete(i)); renderTable(); },
          onTogglePaid: (d) => {
            Deals.save({ id: d.id, paid: !d.paid, paidDate: !d.paid ? (d.paidDate || todayISO()) : "", paidAmount: !d.paid ? (d.paidAmount || netFee(d)) : 0 });
            toast(!d.paid ? "Marked paid" : "Marked unpaid");
          },
        })),
      ),
    );
  };

  function savedViewsBar() {
    const views = getSavedViews();
    if (!views.length) return null;
    const wrap = el("div", { class: "saved-views" },
      el("span", { class: "small muted", style: { marginRight: 6 } }, "Views:"),
      ...views.map((v) =>
        el("span", { class: "view-chip" },
          el("button", { class: "view-chip-btn", onclick: () => { filters = { ...filters, ...v.filters }; persist(); renderTable(); toast(`Loaded "${v.name}"`); } }, v.name),
          el("button", { class: "view-chip-x", title: "Delete view", onclick: async () => {
            const ok = await confirmDialog({ title: `Delete view "${v.name}"?`, danger: true, confirmLabel: "Delete" });
            if (ok) { deleteView(v.name); renderTable(); }
          } }, "×"),
        ),
      ),
    );
    return wrap;
  }

  function promptSaveView() {
    const name = prompt("Name this view");
    if (!name) return;
    saveView(name.trim(), {
      search: filters.search,
      status: filters.status,
      year: filters.year,
      svc: filters.svc,
      sort: filters.sort,
    });
    toast(`View "${name}" saved`);
    renderTable();
  }

  function copyShareLink() {
    const url = location.href;
    navigator.clipboard.writeText(url).then(() => toast("Shareable link copied"), () => toast("Couldn't copy", "warn"));
  }

  function bulkBar(filtered) {
    if (!selected.size) return null;
    const ids = filtered.filter((d) => selected.has(d.id));
    const total = ids.reduce((s, d) => s + netFee(d), 0);
    return el("div", { class: "bulk-bar" },
      el("span", { class: "small" }, `${selected.size} selected · ${fmtMoney(total)}`),
      el("div", { class: "spacer" }),
      el("button", { class: "btn sm", onclick: () => bulkMarkPaid(ids) }, "Mark paid"),
      el("button", { class: "btn sm", onclick: () => bulkExport(ids) }, "Export selected"),
      el("button", { class: "btn sm danger", onclick: () => bulkDelete(ids) }, "Delete"),
      el("button", { class: "btn sm ghost", onclick: () => { selected.clear(); renderTable(); } }, "Clear"),
    );
  }

  async function bulkMarkPaid(ds) {
    const unpaid = ds.filter((d) => !d.paid);
    if (!unpaid.length) { toast("Nothing to mark"); return; }
    const ok = await confirmDialog({ title: `Mark ${unpaid.length} deal(s) paid?`, confirmLabel: "Mark paid" });
    if (!ok) return;
    unpaid.forEach((d) => Deals.save({ id: d.id, paid: true, paidDate: d.paidDate || todayISO(), paidAmount: d.paidAmount || netFee(d) }));
    toast(`Marked ${unpaid.length} paid`);
    selected.clear();
  }

  async function bulkDelete(ds) {
    const ok = await confirmDialog({ title: `Delete ${ds.length} deal(s)?`, body: "This cannot be undone (snapshot first if unsure).", danger: true, confirmLabel: "Delete" });
    if (!ok) return;
    ds.forEach((d) => Deals.remove(d.id));
    toast(`Deleted ${ds.length}`);
    selected.clear();
  }

  function bulkExport(ds) {
    const csv = toCSV(ds, [
      { key: "company", label: "Company" }, { key: "svc", label: "Service" }, { key: "fee", label: "Fee" },
      { key: "paidAmount", label: "Paid Amount" }, { key: "paid", label: "Paid", value: (d) => d.paid ? "yes" : "no" },
      { key: "paidDate", label: "Paid Date" }, { key: "serviceDate", label: "Service Date" },
      { key: "postDate", label: "Post Date" }, { key: "invoiceNumber", label: "Invoice #" }, { key: "notes", label: "Notes" },
    ]);
    downloadFile(`rodbooks-deals-selected-${todayISO()}.csv`, csv, "text/csv");
    toast(`Exported ${ds.length}`);
  }

  function exportCsv() {
    const all = Deals.all();
    const csv = toCSV(all, [
      { key: "company", label: "Company" },
      { key: "svc", label: "Service" },
      { key: "fee", label: "Fee" },
      { key: "partnerFeePct", label: "Partner Fee %" },
      { key: "paidAmount", label: "Paid Amount" },
      { key: "paid", label: "Paid", value: (d) => d.paid ? "yes" : "no" },
      { key: "paidDate", label: "Paid Date" },
      { key: "payMethod", label: "Pay Method" },
      { key: "serviceDate", label: "Service Date" },
      { key: "postDate", label: "Post Date" },
      { key: "draftDue", label: "Draft Due" },
      { key: "invoiceNumber", label: "Invoice #" },
      { key: "invoiceDate", label: "Invoice Date" },
      { key: "invoiceUrl", label: "Invoice URL" },
      { key: "invoiceTo", label: "Invoice To" },
      { key: "contractUrl", label: "Contract URL" },
      { key: "briefUrl", label: "Brief URL" },
      { key: "draftUrl", label: "Draft URL" },
      { key: "portalUrl", label: "Portal URL" },
      { key: "notesUrl", label: "Notes URL" },
      { key: "transactionId", label: "Transaction" },
      { key: "notes", label: "Notes" },
    ]);
    downloadFile(`rodbooks-deals-${todayISO()}.csv`, csv, "text/csv");
    toast("Exported deals CSV");
  }

  const unsub = subscribe(renderTable);
  renderTable();
  return { node, unmount: unsub };
}

function searchInput(value, onChange) {
  const i = el("input", { class: "input search", placeholder: "Search… try: brand:lumira paid:no >1000", value, title: "Operators: brand:NAME paid:yes/no svc:v year:2025 method:stripe >500 <2000" });
  i.addEventListener("input", debounce((e) => onChange(e.target.value), 150));
  return i;
}
function select(value, options, onChange) {
  const s = el("select", { class: "select" });
  for (const o of options) {
    const opt = el("option", { value: o.value }, o.label);
    if (String(o.value) === String(value)) opt.selected = true;
    s.append(opt);
  }
  s.addEventListener("change", () => onChange(s.value));
  return s;
}

function table(rows, sortKey, sortDir, selected, h) {
  if (!rows.length) {
    return el("div", { class: "empty" },
      el("div", { class: "ico" }, "★"),
      el("div", {}, "No deals match your filters."),
      el("div", { style: { marginTop: 12 } },
        el("button", { class: "btn primary", onclick: () => openDealForm() }, "+ Add a deal"),
      ),
    );
  }
  const arrow = (k) => sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "";
  const headers = [
    { k: "company", l: "Brand" },
    { k: "svc", l: "Type" },
    { k: "serviceDate", l: "Service" },
    { k: "postDate", l: "Post" },
    { k: "draftDue", l: "Draft Due" },
    { k: "fee", l: "Net", num: true },
    { k: "paid", l: "Status" },
    { k: "stageAge", l: "Stage age" },
    { k: "paidDate", l: "Paid" },
    { k: "invoiceNumber", l: "Invoice" },
  ];
  const t = el("table", { class: "data" });
  const ids = rows.map((r) => r.id);
  const allChecked = ids.every((id) => selected.has(id));
  const someChecked = !allChecked && ids.some((id) => selected.has(id));
  const headCheck = el("input", { type: "checkbox", "aria-label": "Select all" });
  headCheck.checked = allChecked;
  headCheck.indeterminate = someChecked;
  headCheck.addEventListener("click", (e) => { e.stopPropagation(); h.onSelectAll(ids, headCheck.checked); });
  const thead = el("thead", {}, el("tr", {},
    el("th", { class: "check-col", onclick: (e) => e.stopPropagation() }, headCheck),
    ...headers.map((hh) =>
      el("th", { onclick: () => h.onSort(hh.k), class: hh.num ? "num" : "" }, hh.l + arrow(hh.k)),
    ),
  ));
  const tbody = el("tbody", {});
  for (const d of rows) {
    const status = dealStatus(d);
    const sm = serviceMeta(d.svc);
    const age = dealStageAge(d);
    const ageWarn = age.days != null && age.days > 30 && !d.paid;
    const checkbox = el("input", { type: "checkbox", "aria-label": "Select row" });
    checkbox.checked = selected.has(d.id);
    checkbox.addEventListener("click", (e) => { e.stopPropagation(); h.onToggle(d.id, checkbox.checked); });
    const statusPill = el("span", {
      class: `pill ${status.cls} clickable`,
      title: "Click to toggle paid",
      onclick: (e) => { e.stopPropagation(); h.onTogglePaid(d); },
    }, status.label);
    const tr = el("tr", { onclick: () => go(`/deals/${d.id}`), class: selected.has(d.id) ? "row-selected" : "" },
      el("td", { class: "check-col", onclick: (e) => e.stopPropagation() }, checkbox),
      el("td", {}, d.company || "—"),
      el("td", {}, el("span", { class: `pill ${sm.cls}` }, sm.label)),
      el("td", { class: "small muted" }, fmtDateShort(d.serviceDate)),
      el("td", { class: "small muted" }, fmtDateShort(d.postDate)),
      el("td", { class: "small muted" }, fmtDateShort(d.draftDue)),
      el("td", { class: "num" }, fmtMoney(netFee(d))),
      el("td", {}, statusPill),
      el("td", { class: "small", style: ageWarn ? { color: "var(--warn)" } : { color: "var(--muted)" } }, age.days != null ? `${age.stage} · ${age.days}d` : age.stage),
      el("td", { class: "small muted" }, fmtDateShort(d.paidDate)),
      el("td", { class: "small muted" }, d.invoiceNumber || ""),
    );
    tbody.append(tr);
  }
  t.append(thead, tbody);
  return t;
}

// ---- Deal detail page ----
export function dealDetail({ id }) {
  const node = el("div", {});
  const render = () => {
    const d = Deals.get(id);
    if (!d) {
      node.innerHTML = "";
      node.append(el("div", { class: "empty" }, el("div", { class: "ico" }, "∅"), "Deal not found.",
        el("div", { style: { marginTop: 8 } }, el("a", { class: "btn", href: "#/deals" }, "← Back to deals"))));
      return;
    }
    const status = dealStatus(d);
    const sm = serviceMeta(d.svc);
    const link = (href) => href ? el("a", { href, target: "_blank", rel: "noreferrer" }, "Open ↗") : el("span", { class: "muted" }, "—");

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("a", { href: "#/deals", class: "small muted" }, "← All deals"),
          el("h1", { style: { marginTop: 4 } }, d.company),
          el("div", { class: "row sub" },
            el("span", { class: `pill ${sm.cls}` }, sm.label),
            el("span", { class: `pill ${status.cls}` }, status.label),
            d.invoiceNumber && el("span", { class: "muted" }, `Invoice ${d.invoiceNumber}`),
          ),
        ),
        el("div", { class: "row" },
          el("a", { class: "btn", href: `#/brand/${encodeURIComponent(d.company)}` }, "Open brand →"),
          el("button", { class: "btn", title: "AI: summarize the brief", onclick: async () => {
            const { openBriefSummarizer } = await import("../aiActions.js");
            openBriefSummarizer(d.notes || "");
          } }, "Summarize brief"),
          el("button", { class: "btn", title: "AI: grade this deal vs your history", onclick: async () => {
            const { openDealGrader } = await import("../aiActions.js");
            openDealGrader(d);
          } }, "Grade deal"),
          el("button", { class: "btn", onclick: () => {
            const { id, paid, paidDate, paidAmount, invoiceNumber, invoiceDate, invoiceUrl, transactionId, ...rest } = d;
            openDealForm({ ...rest, paid: false, paidDate: "", paidAmount: 0, invoiceNumber: "", invoiceDate: "", invoiceUrl: "", transactionId: "", serviceDate: todayISO(), notes: (d.notes || "") + (d.notes ? " · " : "") + "(repeat)" });
          } }, "Clone / repeat"),
          el("button", { class: "btn", onclick: async () => {
            const ok = await confirmDialog({
              title: "Make this deal recurring?",
              body: el("div", {},
                el("div", {}, `A monthly template will be created for ${d.company} at ${fmtMoney(d.fee)}.`),
                el("div", { class: "small muted", style: { marginTop: 6 } }, "Each load, the scheduler will materialize a fresh deal if a full cadence has passed."),
              ),
              confirmLabel: "Create template",
            });
            if (!ok) return;
            DealTemplates.save({
              name: `${d.company} retainer`,
              contactId: d.contactId, company: d.company, svc: d.svc,
              fee: d.fee, partnerFeePct: d.partnerFeePct || 0,
              terms: d.terms || 30, deliverables: d.deliverables || [],
              cadence: "monthly", dayOfMonth: +d.serviceDate?.slice(8) || 1,
              invoiceTo: d.invoiceTo || "",
              active: true, lastRunAt: Date.now(),
              notes: "From " + (d.invoiceNumber || d.id),
            });
            toast("Recurring template created");
          } }, "Make recurring"),
          !d.paid && el("button", {
            class: "btn primary",
            onclick: () => {
              Deals.save({ id: d.id, paid: true, paidDate: d.paidDate || todayISO(), paidAmount: d.paidAmount || netFee(d) });
              toast("Marked paid");
            },
          }, "Mark paid"),
          el("button", { class: "btn", onclick: () => openDealForm(d) }, "Edit"),
          el("button", {
            class: "btn danger",
            onclick: async () => {
              const ok = await confirmDialog({ title: "Delete deal?", body: `This will remove the ${d.company} deal.`, danger: true, confirmLabel: "Delete" });
              if (ok) { Deals.remove(d.id); toast("Deleted"); go("/deals"); }
            },
          }, "Delete"),
        ),
      ),
      el("div", { class: "kpi-grid" },
        kv("Gross fee", fmtMoney(d.fee) + (d.currency && d.currency !== Settings.get().currency ? ` ${d.currency}` : "")),
        kv("Partner fee", d.partnerFeePct ? `${d.partnerFeePct}%` : "—"),
        kv("Net", (function () {
          const baseCcy = Settings.get().currency || "USD";
          if (d.currency && d.currency !== baseCcy && d.fxRate) {
            return el("span", {},
              fmtMoney(netFee(d)) + " " + d.currency,
              el("div", { class: "small muted" }, `≈ ${fmtMoney(netFee(d) * d.fxRate)} ${baseCcy} @ ${d.fxRate}`),
            );
          }
          return fmtMoney(netFee(d));
        })()),
        kv("Paid", d.paid ? fmtMoney(d.paidAmount || netFee(d)) : "—"),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Lifecycle"),
        dealStageTracker(d),
      ),
      // Deliverables progress (#4)
      d.deliverables?.length ? el("div", { class: "card" },
        el("h3", {}, "Deliverables"),
        (function () {
          const done = d.deliverables.filter((x) => x.done).length;
          const total = d.deliverables.length;
          return el("div", {},
            el("div", { class: "spread", style: { marginBottom: 8 } },
              el("strong", {}, `${done} / ${total} done`),
              el("div", { style: { width: 140, height: 6, background: "var(--bg-3)", borderRadius: 3, overflow: "hidden" } },
                el("div", { style: { width: `${(done / total) * 100}%`, height: "100%", background: "var(--accent)" } }),
              ),
            ),
            el("div", { class: "list" },
              ...d.deliverables.map((x, i) => el("div", { class: "list-row" },
                (function () {
                  const cb = el("input", { type: "checkbox" });
                  cb.checked = !!x.done;
                  cb.addEventListener("change", () => {
                    const next = d.deliverables.map((y, j) => j === i ? { ...y, done: cb.checked } : y);
                    Deals.save({ id: d.id, deliverables: next });
                  });
                  return cb;
                })(),
                el("div", { style: { flex: 1, textDecoration: x.done ? "line-through" : "none", color: x.done ? "var(--muted)" : "var(--text)" } }, x.label || "—"),
                x.due ? el("span", { class: "small muted" }, "Due " + fmtDateShort(x.due)) : null,
              )),
            ),
          );
        })(),
      ) : null,
      // Payment ledger (#44)
      d.partials?.length ? el("div", { class: "card" },
        el("h3", {}, "Payments received"),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {}, el("th", {}, "Date"), el("th", { class: "num" }, "Amount"), el("th", {}, "Memo"))),
          el("tbody", {}, ...d.partials.map((p) => el("tr", {},
            el("td", { class: "small muted" }, fmtDate(p.date)),
            el("td", { class: "num" }, fmtMoney(p.amount)),
            el("td", { class: "small muted truncate" }, p.note || "—"),
          ))),
        ),
      ) : null,
      el("div", { class: "card" },
        el("h3", {}, "Timeline"),
        el("div", { class: "detail-grid" },
          kv("Service date", fmtDate(d.serviceDate) || "—"),
          kv("Post date", fmtDate(d.postDate) || "—"),
          kv("Draft due", fmtDate(d.draftDue) || "—"),
          kv("Invoice date", fmtDate(d.invoiceDate) || "—"),
          kv("Payment terms", d.terms ? `Net ${d.terms}` : "Due on receipt"),
          kv("Due date", (function () {
            const due = dueDate(d);
            const dpd = daysPastDue(d);
            if (!due) return "—";
            const lf = lateFee(d, Settings.get().lateFeePct || 0);
            return el("span", {},
              fmtDate(due),
              dpd != null && dpd > 0 ? el("span", { class: "pill red", style: { marginLeft: 6 } }, `${dpd}d overdue`) : null,
              lf > 0 ? el("span", { class: "small muted", style: { marginLeft: 6 } }, `+ ${fmtMoney(lf)} late fee`) : null,
            );
          })()),
          kv("Paid date", fmtDate(d.paidDate) || "—"),
          kv("Pay method", d.payMethod || "—"),
          d.creditNoteOf ? kv("Credit-note for", (function () {
            const src = Deals.get(d.creditNoteOf);
            return src ? el("a", { href: `#/deals/${src.id}` }, src.invoiceNumber || src.company) : "—";
          })()) : null,
          d.quotedFee && d.quotedFee !== d.fee ? kv("Quoted vs accepted", `${fmtMoney(d.quotedFee)} → ${fmtMoney(d.fee)} (${Math.round((d.fee / d.quotedFee) * 100)}%)`) : null,
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Links"),
        el("div", { class: "detail-grid" },
          kv("Contract", link(d.contractUrl)),
          kv("Brief", link(d.briefUrl)),
          kv("Draft", link(d.draftUrl)),
          kv("Portal", link(d.portalUrl)),
          kv("Notes / GPT", link(d.notesUrl)),
          kv("Invoice", link(d.invoiceUrl)),
        ),
      ),
      // Commercials (#10): currency, FX, withholding, agent attribution.
      (d.currency || d.fxRate || d.withholdingPct || d.agentId || d.wireFee || d.hoursWorked || d.perfPlatform) && el("div", { class: "card" },
        el("h3", {}, "Commercials"),
        el("div", { class: "detail-grid" },
          d.currency && d.currency !== Settings.get().currency && kv("Currency", `${d.currency}${d.fxRate ? ` @ ${d.fxRate}` : ""}`),
          d.withholdingPct ? kv("Withholding", `${d.withholdingPct}%${d.withholdingTreaty ? " · " + d.withholdingTreaty : ""}`) : null,
          d.wireFee ? kv("Foreign-wire fee", fmtMoney(d.wireFee)) : null,
          d.hoursWorked ? kv("Hours worked", `${d.hoursWorked}h · ${fmtMoney(netFee(d) / d.hoursWorked)}/hr eff. rate`) : null,
          d.agentId ? kv("Agent / manager", (function () {
            const ag = Agents.get(d.agentId);
            const name = ag?.name || "—";
            return `${name}${d.agentPct ? ` · ${d.agentPct}% commission` : ""}`;
          })()) : null,
          d.perfPlatform ? kv("Performance", `${d.perfPlatform.toUpperCase()}${d.perfViews ? ` · ${(+d.perfViews).toLocaleString()} views` : ""}${d.perfEngagements ? ` · ${(+d.perfEngagements).toLocaleString()} engagements` : ""}`) : null,
          d.quotedFee && d.quotedFee !== d.fee ? kv("Quoted vs accepted", `${fmtMoney(d.quotedFee)} → ${fmtMoney(d.fee)} (${Math.round((d.fee / d.quotedFee) * 100)}%)`) : null,
        ),
      ),
      // Approval / dispute log (#10).
      (d.approvalStatus && d.approvalStatus !== "n/a") || d.disputes?.length ? el("div", { class: "card" },
        el("h3", {}, "Approval & disputes"),
        el("div", { class: "detail-grid" },
          d.approvalStatus && d.approvalStatus !== "n/a" ? kv("Approval status", el("span", {},
            el("span", { class: `pill ${d.approvalStatus === "approved" ? "green" : d.approvalStatus === "rejected" ? "red" : d.approvalStatus === "sent" ? "amber" : "gray"}` }, d.approvalStatus),
            d.approvalNote ? el("span", { class: "small muted", style: { marginLeft: "8px" } }, d.approvalNote) : null,
          )) : null,
        ),
        d.disputes?.length ? el("table", { class: "data", style: { marginTop: "8px" } },
          el("thead", {}, el("tr", {}, el("th", {}, "Date"), el("th", {}, "Status"), el("th", { class: "num" }, "Amount"), el("th", {}, "Note"))),
          el("tbody", {}, ...d.disputes.map((dx) => el("tr", {},
            el("td", { class: "small muted" }, fmtDate(dx.date) || "—"),
            el("td", {}, el("span", { class: `pill ${dx.status === "won" ? "green" : dx.status === "lost" ? "red" : "amber"}` }, dx.status || "open")),
            el("td", { class: "num" }, fmtMoney(dx.amount)),
            el("td", { class: "small muted truncate" }, dx.note || "—"),
          ))),
        ) : null,
      ) : null,
      // Exclusivity & rights (#10).
      (d.exclusivityFrom || d.exclusivityTo || d.usageRightsUntil) && el("div", { class: "card" },
        el("h3", {}, "Exclusivity & rights"),
        el("div", { class: "detail-grid" },
          d.exclusivityFrom || d.exclusivityTo ? kv("Exclusivity window", `${fmtDate(d.exclusivityFrom) || "—"} → ${fmtDate(d.exclusivityTo) || "—"}`) : null,
          d.usageRightsUntil ? kv("Usage rights until", fmtDate(d.usageRightsUntil)) : null,
        ),
      ),
      // Line items (#3 / #10).
      d.lineItems?.length ? el("div", { class: "card" },
        el("h3", {}, "Line items"),
        el("table", { class: "data" },
          el("thead", {}, el("tr", {}, el("th", {}, "Description"), el("th", { class: "num" }, "Amount"))),
          el("tbody", {},
            ...d.lineItems.map((li) => el("tr", {},
              el("td", {}, li.desc || "—"),
              el("td", { class: "num" }, fmtMoney(li.amount)),
            )),
            el("tr", { style: { borderTop: "2px solid var(--line-2)" } },
              el("td", { style: { fontWeight: 700 } }, "Total"),
              el("td", { class: "num", style: { fontWeight: 700 } }, fmtMoney(d.lineItems.reduce((s, li) => s + (+li.amount || 0), 0))),
            ),
          ),
        ),
      ) : null,
      (d.invoiceTo || d.transactionId || d.notes) && el("div", { class: "card" },
        el("h3", {}, "Other"),
        el("div", { class: "detail-grid" },
          d.invoiceTo && kv("Invoice to", d.invoiceTo),
          d.transactionId && kv("Transaction ID", d.transactionId),
          d.notes && kv("Notes", d.notes),
        ),
      ),
    );
  };
  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function kv(k, v) {
  return el("div", { class: "kv" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v ?? "—"));
}
