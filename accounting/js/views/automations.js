import { el, kpi } from "../utils.js";
import { generateProposals, getRules, setRule } from "../automations.js";
import { subscribe } from "../store.js";
import { toast, confirmDialog } from "../ui.js";

export default function automationsView() {
  const node = el("div", {});

  const render = () => {
    const proposals = generateProposals();
    const rules = getRules();

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Automations"),
          el("div", { class: "sub" }, "Suggested rules based on patterns in your books. Apply to update records, or enable to keep watching."),
        ),
      ),

      el("div", { class: "kpi-grid" },
        kpi("Open proposals", proposals.length),
        kpi("Saved rules", Object.keys(rules).filter((k) => rules[k]?.enabled).length),
        kpi("Records affected", proposals.reduce((s, p) => s + (p.count || 0), 0)),
      ),

      proposals.length === 0
        ? el("div", { class: "card empty" }, el("div", { class: "ico" }, "✓"), "All clear — no automations to propose right now.")
        : el("div", { class: "stack" },
            ...proposals.map((p) => proposalCard(p, rules, render)),
          ),

      el("div", { class: "card" },
        el("h3", {}, "Active rules"),
        el("div", { class: "small muted", style: { marginBottom: "8px" } },
          "Rules run when you load the dashboard. Disable any to stop their suggestions."),
        ruleList(rules, render),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function severityCls(s) {
  return s === "high" ? "red" : s === "medium" ? "amber" : "blue";
}

function proposalCard(p, rules, rerender) {
  const enabled = rules[p.id]?.enabled;
  return el("div", { class: "card" },
    el("div", { class: "spread" },
      el("div", {},
        el("div", { class: "row" },
          el("span", { class: `pill ${severityCls(p.severity)}` }, p.severity),
          el("strong", {}, p.title),
        ),
        el("div", { class: "small muted", style: { marginTop: 4 } }, p.description),
      ),
      el("div", { class: "row" },
        el("button", {
          class: `btn ${enabled ? "" : "ghost"}`,
          onclick: () => { setRule(p.id, { enabled: !enabled }); toast(enabled ? "Rule disabled" : "Rule enabled"); rerender(); },
        }, enabled ? "Enabled" : "Enable rule"),
        el("button", {
          class: "btn primary",
          onclick: async () => {
            const ok = await confirmDialog({
              title: "Apply automation?",
              body: el("div", {},
                el("div", {}, p.title),
                el("div", { class: "small muted", style: { marginTop: 6 } }, p.description),
                el("div", { class: "small muted", style: { marginTop: 6 } }, `Will affect ${p.count} record${p.count === 1 ? "" : "s"}.`),
              ),
              confirmLabel: "Apply now",
            });
            if (ok) {
              try { p.apply(); toast("Applied"); rerender(); }
              catch (e) { toast("Apply failed: " + e.message, "warn", 4000); }
            }
          },
        }, "Apply now"),
      ),
    ),
    p.preview && p.preview.length
      ? el("div", { style: { marginTop: 12, padding: "10px 12px", background: "var(--bg-2)", borderRadius: 8 } },
          el("div", { class: "small muted", style: { marginBottom: 4 } }, "Examples:"),
          el("ul", { style: { margin: 0, paddingLeft: "18px" } },
            ...p.preview.map((line) => el("li", { class: "small" }, line)),
          ),
        )
      : null,
  );
}

function ruleList(rules, rerender) {
  const ids = Object.keys(rules);
  if (!ids.length) return el("div", { class: "small muted" }, "No saved rules yet.");
  return el("div", { class: "list" },
    ...ids.map((id) => el("div", { class: "list-row" },
      el("span", { class: `pill ${rules[id]?.enabled ? "green" : "gray"}` }, rules[id]?.enabled ? "ON" : "off"),
      el("div", { style: { flex: 1 } }, id),
      el("button", { class: "btn sm", onclick: () => { setRule(id, { enabled: !rules[id]?.enabled }); rerender(); } }, "Toggle"),
    )),
  );
}

