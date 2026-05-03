// Other income streams: affiliate (#9), tips/donations (#10), AdSense importer (#8).

import { el, fmtMoney, fmtDate, todayISO, csvFromString, field } from "../utils.js";
import { Affiliates, AffiliateEntries, Tips, subscribe, downloadFile } from "../store.js";
import { openModal, toast, confirmDialog } from "../ui.js";

const PLATFORMS = ["adsense", "patreon", "buymeacoffee", "kofi", "twitch", "youtube-membership", "tiktok-creator-fund", "x-creator", "stripe", "other"];

export default function incomeView() {
  const node = el("div", {});
  let tab = "tips";

  const render = () => {
    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Other income"),
          el("div", { class: "sub" }, "Affiliate revenue, tips/donations, and platform CSV imports."),
        ),
      ),
      el("div", { class: "row", style: { marginBottom: 12 } },
        el("button", { class: `chip ${tab === "tips" ? "active" : ""}`, onclick: () => { tab = "tips"; render(); } }, "Platform / tips"),
        el("button", { class: `chip ${tab === "affiliate" ? "active" : ""}`, onclick: () => { tab = "affiliate"; render(); } }, "Affiliate"),
        el("button", { class: `chip ${tab === "linkgen" ? "active" : ""}`, onclick: () => { tab = "linkgen"; render(); } }, "UTM link generator"),
        el("button", { class: `chip ${tab === "import" ? "active" : ""}`, onclick: () => { tab = "import"; render(); } }, "Import CSV"),
      ),
      tab === "tips" ? renderTips() : tab === "affiliate" ? renderAffiliates() : tab === "linkgen" ? renderLinkGen() : renderImport(),
    );
  };

  function renderTips() {
    const all = Tips.all().sort((a, b) => (b.period || "").localeCompare(a.period || ""));
    const yearly = {};
    all.forEach((t) => {
      const y = (t.period || "").slice(0, 4);
      yearly[y] = (yearly[y] || 0) + (+t.amount || 0);
    });

    return el("div", {},
      el("div", { class: "row spread", style: { marginBottom: 8 } },
        el("div", { class: "small muted" }, `${all.length} entries · YTD ${fmtMoney(yearly[String(new Date().getFullYear())] || 0)}`),
        el("button", { class: "btn primary", onclick: () => openTipForm() }, "+ Log income"),
      ),
      all.length === 0
        ? el("div", { class: "card empty" }, el("div", { class: "ico" }, "♡"), "No tips/platform income logged yet.")
        : el("div", { class: "card" },
            el("table", { class: "data" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Period"), el("th", {}, "Platform"),
                el("th", { class: "num" }, "Supporters"), el("th", { class: "num" }, "Amount"), el("th", {}, ""),
              )),
              el("tbody", {}, ...all.map((t) => el("tr", {},
                el("td", {}, t.period || "—"),
                el("td", {}, el("span", { class: "pill teal" }, t.platform || "—")),
                el("td", { class: "num small muted" }, t.supporters ? String(t.supporters) : "—"),
                el("td", { class: "num" }, fmtMoney(t.amount)),
                el("td", {}, el("button", { class: "btn sm", onclick: () => openTipForm(t) }, "Edit")),
              ))),
            ),
          ),
    );
  }

  function renderAffiliates() {
    const affs = Affiliates.all();
    const entries = AffiliateEntries.all();
    return el("div", {},
      el("div", { class: "row spread", style: { marginBottom: 8 } },
        el("div", { class: "small muted" }, `${affs.length} brand${affs.length === 1 ? "" : "s"} · ${entries.length} entries`),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => openAffiliateEntryForm({}) }, "+ Log entry"),
          el("button", { class: "btn primary", onclick: () => openAffiliateForm() }, "+ New affiliate"),
        ),
      ),
      affs.length === 0
        ? el("div", { class: "card empty" },
            el("div", { class: "ico" }, "%"),
            el("div", {}, "No affiliate brands yet."),
            el("div", { style: { marginTop: 12 } }, el("button", { class: "btn primary", onclick: () => openAffiliateForm() }, "+ Add affiliate")),
          )
        : el("div", { class: "stack" },
            ...affs.map((a) => {
              const myEntries = entries.filter((e) => e.affiliateId === a.id).sort((a2, b2) => (b2.period || "").localeCompare(a2.period || ""));
              const totalCommission = myEntries.reduce((s, e) => s + (+e.commission || 0), 0);
              const ytd = myEntries.filter((e) => (e.period || "").startsWith(String(new Date().getFullYear()))).reduce((s, e) => s + (+e.commission || 0), 0);
              return el("div", { class: "card" },
                el("div", { class: "spread" },
                  el("div", {},
                    el("strong", {}, a.brand),
                    el("div", { class: "small muted" }, `${a.platform || "—"} · code ${a.code || "—"} · ${(a.tiers || []).length} tier${(a.tiers || []).length === 1 ? "" : "s"}`),
                  ),
                  el("div", { class: "row" },
                    el("div", { class: "kpi-sub" }, `Lifetime ${fmtMoney(totalCommission)} · YTD ${fmtMoney(ytd)}`),
                    el("button", { class: "btn sm", onclick: () => openAffiliateForm(a) }, "Edit"),
                    el("button", { class: "btn sm", onclick: () => openAffiliateEntryForm({ affiliateId: a.id }) }, "+ Entry"),
                  ),
                ),
                myEntries.length > 0 && el("div", { style: { marginTop: 10 } },
                  el("table", { class: "data" },
                    el("thead", {}, el("tr", {},
                      el("th", {}, "Period"), el("th", { class: "num" }, "Revenue"), el("th", { class: "num" }, "Commission"), el("th", {}, "Paid"), el("th", {}, ""),
                    )),
                    el("tbody", {}, ...myEntries.slice(0, 12).map((e) => el("tr", {},
                      el("td", {}, e.period),
                      el("td", { class: "num small muted" }, e.revenue ? fmtMoney(e.revenue) : "—"),
                      el("td", { class: "num" }, fmtMoney(e.commission)),
                      el("td", {}, el("span", { class: `pill ${e.paid ? "green" : "amber"}` }, e.paid ? "Paid" : "Pending")),
                      el("td", {}, el("button", { class: "btn sm", onclick: () => openAffiliateEntryForm(e) }, "Edit")),
                    ))),
                  ),
                ),
              );
            }),
          ),
    );
  }

  const f = (label, control, full) => el("div", { class: `field ${full ? "full" : ""}` }, el("label", {}, label), control);

  function renderLinkGen() {
    const target = el("input", { class: "input", placeholder: "https://brand.com/landing" });
    const source = el("input", { class: "input", placeholder: "youtube · twitter · newsletter" });
    const medium = el("input", { class: "input", placeholder: "video · post · email" });
    const campaign = el("input", { class: "input", placeholder: "summer-launch" });
    const term = el("input", { class: "input", placeholder: "creator-pricing (optional)" });
    const content = el("input", { class: "input", placeholder: "v1 · variant-a (optional)" });
    const code = el("input", { class: "input", placeholder: "Affiliate code (e.g. RODMAN10)" });
    const out = el("input", { class: "input", readonly: "", style: { fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" } });
    const note = el("div", { class: "small muted" });

    const refresh = () => {
      const url = (target.value || "").trim();
      if (!url) { out.value = ""; note.textContent = "Paste a target URL to build a tagged link."; return; }
      let u;
      try { u = new URL(url); } catch { out.value = ""; note.textContent = "Invalid URL."; return; }
      const setIf = (k, v) => { if (v) u.searchParams.set(k, v); };
      setIf("utm_source", source.value);
      setIf("utm_medium", medium.value);
      setIf("utm_campaign", campaign.value);
      setIf("utm_term", term.value);
      setIf("utm_content", content.value);
      setIf("ref", code.value);
      out.value = u.toString();
      note.textContent = "Ready — click Copy to grab the tagged link.";
    };
    [target, source, medium, campaign, term, content, code].forEach((i) => i.addEventListener("input", refresh));

    return el("div", { class: "card" },
      el("h3", {}, "UTM / affiliate link builder"),
      el("div", { class: "small muted", style: { marginBottom: 8 } }, "Glue UTM tags + your affiliate code to any target URL. Track click-through manually in the Affiliate tab."),
      el("div", { class: "form-grid" },
        f("Target URL", target, true),
        f("utm_source", source),
        f("utm_medium", medium),
        f("utm_campaign", campaign, true),
        f("utm_term", term),
        f("utm_content", content),
        f("Affiliate code (ref=)", code, true),
      ),
      el("div", { class: "field full" }, el("label", {}, "Tagged URL"), out, note),
      el("div", { class: "row", style: { marginTop: 8 } },
        el("button", { class: "btn primary", onclick: () => {
          if (!out.value) return;
          navigator.clipboard.writeText(out.value).then(() => toast("Copied"), () => toast("Copy failed", "warn"));
        } }, "Copy URL"),
        el("button", { class: "btn", onclick: async () => {
          if (!out.value) return;
          // Generate QR via tiny inline PNG: rely on Google Charts deprecated? We don't want network calls.
          // Instead just open in a new tab so the user can screenshot or share.
          window.open(out.value, "_blank");
        } }, "Open"),
      ),
    );
  }

  function renderImport() {
    const ta = el("textarea", {
      class: "textarea",
      style: { minHeight: "200px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" },
      placeholder: 'Paste CSV with columns: Month,Estimated revenue\n2025-01,1245.32\n2025-02,1389.10\n…',
    });
    const platform = el("select", { class: "select" });
    PLATFORMS.forEach((p) => platform.append(el("option", { value: p }, p)));
    platform.value = "adsense";

    const preview = el("div", { class: "small muted", style: { marginTop: 8 } });
    const refreshPreview = () => {
      const rows = csvFromString(ta.value);
      if (rows.length < 2) { preview.textContent = "Paste CSV to preview."; return; }
      const sample = rows.slice(1, 4).map((r) => r.join(" · ")).join("\n");
      preview.textContent = `${rows.length - 1} rows. First: ${sample}`;
    };
    ta.addEventListener("input", refreshPreview);

    const doImport = () => {
      const rows = csvFromString(ta.value);
      if (rows.length < 2) { toast("No data", "warn"); return; }
      const headers = rows[0].map((h) => h.toLowerCase());
      const monthIdx = headers.findIndex((h) => /month|period|date/i.test(h));
      const amountIdx = headers.findIndex((h) => /amount|revenue|earn|payout/i.test(h));
      if (monthIdx < 0 || amountIdx < 0) { toast("Couldn't find Month + Amount columns", "warn", 4000); return; }
      let added = 0;
      rows.slice(1).forEach((row) => {
        const m = row[monthIdx]; const a = parseFloat(String(row[amountIdx]).replace(/[^0-9.-]/g, ""));
        if (!m || isNaN(a)) return;
        const period = String(m).match(/(\d{4}[-/]\d{1,2})/)?.[1].replace("/", "-") || normalizeMonth(m);
        if (!period) return;
        Tips.save({ platform: platform.value, period, amount: a, supporters: 0, notes: "imported" });
        added++;
      });
      toast(`Imported ${added} months`);
      ta.value = "";
      tab = "tips"; render();
    };

    return el("div", { class: "card" },
      el("h3", {}, "Import platform revenue (AdSense, Patreon, etc.)"),
      el("div", { class: "small muted", style: { marginBottom: 8 } }, "Most platforms let you export monthly earnings as CSV. We'll pull Month + Amount columns into a Tips/platform entry."),
      el("div", { class: "field", style: { maxWidth: "280px" } }, el("label", {}, "Platform"), platform),
      ta,
      preview,
      el("div", { class: "row", style: { marginTop: 12 } },
        el("button", { class: "btn primary", onclick: doImport }, "Import"),
      ),
    );
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function normalizeMonth(s) {
  // Try "January 2025" → "2025-01"
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const m = String(s).toLowerCase().match(/([a-z]+)\s*(\d{4})/);
  if (m) {
    const idx = months.findIndex((mo) => m[1].startsWith(mo));
    if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  return null;
}


function openTipForm(tip) {
  const isNew = !tip?.id;
  const t = tip || { period: new Date().toISOString().slice(0, 7), platform: "patreon", amount: 0, supporters: 0, notes: "" };
  const period = el("input", { class: "input", type: "month", value: t.period || new Date().toISOString().slice(0, 7) });
  const platform = el("select", { class: "select" });
  PLATFORMS.forEach((p) => {
    const o = el("option", { value: p }, p);
    if (p === t.platform) o.selected = true;
    platform.append(o);
  });
  const amount = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: t.amount || "" });
  const supporters = el("input", { class: "input", type: "number", min: "0", value: t.supporters || "" });
  const notes = el("textarea", { class: "textarea" }, t.notes || "");

  const body = el("div", { class: "form-grid" },
    field("Month", period),
    field("Platform", platform),
    field("Amount ($)", amount),
    field("Supporters / count", supporters),
    field("Notes", notes, true),
  );
  let m;
  const save = () => {
    if (!amount.value) { toast("Amount required", "warn"); return; }
    Tips.save({
      id: t.id, period: period.value, platform: platform.value,
      amount: +amount.value || 0, supporters: +supporters.value || 0, notes: notes.value,
    });
    toast(isNew ? "Logged" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete entry?", danger: true, confirmLabel: "Delete" });
      if (ok) { Tips.remove(t.id); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Log" : "Save"),
  );
  m = openModal({ title: isNew ? "Log platform / tip income" : "Edit entry", body, footer });
  setTimeout(() => amount.focus(), 30);
}

function openAffiliateForm(aff) {
  const isNew = !aff?.id;
  const a = aff || { brand: "", platform: "impact", code: "", tiers: [{ from: 0, to: null, pct: 10 }], notes: "" };
  const brand = el("input", { class: "input", value: a.brand || "", placeholder: "Adobe / Wise / etc." });
  const platform = el("input", { class: "input", value: a.platform || "", placeholder: "Impact, ShareASale, PartnerStack…" });
  const code = el("input", { class: "input", value: a.code || "", placeholder: "Your affiliate code" });
  const notes = el("textarea", { class: "textarea" }, a.notes || "");

  let tiers = (a.tiers || []).slice();
  const tierBox = el("div", { class: "tiers" });
  const renderTiers = () => {
    tierBox.innerHTML = "";
    tiers.forEach((t, i) => {
      const from = el("input", { class: "input", type: "number", min: "0", placeholder: "From $", value: t.from ?? "" });
      from.addEventListener("input", () => { tiers[i].from = +from.value || 0; });
      const to = el("input", { class: "input", type: "number", min: "0", placeholder: "To $ (blank = ∞)", value: t.to ?? "" });
      to.addEventListener("input", () => { tiers[i].to = to.value ? +to.value : null; });
      const pct = el("input", { class: "input", type: "number", step: "0.1", placeholder: "%", value: t.pct ?? "" });
      pct.addEventListener("input", () => { tiers[i].pct = +pct.value || 0; });
      const remove = el("button", { class: "btn sm danger", type: "button", onclick: () => { tiers.splice(i, 1); renderTiers(); } }, "×");
      tierBox.append(el("div", { class: "tier-row" }, from, to, pct, remove));
    });
    tierBox.append(el("button", { class: "btn sm", type: "button", style: { marginTop: 4 }, onclick: () => { tiers.push({ from: 0, to: null, pct: 10 }); renderTiers(); } }, "+ Tier"));
  };
  renderTiers();

  const body = el("div", { class: "form-grid" },
    field("Brand", brand, true),
    field("Platform / network", platform),
    field("Code", code),
    el("div", { class: "field full" }, el("label", {}, "Commission tiers (revenue range → %)"), tierBox),
    field("Notes", notes, true),
  );
  let m;
  const save = () => {
    if (!brand.value.trim()) { toast("Brand required", "warn"); return; }
    Affiliates.save({
      id: a.id, brand: brand.value.trim(), platform: platform.value, code: code.value, notes: notes.value,
      tiers: tiers.filter((t) => t.pct > 0),
    });
    toast(isNew ? "Affiliate added" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete affiliate?", danger: true, confirmLabel: "Delete" });
      if (ok) { Affiliates.remove(a.id); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Add affiliate" : "Save"),
  );
  m = openModal({ title: isNew ? "New affiliate" : "Edit affiliate", body, footer, wide: true });
  setTimeout(() => brand.focus(), 30);
}

function openAffiliateEntryForm(entry) {
  const isNew = !entry?.id;
  const e = entry || { period: new Date().toISOString().slice(0, 7), affiliateId: "", revenue: 0, commission: 0, paid: false, paidDate: "" };
  const aff = el("select", { class: "select" });
  Affiliates.all().forEach((a) => {
    const o = el("option", { value: a.id }, a.brand);
    if (a.id === e.affiliateId) o.selected = true;
    aff.append(o);
  });
  const period = el("input", { class: "input", type: "month", value: e.period || new Date().toISOString().slice(0, 7) });
  const revenue = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: e.revenue || "" });
  const commission = el("input", { class: "input", type: "number", step: "0.01", min: "0", value: e.commission || "" });
  const paid = el("input", { type: "checkbox" }); paid.checked = !!e.paid;
  const paidDate = el("input", { class: "input", type: "date", value: e.paidDate || "" });

  // Auto-derive commission from revenue × tier pct
  revenue.addEventListener("input", () => {
    const a = Affiliates.get(aff.value);
    if (!a || !a.tiers?.length) return;
    const rev = +revenue.value || 0;
    let pct = a.tiers[0].pct;
    a.tiers.forEach((t) => { if (rev >= (t.from || 0) && (t.to == null || rev <= t.to)) pct = t.pct; });
    if (!commission.value) commission.value = (rev * pct / 100).toFixed(2);
  });

  const body = el("div", { class: "form-grid" },
    field("Affiliate", aff),
    field("Month", period),
    field("Revenue ($)", revenue),
    field("Commission ($)", commission),
    el("div", { class: "field" }, el("label", {}, "Paid?"), el("div", {}, paid)),
    field("Paid date", paidDate),
  );
  let m;
  const save = () => {
    if (!aff.value) { toast("Pick an affiliate", "warn"); return; }
    AffiliateEntries.save({
      id: e.id, affiliateId: aff.value, period: period.value,
      revenue: +revenue.value || 0, commission: +commission.value || 0,
      paid: paid.checked, paidDate: paidDate.value,
    });
    toast(isNew ? "Logged" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    !isNew && el("button", { class: "btn danger", onclick: async () => {
      const ok = await confirmDialog({ title: "Delete entry?", danger: true, confirmLabel: "Delete" });
      if (ok) { AffiliateEntries.remove(e.id); m.close(); }
    } }, "Delete"),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Log entry" : "Save"),
  );
  m = openModal({ title: isNew ? "Log affiliate revenue" : "Edit entry", body, footer });
  setTimeout(() => revenue.focus(), 30);
}
