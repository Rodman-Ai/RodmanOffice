// Reusable form builders for the main entities.

import { el, field } from "./utils.js";
import { Contacts, Deals, Bills, Settings, VendorRules, DealTemplates, Agents } from "./store.js";
import { SERVICE_OPTIONS, todayISO, netFee, fmtMoney } from "./utils.js";
import { openModal, toast } from "./ui.js";
import { parseDealText } from "./nl.js";

function input(value, type = "text", attrs = {}) {
  return el("input", { class: "input", type, value: value ?? "", ...attrs });
}
function selectEl(value, options, attrs = {}) {
  const s = el("select", { class: "select", ...attrs });
  for (const o of options) {
    const opt = el("option", { value: o.value }, o.label);
    if (String(o.value) === String(value ?? "")) opt.selected = true;
    s.append(opt);
  }
  return s;
}

function contactSelect(value, name = "contactId") {
  const list = Contacts.all();
  const opts = [{ value: "", label: "— Select brand / contact —" }].concat(
    list.map((c) => ({ value: c.id, label: c.name })),
  );
  opts.push({ value: "__new", label: "+ New contact…" });
  return selectEl(value, opts, { name });
}

export function openDealForm(deal) {
  const isNew = !deal?.id;
  const settings = Settings.get();
  const d = deal || {
    company: "", contactId: "", svc: "p", fee: 0, partnerFeePct: 0, paidAmount: 0,
    paid: false, paidDate: "", payMethod: "", serviceDate: todayISO(), postDate: "", draftDue: "",
    contractUrl: "", briefUrl: "", draftUrl: "", portalUrl: "", notesUrl: "",
    invoiceNumber: "", invoiceDate: "", invoiceUrl: "", invoiceTo: "",
    transactionId: "", year: new Date().getFullYear(), notes: "",
    deliverables: [], partials: [], terms: settings.defaultTerms || 0,
    creditNoteOf: "", quotedFee: 0,
  };

  const company = input(d.company, "text", { placeholder: "e.g. Descript", required: true });
  const contact = contactSelect(d.contactId);
  // Auto-fill from brand defaults when picking a contact (#5).
  contact.addEventListener("change", () => {
    if (contact.value === "__new") {
      const name = prompt("New contact name");
      if (name) {
        const c = Contacts.ensure(name);
        contact.replaceWith(contactSelect(c.id));
        company.value = company.value || name;
      } else {
        contact.value = d.contactId || "";
      }
    } else {
      const c = Contacts.get(contact.value);
      if (c) {
        if (!company.value) company.value = c.name;
        // Auto-fill defaults if deal is empty
        if (isNew && c.defaultRates) {
          const rate = c.defaultRates[svc.value];
          if (rate && !fee.value) { fee.value = rate; recalcNet(); }
        }
        refreshSmartFee();
      }
    }
  });

  // Smart fee suggestion (#82): when brand + service known, surface average
  // accepted fee from your history.
  const smartFeeHint = el("div", { class: "small muted" });
  function refreshSmartFee() {
    const ctxBrand = (company.value || "").trim().toLowerCase();
    const ctxSvc = (svc.value || "").toLowerCase();
    if (!ctxBrand && !ctxSvc) { smartFeeHint.textContent = ""; return; }
    const history = Deals.all().filter((dl) => dl.id !== d.id);
    const sameBoth = history.filter((dl) => (dl.company || "").toLowerCase() === ctxBrand && (dl.svc || "").toLowerCase() === ctxSvc && +dl.fee > 0);
    const sameSvc = history.filter((dl) => (dl.svc || "").toLowerCase() === ctxSvc && +dl.fee > 0);
    let basis = sameBoth.length >= 2 ? sameBoth : sameSvc.length >= 3 ? sameSvc : null;
    if (!basis) { smartFeeHint.textContent = ""; return; }
    const sorted = basis.map((dl) => +dl.fee).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const last = basis.sort((a, b) => (b.serviceDate || "").localeCompare(a.serviceDate || ""))[0];
    smartFeeHint.innerHTML = `<span style="color:var(--info)">💡 ${basis === sameBoth ? "This brand" : "This service"}: median ${fmtMoney(median)} (n=${basis.length})${last?.serviceDate ? ", last " + fmtMoney(+last.fee) + " on " + last.serviceDate : ""}</span>`;
  }
  // (Smart-fee wiring is bound *after* `svc` is declared, below — referencing
  // svc here would TDZ-throw because of the lexical const-not-yet-initialised
  // semantics in module mode.)

  const svc = selectEl(d.svc, SERVICE_OPTIONS.map((s) => ({ value: s.key, label: s.label })));
  const fee = input(d.fee, "number", { step: "0.01", min: "0" });
  const partnerFee = input(d.partnerFeePct, "number", { step: "0.01", min: "0", placeholder: "e.g. 3.5" });
  const paidAmount = input(d.paidAmount, "number", { step: "0.01", min: "0", placeholder: "auto" });
  const paid = input(null, "checkbox", { checked: d.paid });
  const paidDate = input(d.paidDate, "date");
  // Smart-fee wiring (was here previously but referenced `svc` before declaration).
  svc.addEventListener("change", refreshSmartFee);
  setTimeout(refreshSmartFee, 50);
  const payMethod = input(d.payMethod, "text", { placeholder: "Stripe, Brex, ACH, partnerstack…" });
  const serviceDate = input(d.serviceDate, "date");
  const postDate = input(d.postDate, "date");
  const draftDue = input(d.draftDue, "date");
  const invNumber = input(d.invoiceNumber, "text", { placeholder: "auto on first save" });
  const invDate = input(d.invoiceDate, "date");
  const invUrl = input(d.invoiceUrl, "url", { placeholder: "https://" });
  const invoiceTo = input(d.invoiceTo, "text", { placeholder: "Billing address / entity" });
  const contractUrl = input(d.contractUrl, "url", { placeholder: "https://" });
  const briefUrl = input(d.briefUrl, "url", { placeholder: "https://" });
  const draftUrl = input(d.draftUrl, "url", { placeholder: "https://" });
  const portalUrl = input(d.portalUrl, "url", { placeholder: "https://" });
  const notesUrl = input(d.notesUrl, "url", { placeholder: "https://" });
  const transactionId = input(d.transactionId, "text", { placeholder: "Bank/Stripe ref" });
  const notes = el("textarea", { class: "textarea", placeholder: "Notes" }, d.notes || "");
  // Time tracking (#75): hours worked → effective hourly rate.
  const hoursWorked = input(d.hoursWorked || "", "number", { step: "0.25", min: "0", placeholder: "e.g. 6" });
  const hourlyHint = el("div", { class: "small muted" });
  const refreshHourly = () => {
    const h = +hoursWorked.value || 0;
    if (!h) { hourlyHint.textContent = ""; return; }
    const rate = (((+fee.value || 0) * (1 - (+partnerFee.value || 0) / 100)) / h);
    hourlyHint.textContent = `Effective rate: ${fmtMoney(rate)}/hr`;
  };
  hoursWorked.addEventListener("input", refreshHourly);
  // Per-platform performance attribution (#94): post-publish metrics.
  const perfPlatform = selectEl(d.perfPlatform || "", [{ value: "", label: "—" }, { value: "yt", label: "YouTube" }, { value: "ig", label: "Instagram" }, { value: "tt", label: "TikTok" }, { value: "x", label: "X" }, { value: "ln", label: "LinkedIn" }, { value: "fb", label: "Facebook" }]);
  const perfViews = input(d.perfViews || "", "number", { step: "1", min: "0" });
  const perfEngagements = input(d.perfEngagements || "", "number", { step: "1", min: "0" });
  // Foreign-wire fee (#30): manual flag + amount logged into deal.
  const wireFee = input(d.wireFee || "", "number", { step: "0.01", min: "0", placeholder: "e.g. 25" });
  // International withholding flag (#37)
  const withholdingPct = input(d.withholdingPct || "", "number", { step: "0.01", min: "0", max: "100", placeholder: "e.g. 30" });
  const withholdingTreaty = input(d.withholdingTreaty || "", "text", { placeholder: "e.g. US-DE Article 12 (royalties)" });
  // Invoice approval workflow (#48): "draft" | "sent" | "approved" | "rejected" | "n/a"
  const approvalStatus = selectEl(d.approvalStatus || "n/a", [
    { value: "n/a", label: "Not applicable" },
    { value: "draft", label: "Draft" },
    { value: "sent", label: "Sent for approval" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected — needs rework" },
  ]);
  const approvalNote = input(d.approvalNote || "", "text", { placeholder: "Approver / reason" });
  const baseCcy = (Settings.get().currency || "USD");
  const dealCcy = selectEl(d.currency || baseCcy, ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR", "CHF", "BRL", "MXN", "SGD"].map((v) => ({ value: v, label: v })));
  const fxRate = input(d.fxRate || "", "number", { step: "0.000001", min: "0", placeholder: `to ${baseCcy} (1.00 if same)` });
  const fxNote = el("div", { class: "small muted" });
  const refreshFx = () => {
    if (dealCcy.value === baseCcy) { fxNote.textContent = "Base currency — FX not applied."; if (!fxRate.value) fxRate.value = "1"; return; }
    const r = +fxRate.value || 0;
    if (!r) fxNote.textContent = `Set the FX rate from 1 ${dealCcy.value} → ${baseCcy} on the day of the deal.`;
    else fxNote.textContent = `Net at base: ${fmtMoney(((+fee.value || 0) * (1 - (+partnerFee.value || 0) / 100)) * r)}`;
  };
  dealCcy.addEventListener("change", refreshFx);
  fxRate.addEventListener("input", refreshFx);
  const exclusivityFrom = input(d.exclusivityFrom || "", "date");
  const exclusivityTo = input(d.exclusivityTo || "", "date");
  const usageRightsUntil = input(d.usageRightsUntil || "", "date");
  // Agent (#59)
  const agentList = Agents.all();
  const agentOptions = () => [
    { value: "", label: "— None —" },
    ...agentList.map((a) => ({ value: a.id, label: a.name + (a.defaultPct ? ` (${a.defaultPct}%)` : "") })),
    { value: "__new", label: "+ New agent…" },
  ];
  const agent = selectEl(d.agentId || "", agentOptions());
  const agentPct = input(d.agentPct || "", "number", { step: "0.1", min: "0", max: "100", placeholder: "% commission" });
  agent.addEventListener("change", () => {
    if (agent.value === "__new") {
      const name = prompt("Agent / manager name");
      if (name) {
        const a = Agents.save({ name: name.trim(), defaultPct: +agentPct.value || 10 });
        agent.replaceWith(selectEl(a.id, [
          { value: "", label: "— None —" },
          ...Agents.all().map((x) => ({ value: x.id, label: x.name + (x.defaultPct ? ` (${x.defaultPct}%)` : "") })),
          { value: "__new", label: "+ New agent…" },
        ]));
      } else agent.value = d.agentId || "";
    } else if (agent.value) {
      const a = Agents.get(agent.value);
      if (a && !agentPct.value) agentPct.value = a.defaultPct || "";
    }
  });
  const terms = selectEl(d.terms ?? "", [
    { value: "", label: "Due on receipt" },
    { value: "15", label: "Net 15" },
    { value: "30", label: "Net 30" },
    { value: "45", label: "Net 45" },
    { value: "60", label: "Net 60" },
    { value: "90", label: "Net 90" },
  ]);
  const quotedFee = input(d.quotedFee || "", "number", { step: "0.01", min: "0", placeholder: "What you originally quoted" });
  const creditOptions = [{ value: "", label: "— None (regular deal) —" }].concat(
    Deals.all().filter((x) => x.id !== d.id && x.invoiceNumber).map((x) => ({ value: x.id, label: `${x.company} · ${x.invoiceNumber}` })),
  );
  const creditNoteOf = selectEl(d.creditNoteOf || "", creditOptions);

  // Dispute / chargeback log (#47): array of { date, status, amount, note }
  let disputes = (d.disputes || []).slice();
  const disputeBox = el("div", { class: "disputes" });
  const renderDisputes = () => {
    disputeBox.innerHTML = "";
    disputes.forEach((dx, i) => {
      const date = input(dx.date || todayISO(), "date");
      date.addEventListener("input", () => { disputes[i].date = date.value; });
      const status = selectEl(dx.status || "open", [
        { value: "open", label: "Open" },
        { value: "investigating", label: "Investigating" },
        { value: "won", label: "Won — funds returned" },
        { value: "lost", label: "Lost — refunded" },
        { value: "withdrawn", label: "Withdrawn" },
      ]);
      status.addEventListener("change", () => { disputes[i].status = status.value; });
      const amt = input(dx.amount || 0, "number", { step: "0.01", min: "0" });
      amt.addEventListener("input", () => { disputes[i].amount = +amt.value || 0; });
      const note = input(dx.note || "", "text", { placeholder: "Reason / case ID" });
      note.addEventListener("input", () => { disputes[i].note = note.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { disputes.splice(i, 1); renderDisputes(); } }, "×");
      disputeBox.append(el("div", { class: "dispute-row" }, date, status, amt, note, remove));
    });
    disputeBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { disputes.push({ date: todayISO(), status: "open", amount: 0, note: "" }); renderDisputes(); } }, "+ Log dispute"));
  };
  renderDisputes();

  // Tiered / escalator line items (#3): when present, fee = sum of line amounts.
  let lineItems = (d.lineItems || []).slice();
  const linesBox = el("div", { class: "lines" });
  const renderLines = () => {
    linesBox.innerHTML = "";
    lineItems.forEach((li, i) => {
      const desc = input(li.desc || "", "text", { placeholder: "Line description" });
      desc.addEventListener("input", () => { lineItems[i].desc = desc.value; });
      const amt = input(li.amount || 0, "number", { step: "0.01", min: "0" });
      amt.addEventListener("input", () => { lineItems[i].amount = +amt.value || 0; recalcFromLines(); });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { lineItems.splice(i, 1); renderLines(); recalcFromLines(); } }, "×");
      linesBox.append(el("div", { class: "line-row" }, desc, amt, remove));
    });
    const total = lineItems.reduce((s, li) => s + (+li.amount || 0), 0);
    linesBox.append(el("div", { class: "row spread", style: { marginTop: 6 } },
      el("button", { class: "btn sm", type: "button", onclick: () => { lineItems.push({ desc: "", amount: 0 }); renderLines(); } }, "+ Add line"),
      el("div", { class: "small muted" }, lineItems.length ? `${lineItems.length} lines · ${fmtMoney(total)}` : "Use line items for tiered/escalator deals"),
    ));
  };
  function recalcFromLines() {
    if (lineItems.length) {
      const total = lineItems.reduce((s, li) => s + (+li.amount || 0), 0);
      fee.value = total.toFixed(2);
      recalcNet();
    }
  }
  renderLines();

  // Deliverables checklist (#4)
  let deliverables = (d.deliverables || []).slice();
  const dlvList = el("div", { class: "deliverables" });
  const renderDeliverables = () => {
    dlvList.innerHTML = "";
    deliverables.forEach((dl, i) => {
      const checkbox = input(null, "checkbox", { checked: !!dl.done });
      checkbox.addEventListener("change", () => { deliverables[i].done = checkbox.checked; });
      const label = input(dl.label || "", "text", { placeholder: "Deliverable" });
      label.addEventListener("input", () => { deliverables[i].label = label.value; });
      const due = input(dl.due || "", "date");
      due.addEventListener("input", () => { deliverables[i].due = due.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { deliverables.splice(i, 1); renderDeliverables(); } }, "×");
      dlvList.append(el("div", { class: "deliverable-row" }, checkbox, label, due, remove));
    });
    const presets = ["Script", "B-roll", "Thumbnail", "Draft", "Post", "Repost"];
    const addRow = el("div", { class: "row", style: { marginTop: "6px", flexWrap: "wrap", gap: "4px" } },
      el("button", { class: "btn sm", type: "button", onclick: () => { deliverables.push({ label: "", done: false, due: "" }); renderDeliverables(); } }, "+ Add"),
      ...presets.map((p) => el("button", { class: "btn sm ghost", type: "button", onclick: () => {
        if (!deliverables.some((x) => (x.label || "").toLowerCase() === p.toLowerCase())) {
          deliverables.push({ label: p, done: false, due: "" });
          renderDeliverables();
        }
      } }, "+ " + p)),
    );
    dlvList.append(addRow);
  };
  renderDeliverables();

  // Partial payments ledger (#44)
  let partials = (d.partials || []).slice();
  const partialsBox = el("div", { class: "partials" });
  const renderPartials = () => {
    partialsBox.innerHTML = "";
    partials.forEach((p, i) => {
      const date = input(p.date || todayISO(), "date");
      date.addEventListener("input", () => { partials[i].date = date.value; });
      const amount = input(p.amount || 0, "number", { step: "0.01", min: "0" });
      amount.addEventListener("input", () => { partials[i].amount = +amount.value || 0; recalcPaidFromPartials(); });
      const note = input(p.note || "", "text", { placeholder: "Memo" });
      note.addEventListener("input", () => { partials[i].note = note.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { partials.splice(i, 1); renderPartials(); recalcPaidFromPartials(); } }, "×");
      partialsBox.append(el("div", { class: "partial-row" }, date, amount, note, remove));
    });
    const total = partials.reduce((s, p) => s + (+p.amount || 0), 0);
    partialsBox.append(el("div", { class: "row spread", style: { marginTop: "6px" } },
      el("button", { class: "btn sm", type: "button", onclick: () => { partials.push({ date: todayISO(), amount: 0, note: "" }); renderPartials(); } }, "+ Record payment"),
      el("div", { class: "small muted" }, `${partials.length} payment${partials.length === 1 ? "" : "s"} · ${fmtMoney(total)}`),
    ));
  };
  function recalcPaidFromPartials() {
    if (!partials.length) return;
    const total = partials.reduce((s, p) => s + (+p.amount || 0), 0);
    paidAmount.value = total.toFixed(2);
    if (total >= netFee({ fee: +fee.value || 0, partnerFeePct: +partnerFee.value || 0, paidAmount: 0 }) - 0.01) {
      paid.checked = true;
      const last = partials.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).pop();
      if (last?.date && !paidDate.value) paidDate.value = last.date;
    }
    recalcNet();
  }
  renderPartials();

  const netHint = el("div", { class: "small muted" }, "");
  const feeHint = el("div", { class: "small muted" }, "");
  const recalcNet = () => {
    const n = netFee({ fee: +fee.value || 0, partnerFeePct: +partnerFee.value || 0, paidAmount: +paidAmount.value || 0 });
    netHint.textContent = `Net: ${fmtMoney(n)}`;
  };
  // Smart fee suggestion (#82)
  const refreshFeeHint = () => {
    const id = contact.value && contact.value !== "__new" ? contact.value : null;
    const svcKey = svc.value;
    if (!id) { feeHint.textContent = ""; return; }
    const past = Deals.all().filter((dl) => dl.contactId === id && dl.svc === svcKey && dl.fee > 0);
    if (!past.length) { feeHint.textContent = ""; return; }
    const fees = past.map((p) => +p.fee).sort((a, b) => a - b);
    const med = fees[Math.floor(fees.length / 2)];
    const max = fees[fees.length - 1];
    feeHint.textContent = `History (${past.length}): median ${fmtMoney(med)} · max ${fmtMoney(max)}`;
  };
  [fee, partnerFee, paidAmount].forEach((i) => i.addEventListener("input", recalcNet));
  contact.addEventListener("change", refreshFeeHint);
  svc.addEventListener("change", refreshFeeHint);
  recalcNet();
  refreshFeeHint();

  const body = el("div", { class: "form-grid" },
    field("Brand / Company", company, { full: true }),
    field("Contact", contact),
    field("Service type", svc),
    el("div", { class: "field" }, el("label", {}, "Fee ($)"), fee, feeHint),
    field("Quoted fee ($)", quotedFee),
    field("Partner fee %", partnerFee),
    field("Paid amount (actual)", paidAmount),
    el("div", { class: "field full small muted" }, netHint),
    el("div", { class: "field full" }, smartFeeHint),
    field("Service / Filming date", serviceDate),
    field("Post date", postDate),
    field("Draft due", draftDue),
    field("Pay method", payMethod),
    field("Paid date", paidDate),
    el("div", { class: "field" }, el("label", {}, "Paid?"), el("div", {}, paid)),
    field("Invoice #", invNumber),
    field("Invoice date", invDate),
    field("Currency", dealCcy),
    field(`FX rate (1 ${baseCcy === "USD" ? "deal-ccy" : baseCcy})`, fxRate),
    el("div", { class: "field full small muted" }, fxNote),
    field("Payment terms", terms),
    field("Credit-note for", creditNoteOf),
    field("Invoice URL", invUrl, { full: true }),
    field("Invoice to (billing)", invoiceTo, { full: true }),
    field("Agent / manager", agent),
    field("Agent commission %", agentPct),
    field("Exclusivity from", exclusivityFrom),
    field("Exclusivity to", exclusivityTo),
    field("Usage rights until", usageRightsUntil),
    el("div", { class: "field full" }, el("label", {}, "Line items (tiered fees)"), linesBox),
    el("div", { class: "field full" }, el("label", {}, "Deliverables"), dlvList),
    el("div", { class: "field full" }, el("label", {}, "Payment ledger"), partialsBox),
    field("Contract URL", contractUrl),
    field("Brief URL", briefUrl),
    field("Draft URL", draftUrl),
    field("Portal URL", portalUrl),
    field("Notes URL (GPT/Doc)", notesUrl),
    field("Transaction / Ref", transactionId),
    field("Foreign-wire fee ($)", wireFee),
    field("Withholding %", withholdingPct),
    field("Treaty / withholding note", withholdingTreaty, { full: true }),
    field("Approval status", approvalStatus),
    field("Approval note", approvalNote),
    el("div", { class: "field full" }, el("label", {}, "Disputes / chargebacks"), disputeBox),
    field("Hours worked", hoursWorked),
    el("div", { class: "field full small muted" }, hourlyHint),
    field("Performance: platform", perfPlatform),
    field("Performance: views", perfViews),
    field("Performance: engagements", perfEngagements),
    field("Notes", notes, { full: true }),
  );

  let modal;
  const save = () => {
    if (!company.value.trim()) { toast("Company is required", "warn"); return; }
    // #13 Validation: fee, partner-fee %, FX rate, date sanity, withholding %.
    if (+fee.value < 0) { toast("Fee can't be negative", "warn"); return; }
    if (+partnerFee.value < 0 || +partnerFee.value > 100) { toast("Partner fee % must be 0–100", "warn"); return; }
    if (+withholdingPct.value < 0 || +withholdingPct.value > 100) { toast("Withholding % must be 0–100", "warn"); return; }
    if (dealCcy.value !== baseCcy && (!fxRate.value || +fxRate.value <= 0)) {
      toast(`Set a positive FX rate (${dealCcy.value} → ${baseCcy})`, "warn");
      return;
    }
    if (paidDate.value && serviceDate.value && paidDate.value < serviceDate.value) {
      toast("Paid date can't be before service date", "warn"); return;
    }
    if (exclusivityFrom.value && exclusivityTo.value && exclusivityFrom.value > exclusivityTo.value) {
      toast("Exclusivity end is before start", "warn"); return;
    }
    let cId = contact.value && contact.value !== "__new" ? contact.value : null;
    if (!cId) {
      const c = Contacts.ensure(company.value.trim());
      cId = c?.id;
    }
    let invNum = invNumber.value.trim();
    if (!invNum && (invDate.value || invUrl.value || paid.checked)) {
      const n = Settings.nextInvoiceNumber();
      invNum = `${Settings.get().invoicePrefix || "INV"}-${n}`;
    }
    const saved = Deals.save({
      id: d.id,
      contactId: cId,
      company: company.value.trim(),
      svc: svc.value,
      fee: +fee.value || 0,
      quotedFee: +quotedFee.value || 0,
      partnerFeePct: +partnerFee.value || 0,
      paidAmount: +paidAmount.value || 0,
      paid: paid.checked,
      paidDate: paidDate.value,
      payMethod: payMethod.value,
      serviceDate: serviceDate.value,
      postDate: postDate.value,
      draftDue: draftDue.value,
      contractUrl: contractUrl.value,
      briefUrl: briefUrl.value,
      draftUrl: draftUrl.value,
      portalUrl: portalUrl.value,
      notesUrl: notesUrl.value,
      invoiceNumber: invNum,
      invoiceDate: invDate.value,
      invoiceUrl: invUrl.value,
      invoiceTo: invoiceTo.value,
      transactionId: transactionId.value,
      notes: notes.value,
      terms: terms.value ? +terms.value : 0,
      creditNoteOf: creditNoteOf.value || "",
      currency: dealCcy.value || baseCcy,
      fxRate: dealCcy.value === baseCcy ? 1 : (+fxRate.value || 0),
      hoursWorked: +hoursWorked.value || 0,
      perfPlatform: perfPlatform.value,
      perfViews: +perfViews.value || 0,
      perfEngagements: +perfEngagements.value || 0,
      wireFee: +wireFee.value || 0,
      withholdingPct: +withholdingPct.value || 0,
      withholdingTreaty: withholdingTreaty.value,
      approvalStatus: approvalStatus.value,
      approvalNote: approvalNote.value,
      disputes: disputes.filter((dx) => dx.amount > 0 || dx.note),
      agentId: agent.value && agent.value !== "__new" ? agent.value : "",
      agentPct: +agentPct.value || 0,
      exclusivityFrom: exclusivityFrom.value,
      exclusivityTo: exclusivityTo.value,
      usageRightsUntil: usageRightsUntil.value,
      lineItems: lineItems.filter((li) => li.desc?.trim() || +li.amount > 0),
      deliverables: deliverables.filter((x) => x.label?.trim()),
      partials: partials.filter((p) => p.amount > 0 || p.date),
      year: serviceDate.value ? +serviceDate.value.slice(0, 4) : (d.year || new Date().getFullYear()),
    });
    toast(isNew ? "Deal created" : "Deal updated", "info");
    modal.close();
    return saved;
  };

  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Create deal" : "Save changes"),
  );

  modal = openModal({ title: isNew ? "New brand deal" : "Edit deal", body, footer, wide: true });
  setTimeout(() => company.focus(), 30);
  return modal;
}

export function openBillForm(bill) {
  const isNew = !bill?.id;
  const b = bill || {
    vendor: "", category: "Software", amount: 0, date: todayISO(),
    paid: true, paidDate: todayISO(), payMethod: "", recurring: "", notes: "", receiptUrl: "",
  };
  const vendor = input(b.vendor, "text", { required: true, placeholder: "Vendor name" });
  const category = selectEl(b.category, [
    "Software", "Equipment", "Office", "Travel", "Meals", "Marketing", "Contractors", "Education", "Subscriptions", "Phone & Internet", "Home Office", "Other",
  ].map((v) => ({ value: v, label: v })));
  // Vendor → category memory (#81): suggest category from learned rules.
  vendor.addEventListener("input", () => {
    if (!isNew) return;
    const suggested = VendorRules.categoryFor(vendor.value);
    if (suggested) category.value = suggested;
  });
  const amount = input(b.amount, "number", { step: "0.01", min: "0", required: true });
  const date = input(b.date, "date");
  const paid = input(null, "checkbox", { checked: b.paid });
  const paidDate = input(b.paidDate, "date");
  const payMethod = input(b.payMethod, "text", { placeholder: "Brex card, ACH, etc." });
  const recurring = selectEl(b.recurring, [
    { value: "", label: "One-time" },
    { value: "monthly", label: "Monthly" },
    { value: "yearly", label: "Yearly" },
    { value: "weekly", label: "Weekly" },
  ]);
  const receipt = input(b.receiptUrl, "url", { placeholder: "https:// or paste data URI" });

  // Receipt OCR + camera capture (#11)
  const cameraInput = el("input", { type: "file", accept: "image/*", capture: "environment", style: { display: "none" } });
  const ocrStatus = el("span", { class: "small muted" });
  cameraInput.addEventListener("change", async () => {
    const f = cameraInput.files?.[0]; if (!f) return;
    const { fileToDataUrl } = await import("./ocr.js");
    const dataUrl = await fileToDataUrl(f);
    receipt.value = dataUrl;
    refreshReceiptPreview();
    if (!navigator.onLine) {
      // Offline: queue for later OCR + parsing (#91).
      ocrStatus.innerHTML = `<span style="color:var(--warn)">Offline — image saved locally. Will OCR when back online.</span>`;
      try {
        const { enqueue } = await import("./offlineQueue.js");
        await enqueue({ kind: "receipt", dataUrl, vendorHint: vendor.value, billId: b.id || null });
      } catch (e) { /* IDB unavailable; image still pinned in form */ }
      return;
    }
    ocrStatus.textContent = "Reading receipt…";
    try {
      const { ocrImage, extractReceiptFields } = await import("./ocr.js");
      const text = await ocrImage(f, (p) => { ocrStatus.textContent = `Reading receipt… ${(p * 100).toFixed(0)}%`; });
      const fields = extractReceiptFields(text);
      if (fields.vendor && !vendor.value) vendor.value = fields.vendor;
      if (fields.amount && !amount.value) amount.value = fields.amount.toFixed(2);
      if (fields.date && !date.value) date.value = fields.date;
      ocrStatus.innerHTML = `<span style="color:var(--accent)">✓ Extracted${fields.vendor ? ` vendor "${fields.vendor}"` : ""}${fields.amount ? `, amount $${fields.amount.toFixed(2)}` : ""}${fields.date ? `, date ${fields.date}` : ""}.</span>`;
    } catch (e) {
      ocrStatus.innerHTML = `<span style="color:var(--danger)">OCR failed: ${e.message}</span>`;
    }
  });
  const cameraBtn = el("button", { class: "btn sm", type: "button", onclick: () => cameraInput.click() }, "📷 Capture / OCR");

  const receiptPreview = el("div", { class: "small muted" });
  const refreshReceiptPreview = () => {
    receiptPreview.innerHTML = "";
    const v = receipt.value;
    if (v && (/^data:image\//.test(v) || /\.(png|jpe?g|gif|webp|heic)$/i.test(v))) {
      receiptPreview.append(el("img", { src: v, style: { maxWidth: "180px", borderRadius: "6px", marginTop: "4px" }, loading: "lazy" }));
    } else if (v) {
      receiptPreview.append(el("a", { href: receipt.value, target: "_blank", rel: "noreferrer" }, "Open receipt ↗"));
    }
  };
  receipt.addEventListener("input", refreshReceiptPreview);
  refreshReceiptPreview();
  // Pre-tax / deductibility flag (#15)
  const taxStatus = selectEl(b.taxStatus || "deductible", [
    { value: "deductible", label: "Deductible (post-tax expense)" },
    { value: "preTax", label: "Pre-tax (HSA / 401k / pre-tax benefit)" },
    { value: "personal", label: "Personal (non-deductible)" },
  ]);
  const notes = el("textarea", { class: "textarea" }, b.notes || "");
  // Per-deal COGS link (#19)
  const dealOpts = [{ value: "", label: "— None (overhead) —" }].concat(
    Deals.all().sort((a, b2) => (b2.serviceDate || "").localeCompare(a.serviceDate || "")).slice(0, 100)
      .map((dl) => ({ value: dl.id, label: `${dl.company || "—"} · ${dl.serviceDate || ""}` })),
  );
  const dealId = selectEl(b.dealId || "", dealOpts);

  const body = el("div", { class: "form-grid" },
    field("Vendor", vendor, { full: true }),
    field("Category", category),
    field("Amount", amount),
    field("Date", date),
    el("div", { class: "field" }, el("label", {}, "Paid?"), el("div", {}, paid)),
    field("Paid date", paidDate),
    field("Pay method", payMethod),
    field("Recurring", recurring),
    field("Allocate to deal (COGS)", dealId, { full: true }),
    field("Tax status", taxStatus, { full: true }),
    field("Receipt URL", receipt, { full: true }),
    el("div", { class: "field full" },
      el("div", { class: "row", style: { gap: "8px" } }, cameraBtn, ocrStatus, cameraInput),
    ),
    el("div", { class: "field full" }, receiptPreview),
    field("Notes", notes, { full: true }),
  );

  let modal;
  const save = () => {
    if (!vendor.value.trim()) { toast("Vendor required", "warn"); return; }
    Bills.save({
      id: b.id,
      vendor: vendor.value.trim(),
      category: category.value,
      amount: +amount.value || 0,
      date: date.value,
      paid: paid.checked,
      paidDate: paidDate.value,
      payMethod: payMethod.value,
      recurring: recurring.value,
      receiptUrl: receipt.value,
      notes: notes.value,
      dealId: dealId.value || "",
      taxStatus: taxStatus.value || "deductible",
    });
    // Learn this vendor → category mapping (#81)
    VendorRules.learn(vendor.value.trim(), category.value);
    toast(isNew ? "Bill added" : "Bill updated");
    modal.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add bill" : "Save"),
  );
  modal = openModal({ title: isNew ? "New bill / expense" : "Edit bill", body, footer });
  setTimeout(() => vendor.focus(), 30);
}

export function openContactForm(contact) {
  const isNew = !contact?.id;
  const c = contact || { name: "", company: "", type: "brand", email: "", phone: "", notes: "", tags: [], wikiMd: "", defaultRates: {}, audience: [], testimonials: [], emailLog: [] };
  const name = input(c.name, "text", { required: true });
  const company = input(c.company, "text");
  const type = selectEl(c.type, [
    { value: "brand", label: "Brand" },
    { value: "agency", label: "Agency" },
    { value: "vendor", label: "Vendor" },
    { value: "partner", label: "Partner" },
    { value: "personal", label: "Personal" },
  ]);
  const email = input(c.email, "email");
  const phone = input(c.phone, "tel");
  const notes = el("textarea", { class: "textarea" }, c.notes || "");
  const tags = input((c.tags || []).join(", "), "text", { placeholder: "tier1, rush, pays-late, great-team" });
  const confidential = input(null, "checkbox", { checked: !!c.confidential });
  const wikiMd = el("textarea", { class: "textarea", style: { minHeight: "120px" }, placeholder: "Brand notes (markdown OK)" }, c.wikiMd || "");

  // Email-thread paste log (#52)
  let emailLog = (c.emailLog || []).slice();
  const emailLogBox = el("div", { class: "email-log" });
  const renderEmailLog = () => {
    emailLogBox.innerHTML = "";
    emailLog.forEach((e, i) => {
      const date = input(e.date || todayISO(), "date");
      date.addEventListener("input", () => { emailLog[i].date = date.value; });
      const subject = input(e.subject || "", "text", { placeholder: "Subject" });
      subject.addEventListener("input", () => { emailLog[i].subject = subject.value; });
      const body = el("textarea", { class: "textarea", style: { minHeight: "60px" }, placeholder: "Paste email body" }, e.body || "");
      body.addEventListener("input", () => { emailLog[i].body = body.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { emailLog.splice(i, 1); renderEmailLog(); } }, "×");
      emailLogBox.append(el("div", { class: "email-row" }, date, subject, remove, body));
    });
    emailLogBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { emailLog.push({ date: todayISO(), subject: "", body: "" }); renderEmailLog(); } }, "+ Email"));
  };
  renderEmailLog();

  // Portfolio links (#97)
  let portfolioLinks = (c.portfolioLinks || []).slice();
  const portBox = el("div", { class: "portfolio" });
  const renderPortfolio = () => {
    portBox.innerHTML = "";
    portfolioLinks.forEach((p, i) => {
      const title = input(p.title || "", "text", { placeholder: "e.g. Best-performing video for them" });
      title.addEventListener("input", () => { portfolioLinks[i].title = title.value; });
      const url = input(p.url || "", "url", { placeholder: "https://" });
      url.addEventListener("input", () => { portfolioLinks[i].url = url.value; });
      const metric = input(p.metric || "", "text", { placeholder: "e.g. 1.2M views, 3.4% CTR" });
      metric.addEventListener("input", () => { portfolioLinks[i].metric = metric.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { portfolioLinks.splice(i, 1); renderPortfolio(); } }, "×");
      portBox.append(el("div", { class: "portfolio-row" }, title, url, metric, remove));
    });
    portBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { portfolioLinks.push({ title: "", url: "", metric: "" }); renderPortfolio(); } }, "+ Portfolio link"));
  };
  renderPortfolio();

  // Default rates per service type (#5)
  const dr = c.defaultRates || {};
  const rateInputs = {};
  const rateGrid = el("div", { class: "form-grid" });
  ["v", "p", "qrt", "rt", "incentive"].forEach((k) => {
    const inp = input(dr[k] || "", "number", { step: "0.01", min: "0", placeholder: "0" });
    rateInputs[k] = inp;
    const lbl = ({ v: "Video", p: "Post", qrt: "Quote/RT", rt: "Repost", incentive: "Incentive" })[k];
    rateGrid.append(field(lbl, inp));
  });

  // Audience snapshot tracker (#93)
  let audience = (c.audience || []).slice();
  const audienceBox = el("div", { class: "audience" });
  const renderAudience = () => {
    audienceBox.innerHTML = "";
    audience.forEach((a, i) => {
      const date = input(a.date || todayISO(), "date");
      date.addEventListener("input", () => { audience[i].date = date.value; });
      const platform = selectEl(a.platform || "yt", ["yt", "ig", "tt", "x", "ln", "fb", "yt-shorts", "yt-subs"].map((v) => ({ value: v, label: v.toUpperCase() })));
      platform.addEventListener("change", () => { audience[i].platform = platform.value; });
      const count = input(a.count || 0, "number", { step: "1", min: "0", placeholder: "Followers" });
      count.addEventListener("input", () => { audience[i].count = +count.value || 0; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { audience.splice(i, 1); renderAudience(); } }, "×");
      audienceBox.append(el("div", { class: "audience-row" }, date, platform, count, remove));
    });
    audienceBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { audience.push({ date: todayISO(), platform: "yt", count: 0 }); renderAudience(); } }, "+ Snapshot"));
  };
  renderAudience();

  // Testimonials (#98)
  let testimonials = (c.testimonials || []).slice();
  const testBox = el("div", { class: "testimonials" });
  const renderTests = () => {
    testBox.innerHTML = "";
    testimonials.forEach((t, i) => {
      const date = input(t.date || todayISO(), "date");
      date.addEventListener("input", () => { testimonials[i].date = date.value; });
      const quote = el("textarea", { class: "textarea", placeholder: "“They were a dream to work with…”" }, t.quote || "");
      quote.addEventListener("input", () => { testimonials[i].quote = quote.value; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { testimonials.splice(i, 1); renderTests(); } }, "×");
      testBox.append(el("div", { class: "test-row" }, date, quote, remove));
    });
    testBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { testimonials.push({ date: todayISO(), quote: "" }); renderTests(); } }, "+ Add testimonial"));
  };
  renderTests();

  const body = el("div", { class: "form-grid" },
    field("Name", name),
    field("Type", type),
    field("Company", company, { full: true }),
    field("Email", email),
    field("Phone", phone),
    field("Tags (comma-separated)", tags, { full: true }),
    el("div", { class: "field" }, el("label", {}, "Confidential? (hide from media kit / share-bundle)"), el("div", {}, confidential)),
    el("div", { class: "field full" }, el("label", {}, "Default rates ($)"), rateGrid),
    el("div", { class: "field full" }, el("label", {}, "Audience snapshots"), audienceBox),
    el("div", { class: "field full" }, el("label", {}, "Portfolio links"), portBox),
    el("div", { class: "field full" }, el("label", {}, "Testimonials"), testBox),
    el("div", { class: "field full" }, el("label", {}, "Brand wiki (markdown)"), wikiMd),
    el("div", { class: "field full" }, el("label", {}, "Email log (paste threads)"), emailLogBox),
    field("Quick notes", notes, { full: true }),
  );

  let modal;
  const save = () => {
    if (!name.value.trim()) { toast("Name required", "warn"); return; }
    const defaultRates = {};
    Object.entries(rateInputs).forEach(([k, inp]) => { if (+inp.value) defaultRates[k] = +inp.value; });
    Contacts.save({
      id: c.id,
      name: name.value.trim(),
      company: company.value.trim(),
      type: type.value,
      email: email.value.trim(),
      phone: phone.value.trim(),
      notes: notes.value,
      tags: tags.value.split(",").map((s) => s.trim()).filter(Boolean),
      wikiMd: wikiMd.value,
      confidential: confidential.checked,
      emailLog: emailLog.filter((e) => (e.subject || "").trim() || (e.body || "").trim()),
      defaultRates,
      audience: audience.filter((a) => a.count || a.date),
      testimonials: testimonials.filter((t) => t.quote?.trim()),
      portfolioLinks: portfolioLinks.filter((p) => p.url?.trim() || p.title?.trim()),
    });
    toast(isNew ? "Contact added" : "Contact updated");
    modal.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => modal.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add contact" : "Save"),
  );
  modal = openModal({ title: isNew ? "New contact" : "Edit contact", body, footer, wide: true });
  setTimeout(() => name.focus(), 30);
}

export function openQuickAdd() {
  const nlInput = el("input", {
    class: "input",
    placeholder: 'e.g. "Lumira AI $1500 video due May 15 paid"',
    style: { fontSize: "15px", padding: "10px 12px" },
  });
  const preview = el("div", { class: "small muted", style: { minHeight: "20px" } });
  const onInput = () => {
    const parsed = parseDealText(nlInput.value);
    if (!parsed || !nlInput.value.trim()) { preview.textContent = ""; return; }
    const parts = [];
    if (parsed.company) parts.push(`brand: ${parsed.company}`);
    if (parsed.fee) parts.push(`fee: $${parsed.fee}`);
    if (parsed.svc) parts.push(`type: ${parsed.svc}`);
    if (parsed.draftDue) parts.push(`due: ${parsed.draftDue}`);
    if (parsed.serviceDate) parts.push(`service: ${parsed.serviceDate}`);
    if (parsed.postDate) parts.push(`post: ${parsed.postDate}`);
    if (parsed.paid) parts.push("paid");
    preview.textContent = parts.length ? "→ " + parts.join("  ·  ") : "(no fields detected — opens a blank form)";
  };
  nlInput.addEventListener("input", onInput);
  nlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") openParsedDeal(); });

  const openParsedDeal = () => {
    const parsed = parseDealText(nlInput.value) || {};
    close();
    openDealForm({
      company: parsed.company || "",
      svc: parsed.svc || "p",
      fee: parsed.fee || 0,
      partnerFeePct: parsed.partnerFeePct || 0,
      paid: !!parsed.paid,
      paidDate: parsed.paid ? todayISO() : "",
      draftDue: parsed.draftDue || "",
      serviceDate: parsed.serviceDate || todayISO(),
      postDate: parsed.postDate || "",
    });
  };

  const pasteImport = () => {
    const ta = el("textarea", { class: "textarea", placeholder: "Paste a brief, contract, or email here. We'll try to extract a deal.", style: { minHeight: "120px" } });
    let m2;
    const submit = () => {
      const parsed = parseDealText(ta.value) || {};
      m2.close(); close();
      openDealForm({
        company: parsed.company || "",
        svc: parsed.svc || "p",
        fee: parsed.fee || 0,
        partnerFeePct: parsed.partnerFeePct || 0,
        draftDue: parsed.draftDue || "",
        serviceDate: parsed.serviceDate || todayISO(),
        postDate: parsed.postDate || "",
        notes: ta.value.length > 200 ? ta.value.slice(0, 200) + "…" : ta.value,
      });
    };
    const footer = el("div", { class: "row" },
      el("div", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m2.close() }, "Cancel"),
      el("button", { class: "btn primary", onclick: submit }, "Extract & open"),
    );
    m2 = openModal({ title: "Paste to extract", body: ta, footer });
    setTimeout(() => ta.focus(), 30);
  };

  // Bulk paste — multi-line NL (#83): one deal per line, preview, confirm & create.
  const bulkImport = () => {
    const ta = el("textarea", { class: "textarea", placeholder: 'One deal per line, e.g.:\n"Lumira AI $1500 video due May 15"\n"Vortex Studio $800 post"\n"Echoware $2200 video paid 5/2"', style: { minHeight: "200px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" } });
    const previewBox = el("div", { class: "stack", style: { marginTop: 8 } });
    const refresh = () => {
      previewBox.innerHTML = "";
      const lines = ta.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const parsed = lines.map((line) => parseDealText(line) || {});
      previewBox.append(el("div", { class: "small muted" }, `${parsed.length} deal${parsed.length === 1 ? "" : "s"} parsed`));
      parsed.slice(0, 30).forEach((p, i) => {
        previewBox.append(el("div", { class: "small", style: { padding: "4px 8px", background: "var(--bg-2)", borderRadius: 6, marginTop: 4 } },
          `${i + 1}. ${p.company || "(no brand?)"} · ${p.svc || "p"} · $${p.fee || 0}` + (p.draftDue ? ` · due ${p.draftDue}` : "") + (p.paid ? " · paid" : ""),
        ));
      });
    };
    ta.addEventListener("input", refresh);
    let m3;
    const submit = () => {
      const lines = ta.value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
      const dealsToMake = lines.map((line) => parseDealText(line) || {});
      let created = 0;
      dealsToMake.forEach((p) => {
        if (!p.company) return;
        const c = Contacts.ensure(p.company);
        Deals.save({
          contactId: c?.id, company: p.company, svc: p.svc || "p",
          fee: p.fee || 0, partnerFeePct: p.partnerFeePct || 0,
          paid: !!p.paid, paidDate: p.paid ? todayISO() : "",
          paidAmount: p.paid ? (p.fee || 0) : 0,
          serviceDate: p.serviceDate || todayISO(),
          postDate: p.postDate || "", draftDue: p.draftDue || "",
          year: +(p.serviceDate || todayISO()).slice(0, 4),
        });
        created++;
      });
      toast(`Created ${created} deal${created === 1 ? "" : "s"}`);
      m3.close(); close();
    };
    const footer = el("div", { class: "row" },
      el("div", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m3.close() }, "Cancel"),
      el("button", { class: "btn primary", onclick: submit }, "Create all"),
    );
    m3 = openModal({ title: "Bulk import deals", body: el("div", {}, ta, previewBox), footer, wide: true });
    setTimeout(() => ta.focus(), 30);
  };

  const body = el("div", { class: "stack" },
    el("div", { class: "field" },
      el("label", {}, "Type a deal in plain English"),
      nlInput, preview,
    ),
    el("div", { class: "row" },
      el("button", { class: "btn primary", onclick: openParsedDeal }, "Open deal form"),
      el("button", { class: "btn", onclick: pasteImport }, "Paste from email…"),
      el("button", { class: "btn", onclick: bulkImport }, "Bulk import…"),
    ),
    el("div", { style: { borderTop: "1px solid var(--line)", margin: "12px 0", paddingTop: "12px" } },
      el("div", { class: "small muted", style: { marginBottom: 8 } }, "Or jump to:"),
      el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } },
        el("button", { class: "btn", onclick: () => { close(); openDealForm(); } }, "★  New deal"),
        el("button", { class: "btn", onclick: () => { close(); openBillForm(); } }, "↧  New bill"),
        el("button", { class: "btn", onclick: () => { close(); openContactForm(); } }, "☺  New contact"),
      ),
    ),
  );
  let modal;
  const close = () => modal?.close();
  modal = openModal({ title: "Quick add", body });
  setTimeout(() => nlInput.focus(), 30);
}
