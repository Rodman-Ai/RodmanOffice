// Contract risk-clause flagger (#63). Paste contract text → highlights risky terms.

import { el, escHtml } from "../utils.js";
import { ContractTemplates, subscribe } from "../store.js";
import { go } from "../router.js";

// Risk patterns. Each entry: { re, severity, label, why }
const RISK_PATTERNS = [
  { re: /\b(perpetual|in\s+perpetuity)\b/i, severity: "high", label: "Perpetual rights", why: "License runs forever — usually a no-go without huge fee uplift." },
  { re: /\b(worldwide|all\s+territories|global)\b/i, severity: "medium", label: "Worldwide rights", why: "Geographic scope is unlimited — increases reach but needs higher fee." },
  { re: /\b(exclusivity|exclusive)\b/i, severity: "medium", label: "Exclusivity", why: "Restricts other deals; check window length." },
  { re: /\b(moral\s+clause|moral\s+turpitude|morality)\b/i, severity: "high", label: "Moral clause", why: "Brand can terminate based on subjective conduct — limit duration & scope." },
  { re: /\b(non[-\s]?compete|noncompete)\b/i, severity: "high", label: "Non-compete", why: "Blocks future deals with similar brands. Negotiate scope hard." },
  { re: /\b(work[-\s]?for[-\s]?hire|wfh|work\s+made\s+for\s+hire)\b/i, severity: "high", label: "Work for hire", why: "Brand owns IP outright. Push back unless paid handsomely." },
  { re: /\b(unlimited\s+revisions?|all\s+revisions?)\b/i, severity: "medium", label: "Unlimited revisions", why: "Cap revisions (typically 2 rounds) or charge per round." },
  { re: /\b(kill\s+fee|cancellation\s+fee)\b/i, severity: "info", label: "Kill fee", why: "Worth flagging — confirm % matches what you usually charge (50/75/100)." },
  { re: /\b(net[-\s]?(60|75|90))\b/i, severity: "medium", label: "Long payment terms", why: "Net 60+ erodes cash flow. Counter with Net 30 or shorter." },
  { re: /\b(approval\s+rights?|final\s+approval|brand\s+approval)\b/i, severity: "info", label: "Approval rights", why: "Common, but limit rounds and approval window so you're not stuck." },
  { re: /\b(usage|paid\s+media|whitelisting|sparking?|allowlisting)\b/i, severity: "medium", label: "Paid media usage", why: "Boosting your content is paid usage — separate fee + duration." },
  { re: /\b(indemnif(y|ication))\b/i, severity: "medium", label: "Indemnification", why: "Make it mutual and limited to direct damages, not consequential." },
  { re: /\b(liquidated\s+damages|penalty)\b/i, severity: "high", label: "Liquidated damages", why: "Pre-set penalty for missing terms — strike or cap at deal value." },
  { re: /\b(audit|inspection)\s+(rights?|clause)\b/i, severity: "info", label: "Audit rights", why: "Brand can review your books — limit to deal-related records only." },
  { re: /\b(no\s+disparagement|non[-\s]?disparagement)\b/i, severity: "medium", label: "Non-disparagement", why: "You can't speak negatively about the brand — push for time-bounded." },
  { re: /\b(arbitration|binding\s+arbitration)\b/i, severity: "info", label: "Arbitration", why: "Disputes go to arbitration, not court. Note venue and rules." },
  { re: /\b(assignment|assign\s+rights)\b/i, severity: "info", label: "Assignment", why: "Brand can transfer the contract to a third party. Require consent." },
  { re: /\b(automat\w+\s+renew(al)?)\b/i, severity: "medium", label: "Auto-renewal", why: "Contract renews on its own — set a reminder before opt-out window." },
  { re: /\b(force\s+majeure)\b/i, severity: "info", label: "Force majeure", why: "Standard, but check if pandemics/strikes are covered." },
];

export default function contractsView() {
  const node = el("div", {});
  let text = "";
  let lastTemplateId = "";

  const render = () => {
    const flags = scan(text);
    const highlightHtml = highlight(text, flags);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Contract risk scanner"),
          el("div", { class: "sub" }, "Paste a contract; we'll flag risky clauses with negotiation tips."),
        ),
        el("div", { class: "row" },
          el("a", { class: "btn", href: "#/templates" }, "Open template library →"),
        ),
      ),

      el("div", { class: "row", style: { gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
        (function () {
          const sel = el("select", { class: "select", style: { maxWidth: "260px" } });
          sel.append(el("option", { value: "" }, "— Or load a template —"));
          ContractTemplates.all().forEach((t) => sel.append(el("option", { value: t.id }, t.name)));
          sel.value = lastTemplateId;
          sel.addEventListener("change", () => {
            const t = ContractTemplates.get(sel.value);
            if (t) { text = t.body || ""; lastTemplateId = sel.value; ta.value = text; render(); }
          });
          return sel;
        })(),
        el("button", { class: "btn ghost", onclick: () => { text = ""; ta.value = ""; render(); } }, "Clear"),
        el("button", { class: "btn primary", onclick: askAI }, "Ask AI"),
      ),

      (function () {
        const ta = el("textarea", {
          class: "textarea",
          style: { minHeight: "240px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" },
          placeholder: "Paste contract text here…",
        }, text);
        ta.addEventListener("input", (e) => { text = e.target.value; renderResults(); });
        // We need a reference to the textarea elsewhere
        node._ta = ta;
        return ta;
      })(),

      el("div", { id: "scan-results", style: { marginTop: "16px" } }, renderResultsBody(flags, highlightHtml)),
      el("div", { id: "ai-results" }),
    );
    // Wire late ref to ta so dropdown can reset
    if (node._ta) ta = node._ta;
  };

  async function askAI() {
    const target = node.querySelector("#ai-results");
    if (!target) return;
    target.innerHTML = "";
    if (!text.trim()) {
      target.append(el("div", { class: "small muted" }, "Paste a contract first."));
      return;
    }
    const { llmIsConnected, llmGenerate } = await import("../llm.js");
    const { toast } = await import("../ui.js");
    if (!llmIsConnected()) {
      target.append(el("div", { class: "card", style: { borderLeft: "3px solid var(--warn)" } },
        el("strong", {}, "AI not connected"),
        el("div", { class: "small muted", style: { marginTop: 4 } }, "Add an API key under "),
        el("a", { href: "#/connect" }, "Settings → Connect"),
        el("span", {}, " to enable AI redline.")));
      return;
    }
    target.append(el("div", { class: "card" }, el("div", { class: "small muted" }, "Asking AI…")));
    const sys = "You are a creator-side contract reviewer. Output: 1) overall risk score (low/med/high) with one sentence, 2) up to 5 bullet flags (term + why it matters + suggested redline). Be concise.";
    try {
      const out = await llmGenerate({ system: sys, user: "Review this contract:\n\n" + text.slice(0, 12000), maxTokens: 800 });
      target.innerHTML = "";
      target.append(el("div", { class: "card" },
        el("div", { class: "spread" },
          el("strong", {}, "AI redline"),
          el("button", { class: "btn sm", onclick: () => { navigator.clipboard.writeText(out); toast("Copied"); } }, "Copy"),
        ),
        el("pre", { style: { whiteSpace: "pre-wrap", marginTop: 10, fontFamily: "-apple-system, sans-serif", fontSize: "13px", lineHeight: 1.5 } }, out),
      ));
    } catch (e) {
      target.innerHTML = "";
      target.append(el("div", { class: "card", style: { borderLeft: "3px solid var(--danger)" } },
        el("strong", {}, "AI request failed"),
        el("div", { class: "small muted", style: { marginTop: 4 } }, e.message),
      ));
    }
  }

  let ta;
  const renderResults = () => {
    const flags = scan(text);
    const html = highlight(text, flags);
    const c = node.querySelector("#scan-results");
    if (c) {
      c.innerHTML = "";
      c.append(renderResultsBody(flags, html));
    }
  };

  function renderResultsBody(flags, highlightedHtml) {
    if (!text.trim()) {
      return el("div", { class: "empty small" }, "Paste contract text above to scan.");
    }
    const grouped = {};
    flags.forEach((f) => { (grouped[f.label] = grouped[f.label] || []).push(f); });
    return el("div", { class: "dash-grid" },
      el("div", { class: "card" },
        el("h3", {}, `Risk findings · ${flags.length} match${flags.length === 1 ? "" : "es"}`),
        flags.length === 0
          ? el("div", { class: "small muted" }, "No common risk patterns detected.")
          : el("div", { class: "list" },
              ...Object.entries(grouped).map(([label, items]) => {
                const sev = items[0].severity;
                const cls = sev === "high" ? "red" : sev === "medium" ? "amber" : "blue";
                return el("div", { class: "list-row", style: { display: "block", padding: "8px 0" } },
                  el("div", { class: "row spread" },
                    el("strong", {}, label),
                    el("span", { class: `pill ${cls}` }, sev),
                  ),
                  el("div", { class: "small muted", style: { marginTop: 4 } }, items[0].why),
                  el("div", { class: "small", style: { marginTop: 4 } }, `${items.length} occurrence${items.length === 1 ? "" : "s"}`),
                );
              }),
            ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Highlighted contract"),
        el("div", { class: "wiki-md", style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px", lineHeight: 1.5 }, html: highlightedHtml }),
      ),
    );
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function scan(text) {
  const flags = [];
  if (!text) return flags;
  RISK_PATTERNS.forEach((p) => {
    let m;
    const reAll = new RegExp(p.re.source, "gi");
    while ((m = reAll.exec(text)) !== null) {
      flags.push({ ...p, index: m.index, match: m[0] });
      if (flags.length > 200) break;
    }
  });
  return flags;
}

function highlight(text, flags) {
  if (!text) return "";
  if (!flags.length) return escHtml(text);
  const sorted = [...flags].sort((a, b) => a.index - b.index);
  let html = "";
  let pos = 0;
  for (const f of sorted) {
    if (f.index < pos) continue;
    html += escHtml(text.slice(pos, f.index));
    const cls = f.severity === "high" ? "red" : f.severity === "medium" ? "amber" : "blue";
    html += `<mark class="risk-${cls}" title="${escHtml(f.label)}: ${escHtml(f.why)}">${escHtml(f.match)}</mark>`;
    pos = f.index + f.match.length;
  }
  html += escHtml(text.slice(pos));
  return html;
}
