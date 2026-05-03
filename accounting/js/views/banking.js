// Banking: accounts (#22), CSV import w/ mapping memory (#21), vendor rules (#23),
// transaction matcher (#24), reconciliation worksheet (#25), smart paid-date inference (#88).

import { el, fmtMoney, fmtDate, fmtDateShort, csvFromString, debounce, todayISO, parseDate, kpi, field } from "../utils.js";
import { Accounts, Transactions, Deals, Bills, VendorRules, CsvMappings, subscribe, downloadFile, toCSV } from "../store.js";
import { openModal, toast, confirmDialog } from "../ui.js";
import { go } from "../router.js";

export default function bankingView() {
  const node = el("div", {});
  let tab = "ledger"; // ledger | rules | match | reconcile
  let activeAccountId = null;

  const render = () => {
    const accts = Accounts.all();
    if (!activeAccountId && accts.length) activeAccountId = accts[0].id;

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Banking"),
          el("div", { class: "sub" }, "Accounts, CSV import, vendor rules, deal matcher, reconciliation."),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => openAccountForm() }, "+ Account"),
          el("button", { class: "btn primary", onclick: () => openImportWizard() }, "Import CSV…"),
        ),
      ),
      el("div", { class: "row", style: { flexWrap: "wrap", gap: "6px", marginBottom: "10px" } },
        ...accts.map((a) => el("button", {
          class: `chip ${activeAccountId === a.id ? "active" : ""}`,
          onclick: () => { activeAccountId = a.id; render(); },
        }, `${a.name} · ${a.kind}${a.last4 ? ` · …${a.last4}` : ""}`)),
        accts.length === 0 ? el("div", { class: "small muted" }, "No accounts yet — add one to start.") : null,
      ),
      el("div", { class: "row", style: { gap: "6px", marginBottom: "12px" } },
        el("button", { class: `chip ${tab === "ledger" ? "active" : ""}`, onclick: () => { tab = "ledger"; render(); } }, "Ledger"),
        el("button", { class: `chip ${tab === "rules" ? "active" : ""}`, onclick: () => { tab = "rules"; render(); } }, "Auto-categorize rules"),
        el("button", { class: `chip ${tab === "match" ? "active" : ""}`, onclick: () => { tab = "match"; render(); } }, "Match deals/bills"),
        el("button", { class: `chip ${tab === "reconcile" ? "active" : ""}`, onclick: () => { tab = "reconcile"; render(); } }, "Reconcile"),
      ),
    );

    if (tab === "ledger") node.append(renderLedger(activeAccountId));
    else if (tab === "rules") node.append(renderRules());
    else if (tab === "match") node.append(renderMatcher(activeAccountId));
    else if (tab === "reconcile") node.append(renderReconcile(activeAccountId));
  };

  function renderLedger(accountId) {
    if (!accountId) return el("div", { class: "empty" }, el("div", { class: "ico" }, "$"), "Add an account first.");
    const txs = Transactions.byAccount(accountId).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!txs.length) {
      return el("div", { class: "empty" },
        el("div", { class: "ico" }, "↧"),
        el("div", {}, "No transactions in this account yet."),
        el("div", { style: { marginTop: 12 } }, el("button", { class: "btn primary", onclick: () => openImportWizard() }, "Import CSV")),
      );
    }
    let running = txs.reduce((s, t) => s + (t.type === "credit" ? +t.amount : -+t.amount), 0);
    const t = el("table", { class: "data" });
    t.append(el("thead", {}, el("tr", {},
      el("th", {}, "Date"), el("th", {}, "Vendor"), el("th", {}, "Category"),
      el("th", { class: "num" }, "Amount"), el("th", { class: "num" }, "Balance"),
      el("th", {}, "Linked"), el("th", {}, "Cleared"),
    )));
    const tb = el("tbody");
    txs.forEach((tx) => {
      const balanceAtRow = running;
      running -= (tx.type === "credit" ? +tx.amount : -+tx.amount);
      const linked = tx.dealId ? Deals.get(tx.dealId) : tx.billId ? Bills.get(tx.billId) : null;
      const clearedCb = el("input", { type: "checkbox" });
      clearedCb.checked = !!tx.cleared;
      clearedCb.addEventListener("change", () => Transactions.save({ id: tx.id, cleared: clearedCb.checked }));
      tb.append(el("tr", {},
        el("td", { class: "small muted" }, fmtDateShort(tx.date)),
        el("td", {}, tx.vendor || "—"),
        el("td", {}, tx.category ? el("span", { class: "pill gray" }, tx.category) : el("span", { class: "muted" }, "—")),
        el("td", { class: "num", style: { color: tx.type === "credit" ? "var(--accent)" : "var(--danger)" } }, (tx.type === "credit" ? "+" : "-") + fmtMoney(Math.abs(+tx.amount || 0))),
        el("td", { class: "num small muted" }, fmtMoney(balanceAtRow)),
        el("td", { class: "small" },
          linked && tx.dealId ? el("a", { href: `#/deals/${linked.id}` }, "Deal: " + linked.company)
            : linked && tx.billId ? el("span", {}, "Bill: " + linked.vendor)
            : el("button", { class: "btn sm", onclick: () => quickLink(tx) }, "Link…"),
        ),
        el("td", {}, clearedCb),
      ));
    });
    t.append(tb);
    return el("div", { class: "table-wrap" }, el("div", { class: "table-scroll" }, t));
  }

  function quickLink(tx) {
    // Suggest matches based on amount + date proximity
    const target = +tx.amount;
    const txDate = parseDate(tx.date)?.getTime() || 0;
    const candidates = [];
    if (tx.type === "credit") {
      Deals.all().filter((d) => !d.paid).forEach((d) => {
        const expected = +d.fee || 0;
        const diff = Math.abs(expected - target);
        if (diff <= Math.max(5, expected * 0.05)) {
          candidates.push({ kind: "deal", obj: d, score: 100 - diff });
        }
      });
    } else {
      Bills.all().forEach((b) => {
        if (Math.abs(+b.amount - target) <= 1) candidates.push({ kind: "bill", obj: b, score: 80 });
      });
    }
    candidates.sort((a, b) => b.score - a.score);

    const list = el("div", { class: "stack" });
    if (!candidates.length) list.append(el("div", { class: "small muted" }, "No good matches by amount. Browse below:"));
    candidates.slice(0, 6).forEach((c) => {
      const lbl = c.kind === "deal"
        ? `${c.obj.company} · ${c.obj.svc || "—"} · ${fmtMoney(c.obj.fee)} · invoiced ${c.obj.invoiceDate || "—"}`
        : `${c.obj.vendor} · ${fmtMoney(c.obj.amount)} · ${c.obj.date || "—"}`;
      list.append(el("div", { class: "list-row", style: { cursor: "pointer" }, onclick: () => apply(c) }, lbl));
    });
    let m;
    function apply(c) {
      if (c.kind === "deal") {
        Transactions.save({ id: tx.id, dealId: c.obj.id });
        // Smart paid-date inference (#88)
        if (!c.obj.paid) {
          Deals.save({ id: c.obj.id, paid: true, paidDate: tx.date, paidAmount: +tx.amount, transactionId: tx.id });
          toast("Linked + marked paid");
        } else toast("Linked");
      } else {
        Transactions.save({ id: tx.id, billId: c.obj.id });
        toast("Linked");
      }
      m.close();
    }
    const footer = el("div", { class: "row" },
      el("div", { class: "spacer" }),
      el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    );
    m = openModal({ title: `Link transaction · ${fmtMoney(tx.amount)} on ${tx.date}`, body: list, footer });
  }

  function renderRules() {
    const rules = VendorRules.all();
    return el("div", { class: "card" },
      el("h3", {}, `${rules.length} auto-categorize rule${rules.length === 1 ? "" : "s"}`),
      el("div", { class: "small muted", style: { marginBottom: 8 } }, "When a transaction's vendor includes the match string, the category is auto-applied. Rules learn automatically when you save bills."),
      el("table", { class: "data" },
        el("thead", {}, el("tr", {}, el("th", {}, "Match (substring)"), el("th", {}, "Category"), el("th", {}, ""))),
        el("tbody", {}, ...rules.sort((a, b) => (a.match || "").localeCompare(b.match || "")).map((r) => el("tr", {},
          el("td", {}, r.match),
          el("td", {}, el("span", { class: "pill gray" }, r.category)),
          el("td", {}, el("button", { class: "btn sm danger", onclick: async () => {
            const ok = await confirmDialog({ title: "Delete rule?", body: `${r.match} → ${r.category}`, danger: true, confirmLabel: "Delete" });
            if (ok) { VendorRules.remove(r.id); toast("Deleted"); }
          } }, "Delete")),
        ))),
      ),
      el("div", { style: { marginTop: 12 } },
        el("button", { class: "btn primary", onclick: () => openRuleForm() }, "+ Add rule"),
        el("button", { class: "btn ghost", style: { marginLeft: 8 }, onclick: () => applyRulesNow() }, "Apply rules to existing transactions"),
      ),
    );
  }

  function renderMatcher(accountId) {
    if (!accountId) return el("div", { class: "empty" }, "Pick an account.");
    const txs = Transactions.byAccount(accountId).filter((t) => !t.dealId && !t.billId);
    const credits = txs.filter((t) => t.type === "credit");
    const debits = txs.filter((t) => t.type === "debit");
    const unpaidDeals = Deals.all().filter((d) => !d.paid);
    const unpaidBills = Bills.all().filter((b) => !b.paid);

    // Build top suggestions: best amount + closest date
    const suggestions = [];
    credits.forEach((t) => {
      const target = +t.amount;
      const txMs = parseDate(t.date)?.getTime() || 0;
      let best = null;
      unpaidDeals.forEach((d) => {
        const expected = +d.fee || 0;
        const diff = Math.abs(expected - target);
        if (diff > Math.max(5, expected * 0.05)) return;
        const refMs = parseDate(d.invoiceDate || d.serviceDate)?.getTime() || 0;
        const dayDelta = refMs ? Math.abs(txMs - refMs) / 86400000 : 999;
        const score = 100 - diff - dayDelta * 0.1;
        if (!best || score > best.score) best = { d, score, dayDelta, diff };
      });
      if (best) suggestions.push({ tx: t, ...best });
    });
    debits.forEach((t) => {
      const target = Math.abs(+t.amount);
      let best = null;
      unpaidBills.forEach((b) => {
        if (Math.abs(+b.amount - target) > 1) return;
        const score = 100 - Math.abs(+b.amount - target);
        if (!best || score > best.score) best = { b, score };
      });
      if (best) suggestions.push({ tx: t, ...best });
    });

    return el("div", { class: "card" },
      el("h3", {}, `${suggestions.length} matched suggestion${suggestions.length === 1 ? "" : "s"}`),
      el("div", { class: "small muted", style: { marginBottom: 8 } }, "Auto-pairs unmatched bank transactions with unpaid deals/bills based on amount and date proximity."),
      suggestions.length === 0 ? el("div", { class: "empty small" }, "Nothing to match. Import more transactions or update fees.")
        : el("table", { class: "data" },
            el("thead", {}, el("tr", {},
              el("th", {}, "Date"), el("th", { class: "num" }, "Amount"),
              el("th", {}, "Suggested match"), el("th", {}, ""),
            )),
            el("tbody", {}, ...suggestions.slice(0, 50).map((s) => {
              const obj = s.d || s.b;
              const label = s.d ? `${obj.company} · invoiced ${obj.invoiceDate || "—"}` : `${obj.vendor} · ${obj.date || "—"}`;
              return el("tr", {},
                el("td", { class: "small muted" }, fmtDateShort(s.tx.date)),
                el("td", { class: "num" }, fmtMoney(s.tx.amount)),
                el("td", {}, label),
                el("td", { class: "row" },
                  el("button", { class: "btn sm primary", onclick: () => {
                    if (s.d) {
                      Transactions.save({ id: s.tx.id, dealId: s.d.id });
                      Deals.save({ id: s.d.id, paid: true, paidDate: s.tx.date, paidAmount: +s.tx.amount, transactionId: s.tx.id });
                    } else {
                      Transactions.save({ id: s.tx.id, billId: s.b.id });
                      Bills.save({ id: s.b.id, paid: true, paidDate: s.tx.date });
                    }
                    toast("Matched");
                  } }, "Confirm"),
                  el("button", { class: "btn sm", onclick: () => Transactions.save({ id: s.tx.id, dealId: "_skip", billId: "" }) }, "Skip"),
                ),
              );
            })),
          ),
    );
  }

  function renderReconcile(accountId) {
    if (!accountId) return el("div", { class: "empty" }, "Pick an account.");
    const txs = Transactions.byAccount(accountId);
    const cleared = txs.filter((t) => t.cleared);
    const uncleared = txs.filter((t) => !t.cleared);
    const clearedSum = cleared.reduce((s, t) => s + (t.type === "credit" ? +t.amount : -+t.amount), 0);
    const unclearedSum = uncleared.reduce((s, t) => s + (t.type === "credit" ? +t.amount : -+t.amount), 0);
    const account = Accounts.get(accountId);
    const stmt = +account?.statementBalance || 0;
    const diff = stmt - clearedSum;

    return el("div", { class: "card" },
      el("h3", {}, "Reconciliation"),
      el("div", { class: "kpi-grid" },
        kpi("Statement balance", fmtMoney(stmt), null, "Set on the account"),
        kpi("Cleared total", fmtMoney(clearedSum)),
        kpi("Difference", fmtMoney(diff), Math.abs(diff) < 0.01 ? "up" : "down"),
        kpi("Uncleared", fmtMoney(unclearedSum), null, `${uncleared.length} txns`),
      ),
      Math.abs(diff) < 0.01
        ? el("div", { class: "pill green", style: { marginTop: 12, padding: "4px 10px" } }, "✓ Reconciled")
        : el("div", { class: "small muted", style: { marginTop: 12 } }, `Difference of ${fmtMoney(Math.abs(diff))} — review uncleared transactions or update statement balance on the account.`),
      el("div", { style: { marginTop: 12 } },
        el("button", { class: "btn", onclick: () => openAccountForm(account) }, "Edit statement balance"),
      ),
    );
  }

  function applyRulesNow() {
    let count = 0;
    Transactions.all().forEach((t) => {
      if (t.category) return;
      const cat = VendorRules.categoryFor(t.vendor);
      if (cat) { Transactions.save({ id: t.id, category: cat }); count++; }
    });
    toast(`Applied to ${count} transaction${count === 1 ? "" : "s"}`);
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function openAccountForm(account) {
  const a = account || { name: "", kind: "checking", last4: "", currency: "USD", statementBalance: 0 };
  const isNew = !a.id;
  const name = el("input", { class: "input", value: a.name || "", placeholder: "Brex Checking" });
  const kind = el("select", { class: "select" });
  ["checking", "savings", "credit"].forEach((k) => {
    const o = el("option", { value: k }, k);
    if (k === a.kind) o.selected = true;
    kind.append(o);
  });
  const last4 = el("input", { class: "input", value: a.last4 || "", placeholder: "1234" });
  const currency = el("input", { class: "input", value: a.currency || "USD" });
  const stmt = el("input", { class: "input", type: "number", step: "0.01", value: a.statementBalance || "" });

  const body = el("div", { class: "form-grid" },
    field("Name", name),
    field("Kind", kind),
    field("Last 4", last4),
    field("Currency", currency),
    field("Statement balance ($)", stmt, true),
  );
  let m;
  const save = () => {
    if (!name.value.trim()) { toast("Name required", "warn"); return; }
    Accounts.save({ id: a.id, name: name.value.trim(), kind: kind.value, last4: last4.value, currency: currency.value, statementBalance: +stmt.value || 0 });
    toast(isNew ? "Account added" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete account?", body: "Transactions in this account remain.", danger: true, confirmLabel: "Delete" });
      if (ok) { Accounts.remove(a.id); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add account" : "Save"),
  );
  m = openModal({ title: isNew ? "New account" : "Edit account", body, footer });
  setTimeout(() => name.focus(), 30);
}

function openRuleForm() {
  const match = el("input", { class: "input", placeholder: "starbucks" });
  const cat = el("select", { class: "select" });
  ["Software", "Equipment", "Office", "Travel", "Meals", "Marketing", "Contractors", "Education", "Subscriptions", "Phone & Internet", "Home Office", "Other"]
    .forEach((c) => cat.append(el("option", { value: c }, c)));
  const body = el("div", { class: "form-grid" },
    field("Match (substring, case-insensitive)", match),
    field("Category", cat),
  );
  let m;
  const save = () => {
    if (!match.value.trim()) { toast("Match required", "warn"); return; }
    VendorRules.learn(match.value.trim(), cat.value);
    toast("Rule added");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, "Add rule"),
  );
  m = openModal({ title: "New auto-categorize rule", body, footer });
  setTimeout(() => match.focus(), 30);
}

function openImportWizard() {
  const file = el("input", { type: "file", accept: ".csv,.ofx,.qfx,text/csv,application/x-ofx" });
  file.addEventListener("change", async () => {
    const f = file.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = async () => {
      const text = String(r.result || "");
      // OFX/QFX are SGML/XML — detect by header or root tag.
      if (/OFXHEADER|<OFX>/i.test(text) || /\.(ofx|qfx)$/i.test(f.name)) {
        const { parseOfx } = await import("../ofx.js");
        const { transactions } = parseOfx(text);
        if (!transactions.length) { toast("No transactions found in OFX/QFX", "warn"); return; }
        await importOfxStep2(transactions, f.name);
      } else {
        importWizardStep2(text, f.name);
      }
    };
    r.readAsText(f);
  });
  file.click();
}

async function importOfxStep2(transactions, filename) {
  const accountSel = el("select", { class: "select" });
  accountSel.append(el("option", { value: "__new" }, "+ New account from filename…"));
  Accounts.all().forEach((a) => accountSel.append(el("option", { value: a.id }, a.name)));
  if (Accounts.all()[0]) accountSel.value = Accounts.all()[0].id;
  const previewLines = transactions.slice(0, 4).map((t) => `${t.date}  ${t.vendor.slice(0, 40).padEnd(40)}  ${t.type === "credit" ? "+" : "-"}$${t.amount.toFixed(2)}`).join("\n");
  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, `${transactions.length} transactions in ${filename}`),
    el("div", { class: "field" }, el("label", {}, "Account"), accountSel),
    el("pre", { style: { background: "var(--bg-2)", padding: "8px", borderRadius: "6px", fontSize: "11px", whiteSpace: "pre-wrap" } }, previewLines),
  );
  let m;
  const doImport = () => {
    let accountId = accountSel.value;
    if (accountId === "__new") {
      const a = Accounts.save({ name: filename || "OFX import", kind: "checking", currency: "USD" });
      accountId = a.id;
    }
    transactions.forEach((t) => {
      Transactions.save({
        accountId,
        date: t.date,
        vendor: t.vendor,
        amount: t.amount,
        type: t.type,
        category: VendorRules.categoryFor(t.vendor) || "",
        cleared: false,
        source: filename || "ofx",
        memo: t.memo || "",
        fitid: t.fitid || "",
      });
    });
    toast(`Imported ${transactions.length} transactions`);
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: doImport }, "Import"),
  );
  m = openModal({ title: `OFX/QFX import · ${transactions.length} txns`, body, footer });
}

function importWizardStep2(text, filename) {
  const rows = csvFromString(text);
  if (rows.length < 2) { toast("Empty CSV", "warn"); return; }
  const headers = rows[0];
  const data = rows.slice(1).filter((r) => r.length === headers.length);

  // Try previously saved mappings to find a match.
  const saved = CsvMappings.all();
  let preset = null;
  for (const m of saved) {
    const mappedKeys = Object.keys(m.columnMap || {});
    if (mappedKeys.every((k) => headers.includes(m.columnMap[k]))) { preset = m; break; }
  }

  const accounts = Accounts.all();
  const accountSel = el("select", { class: "select" });
  accountSel.append(el("option", { value: "__new" }, "+ New account from filename…"));
  accounts.forEach((a) => accountSel.append(el("option", { value: a.id }, a.name)));
  if (accounts[0]) accountSel.value = accounts[0].id;

  const fieldDefs = ["date", "vendor", "amount", "type", "category"];
  const sels = {};
  const grid = el("div", { class: "form-grid" });
  fieldDefs.forEach((f) => {
    const s = el("select", { class: "select" });
    s.append(el("option", { value: "" }, "— ignore —"));
    headers.forEach((h, i) => {
      const o = el("option", { value: String(i) }, h);
      // Auto-pick by header name match
      if (h.toLowerCase().includes(f) || (f === "vendor" && h.toLowerCase().includes("descript"))) o.selected = true;
      // Preset overrides
      if (preset?.columnMap?.[f] === h) o.selected = true;
      s.append(o);
    });
    sels[f] = s;
    grid.append(field(f, s));
  });

  const saveMap = el("input", { class: "input", placeholder: filename || "Mapping name (e.g. Brex CSV)" });
  const previewBox = el("div", { class: "small muted", style: { marginTop: 8 } });
  const refreshPreview = () => {
    // Build via text nodes — never inject untrusted CSV cells as HTML.
    previewBox.textContent = "";
    const head = document.createElement("div");
    head.textContent = "Preview:";
    previewBox.append(head);
    data.slice(0, 3).forEach((row) => {
      const line = fieldDefs.map((f) => sels[f].value !== "" ? row[+sels[f].value] : "—").join("  ·  ");
      const div = document.createElement("div");
      div.textContent = "· " + line;
      previewBox.append(div);
    });
  };
  Object.values(sels).forEach((s) => s.addEventListener("change", refreshPreview));
  refreshPreview();

  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, `${data.length} rows in ${filename || "CSV"}`),
    el("div", { class: "field" }, el("label", {}, "Account"), accountSel),
    grid,
    el("div", { class: "field" }, el("label", {}, "Save this column map for next time"), saveMap),
    previewBox,
  );

  let m;
  const doImport = () => {
    let accountId = accountSel.value;
    if (accountId === "__new") {
      const a = Accounts.save({ name: filename || "Imported", kind: "checking", currency: "USD" });
      accountId = a.id;
    }
    const map = {};
    fieldDefs.forEach((f) => { if (sels[f].value !== "") map[f] = +sels[f].value; });
    let added = 0;
    data.forEach((row) => {
      const dt = map.date != null ? row[map.date] : "";
      const ven = map.vendor != null ? row[map.vendor] : "";
      let amtRaw = map.amount != null ? row[map.amount] : "0";
      const numeric = parseFloat(String(amtRaw).replace(/[^0-9.\-]/g, "")) || 0;
      const type = map.type != null ? (/credit|deposit|in/i.test(row[map.type]) ? "credit" : /debit|withdraw|out/i.test(row[map.type]) ? "debit" : (numeric < 0 ? "debit" : "credit")) : (numeric < 0 ? "debit" : "credit");
      const cat = (map.category != null ? row[map.category] : "") || VendorRules.categoryFor(ven) || "";
      Transactions.save({
        accountId,
        date: normalizeDate(dt),
        vendor: ven, amount: Math.abs(numeric),
        type, category: cat, cleared: false, source: filename || "csv",
      });
      added++;
    });
    if (saveMap.value.trim()) {
      const columnMap = Object.fromEntries(Object.entries(map).map(([k, v]) => [k, headers[v]]));
      CsvMappings.save({ name: saveMap.value.trim(), columnMap });
    }
    toast(`Imported ${added} transactions`);
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: doImport }, "Import"),
  );
  m = openModal({ title: `CSV import · ${data.length} rows`, body, footer, wide: true });
}

function normalizeDate(s) {
  if (!s) return "";
  const iso = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const yr = us[3].length === 2 ? "20" + us[3] : us[3];
    return `${yr}-${String(+us[1]).padStart(2, "0")}-${String(+us[2]).padStart(2, "0")}`;
  }
  return s;
}
