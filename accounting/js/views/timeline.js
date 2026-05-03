// Calendar / Gantt-style view of deal lifecycle events.

import { el, fmtMoney, fmtDateShort, parseDate, netFee, dealStatus, initials, serviceMeta } from "../utils.js";
import { Deals, subscribe } from "../store.js";
import { go } from "../router.js";
import { downloadIcs } from "../ics.js";
import { toast } from "../ui.js";

const STAGE_META = {
  draftDue: { label: "Draft due", cls: "amber" },
  serviceDate: { label: "Service / film", cls: "purple" },
  postDate: { label: "Post", cls: "blue" },
  invoiceDate: { label: "Invoice", cls: "teal" },
  paidDate: { label: "Paid", cls: "green" },
};
const DELIVERABLE_META = { label: "Deliverable", cls: "pink" };

export default function timelineView() {
  const node = el("div", {});
  const today = new Date();
  let mode = "month"; // month | year
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);

  const render = () => {
    const all = Deals.all();

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Timeline"),
          el("div", { class: "sub" }, mode === "month" ? "Calendar of deal milestones" : `Gantt-style overview · ${cursor.getFullYear()}`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => { downloadIcs(Deals.all(), "rodbooks-deals.ics"); toast("Calendar exported"); } }, "Export .ics"),
          el("button", { class: `btn ${mode === "month" ? "primary" : ""}`, onclick: () => { mode = "month"; render(); } }, "Month"),
          el("button", { class: `btn ${mode === "year" ? "primary" : ""}`, onclick: () => { mode = "year"; render(); } }, "Year"),
        ),
      ),
      el("div", { class: "row", style: { marginBottom: "12px" } },
        el("button", { class: "icon-btn", onclick: () => { shift(-1); render(); } }, "←"),
        el("div", { style: { fontWeight: 600, minWidth: "180px", textAlign: "center" } },
          mode === "month"
            ? cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
            : String(cursor.getFullYear()),
        ),
        el("button", { class: "icon-btn", onclick: () => { shift(+1); render(); } }, "→"),
        el("div", { class: "spacer" }),
        el("button", { class: "btn", onclick: () => { cursor = new Date(today.getFullYear(), today.getMonth(), 1); render(); } }, "Today"),
      ),
    );

    if (mode === "month") node.append(renderMonth(all));
    else node.append(renderYear(all));

    // Legend
    node.append(el("div", { class: "row", style: { marginTop: "12px", flexWrap: "wrap", gap: "8px" } },
      ...Object.entries(STAGE_META).map(([k, m]) =>
        el("span", { class: `pill ${m.cls}` }, m.label)),
      el("span", { class: `pill ${DELIVERABLE_META.cls}` }, DELIVERABLE_META.label),
    ));
  };

  function shift(dir) {
    if (mode === "month") cursor = new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1);
    else cursor = new Date(cursor.getFullYear() + dir, 0, 1);
  }

  function renderMonth(all) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const firstDay = new Date(y, m, 1).getDay(); // 0 Sun
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Bucket events by date string
    const byDate = {};
    const ymKey = `${y}-${String(m + 1).padStart(2, "0")}`;
    for (const d of all) {
      for (const stage of Object.keys(STAGE_META)) {
        const ds = d[stage];
        if (!ds) continue;
        if (ds.slice(0, 7) !== ymKey) continue;
        (byDate[ds] = byDate[ds] || []).push({ deal: d, stage });
      }
      // Content-calendar overlay (#67): each deliverable due-date becomes its own event.
      (d.deliverables || []).forEach((dl) => {
        if (!dl.due || dl.due.slice(0, 7) !== ymKey) return;
        (byDate[dl.due] = byDate[dl.due] || []).push({ deal: d, stage: "deliverable", deliverable: dl });
      });
    }

    const wrap = el("div", { class: "card", style: { padding: "8px" } });
    const grid = el("div", {
      style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "var(--line)", borderRadius: "8px", overflow: "hidden" },
    });

    // Header
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((d) => {
      grid.append(el("div", { style: { padding: "8px 10px", background: "var(--bg-1)", color: "var(--muted)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase" } }, d));
    });

    // Empty cells before day 1
    for (let i = 0; i < firstDay; i++) {
      grid.append(el("div", { style: { background: "var(--bg-2)", minHeight: "92px" } }));
    }
    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const events = byDate[ds] || [];
      const isToday = today.toISOString().slice(0, 10) === ds;
      const cell = el("div", { style: { background: "var(--bg-1)", padding: "6px", minHeight: "92px", display: "flex", flexDirection: "column", gap: "3px" } },
        el("div", { style: { fontSize: "11px", color: isToday ? "var(--accent)" : "var(--muted)", fontWeight: isToday ? 700 : 500 } }, String(day)),
        ...events.slice(0, 4).map(({ deal, stage, deliverable }) => {
          const meta = stage === "deliverable" ? DELIVERABLE_META : STAGE_META[stage];
          const lbl = stage === "deliverable" ? `${deal.company} · ${deliverable.label || "deliverable"}` : deal.company;
          return el("div", {
            class: `pill ${meta.cls}`,
            title: `${deal.company} · ${stage === "deliverable" ? (deliverable.label || "Deliverable") : meta.label}`,
            onclick: (e) => { e.stopPropagation(); go(`/deals/${deal.id}`); },
            style: { cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "10px" },
          }, lbl);
        }),
        events.length > 4 && el("div", { class: "small muted" }, `+${events.length - 4} more`),
      );
      grid.append(cell);
    }

    wrap.append(grid);
    return wrap;
  }

  function renderYear(all) {
    const y = cursor.getFullYear();
    // Show deals where any stage has a date in this year, sorted by earliest stage.
    const inYear = all.map((d) => {
      const stamps = Object.keys(STAGE_META).map((k) => d[k]).filter((x) => x && x.slice(0, 4) === String(y));
      if (!stamps.length) return null;
      const earliest = stamps.sort()[0];
      const latest = stamps.sort().slice(-1)[0];
      return { deal: d, earliest, latest };
    }).filter(Boolean).sort((a, b) => a.earliest.localeCompare(b.earliest));

    const wrap = el("div", { class: "card", style: { padding: "12px" } });
    if (!inYear.length) {
      wrap.append(el("div", { class: "empty small" }, `No timeline events in ${y}.`));
      return wrap;
    }

    // Months header
    const grid = el("div", { style: { display: "grid", gridTemplateColumns: "180px repeat(12, 1fr)", gap: "1px", background: "var(--line)", borderRadius: "8px", overflow: "hidden" } });
    grid.append(el("div", { style: { padding: "8px", background: "var(--bg-1)", color: "var(--muted)", fontSize: "11px", textTransform: "uppercase", fontWeight: 600 } }, "Brand"));
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].forEach((mn) => {
      grid.append(el("div", { style: { padding: "8px", background: "var(--bg-1)", color: "var(--muted)", fontSize: "11px", textAlign: "center", fontWeight: 600 } }, mn));
    });

    inYear.slice(0, 80).forEach(({ deal }) => {
      // Brand label cell
      grid.append(el("div", {
        onclick: () => go(`/deals/${deal.id}`),
        style: { padding: "6px 8px", background: "var(--bg-1)", cursor: "pointer", fontSize: "12px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
      }, deal.company));
      // 12 month cells
      for (let mi = 0; mi < 12; mi++) {
        const stages = [];
        for (const k of Object.keys(STAGE_META)) {
          const dd = deal[k];
          if (!dd) continue;
          const dt = parseDate(dd);
          if (dt && dt.getFullYear() === y && dt.getMonth() === mi) stages.push(k);
        }
        const cell = el("div", { style: { background: "var(--bg-1)", padding: "4px", minHeight: "26px", display: "flex", gap: "2px", alignItems: "center", justifyContent: "center", flexWrap: "wrap" } });
        stages.forEach((stage) => {
          const meta = STAGE_META[stage];
          cell.append(el("span", {
            class: `pill ${meta.cls}`,
            style: { padding: "1px 6px", fontSize: "9px", cursor: "pointer" },
            title: `${deal.company} · ${meta.label}`,
            onclick: () => go(`/deals/${deal.id}`),
          }, meta.label.slice(0, 1)));
        });
        grid.append(cell);
      }
    });
    wrap.append(grid);
    if (inYear.length > 80) wrap.append(el("div", { class: "small muted", style: { marginTop: 8 } }, `Showing first 80 of ${inYear.length} deals.`));
    return wrap;
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

// ----- Reusable: deal lifecycle stage tracker (used on deal detail) -----
export function dealStageTracker(deal) {
  const stages = [
    { key: "contractUrl", label: "Contract", date: deal.contractUrl ? "Signed" : "" },
    { key: "briefUrl", label: "Brief", date: deal.briefUrl ? "Received" : "" },
    { key: "draftDue", label: "Draft due", date: fmtDateShort(deal.draftDue) },
    { key: "draftUrl", label: "Draft sent", date: deal.draftUrl ? "Sent" : "" },
    { key: "serviceDate", label: "Service", date: fmtDateShort(deal.serviceDate) },
    { key: "postDate", label: "Posted", date: fmtDateShort(deal.postDate) },
    { key: "invoiceDate", label: "Invoiced", date: fmtDateShort(deal.invoiceDate) },
    { key: "paidDate", label: "Paid", date: fmtDateShort(deal.paidDate) },
  ];
  // Mark "active" stages (those with values)
  const flags = stages.map((s) => Boolean(deal[s.key]));
  // Highlight current = first inactive after at least one active, else the last active.
  let currentIdx = flags.findIndex((f, i) => f && !flags[i + 1]);
  if (currentIdx < 0) currentIdx = flags.lastIndexOf(true);

  const wrap = el("div", { class: "stage-tracker" });
  stages.forEach((s, i) => {
    const active = flags[i];
    const current = i === currentIdx + 1 && !active;
    wrap.append(
      el("div", { class: `stage ${active ? "done" : ""} ${current ? "current" : ""}` },
        el("div", { class: "stage-dot" }),
        el("div", { class: "stage-label" }, s.label),
        el("div", { class: "stage-date small muted" }, s.date || "—"),
      ),
    );
  });
  return wrap;
}
