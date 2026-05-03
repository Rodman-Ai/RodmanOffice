import { el, todayISO, csvFromString, field } from "../utils.js";
import { Settings, exportJSON, importJSON, resetAll, loadSampleData, downloadFile, subscribe, Deals, Bills, Contacts, Snapshots, isVaultEncrypted, enableEncryptionWithPassphrase, disableEncryption } from "../store.js";
import { confirmDialog, toast, openModal } from "../ui.js";
import { setTheme } from "../theme.js";
import { setPasscode, isLockEnabled, lock as lockNow } from "../lock.js";
import { listProfiles, getActiveProfileId, createProfile, renameProfile, deleteProfile, activateProfile } from "../profiles.js";

export default function settings() {
  const node = el("div", {});
  const render = () => {
    const s = Settings.get();
    const dealCount = Deals.all().length;
    const billCount = Bills.all().length;
    const contactCount = Contacts.all().length;

    const businessName = inp(s.businessName, "Your Creator LLC");
    const legalName = inp(s.legalName, "Legal entity name");
    const email = inp(s.email, "you@yourdomain.com", "email");
    const address = textarea(s.address, "Mailing / billing address");
    const taxRate = inp(Math.round((s.taxRate || .3) * 100), "30", "number");
    const currency = sel(s.currency, ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR"].map((c) => ({ value: c, label: c })));
    const invPrefix = inp(s.invoicePrefix, "INV");
    const invNext = inp(s.nextInvoiceNumber, "1001", "number");
    const monthlyGoal = inp(s.monthlyGoal || "", "5000", "number");
    const annualGoal = inp(s.annualGoal || "", "120000", "number");
    const mileageRate = inp(s.mileageRate ?? 0.67, "0.67", "number");
    const stateRate = inp(Math.round((s.stateRate || 0.05) * 100), "5", "number");
    const cashOnHand = inp(s.cashOnHand || "", "10000", "number");
    const lateFeePct = inp(s.lateFeePct || "", "1.5", "number");
    const defaultTerms = inp(s.defaultTerms || 30, "30", "number");

    // Invoice template (#41)
    const it = s.invoiceTemplate || {};
    const tplLogo = inp(it.logo || "", "https:// or data:image/png;base64,…", "url");
    const tplPrimary = inp(it.primary || "#22c55e", "#22c55e", "color");
    const tplFooter = textarea(it.footer || "", "Thank-you note, ACH wire details, etc.");
    const tplTaxId = inp(it.taxId || "", "EIN / VAT");

    const save = () => {
      Settings.update({
        businessName: businessName.value,
        legalName: legalName.value,
        email: email.value,
        address: address.value,
        taxRate: (+taxRate.value || 30) / 100,
        currency: currency.value,
        invoicePrefix: invPrefix.value,
        nextInvoiceNumber: +invNext.value || 1001,
        monthlyGoal: +monthlyGoal.value || 0,
        annualGoal: +annualGoal.value || 0,
        mileageRate: +mileageRate.value || 0.67,
        stateRate: (+stateRate.value || 5) / 100,
        cashOnHand: +cashOnHand.value || 0,
        lateFeePct: +lateFeePct.value || 0,
        defaultTerms: +defaultTerms.value || 30,
        invoiceTemplate: {
          logo: tplLogo.value, primary: tplPrimary.value || "#22c55e",
          footer: tplFooter.value, taxId: tplTaxId.value,
        },
      });
      toast("Settings saved");
    };

    const onExport = () => {
      const text = exportJSON();
      downloadFile(`rodbooks-${todayISO()}.json`, text, "application/json");
      toast("Exported");
    };
    const onImport = () => {
      const file = el("input", { type: "file", accept: ".json,application/json" });
      file.addEventListener("change", async () => {
        const f = file.files?.[0]; if (!f) return;
        const text = await f.text();
        const ok = await confirmDialog({
          title: "Replace all data with this JSON?",
          body: el("div", {},
            el("div", {}, `File: ${f.name} (${Math.round(f.size / 1024)} KB)`),
            el("div", { class: "small muted", style: { marginTop: 6 } },
              "This wipes the current profile and replaces it with the file's contents. Take a snapshot first if you want a rollback point."),
          ),
          danger: true, confirmLabel: "Replace data",
        });
        if (!ok) return;
        try {
          importJSON(text);
          toast("Imported");
        } catch (e) {
          toast("Import failed: " + e.message, "warn", 4000);
        }
      });
      file.click();
    };
    const onSample = async () => {
      const ok = await confirmDialog({
        title: "Load sample data?",
        body: "This replaces your current data with sample brand deals and expenses (handy for demos).",
        confirmLabel: "Load sample",
      });
      if (ok) { await loadSampleData(); toast("Sample data loaded"); }
    };
    const onReset = async () => {
      const ok = await confirmDialog({
        title: "Erase all data?",
        body: "This wipes all deals, bills, contacts, and settings. Export first if you want a backup.",
        danger: true, confirmLabel: "Erase everything",
      });
      if (ok) { resetAll(); toast("Reset"); }
    };

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Settings"),
          el("div", { class: "sub" }, "Business profile, invoicing, and your data."),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Business profile"),
        el("div", { class: "form-grid" },
          field("Business name", businessName),
          field("Legal name", legalName),
          field("Email", email),
          field("Currency", currency),
          field("Tax reserve %", taxRate),
          field("Address", address, true),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Invoicing"),
        el("div", { class: "form-grid" },
          field("Invoice prefix", invPrefix),
          field("Next invoice #", invNext),
        ),
        el("h4", { style: { fontSize: "12px", color: "var(--muted)", textTransform: "uppercase", margin: "12px 0 4px" } }, "Invoice template"),
        el("div", { class: "form-grid" },
          field("Logo URL or data URI", tplLogo, true),
          field("Primary color", tplPrimary),
          field("Tax ID (EIN/VAT)", tplTaxId),
          field("Footer text", tplFooter, true),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Goals"),
        el("div", { class: "form-grid" },
          field("Monthly revenue goal ($)", monthlyGoal),
          field("Annual revenue goal ($)", annualGoal),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Cash & terms"),
        el("div", { class: "form-grid" },
          field("Cash on hand ($)", cashOnHand),
          field("Default payment terms (net days)", defaultTerms),
          field("Late-fee % per month", lateFeePct),
          field("State income-tax effective rate %", stateRate),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Mileage"),
        el("div", { class: "form-grid" },
          field("Deduction rate ($/mile)", mileageRate),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Appearance"),
        el("div", { class: "row" },
          themeBtn("auto", "System", s.theme === "auto"),
          themeBtn("dark", "Dark", s.theme === "dark"),
          themeBtn("light", "Light", s.theme === "light"),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Privacy lock"),
        el("div", { class: "small muted", style: { marginBottom: 8 } },
          "Set a passcode to gate the app on shared devices. This is a UI lock — data is still stored unencrypted in your browser."),
        el("div", { class: "row" },
          isLockEnabled()
            ? el("button", { class: "btn", onclick: async () => { await setPasscode(""); toast("Lock removed"); } }, "Remove passcode")
            : el("button", { class: "btn primary", onclick: () => openSetPasscode() }, "Set passcode"),
          isLockEnabled() && el("button", { class: "btn", onclick: () => lockNow() }, "Lock now"),
        ),
      ),

      profileSection(render),

      el("div", { class: "card" },
        el("h3", {}, "Encrypted-at-rest vault"),
        el("div", { class: "small muted", style: { marginBottom: 8 } },
          isVaultEncrypted()
            ? "Your books are encrypted in localStorage with AES-GCM. You'll be prompted on next launch."
            : "Optional. Encrypts the entire localStorage blob with a passphrase you choose. There is NO recovery — losing the passphrase means losing the data."),
        el("div", { class: "row" },
          isVaultEncrypted()
            ? el("button", { class: "btn", onclick: async () => {
                const ok = await confirmDialog({ title: "Disable encryption?", body: "Your data will be written back to localStorage in plaintext.", danger: true, confirmLabel: "Disable" });
                if (ok) { await disableEncryption(); toast("Encryption disabled"); }
              } }, "Disable encryption")
            : el("button", { class: "btn primary", onclick: () => openEnableEncryption() }, "Enable encryption…"),
        ),
      ),

      el("div", { class: "card" },
        el("h3", {}, "Snapshots"),
        el("div", { class: "small muted", style: { marginBottom: 8 } }, "Save a restore point before risky changes. Up to 20 retained."),
        el("div", { class: "row" },
          el("button", { class: "btn primary", onclick: async () => {
            const label = prompt("Label this snapshot", new Date().toLocaleString());
            if (label !== null) { Snapshots.create(label); toast("Snapshot saved"); }
          } }, "Save snapshot"),
        ),
        renderSnapshotList(),
      ),

      el("div", { class: "row", style: { justifyContent: "flex-end" } }, el("button", { class: "btn primary", onclick: save }, "Save settings")),

      el("div", { class: "card" },
        el("h3", {}, "Your data"),
        el("div", { class: "small muted", style: { marginBottom: "8px" } },
          `${dealCount} deals · ${billCount} bills · ${contactCount} contacts. Stored locally on this device.`),
        el("div", { class: "row", style: { flexWrap: "wrap", gap: "8px" } },
          el("button", { class: "btn", onclick: onExport }, "Export JSON"),
          el("button", { class: "btn", onclick: async () => {
            const yr = String(prompt("Tax year for share bundle?", new Date().getFullYear()) || "").trim();
            if (!yr) return;
            const incReceipts = confirm("Include image receipts (data URIs) in the bundle?");
            const { downloadShareBundle } = await import("../share.js");
            try { await downloadShareBundle({ year: yr, includeReceipts: incReceipts }); toast("Share bundle exported"); }
            catch (e) { toast("Bundle failed: " + e.message, "warn", 4000); }
          } }, "Share with accountant…"),
          el("button", { class: "btn", onclick: onImport }, "Import JSON"),
          el("button", { class: "btn", onclick: openCsvImport }, "Import CSV…"),
          el("button", { class: "btn", onclick: onSample }, "Load sample data"),
          el("button", { class: "btn danger", onclick: onReset }, "Reset all"),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "About"),
        el("div", { class: "small muted" },
          "RodBooks is an AI-first creator-business app. The QuickBooks-style books (brand deals, invoices, mileage, taxes, banking) are wired to the AI tools — brief summarizer, deal grader, contract redline, coach mode — so most of the work runs itself. Local-first; data stays in your browser. Export JSON for backups; print or save invoices as PDF.",
        ),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function themeBtn(value, label, active) {
  return el("button", { class: `chip ${active ? "active" : ""}`, onclick: () => { setTheme(value); toast(`Theme: ${label.toLowerCase()}`); } }, label);
}

function renderSnapshotList() {
  const list = Snapshots.all();
  if (!list.length) return el("div", { class: "small muted", style: { marginTop: 8 } }, "No snapshots yet.");
  return el("div", { class: "list", style: { marginTop: 12 } },
    ...list.map((s) => el("div", { class: "list-row" },
      el("div", { style: { flex: 1 } },
        el("div", {}, s.label),
        el("div", { class: "small muted" }, new Date(s.ts).toLocaleString()),
      ),
      el("button", { class: "btn sm", onclick: async () => {
        const ok = await confirmDialog({ title: "Restore this snapshot?", body: "Current data will be replaced (your snapshot list is preserved).", danger: true, confirmLabel: "Restore" });
        if (ok) { Snapshots.restore(s.id); toast("Restored"); }
      } }, "Restore"),
      el("button", { class: "btn sm danger", onclick: async () => {
        const ok = await confirmDialog({ title: "Delete snapshot?", body: s.label, danger: true, confirmLabel: "Delete" });
        if (ok) { Snapshots.remove(s.id); toast("Deleted"); }
      } }, "Delete"),
    )),
  );
}

function profileSection(rerender) {
  const list = listProfiles();
  const active = getActiveProfileId();
  return el("div", { class: "card" },
    el("h3", {}, "Profiles (entities)"),
    el("div", { class: "small muted", style: { marginBottom: 8 } }, "Run multiple books in the same browser — useful for separating your LLC from personal income, or one creator account from another. Each profile has its own deals, bills, contacts."),
    el("table", { class: "data" },
      el("tbody", {}, ...list.map((p) => el("tr", {},
        el("td", {}, p.name + (p.id === active ? " · active" : "")),
        el("td", {},
          el("div", { class: "row" },
            p.id !== active && el("button", { class: "btn sm", onclick: () => activateProfile(p.id) }, "Switch"),
            el("button", { class: "btn sm", onclick: () => {
              const n = prompt("Rename profile", p.name);
              if (n) { renameProfile(p.id, n); toast("Renamed"); rerender && rerender(); }
            } }, "Rename"),
            list.length > 1 && p.id !== active && el("button", { class: "btn sm danger", onclick: async () => {
              const ok = await confirmDialog({ title: `Delete profile "${p.name}"?`, body: "All deals, bills, and contacts in that profile will be erased.", danger: true, confirmLabel: "Delete" });
              if (ok) { try { deleteProfile(p.id); toast("Deleted"); rerender && rerender(); } catch (e) { toast(e.message, "warn"); } }
            } }, "Delete"),
          ),
        ),
      ))),
    ),
    el("div", { style: { marginTop: 12 } },
      el("button", { class: "btn primary", onclick: () => {
        const name = prompt("New profile name");
        if (name) { const p = createProfile(name); activateProfile(p.id); }
      } }, "+ New profile"),
    ),
  );
}

function openEnableEncryption() {
  const p1 = el("input", { class: "input", type: "password", placeholder: "Strong passphrase", autocomplete: "new-password" });
  const p2 = el("input", { class: "input", type: "password", placeholder: "Confirm", autocomplete: "new-password" });
  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, "AES-GCM via PBKDF2-SHA256 (200k iterations). The passphrase never leaves your device."),
    el("div", { class: "small", style: { color: "var(--warn)" } }, "If you forget the passphrase, your data is unrecoverable."),
    el("div", { class: "field" }, el("label", {}, "Passphrase"), p1),
    el("div", { class: "field" }, el("label", {}, "Confirm"), p2),
  );
  let m;
  const submit = async () => {
    if (p1.value.length < 8) { toast("Use at least 8 characters", "warn"); return; }
    if (p1.value !== p2.value) { toast("Doesn't match", "warn"); return; }
    try {
      await enableEncryptionWithPassphrase(p1.value);
      toast("Encryption enabled");
      m.close();
    } catch (e) {
      toast("Failed: " + e.message, "warn", 4000);
    }
  };
  p2.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: submit }, "Enable"),
  );
  m = openModal({ title: "Enable encryption-at-rest", body, footer });
  setTimeout(() => p1.focus(), 30);
}

function openSetPasscode() {
  const pin1 = el("input", { class: "input", type: "password", inputmode: "numeric", placeholder: "4-8 digits", autocomplete: "new-password" });
  const pin2 = el("input", { class: "input", type: "password", inputmode: "numeric", placeholder: "Confirm", autocomplete: "new-password" });
  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, "Choose a numeric passcode. You'll be prompted on next launch."),
    el("div", { class: "field" }, el("label", {}, "Passcode"), pin1),
    el("div", { class: "field" }, el("label", {}, "Confirm"), pin2),
  );
  let m;
  const submit = async () => {
    if (!pin1.value || pin1.value.length < 4) { toast("At least 4 characters", "warn"); return; }
    if (pin1.value !== pin2.value) { toast("Doesn't match", "warn"); return; }
    await setPasscode(pin1.value);
    toast("Passcode set");
    m.close();
  };
  pin2.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: submit }, "Set passcode"),
  );
  m = openModal({ title: "Set passcode", body, footer });
  setTimeout(() => pin1.focus(), 30);
}

function openCsvImport() {
  const file = el("input", { type: "file", accept: ".csv,text/csv" });
  file.addEventListener("change", () => {
    const f = file.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => csvImportWizard(String(reader.result || ""));
    reader.readAsText(f);
  });
  file.click();
}

function csvImportWizard(text) {
  const rows = csvFromString(text);
  if (!rows.length) { toast("Empty CSV", "warn"); return; }
  const headers = rows[0];
  const data = rows.slice(1).filter((r) => r.length === headers.length);

  const targetSel = sel("deals", [
    { value: "deals", label: "Brand Deals" },
    { value: "bills", label: "Bills / Expenses" },
    { value: "contacts", label: "Contacts" },
  ]);

  const fieldDefs = {
    deals: ["company", "svc", "fee", "partnerFeePct", "paidAmount", "paid", "paidDate", "payMethod", "serviceDate", "postDate", "draftDue", "invoiceNumber", "invoiceDate", "invoiceUrl", "invoiceTo", "contractUrl", "briefUrl", "draftUrl", "notes"],
    bills: ["vendor", "category", "amount", "date", "paid", "paidDate", "payMethod", "recurring", "receiptUrl", "notes"],
    contacts: ["name", "company", "type", "email", "phone", "notes"],
  };

  const mappingsContainer = el("div", { class: "form-grid" });
  const renderMappings = () => {
    mappingsContainer.innerHTML = "";
    const fields = fieldDefs[targetSel.value];
    fields.forEach((f) => {
      const guess = headers.find((h) => h.toLowerCase().replace(/[^a-z]/g, "") === f.toLowerCase());
      const dropdown = el("select", { class: "select" });
      dropdown.dataset.field = f;
      dropdown.append(el("option", { value: "" }, "— ignore —"));
      headers.forEach((h, i) => {
        const o = el("option", { value: String(i) }, h);
        if (h === guess) o.selected = true;
        dropdown.append(o);
      });
      mappingsContainer.append(el("div", { class: "field" }, el("label", {}, f), dropdown));
    });
  };
  targetSel.addEventListener("change", renderMappings);
  renderMappings();

  const body = el("div", { class: "stack" },
    el("div", { class: "small muted" }, `${data.length} rows detected. Map columns:`),
    el("div", { class: "field" }, el("label", {}, "Import as"), targetSel),
    mappingsContainer,
  );
  let m;
  const doImport = async () => {
    const target = targetSel.value;
    const fields = fieldDefs[target];
    const map = {};
    mappingsContainer.querySelectorAll("select").forEach((sel) => {
      if (sel.value !== "") map[sel.dataset.field] = +sel.value;
    });
    let added = 0;
    for (const row of data) {
      const item = {};
      for (const [f, idx] of Object.entries(map)) {
        let v = row[idx];
        if (v == null) continue;
        if (["fee", "amount", "paidAmount", "partnerFeePct"].includes(f)) v = parseFloat(v) || 0;
        if (f === "paid") v = /^(yes|y|true|1|paid)$/i.test(String(v).trim());
        item[f] = v;
      }
      if (Object.keys(item).length === 0) continue;
      if (target === "deals") Deals.save(item);
      else if (target === "bills") Bills.save(item);
      else if (target === "contacts") Contacts.save(item);
      added++;
    }
    toast(`Imported ${added} row${added === 1 ? "" : "s"}`);
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: doImport }, "Import"),
  );
  m = openModal({ title: `CSV import · ${data.length} rows`, body, footer, wide: true });
}

function inp(value, placeholder, type = "text") {
  return el("input", { class: "input", type, value: value ?? "", placeholder });
}
function textarea(value, placeholder) {
  return el("textarea", { class: "textarea", placeholder }, value || "");
}
function sel(value, options) {
  const s = el("select", { class: "select" });
  for (const o of options) {
    const opt = el("option", { value: o.value }, o.label);
    if (o.value === value) opt.selected = true;
    s.append(opt);
  }
  return s;
}
