import { el, fmtMoney, fmtDateShort, netFee, serviceMeta, todayISO, dealStageAge, initials } from "../utils.js";
import { Deals, Settings, subscribe } from "../store.js";
import { go } from "../router.js";
import { openDealForm } from "../forms.js";
import { toast } from "../ui.js";

const STAGES = [
  { id: "pending", label: "Pending", match: (d) => !d.paid && !d.invoiceDate && !d.postDate && !d.draftUrl && !d.briefUrl && !d.contractUrl },
  { id: "contract", label: "Contract", match: (d) => !d.paid && d.contractUrl && !d.briefUrl && !d.draftUrl && !d.postDate && !d.invoiceDate },
  { id: "brief", label: "Brief", match: (d) => !d.paid && d.briefUrl && !d.draftUrl && !d.postDate && !d.invoiceDate },
  { id: "draft", label: "Draft", match: (d) => !d.paid && d.draftUrl && !d.postDate && !d.invoiceDate },
  { id: "posted", label: "Posted", match: (d) => !d.paid && d.postDate && !d.invoiceDate },
  { id: "invoiced", label: "Invoiced", match: (d) => !d.paid && (d.invoiceDate || d.invoiceNumber) },
  { id: "paid", label: "Paid", match: (d) => d.paid },
];

const TRANSITIONS = {
  contract: { contractUrl: "https://placeholder/contract" },
  brief: { briefUrl: "https://placeholder/brief" },
  draft: { draftUrl: "https://placeholder/draft" },
  posted: { postDate: todayISO() },
  invoiced: { invoiceDate: todayISO() },
  paid: { paid: true, paidDate: todayISO() },
  pending: { contractUrl: "", briefUrl: "", draftUrl: "", postDate: "", invoiceDate: "", paid: false, paidDate: "" },
};

export default function kanban() {
  const node = el("div", {});
  let filter = { year: "all", search: "" };

  const render = () => {
    const all = Deals.all();
    const years = Array.from(new Set(all.map((d) => (d.serviceDate || d.paidDate || "").slice(0, 4)).filter(Boolean))).sort().reverse();

    const matches = (d) => {
      const yr = (d.serviceDate || d.paidDate || "").slice(0, 4);
      if (filter.year !== "all" && yr !== filter.year) return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (!`${d.company} ${d.notes}`.toLowerCase().includes(q)) return false;
      }
      return true;
    };

    const buckets = STAGES.map((s) => ({ ...s, deals: [] }));
    for (const d of all.filter(matches)) {
      // assign to first matching stage starting from "paid" backward
      let placed = false;
      for (let i = STAGES.length - 1; i >= 0; i--) {
        if (STAGES[i].match(d)) { buckets[i].deals.push(d); placed = true; break; }
      }
      if (!placed) buckets[0].deals.push(d);
    }

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Pipeline"),
          el("div", { class: "sub" }, `${all.filter(matches).length} deals · drag a card across columns to advance the stage`),
        ),
        el("div", { class: "row" },
          (function () {
            const i = el("input", { class: "input", placeholder: "Search…", value: filter.search, style: { width: "180px" } });
            i.addEventListener("input", (e) => { filter.search = e.target.value; render(); });
            return i;
          })(),
          (function () {
            const s = el("select", { class: "select" });
            for (const o of [{ value: "all", label: "All years" }, ...years.map((y) => ({ value: y, label: y }))]) {
              const opt = el("option", { value: o.value }, o.label);
              if (o.value === filter.year) opt.selected = true;
              s.append(opt);
            }
            s.addEventListener("change", () => { filter.year = s.value; render(); });
            return s;
          })(),
          el("button", { class: "btn primary", onclick: () => openDealForm() }, "+ New deal"),
        ),
      ),
      el("div", { class: "kanban" },
        ...buckets.map((b) => {
          const total = b.deals.reduce((s, d) => s + netFee(d), 0);
          const col = el("div", {
            class: "kanban-col",
            ondragover: (e) => { e.preventDefault(); col.classList.add("drag-over"); },
            ondragleave: () => col.classList.remove("drag-over"),
            ondrop: (e) => {
              e.preventDefault();
              col.classList.remove("drag-over");
              const id = e.dataTransfer.getData("text/plain");
              if (!id) return;
              const transition = TRANSITIONS[b.id];
              if (!transition) return;
              Deals.save({ id, ...transition });
              toast(`Moved to ${b.label}`);
            },
          });
          col.append(
            el("div", { class: "kanban-head" },
              el("div", { style: { fontWeight: 600 } }, b.label),
              el("div", { class: "small muted" }, `${b.deals.length} · ${fmtMoney(total)}`),
            ),
            ...b.deals.slice(0, 50).map((d) => card(d)),
            b.deals.length > 50 && el("div", { class: "small muted", style: { padding: "8px", textAlign: "center" } }, `+${b.deals.length - 50} more`),
          );
          return col;
        }),
      ),
    );
  };

  function card(d) {
    const sm = serviceMeta(d.svc);
    const age = dealStageAge(d);
    const ageWarn = age.days != null && age.days > 30;
    const c = el("div", {
      class: "kanban-card",
      draggable: "true",
      ondragstart: (e) => { e.dataTransfer.setData("text/plain", d.id); e.dataTransfer.effectAllowed = "move"; c.classList.add("dragging"); },
      ondragend: () => c.classList.remove("dragging"),
      onclick: () => go(`/deals/${d.id}`),
    },
      el("div", { class: "row" },
        el("div", { class: "avatar", style: { width: "26px", height: "26px", fontSize: "10px" } }, initials(d.company)),
        el("div", { class: "truncate", style: { flex: 1, fontWeight: 600, fontSize: "13px" } }, d.company),
        el("span", { class: `pill ${sm.cls}`, style: { padding: "1px 6px", fontSize: "10px" } }, sm.label),
      ),
      el("div", { class: "row", style: { marginTop: "6px", justifyContent: "space-between" } },
        el("div", { class: "small muted" }, fmtDateShort(d.serviceDate || d.draftDue) || "—"),
        el("div", { style: { fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: "13px" } }, fmtMoney(netFee(d))),
      ),
      age.days != null && el("div", { class: "small", style: { marginTop: "4px", color: ageWarn ? "var(--warn)" : "var(--muted)" } },
        `${age.stage} · ${age.days}d`,
      ),
    );
    return c;
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}
