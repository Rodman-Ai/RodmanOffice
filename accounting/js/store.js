/**
 * @file LocalStorage-backed store — the single source of truth for every
 * collection in RodBooks. All views read via `getState()` + `subscribe()`,
 * and write via the per-collection APIs (`Deals.save`, `Bills.remove`, etc.)
 * which fan out to subscribers and append to the activity log.
 *
 * **Multi-profile** (#69): each profile keys its own blob in localStorage via
 * `dataKeyFor(activeId)`. Switching profiles reloads the page so the cache
 * is rebuilt fresh.
 *
 * **Encryption-at-rest** (#70): when enabled, writes pass through
 * `cryptoVault.encryptCurrent()` and the localStorage blob is prefixed
 * `enc:v1:`. On boot, `rawIsEncrypted()` triggers the unlock screen.
 *
 * @module store
 */

import { dataKeyFor, getActiveProfileId } from "./profiles.js";

// Active profile's localStorage key. Re-resolved on each access via KEY().
const KEY = () => dataKeyFor(getActiveProfileId());
const SCHEMA_VERSION = 1;

const defaults = () => ({
  schema: SCHEMA_VERSION,
  settings: {
    businessName: "",
    legalName: "",
    email: "",
    address: "",
    taxRate: 0.30,
    currency: "USD",
    invoicePrefix: "INV",
    nextInvoiceNumber: 1001,
    theme: "auto", // auto | dark | light
    monthlyGoal: 0,
    annualGoal: 0,
    mileageRate: 0.67, // IRS standard 2024
    lockHash: "", // sha-256 of passcode (empty = no lock)
    state: "", // optional state code for tax estimator
    stateRate: 0.05, // approx state effective rate
    defaultTerms: 30, // net days
    lateFeePct: 0, // 0 = off; e.g. 1.5 for 1.5% / month
    cashOnHand: 0, // manual current cash balance (for runway calc)
    invoiceTemplate: { logo: "", primary: "#22c55e", footer: "", taxId: "" }, // #41
    homeOffice: { sqft: 0, totalSqft: 0, monthlyUtilities: 0 }, // #17
    connect: {
      plaid: { clientId: "", secret: "", env: "sandbox" },
      stripe: { publishableKey: "", secretKey: "" },
      dropboxSign: { apiKey: "" },
      llm: { provider: "anthropic", apiKey: "", model: "claude-sonnet-4-6" },
    },
  },
  deals: [],
  bills: [],
  contacts: [],
  invoices: [],
  mileage: [], // { id, date, miles, purpose, fromTo, deductible, notes }
  activity: [], // { id, ts, type, entity, entityId, label, detail }
  snapshots: [], // { id, ts, label, payload }
  taxPayments: [], // { id, year, quarter, date, amount, method, notes }
  contractTemplates: [], // { id, name, body, kind }
  outreachTemplates: [], // { id, name, subject, body, kind }
  vendorRules: [], // { id, match, category } — rule for auto-categorize
  dealTemplates: [], // { id, name, contactId, company, svc, fee, partnerFeePct, terms, deliverables, cadence, dayOfMonth, lastRunAt, active }
  agents: [], // { id, name, email, defaultPct } — talent agents/managers
  accounts: [], // { id, name, kind: checking|savings|credit, last4, currency }
  transactions: [], // { id, accountId, date, vendor, amount, type: debit|credit, category, dealId, billId, cleared, source }
  affiliates: [], // { id, brand, platform, code, tiers: [{from,to,pct}], notes }
  affiliateEntries: [], // { id, affiliateId, period: 'YYYY-MM', revenue, commission, paid, paidDate }
  tips: [], // { id, platform, period: 'YYYY-MM', amount, supporters, notes }
  assets: [], // { id, name, category, purchaseDate, cost, life, notes } — depreciation
  csvMappings: [], // { id, name, columnMap, sample } — saved bank import mappings
  salesTax: [], // { id, date, state, taxableSales, ratePct, taxCollected, paid, paidDate, notes }
  reportPresets: [], // { id, name, dimensions, measures } — saved custom-report configs
});

let cache = null;
const subscribers = new Set();

// Encrypted-at-rest support (#70). When enabled, the localStorage blob is
// "enc:v1:..." and we keep the in-memory state plain; writes re-encrypt.
let _encrypted = false;
let _encryptCb = null; // async function(jsonStr) -> ciphertext
export function isVaultEncrypted() { return _encrypted; }
export function enableVaultEncryption(encryptFn) { _encrypted = true; _encryptCb = encryptFn; write(); }
export function disableVaultEncryption() { _encrypted = false; _encryptCb = null; write(); }

function read() {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return defaults();
    if (raw.startsWith("enc:v1:")) {
      // Locked — we'll wait for unlockAndLoad to set the cache.
      return defaults();
    }
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (e) {
    console.warn("Failed to parse store, resetting:", e);
    return defaults();
  }
}

export function rawIsEncrypted() {
  const raw = localStorage.getItem(KEY());
  return typeof raw === "string" && raw.startsWith("enc:v1:");
}

/**
 * Decrypt the on-disk blob with the given passphrase, install the plaintext
 * as the in-memory cache, and broadcast to subscribers. Throws on wrong
 * passphrase. Used by the boot-time vault-unlock screen in `app.js`.
 * @param {string} passphrase
 * @returns {Promise<object>} the decrypted state
 */
export async function unlockVaultAndLoad(passphrase) {
  const raw = localStorage.getItem(KEY());
  if (!raw || !raw.startsWith("enc:v1:")) throw new Error("Not encrypted");
  const { unlock } = await import("./cryptoVault.js");
  const plaintext = await unlock(passphrase, raw);
  const data = JSON.parse(plaintext);
  cache = migrate(data);
  _encrypted = true;
  const { encryptCurrent } = await import("./cryptoVault.js");
  _encryptCb = encryptCurrent;
  // notify subscribers so all views refresh with newly-loaded data.
  subscribers.forEach((fn) => { try { fn(cache); } catch (e) { console.error(e); } });
  return cache;
}

/**
 * Turn on encryption-at-rest using `passphrase`. Re-encrypts the current
 * cache and writes back to localStorage. There is **no recovery** if the
 * passphrase is later forgotten.
 * @param {string} passphrase
 */
export async function enableEncryptionWithPassphrase(passphrase) {
  const { enableWithPassphrase } = await import("./cryptoVault.js");
  const plaintext = JSON.stringify(cache);
  const blob = await enableWithPassphrase(passphrase, plaintext);
  localStorage.setItem(KEY(), blob);
  _encrypted = true;
  const { encryptCurrent } = await import("./cryptoVault.js");
  _encryptCb = encryptCurrent;
}

/**
 * Turn off encryption. Discards the in-memory key and writes the cache back
 * as plaintext.
 */
export async function disableEncryption() {
  _encrypted = false;
  _encryptCb = null;
  const { disable } = await import("./cryptoVault.js");
  disable();
  // Re-write as plaintext.
  localStorage.setItem(KEY(), JSON.stringify(cache));
}

function migrate(data) {
  if (!data.schema) data.schema = SCHEMA_VERSION;
  const d = defaults();
  return {
    ...d,
    ...data,
    settings: { ...d.settings, ...(data.settings || {}) },
    deals: data.deals || [],
    bills: data.bills || [],
    contacts: data.contacts || [],
    invoices: data.invoices || [],
    mileage: data.mileage || [],
    activity: data.activity || [],
    snapshots: data.snapshots || [],
    taxPayments: data.taxPayments || [],
    contractTemplates: data.contractTemplates || [],
    outreachTemplates: data.outreachTemplates || [],
    vendorRules: data.vendorRules || [],
    dealTemplates: data.dealTemplates || [],
    agents: data.agents || [],
    accounts: data.accounts || [],
    transactions: data.transactions || [],
    affiliates: data.affiliates || [],
    affiliateEntries: data.affiliateEntries || [],
    tips: data.tips || [],
    assets: data.assets || [],
    csvMappings: data.csvMappings || [],
    salesTax: data.salesTax || [],
    reportPresets: data.reportPresets || [],
  };
}

function write() {
  const plain = JSON.stringify(cache);
  // Capture the target storage key at dispatch time so an in-flight async
  // encrypt from the previous profile can't write into the new profile's
  // blob during a profile switch. (Audit defect #7.)
  const targetKey = KEY();
  if (_encrypted && _encryptCb) {
    // Encrypt asynchronously; UI is already updated from in-memory cache.
    _encryptCb(plain).then((blob) => localStorage.setItem(targetKey, blob)).catch((e) => console.warn("encrypt write failed:", e));
  } else {
    localStorage.setItem(targetKey, plain);
  }
  subscribers.forEach((fn) => {
    try { fn(cache); } catch (e) { console.error(e); }
  });
}

/**
 * Get the current in-memory state object. Lazily reads from localStorage on
 * first access. Treat the returned object as **mutable but synced** —
 * mutations only persist after a `write()` (which the per-collection APIs
 * do for you). Don't deeply mutate from views; use `Deals.save` etc.
 * @returns {object}
 */
export function getState() {
  if (!cache) cache = read();
  return cache;
}

/** Reset the in-memory cache. Used when switching profiles to force re-read. */
export function resetCache() { cache = null; }

/**
 * Subscribe to state writes. The callback fires after every successful save
 * with the current state. Returns an unsubscribe function — call it from a
 * view's `unmount` to avoid leaks.
 * @param {(state: object) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

/**
 * Random-ish 12-char id used for every new record. Combines a short Math.random
 * base-36 chunk with a Date.now base-36 suffix. Not cryptographically strong;
 * collisions are vanishingly unlikely at expected dataset sizes (≤500k records).
 * @returns {string}
 */
export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// ---- CRUD helpers ----
function logActivity(type, entity, entityId, label, detail) {
  const s = getState();
  s.activity = s.activity || [];
  s.activity.unshift({ id: uid(), ts: Date.now(), type, entity, entityId, label, detail: detail || "" });
  // Keep last 500 entries to bound size
  if (s.activity.length > 500) s.activity.length = 500;
}

function upsertCollection(name, item) {
  const s = getState();
  const arr = s[name];
  const idx = item.id ? arr.findIndex((x) => x.id === item.id) : -1;
  let saved;
  if (idx >= 0) {
    arr[idx] = { ...arr[idx], ...item, updatedAt: Date.now() };
    saved = arr[idx];
    if (name !== "activity") logActivity("update", name, saved.id, labelFor(name, saved));
  } else {
    saved = { ...item, id: item.id || uid(), createdAt: Date.now(), updatedAt: Date.now() };
    arr.push(saved);
    if (name !== "activity") logActivity("create", name, saved.id, labelFor(name, saved));
  }
  write();
  return saved;
}

function labelFor(name, item) {
  if (name === "deals") return `${item.company || "Deal"}${item.fee ? " · $" + item.fee : ""}`;
  if (name === "bills") return `${item.vendor || "Bill"}${item.amount ? " · $" + item.amount : ""}`;
  if (name === "contacts") return item.name || "Contact";
  if (name === "mileage") return `${item.miles || 0} mi · ${item.purpose || "trip"}`;
  return name;
}

function removeFromCollection(name, id) {
  const s = getState();
  const item = s[name].find((x) => x.id === id);
  s[name] = s[name].filter((x) => x.id !== id);
  if (item && name !== "activity") logActivity("delete", name, id, labelFor(name, item));
  write();
}

/**
 * Brand-deal CRUD. `save({...item, id?})` is upsert (id → update, no id → insert).
 * Every save fans out to subscribers and appends to the activity log.
 * @namespace Deals
 */
export const Deals = {
  all: () => getState().deals,
  get: (id) => getState().deals.find((d) => d.id === id),
  save: (d) => upsertCollection("deals", d),
  remove: (id) => removeFromCollection("deals", id),
};
/**
 * Bill / expense CRUD. Saving a bill also calls `VendorRules.learn()` so the
 * vendor → category mapping is remembered for the next bill.
 * @namespace Bills
 */
export const Bills = {
  all: () => getState().bills,
  get: (id) => getState().bills.find((b) => b.id === id),
  save: (b) => upsertCollection("bills", b),
  remove: (id) => removeFromCollection("bills", id),
};
/**
 * Contact (brand / agency / vendor / partner / personal) CRUD.
 * Carries `defaultRates` (per-service brand rate card), `audience` snapshots,
 * `testimonials`, `emailLog`, and the `confidential` flag (excludes from
 * media-kit / share-bundle).
 * @namespace Contacts
 */
export const Contacts = {
  all: () => getState().contacts,
  get: (id) => getState().contacts.find((c) => c.id === id),
  save: (c) => upsertCollection("contacts", c),
  remove: (id) => removeFromCollection("contacts", id),
  byName(name) {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    return getState().contacts.find((c) => (c.name || "").toLowerCase() === n) || null;
  },
  ensure(name, extra = {}) {
    if (!name) return null;
    const existing = Contacts.byName(name);
    if (existing) return existing;
    const c = upsertCollection("contacts", { name: name.trim(), type: "brand", ...extra });
    return c;
  },
};
export const Invoices = {
  all: () => getState().invoices,
  get: (id) => getState().invoices.find((i) => i.id === id),
  save: (i) => upsertCollection("invoices", i),
  remove: (id) => removeFromCollection("invoices", id),
};

export const Mileage = {
  all: () => getState().mileage,
  get: (id) => getState().mileage.find((m) => m.id === id),
  save: (m) => upsertCollection("mileage", m),
  remove: (id) => removeFromCollection("mileage", id),
};

export const TaxPayments = {
  all: () => getState().taxPayments,
  get: (id) => getState().taxPayments.find((x) => x.id === id),
  save: (x) => upsertCollection("taxPayments", x),
  remove: (id) => removeFromCollection("taxPayments", id),
};

export const ContractTemplates = {
  all: () => getState().contractTemplates,
  get: (id) => getState().contractTemplates.find((x) => x.id === id),
  save: (x) => upsertCollection("contractTemplates", x),
  remove: (id) => removeFromCollection("contractTemplates", id),
};

export const OutreachTemplates = {
  all: () => getState().outreachTemplates,
  get: (id) => getState().outreachTemplates.find((x) => x.id === id),
  save: (x) => upsertCollection("outreachTemplates", x),
  remove: (id) => removeFromCollection("outreachTemplates", id),
};

export const DealTemplates = {
  all: () => getState().dealTemplates,
  get: (id) => getState().dealTemplates.find((x) => x.id === id),
  save: (x) => upsertCollection("dealTemplates", x),
  remove: (id) => removeFromCollection("dealTemplates", id),
};

export const Agents = {
  all: () => getState().agents,
  get: (id) => getState().agents.find((x) => x.id === id),
  save: (x) => upsertCollection("agents", x),
  remove: (id) => removeFromCollection("agents", id),
};

export const Accounts = {
  all: () => getState().accounts,
  get: (id) => getState().accounts.find((x) => x.id === id),
  save: (x) => upsertCollection("accounts", x),
  remove: (id) => removeFromCollection("accounts", id),
};

export const Transactions = {
  all: () => getState().transactions,
  get: (id) => getState().transactions.find((x) => x.id === id),
  save: (x) => upsertCollection("transactions", x),
  remove: (id) => removeFromCollection("transactions", id),
  byAccount(accountId) { return getState().transactions.filter((t) => t.accountId === accountId); },
};

export const Affiliates = {
  all: () => getState().affiliates,
  get: (id) => getState().affiliates.find((x) => x.id === id),
  save: (x) => upsertCollection("affiliates", x),
  remove: (id) => removeFromCollection("affiliates", id),
};
export const AffiliateEntries = {
  all: () => getState().affiliateEntries,
  save: (x) => upsertCollection("affiliateEntries", x),
  remove: (id) => removeFromCollection("affiliateEntries", id),
};
export const Tips = {
  all: () => getState().tips,
  save: (x) => upsertCollection("tips", x),
  remove: (id) => removeFromCollection("tips", id),
};
export const Assets = {
  all: () => getState().assets,
  save: (x) => upsertCollection("assets", x),
  remove: (id) => removeFromCollection("assets", id),
};
export const CsvMappings = {
  all: () => getState().csvMappings,
  save: (x) => upsertCollection("csvMappings", x),
  remove: (id) => removeFromCollection("csvMappings", id),
};
export const SalesTax = {
  all: () => getState().salesTax,
  get: (id) => getState().salesTax.find((x) => x.id === id),
  save: (x) => upsertCollection("salesTax", x),
  remove: (id) => removeFromCollection("salesTax", id),
};
export const ReportPresets = {
  all: () => getState().reportPresets,
  save: (x) => upsertCollection("reportPresets", x),
  remove: (id) => removeFromCollection("reportPresets", id),
};

export const VendorRules = {
  all: () => getState().vendorRules,
  save: (x) => upsertCollection("vendorRules", x),
  remove: (id) => removeFromCollection("vendorRules", id),
  // Resolve a category from a vendor name, picking the first matching rule.
  categoryFor(vendor) {
    if (!vendor) return null;
    const v = String(vendor).toLowerCase();
    const rule = getState().vendorRules.find((r) => v.includes((r.match || "").toLowerCase()));
    return rule?.category || null;
  },
  // Learn a vendor → category association (idempotent on `match`).
  learn(vendor, category) {
    if (!vendor || !category) return;
    const m = vendor.toLowerCase().slice(0, 32);
    const existing = getState().vendorRules.find((r) => r.match === m);
    if (existing) {
      if (existing.category !== category) upsertCollection("vendorRules", { id: existing.id, category });
      return;
    }
    upsertCollection("vendorRules", { match: m, category });
  },
};

export const Activity = {
  all: () => getState().activity,
  clear() { const s = getState(); s.activity = []; write(); },
};

export const Snapshots = {
  all: () => getState().snapshots,
  create(label) {
    const s = getState();
    const { snapshots, ...rest } = s;
    const snap = { id: uid(), ts: Date.now(), label: label || new Date().toLocaleString(), payload: JSON.stringify(rest) };
    s.snapshots = [snap, ...(s.snapshots || [])].slice(0, 20);
    write();
    return snap;
  },
  restore(id) {
    const s = getState();
    const snap = (s.snapshots || []).find((x) => x.id === id);
    if (!snap) throw new Error("Snapshot not found");
    const data = JSON.parse(snap.payload);
    cache = migrate({ ...data, snapshots: s.snapshots });
    write();
  },
  remove(id) {
    const s = getState();
    s.snapshots = (s.snapshots || []).filter((x) => x.id !== id);
    write();
  },
};

/**
 * Settings accessor. `Settings.get()` returns the merged settings object;
 * `Settings.update(patch)` does a shallow merge and persists.
 * `nextInvoiceNumber()` increments + persists in one call.
 * @namespace Settings
 */
export const Settings = {
  get: () => getState().settings,
  update(patch) {
    const s = getState();
    s.settings = { ...s.settings, ...patch };
    write();
    return s.settings;
  },
  nextInvoiceNumber() {
    const s = getState();
    const n = s.settings.nextInvoiceNumber || 1001;
    s.settings.nextInvoiceNumber = n + 1;
    write();
    return n;
  },
};

// ---- Import / Export ----
export function exportJSON() {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  cache = migrate(parsed);
  write();
}

export function resetAll() {
  cache = defaults();
  write();
}

export async function loadSampleData() {
  // Generate a rich synthetic dataset (fictional brands, 6 yrs of growth).
  cache = defaults();
  const { buildSyntheticDataset } = await import("./synth.js");
  const { contacts, deals, bills } = buildSyntheticDataset();
  cache.contacts = contacts;
  cache.deals = deals;
  cache.bills = bills;

  Settings.update({
    businessName: "Your Creator LLC",
    email: "you@yourdomain.com",
    invoicePrefix: "RB",
    nextInvoiceNumber: 3000,
  });

  write();
}

// ---- CSV ----
export function toCSV(rows, columns) {
  const esc = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label || c.key)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.key])).join(",")).join("\n");
  return head + "\n" + body;
}

export function downloadFile(filename, content, mime = "application/octet-stream") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}
