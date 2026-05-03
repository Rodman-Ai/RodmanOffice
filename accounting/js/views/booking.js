// Local availability / booking calendar (#96). Pure-client view of your
// month: deal milestones + draft due dates + manual blocked windows.

import { el, fmtMoney, fmtDateShort, parseDate, netFee, kpi } from "../utils.js";
import { Deals, Settings, subscribe } from "../store.js";
import { go } from "../router.js";

const BLOCKS_KEY = "rodbooks:availability";

function getBlocks() {
  try { return JSON.parse(localStorage.getItem(BLOCKS_KEY)) || []; } catch { return []; }
}
function saveBlocks(list) { localStorage.setItem(BLOCKS_KEY, JSON.stringify(list)); }

export default function bookingView() {
  const node = el("div", {});
  const today = new Date();
  let cursor = new Date(today.getFullYear(), today.getMonth(), 1);

  const render = () => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    // Aggregate per-day load: sum hoursWorked of deals whose service/post date is that day,
    // plus a "block" tag for manual unavailability.
    const blocks = getBlocks();
    const dayInfo = {};
    Deals.all().forEach((d) => {
      [d.serviceDate, d.postDate, d.draftDue].forEach((ds) => {
        if (!ds) return;
        if (ds.slice(0, 7) !== `${y}-${String(m + 1).padStart(2, "0")}`) return;
        if (!dayInfo[ds]) dayInfo[ds] = { hours: 0, deals: [], block: false };
        if (d.hoursWorked) dayInfo[ds].hours += +d.hoursWorked;
        dayInfo[ds].deals.push(d);
      });
    });
    blocks.forEach((b) => {
      if (b.date.slice(0, 7) !== `${y}-${String(m + 1).padStart(2, "0")}`) return;
      if (!dayInfo[b.date]) dayInfo[b.date] = { hours: 0, deals: [], block: true, reason: b.reason };
      else { dayInfo[b.date].block = true; dayInfo[b.date].reason = b.reason; }
    });

    const totalHoursMonth = Object.values(dayInfo).reduce((s, x) => s + x.hours, 0);
    const totalDealsMonth = new Set(Object.values(dayInfo).flatMap((x) => x.deals.map((d) => d.id))).size;

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Booking"),
          el("div", { class: "sub" }, `Your availability and current load · ${cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}`),
        ),
        el("div", { class: "row" },
          el("button", { class: "icon-btn", onclick: () => { cursor = new Date(y, m - 1, 1); render(); } }, "←"),
          el("button", { class: "btn", onclick: () => { cursor = new Date(today.getFullYear(), today.getMonth(), 1); render(); } }, "Today"),
          el("button", { class: "icon-btn", onclick: () => { cursor = new Date(y, m + 1, 1); render(); } }, "→"),
        ),
      ),
      el("div", { class: "kpi-grid" },
        kpi("Booked deals (month)", String(totalDealsMonth)),
        kpi("Logged hours", `${totalHoursMonth.toFixed(1)}h`),
        kpi("Blocked days", String(blocks.filter((b) => b.date.slice(0, 7) === `${y}-${String(m + 1).padStart(2, "0")}`).length)),
        kpi("Avg per booked day", Object.keys(dayInfo).length ? `${(totalHoursMonth / Object.keys(dayInfo).length).toFixed(1)}h` : "—"),
      ),
      el("div", { class: "card", style: { padding: "8px" } },
        (function () {
          const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "1px", background: "var(--line)", borderRadius: "8px", overflow: "hidden" } });
          ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].forEach((d) => grid.append(el("div", { style: { padding: "8px 10px", background: "var(--bg-1)", color: "var(--muted)", fontSize: "11px", fontWeight: 600, textTransform: "uppercase" } }, d)));
          for (let i = 0; i < firstDay; i++) grid.append(el("div", { style: { background: "var(--bg-2)", minHeight: "72px" } }));
          for (let day = 1; day <= daysInMonth; day++) {
            const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const info = dayInfo[ds] || { hours: 0, deals: [], block: false };
            const heat = Math.min(0.6, info.hours / 8);
            const isToday = today.toISOString().slice(0, 10) === ds;
            const cell = el("div", {
              style: {
                background: info.block ? "rgba(239,68,68,0.12)" : `rgba(34,197,94,${heat})`,
                padding: "6px",
                minHeight: "72px",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                cursor: "pointer",
              },
              onclick: () => toggleBlock(ds, info.block, info.reason),
            },
              el("div", { class: "row spread" },
                el("div", { style: { fontSize: "11px", color: isToday ? "var(--accent)" : "var(--muted)", fontWeight: isToday ? 700 : 500 } }, String(day)),
                info.hours ? el("div", { class: "small", style: { fontWeight: 600 } }, `${info.hours.toFixed(1)}h`) : null,
              ),
              info.block ? el("div", { class: "pill red", style: { fontSize: "9px" } }, "Blocked" + (info.reason ? `: ${info.reason}` : "")) : null,
              ...info.deals.slice(0, 2).map((d) => el("div", {
                class: "small truncate",
                style: { fontSize: "10px", color: "var(--text)", cursor: "pointer" },
                onclick: (e) => { e.stopPropagation(); go(`/deals/${d.id}`); },
              }, d.company)),
              info.deals.length > 2 ? el("div", { class: "small muted" }, `+${info.deals.length - 2} more`) : null,
            );
            grid.append(cell);
          }
          return grid;
        })(),
      ),
      el("div", { class: "small muted", style: { marginTop: 12 } }, "Click a day to toggle a manual block. Cell shading indicates booked load (logged hours)."),
    );
  };

  function toggleBlock(date, isBlocked, existingReason) {
    const blocks = getBlocks();
    if (isBlocked) {
      saveBlocks(blocks.filter((b) => b.date !== date));
    } else {
      const reason = prompt(`Block ${date} (e.g. "vacation", "filming", "PTO"). Leave empty to cancel:`, "");
      if (reason === null) return;
      blocks.push({ date, reason: reason.trim() });
      saveBlocks(blocks);
    }
    render();
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

