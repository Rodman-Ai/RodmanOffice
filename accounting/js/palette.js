// Spotlight-style command palette: Cmd/Ctrl+K.

import { el, initials } from "./utils.js";
import { Deals, Contacts, Bills } from "./store.js";
import { go } from "./router.js";
import { openDealForm, openBillForm, openContactForm, openQuickAdd } from "./forms.js";
import { openModal } from "./ui.js";
import { getRecent, toggleDensity } from "./prefs.js";
import { openHelp } from "./help.js";

const PAGES = [
  { label: "Dashboard", path: "/", hint: "Home" },
  { label: "Brand Deals", path: "/deals" },
  { label: "Pipeline (Kanban)", path: "/pipeline" },
  { label: "Timeline", path: "/timeline" },
  { label: "Invoices", path: "/invoices" },
  { label: "Bills & Expenses", path: "/bills" },
  { label: "Mileage", path: "/mileage" },
  { label: "Contacts", path: "/contacts" },
  { label: "Automations", path: "/automations" },
  { label: "Reports", path: "/reports" },
  { label: "Activity", path: "/activity" },
  { label: "Settings", path: "/settings" },
];

const COMMANDS = [
  { label: "New brand deal", action: () => openDealForm(), kind: "Action" },
  { label: "New bill / expense", action: () => openBillForm(), kind: "Action" },
  { label: "New contact", action: () => openContactForm(), kind: "Action" },
  { label: "Quick add (NL)", action: () => openQuickAdd(), kind: "Action" },
  { label: "Toggle theme", action: () => import("./theme.js").then((m) => m.toggleTheme()), kind: "Action" },
  { label: "Toggle density (comfortable / compact)", action: () => toggleDensity(), kind: "Action" },
  { label: "Show keyboard shortcuts", action: () => openHelp(), kind: "Action" },
  { label: "Summarize brief (AI)", action: async () => { const { openBriefSummarizer } = await import("./aiActions.js"); openBriefSummarizer(); }, kind: "AI" },
  { label: "Grade a deal (AI)", action: async () => {
      const { openDealGrader } = await import("./aiActions.js");
      const { openModal } = await import("./ui.js");
      const { Deals } = await import("./store.js");
      const recent = Deals.all().slice().sort((a, b) => (b.serviceDate || b.paidDate || "").localeCompare(a.serviceDate || a.paidDate || "")).slice(0, 30);
      const search = el("input", { class: "input", placeholder: "Filter by brand…", autofocus: true });
      const list = el("div", { class: "list", style: { maxHeight: "50vh", overflow: "auto" } });
      let m;
      const render = () => {
        list.innerHTML = "";
        const q = (search.value || "").toLowerCase();
        const items = recent.filter((d) => !q || (d.company || "").toLowerCase().includes(q));
        if (!items.length) { list.append(el("div", { class: "empty small" }, "No matches.")); return; }
        items.forEach((d) => list.append(el("div", { class: "list-row", style: { cursor: "pointer" }, onclick: () => { m.close(); openDealGrader(d); } },
          el("div", { style: { flex: 1 } }, el("strong", {}, d.company || "Untitled"), el("div", { class: "small muted" }, `${d.svc || "—"} · $${d.fee || 0}`)),
          el("span", { class: "pill gray" }, d.paid ? "paid" : "open"),
        )));
      };
      search.addEventListener("input", render);
      render();
      m = openModal({ title: "Pick a deal to grade", body: el("div", { class: "stack" }, search, list) });
    }, kind: "AI" },
  { label: "Coach me (AI)", action: async () => { const { openCoachMode } = await import("./aiActions.js"); openCoachMode(); }, kind: "AI" },
  { label: "Install RodBooks (add to home screen)", action: async () => {
      const { toast } = await import("./ui.js");
      if (!window.installPrompt) { toast("Install prompt not available — open the browser menu.", "warn", 4000); return; }
      const ok = await window.installPrompt();
      toast(ok ? "Installed" : "Install dismissed");
    }, kind: "Action" },
  { label: "Export JSON", action: async () => {
      const { exportJSON, downloadFile } = await import("./store.js");
      downloadFile(`rodbooks-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(), "application/json");
    }, kind: "Action" },
  { label: "Save snapshot", action: async () => {
      const { Snapshots } = await import("./store.js");
      const { toast } = await import("./ui.js");
      const s = Snapshots.create();
      toast(`Snapshot saved · ${new Date(s.ts).toLocaleTimeString()}`);
    }, kind: "Action" },
];

let isOpen = false;

export function openPalette() {
  if (isOpen) return;
  isOpen = true;

  const input = el("input", {
    class: "input",
    placeholder: "Search deals, brands, pages, commands…",
    style: { fontSize: "16px", padding: "12px 14px", border: "0", background: "transparent" },
    autofocus: true,
  });
  const list = el("div", { class: "palette-list" });
  let activeIndex = 0;
  let items = [];

  const render = (q) => {
    const ql = (q || "").toLowerCase().trim();
    const score = (s) => {
      if (!ql) return 0;
      const sl = s.toLowerCase();
      if (sl === ql) return 100;
      if (sl.startsWith(ql)) return 80;
      if (sl.includes(ql)) return 60;
      // fuzzy: every char in order
      let i = 0; for (const ch of ql) { const j = sl.indexOf(ch, i); if (j < 0) return -1; i = j + 1; }
      return 30;
    };

    const out = [];
    if (!ql) {
      // Empty query: top of list = recently viewed.
      getRecent().slice(0, 5).forEach((r) => out.push({ kind: "Recent", label: r.label, sub: r.path, sc: 1000, run: () => go(r.path) }));
    }
    PAGES.forEach((p) => { const sc = score(p.label); if (sc >= 0) out.push({ kind: "Page", label: p.label, sub: p.hint || p.path, sc, run: () => go(p.path) }); });
    COMMANDS.forEach((c) => { const sc = score(c.label); if (sc >= 0) out.push({ kind: c.kind, label: c.label, sub: "", sc, run: c.action }); });

    Deals.all().forEach((d) => {
      const lbl = `${d.company} · $${d.fee}`;
      const sc = Math.max(score(lbl), score(d.company || ""));
      if (sc >= 0) out.push({ kind: "Deal", label: lbl, sub: d.svc || "", sc, run: () => go(`/deals/${d.id}`) });
    });
    Contacts.all().forEach((c) => {
      const sc = Math.max(score(c.name || ""), score(c.company || ""));
      if (sc >= 0) out.push({ kind: "Brand", label: c.name || c.company, sub: c.email || "", sc, run: () => go(`/brand/${encodeURIComponent(c.name || c.company || "")}`) });
    });
    Bills.all().forEach((b) => {
      const sc = score(b.vendor || "");
      if (sc >= 0) out.push({ kind: "Bill", label: `${b.vendor} · $${b.amount}`, sub: b.category || "", sc, run: () => { import("./forms.js").then((m) => m.openBillForm(b)); close(); } });
    });

    items = out.sort((a, b) => b.sc - a.sc).slice(0, 30);
    activeIndex = 0;
    paint();
  };

  const paint = () => {
    list.innerHTML = "";
    if (!items.length) {
      list.append(el("div", { class: "palette-empty" }, "No matches"));
      return;
    }
    items.forEach((it, i) => {
      const row = el("div", {
        class: `palette-row ${i === activeIndex ? "active" : ""}`,
        onclick: () => exec(i),
        onmouseover: () => { activeIndex = i; paint(); },
      },
        el("span", { class: `pill gray`, style: { minWidth: "60px", justifyContent: "center" } }, it.kind),
        el("div", { style: { flex: 1, minWidth: 0 } },
          el("div", { class: "truncate", style: { fontSize: "13px" } }, it.label),
          it.sub && el("div", { class: "small muted truncate" }, it.sub),
        ),
      );
      list.append(row);
    });
  };

  const exec = (i) => {
    const item = items[i];
    if (!item) return;
    close();
    setTimeout(() => item.run(), 30);
  };

  input.addEventListener("input", () => render(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); activeIndex = Math.min(activeIndex + 1, items.length - 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIndex = Math.max(activeIndex - 1, 0); paint(); }
    else if (e.key === "Enter") { e.preventDefault(); exec(activeIndex); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });

  const body = el("div", { class: "palette" }, input, list);
  const m = openModal({ title: "Search & commands", body, onClose: () => { isOpen = false; } });
  function close() { m.close(); }
  render("");
  setTimeout(() => input.focus(), 30);
}
