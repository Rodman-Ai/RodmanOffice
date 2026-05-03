/**
 * @file LLM-backed creator-business actions. All three openers mount a
 * modal; if the LLM isn't connected they show a "not connected" card with
 * a deep-link to `/connect`.
 *
 * - **Brief summarizer (#85)** — paste a brand brief, get key bullets.
 * - **Deal grader (#86)** — assemble a deal's terms + history of similar
 *   service-type deals, get a letter grade + redlines.
 * - **Coach mode (#89)** — 7-day stats → 5 actionable next-week moves.
 *
 * Loaded lazily by `views/dashboard.js` (AI co-pilot strip),
 * `views/deals.js` (deal detail), `views/reports.js` (Coach mode), and
 * `js/palette.js` (palette commands).
 *
 * @module aiActions
 */

import { el } from "./utils.js";
import { llmIsConnected, llmGenerate } from "./llm.js";
import { Deals, Bills, Settings } from "./store.js";
import { netFee, fmtMoney } from "./utils.js";
import { openModal, toast } from "./ui.js";

function notConnectedCard() {
  return el("div", { class: "card", style: { borderLeft: "3px solid var(--warn)" } },
    el("strong", {}, "AI not connected"),
    el("div", { class: "small muted", style: { marginTop: 4 } },
      "Add an LLM API key under ",
      el("a", { href: "#/connect" }, "Settings → Connect"),
      " to enable this feature.",
    ),
  );
}

function loadingCard(label) {
  return el("div", { class: "card" }, el("div", { class: "row" },
    el("div", { class: "small muted" }, label),
  ));
}

function renderResult(title, text) {
  return el("div", { class: "card" },
    el("div", { class: "spread" },
      el("strong", {}, title),
      el("button", { class: "btn sm", onclick: () => { navigator.clipboard.writeText(text); toast("Copied"); } }, "Copy"),
    ),
    el("pre", { style: { whiteSpace: "pre-wrap", marginTop: 10, fontFamily: "-apple-system, sans-serif", fontSize: "13px", lineHeight: 1.5 } }, text),
  );
}

function renderError(e) {
  return el("div", { class: "card", style: { borderLeft: "3px solid var(--danger)" } },
    el("strong", {}, "AI request failed"),
    el("div", { class: "small muted", style: { marginTop: 4 } }, e.message || String(e)),
  );
}

// ---- #85 Brief summarizer ----
/**
 * Open the brief-summarizer modal. The LLM extracts brand+deliverable, key
 * dates, mandatory talking points, exclusivity / usage / kill-fee terms,
 * and open questions to clarify back to the brand.
 * @param {string} [prefillText=""] Optionally pre-fill the textarea (e.g. with
 *   the deal's notes when invoked from the deal detail page).
 */
export function openBriefSummarizer(prefillText = "") {
  const ta = el("textarea", { class: "textarea", style: { minHeight: "200px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" }, placeholder: "Paste the brand brief here…" }, prefillText);
  const out = el("div", { style: { marginTop: 12 } });
  const run = async () => {
    if (!llmIsConnected()) { out.innerHTML = ""; out.append(notConnectedCard()); return; }
    if (!ta.value.trim()) { toast("Paste a brief first", "warn"); return; }
    out.innerHTML = "";
    out.append(loadingCard("Summarizing…"));
    try {
      const text = await llmGenerate({
        system: "You are a creator-side brief summarizer. Output ONLY:\n• Brand & deliverable in one line\n• Key dates (draft due, post date) as bullets\n• Mandatory talking points / disclosures\n• Exclusivity / usage-rights / kill-fee terms\n• Open questions to clarify back to the brand\nKeep the whole thing under 200 words.",
        user: ta.value.slice(0, 12000),
        maxTokens: 700,
      });
      out.innerHTML = "";
      out.append(renderResult("Brief summary", text));
    } catch (e) {
      out.innerHTML = "";
      out.append(renderError(e));
    }
  };
  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, "Paste the brand's brief; the AI will pull out the key bullets and flag open questions."),
    ta,
    el("div", { class: "row" },
      el("button", { class: "btn primary", onclick: run }, "Summarize"),
      el("button", { class: "btn", onclick: () => { ta.value = ""; out.innerHTML = ""; } }, "Clear"),
    ),
    out,
  );
  openModal({ title: "Brief summarizer", body, wide: true });
}

// ---- #86 AI deal grader ----
/**
 * Open the deal-grader modal for a specific deal. Composes a structured
 * summary of the deal's terms + a list of historical deals with the same
 * service type, then asks the LLM for a letter grade, up to 5 redlined
 * red flags, and a one-sentence next-round ask.
 * @param {object} deal
 */
export function openDealGrader(deal) {
  const out = el("div", { style: { marginTop: 12 } });
  const summary = `Brand: ${deal.company || "—"}
Service type: ${deal.svc || "—"}
Quoted fee: ${fmtMoney(deal.quotedFee || 0)}
Accepted fee: ${fmtMoney(deal.fee || 0)}
Partner fee: ${deal.partnerFeePct || 0}%
Currency: ${deal.currency || "USD"}
Terms: net ${deal.terms || 30}
Service date: ${deal.serviceDate || "—"}
Post date: ${deal.postDate || "—"}
Draft due: ${deal.draftDue || "—"}
Exclusivity: ${deal.exclusivityFrom || "—"} → ${deal.exclusivityTo || "—"}
Usage rights until: ${deal.usageRightsUntil || "—"}
Withholding: ${deal.withholdingPct || 0}% ${deal.withholdingTreaty || ""}
Notes: ${deal.notes || "(none)"}`;
  // History context for benchmark
  const history = Deals.all().filter((d) => d.id !== deal.id && d.svc === deal.svc && +d.fee > 0).slice(0, 24);
  const historyLines = history.length
    ? history.map((d) => `- ${d.company} · ${d.svc} · ${fmtMoney(d.fee)} ${d.paidDate ? "(paid " + d.paidDate + ")" : "(unpaid)"}`).join("\n")
    : "(no history)";

  const run = async () => {
    if (!llmIsConnected()) { out.innerHTML = ""; out.append(notConnectedCard()); return; }
    out.innerHTML = "";
    out.append(loadingCard("Grading…"));
    try {
      const text = await llmGenerate({
        system: "You are a creator-side deal grader. Output:\n1) Letter grade (A–F) with one-sentence rationale.\n2) Up to 5 specific red flags with suggested redlines (terms, exclusivity, usage windows, fee gap vs history).\n3) One-sentence summary of what to ask for in the next round of negotiation.\nBe concise.",
        user: `Deal to evaluate:\n${summary}\n\nHistorical context for similar service type:\n${historyLines}`,
        maxTokens: 700,
      });
      out.innerHTML = "";
      out.append(renderResult(`Grade · ${deal.company}`, text));
    } catch (e) {
      out.innerHTML = "";
      out.append(renderError(e));
    }
  };

  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, "AI reviews the deal terms, benchmarks against your history of similar service types, and suggests redlines."),
    el("pre", { class: "tpl-preview" }, summary),
    el("div", { class: "row" },
      el("button", { class: "btn primary", onclick: run }, "Grade this deal"),
    ),
    out,
  );
  openModal({ title: "AI deal grader", body, wide: true });
}

// ---- #89 Coach mode ----
/**
 * Open coach mode. Computes 7-day stats (cash collected, new deals, overdue
 * invoices, top-brand share) and asks the LLM for 5 specific, actionable
 * suggestions for next week. Mixes pricing, follow-up, diversification,
 * expense, and retainer tactics by design.
 */
export function openCoachMode() {
  const settings = Settings.get();
  const since = Date.now() - 7 * 86400000;
  const sinceIso = new Date(since).toISOString().slice(0, 10);
  const allDeals = Deals.all();
  const allBills = Bills.all();
  const paid = allDeals.filter((d) => d.paid && d.paidDate >= sinceIso);
  const newDeals = allDeals.filter((d) => (d.createdAt || 0) >= since);
  const overdue = allDeals.filter((d) => {
    if (d.paid) return false;
    const issue = d.invoiceDate || d.serviceDate;
    if (!issue) return false;
    const due = new Date(issue); due.setDate(due.getDate() + (d.terms || settings.defaultTerms || 30));
    return due.getTime() < Date.now();
  });
  const billsThisWeek = allBills.filter((b) => (b.date || "") >= sinceIso);
  const collected = paid.reduce((s, d) => s + (+d.paidAmount || netFee(d)), 0);
  const totalBills = billsThisWeek.reduce((s, b) => s + (+b.amount || 0), 0);

  const recentTopBrands = (function () {
    const m = {};
    allDeals.filter((d) => d.paid).forEach((d) => { m[d.company] = (m[d.company] || 0) + (+d.paidAmount || netFee(d)); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `- ${k}: ${fmtMoney(v)}`).join("\n");
  })();
  const concentration = (function () {
    const m = {};
    allDeals.filter((d) => d.paid && (d.paidDate || "").startsWith(String(new Date().getFullYear()))).forEach((d) => { m[d.company] = (m[d.company] || 0) + (+d.paidAmount || netFee(d)); });
    const sorted = Object.values(m).sort((a, b) => b - a);
    const total = sorted.reduce((a, b) => a + b, 0);
    return total ? Math.round((sorted[0] || 0) / total * 100) : 0;
  })();

  const out = el("div", { style: { marginTop: 12 } });

  const run = async () => {
    if (!llmIsConnected()) { out.innerHTML = ""; out.append(notConnectedCard()); return; }
    out.innerHTML = "";
    out.append(loadingCard("Reviewing your week…"));
    try {
      const stats = `Last 7 days
- Cash collected: ${fmtMoney(collected)} from ${paid.length} payment(s)
- New deals booked: ${newDeals.length}
- Overdue invoices: ${overdue.length}
- Bills logged: ${fmtMoney(totalBills)}
Top earners (lifetime paid):
${recentTopBrands}
Brand concentration (this year): ${concentration}% from top brand`;
      const text = await llmGenerate({
        system: "You are a creator-business coach. Look at the recent stats below and give the user 5 concise, specific, actionable suggestions to improve next week. Mix tactics: pricing, follow-ups on overdue, brand diversification if concentrated, expense optimization, retainer opportunities. Plain bullets. No fluff.",
        user: stats,
        maxTokens: 600,
      });
      out.innerHTML = "";
      out.append(renderResult("Coach suggestions for next week", text));
    } catch (e) {
      out.innerHTML = "";
      out.append(renderError(e));
    }
  };

  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, "AI looks at your last 7 days + current concentration and suggests next-week moves."),
    el("div", { class: "kpi-grid" },
      el("div", { class: "card kpi" }, el("div", { class: "kpi-sub" }, "Collected · 7d"), el("div", { class: "kpi-value" }, fmtMoney(collected))),
      el("div", { class: "card kpi" }, el("div", { class: "kpi-sub" }, "New deals"), el("div", { class: "kpi-value" }, String(newDeals.length))),
      el("div", { class: "card kpi" }, el("div", { class: "kpi-sub" }, "Overdue"), el("div", { class: "kpi-value" }, String(overdue.length))),
      el("div", { class: "card kpi" }, el("div", { class: "kpi-sub" }, "Top-brand share"), el("div", { class: "kpi-value" }, `${concentration}%`)),
    ),
    el("div", { class: "row" },
      el("button", { class: "btn primary", onclick: run }, "Get suggestions"),
    ),
    out,
  );
  openModal({ title: "Coach mode", body, wide: true });
}
