// Keyboard shortcuts help overlay (press ?).

import { el } from "./utils.js";
import { openModal } from "./ui.js";

const SECTIONS = [
  {
    title: "Global",
    rows: [
      ["Cmd/Ctrl+K  ·  /", "Command palette"],
      ["?", "This help overlay"],
      ["n", "Quick add (deal/bill/contact, NL parser)"],
      ["g  then  d", "Dashboard"],
      ["g  then  b", "Brand deals"],
      ["g  then  k", "Pipeline (kanban)"],
      ["g  then  t", "Timeline"],
      ["g  then  i", "Invoices"],
      ["g  then  e", "Bills / expenses"],
      ["g  then  m", "Mileage"],
      ["g  then  c", "Contacts"],
      ["g  then  a", "Automations"],
      ["g  then  l", "Activity"],
      ["g  then  r", "Reports"],
      ["g  then  s", "Settings"],
    ],
  },
  {
    title: "Deals search operators",
    rows: [
      ["brand:NAME", "Brand contains NAME"],
      ["paid:yes  ·  paid:no", "Filter by paid status"],
      ["svc:v  ·  svc:p", "Service type"],
      ["year:2025", "Service / paid date year"],
      ["method:stripe", "Payment method contains"],
      [">1000  ·  <500", "Net fee range"],
    ],
  },
  {
    title: "Pipeline (kanban)",
    rows: [
      ["Drag a card", "Move a deal across stages — auto-sets the right field"],
    ],
  },
];

export function openHelp() {
  const body = el("div", { class: "help" },
    ...SECTIONS.map((sec) => el("div", { class: "help-section" },
      el("h4", {}, sec.title),
      el("div", { class: "help-rows" },
        ...sec.rows.map(([k, v]) => el("div", { class: "help-row" },
          el("kbd", {}, k),
          el("span", {}, v),
        )),
      ),
    )),
  );
  openModal({ title: "Keyboard shortcuts", body });
}
