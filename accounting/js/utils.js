/**
 * @file Format helpers, DOM DSL (`el`), date math, business helpers
 * (net fee, deal status, brand health), and a vanilla CSV parser.
 *
 * Imports `Settings` so currency/locale-aware formatters resolve from
 * the active profile's settings on each call.
 *
 * @module utils
 */

import { Settings } from "./store.js";

/**
 * Format a number as a localised currency string. Currency code is taken
 * from `Settings.get().currency` (default `"USD"`). When `opts.cents` is
 * unset, integers render with no decimals; non-integers with two.
 *
 * @param {number|string} n Numeric amount.
 * @param {{cents?: number}} [opts] Override the minimum fraction digits.
 * @returns {string}
 */
export function fmtMoney(n, opts = {}) {
  const v = Number(n) || 0;
  const cur = (Settings.get().currency) || "USD";
  return v.toLocaleString(undefined, {
    style: "currency",
    currency: cur,
    minimumFractionDigits: opts.cents ?? (Math.abs(v - Math.round(v)) > 0 ? 2 : 0),
    maximumFractionDigits: 2,
  });
}

/**
 * Compact currency: $1.2k / $3.4M for axis labels and tight KPIs.
 * @param {number} n
 * @returns {string}
 */
export function fmtMoneyShort(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  if (a >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

/**
 * Format an ISO date string (or `Date`) as a localised long-ish date.
 * Returns "" for falsy / unparseable input.
 * @param {string|Date} s
 * @returns {string}
 */
export function fmtDate(s) {
  if (!s) return "";
  const d = typeof s === "string" ? parseDate(s) : s;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fmtDateShort(s) {
  if (!s) return "";
  const d = typeof s === "string" ? parseDate(s) : s;
  if (!d || isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

/**
 * Parse a date string into a `Date`. Prefers ISO `YYYY-MM-DD`; falls back
 * to `new Date(s)`. Returns `null` for falsy / unparseable input.
 * @param {string} s
 * @returns {Date|null}
 */
export function parseDate(s) {
  if (!s) return null;
  // ISO yyyy-mm-dd preferred
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(d) {
  const dt = typeof d === "string" ? parseDate(d) : d;
  if (!dt || isNaN(dt)) return "";
  return dt.toISOString().slice(0, 7); // YYYY-MM
}

export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

// Service-type labeling/coloring matched loosely to the user's spreadsheet conventions.
const SERVICE_COLORS = {
  v: { label: "Video", cls: "blue" },
  p: { label: "Post", cls: "purple" },
  "p prep": { label: "Pre-post", cls: "purple" },
  postp: { label: "Post-post", cls: "purple" },
  qrt: { label: "Quote / RT", cls: "amber" },
  rt: { label: "Repost", cls: "amber" },
  "qrt rt": { label: "Quote+Repost", cls: "amber" },
  "c+l": { label: "Comment+Like", cls: "teal" },
  incentive: { label: "Incentive", cls: "pink" },
  x: { label: "Other", cls: "gray" },
};
export function serviceMeta(svc) {
  const k = (svc || "").toLowerCase().trim();
  return SERVICE_COLORS[k] || { label: svc || "—", cls: "gray" };
}
export const SERVICE_OPTIONS = Object.entries(SERVICE_COLORS).map(([key, v]) => ({ key, ...v }));

/**
 * Derive a status pill for a deal based on which fields are populated.
 * Returns `{ label, cls }` where `cls` is a `.pill .green/.amber/.red/.blue/...`
 * variant. Order: paid → invoiced → draft → in-progress → signed → pending.
 * @param {object} d Deal record.
 * @returns {{label: string, cls: string}}
 */
export function dealStatus(d) {
  if (d.paid) return { label: "Paid", cls: "green" };
  if (d.invoiceDate || d.invoiceUrl || d.invoiceNumber) return { label: "Invoiced", cls: "blue" };
  if (d.draftUrl) return { label: "Draft sent", cls: "purple" };
  if (d.briefUrl) return { label: "In progress", cls: "amber" };
  if (d.contractUrl) return { label: "Signed", cls: "teal" };
  return { label: "Pending", cls: "gray" };
}

/**
 * Effective net fee for a deal. If `paidAmount` is set, uses that.
 * Otherwise applies `partnerFeePct` discount to `fee`. Used for KPIs,
 * reports, and pivot tables across the app.
 * @param {object} d Deal record (`fee`, `partnerFeePct`, `paidAmount`).
 * @returns {number}
 */
export function netFee(d) {
  const fee = Number(d.fee) || 0;
  const pct = Number(d.partnerFeePct) || 0;
  if (d.paidAmount) return Number(d.paidAmount);
  if (pct > 0) return fee * (1 - pct / 100);
  return fee;
}

/**
 * Parse a CSV string into a 2D array of rows × cells. Handles quoted fields
 * with embedded commas, double-quote escaping, and `\r\n` line endings.
 * @param {string} text
 * @returns {string[][]}
 */
export function csvFromString(text) {
  // simple CSV parser supporting quoted fields
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function debounce(fn, ms = 200) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/**
 * Escape a string for safe insertion as text content in HTML. Encodes the
 * five XML-significant characters. Use this whenever interpolating untrusted
 * content into a template-literal HTML string. (Prefer `el()` + textContent
 * for non-template DOM construction.)
 *
 * Also exported as `escapeHtml` for ergonomics — the historical alias used
 * by `digest.js` and `views/tax.js`.
 *
 * @param {*} s
 * @returns {string}
 */
export function escHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
export { escHtml as escapeHtml };

/**
 * Tiny DOM DSL. Build an element with attributes and children in one call.
 *
 * - `attrs.class`: CSS class string.
 * - `attrs.html`: raw `innerHTML` (caller is responsible for escaping).
 * - `attrs.style`: object of CSS properties; values must be valid CSS strings
 *   (e.g. `"6px"`, not the bare number `6`).
 * - `attrs.on*`: any key starting with `on` whose value is a function is
 *   bound via `addEventListener` (lower-cased event name).
 * - Any other entry becomes an attribute via `setAttribute`. `null`/`false`
 *   skips the attribute entirely.
 * - `children`: nodes are appended as-is; everything else becomes a text node.
 *   Arrays are flattened; `null` / `false` / `undefined` are skipped.
 *
 * @param {string} tag HTML tag name.
 * @param {object} [attrs]
 * @param {...(Node|string|number|boolean|null|undefined|Array)} children
 * @returns {HTMLElement}
 */

// CSS properties whose values must carry a length unit. When a style object
// passes a bare number (e.g. `marginTop: 6`), browsers silently drop it. We
// rewrite to "Npx" (and treat 0 specially since "0" is a valid unitless length).
// `lineHeight`, `opacity`, `flex`, `flexGrow`, `flexShrink`, `zIndex`, `order`,
// `fontWeight` are explicitly EXCLUDED — those accept unitless numbers.
const _LENGTH_PROPS = new Set([
  "margin", "marginTop", "marginRight", "marginBottom", "marginLeft",
  "padding", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "top", "right", "bottom", "left",
  "width", "minWidth", "maxWidth",
  "height", "minHeight", "maxHeight",
  "fontSize", "borderRadius", "borderWidth",
  "gap", "rowGap", "columnGap", "letterSpacing",
]);

function applyStyle(node, styleObj) {
  for (const [prop, raw] of Object.entries(styleObj)) {
    if (raw == null || raw === false) continue;
    let v = raw;
    if (typeof v === "number" && _LENGTH_PROPS.has(prop)) {
      v = v === 0 ? "0" : v + "px";
    }
    node.style[prop] = v;
  }
}

export function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") applyStyle(e, v);
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

// Parse search operators like:
//   brand:Descript paid:no >1000 svc:v
// Returns { text, filters: { brand?, paid?, svc?, min?, max?, year? } }
/**
 * Parse the deal-list search box into free-text + structured filters.
 * Recognised operators (case-insensitive):
 * - `brand:NAME` / `company:NAME` → contact-name substring filter
 * - `paid:yes` / `paid:no` / `unpaid` → paid boolean
 * - `svc:v` / `type:p` → service-type code
 * - `year:2025` → year prefix on dates
 * - `method:stripe` → payment method substring
 * - `>1000` / `<500` → net-fee range
 * Free tokens are joined back into `text`.
 * @param {string} q
 * @returns {{text: string, filters: object}}
 */
export function parseSearchOperators(q) {
  const out = { text: "", filters: {} };
  if (!q) return out;
  const tokens = String(q).match(/\S+/g) || [];
  const free = [];
  for (const tok of tokens) {
    const colon = tok.match(/^([a-z]+):(.+)$/i);
    if (colon) {
      const [, k, v] = colon;
      const key = k.toLowerCase();
      if (key === "brand" || key === "company") out.filters.brand = v.toLowerCase();
      else if (key === "paid") out.filters.paid = /^(yes|y|true|1)$/i.test(v);
      else if (key === "unpaid") out.filters.paid = false;
      else if (key === "svc" || key === "type") out.filters.svc = v.toLowerCase();
      else if (key === "year") out.filters.year = v;
      else if (key === "method" || key === "via") out.filters.method = v.toLowerCase();
      else free.push(tok);
    } else if (/^>\d/.test(tok)) {
      out.filters.min = +tok.slice(1);
    } else if (/^<\d/.test(tok)) {
      out.filters.max = +tok.slice(1);
    } else {
      free.push(tok);
    }
  }
  out.text = free.join(" ");
  return out;
}

// Days between an ISO date and now (positive = past, negative = future).
export function daysAgo(iso) {
  if (!iso) return null;
  const d = parseDate(iso);
  if (!d) return null;
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

// Stage age: how many days the deal has been at its current stage.
export function dealStageAge(d) {
  // ordered list of stage signals; the latest non-empty defines current stage.
  const stages = [
    { key: "paidDate", name: "Paid" },
    { key: "invoiceDate", name: "Invoiced" },
    { key: "postDate", name: "Posted" },
    { key: "draftUrl", name: "Draft sent", isDate: false },
    { key: "draftDue", name: "Draft due" },
    { key: "briefUrl", name: "Brief", isDate: false },
    { key: "contractUrl", name: "Contract", isDate: false },
  ];
  for (const s of stages) {
    if (d[s.key]) {
      if (s.isDate === false) {
        // no date for this stage; fall back to updatedAt
        return { stage: s.name, days: Math.round((Date.now() - (d.updatedAt || Date.now())) / 86400000) };
      }
      return { stage: s.name, days: daysAgo(d[s.key]) };
    }
  }
  return { stage: "Pending", days: Math.round((Date.now() - (d.createdAt || Date.now())) / 86400000) };
}

// Last-touched timestamp for a brand (derives from deals + email log).
export function lastTouchedAt(deals, contact) {
  let max = 0;
  deals.forEach((d) => {
    [d.serviceDate, d.postDate, d.invoiceDate, d.paidDate].forEach((dt) => {
      if (!dt) return;
      const ms = parseDate(dt)?.getTime();
      if (ms && ms > max) max = ms;
    });
    if (d.updatedAt && d.updatedAt > max) max = d.updatedAt;
  });
  (contact?.emailLog || []).forEach((e) => {
    const ms = parseDate(e.date)?.getTime();
    if (ms && ms > max) max = ms;
  });
  return max || 0;
}

// Composite brand health: warmth (recency × frequency × paid rate) + responsiveness (avg paid lag).
export function brandHealth(deals, contact) {
  if (!deals.length) return { score: 0, label: "—", cls: "gray" };
  const warmth = brandWarmth(deals);
  const paidWithLag = deals.filter((d) => d.paid && d.invoiceDate && d.paidDate);
  let respScore = 50;
  if (paidWithLag.length) {
    const avgLag = paidWithLag.reduce((s, d) => s + Math.max(0, (parseDate(d.paidDate) - parseDate(d.invoiceDate)) / 86400000), 0) / paidWithLag.length;
    respScore = Math.max(0, 100 - avgLag * 1.5); // 0d → 100, 67d → 0
  }
  const composite = Math.round(warmth * 0.6 + respScore * 0.4);
  const label = composite >= 75 ? "Excellent" : composite >= 55 ? "Healthy" : composite >= 35 ? "Watch" : "At risk";
  const cls = composite >= 75 ? "green" : composite >= 55 ? "blue" : composite >= 35 ? "amber" : "red";
  return { score: composite, label, cls };
}

// Brand warmth: 0-100 score from recency, frequency, payment health.
export function brandWarmth(deals) {
  if (!deals.length) return 0;
  const now = Date.now();
  const sorted = [...deals].sort((a, b) => (b.serviceDate || "").localeCompare(a.serviceDate || ""));
  const lastMs = sorted[0]?.serviceDate ? new Date(sorted[0].serviceDate).getTime() : 0;
  const daysSince = lastMs ? Math.max(0, (now - lastMs) / 86400000) : 999;
  const recencyScore = Math.max(0, 1 - daysSince / 180); // 6 months → 0
  const freqScore = Math.min(1, deals.length / 6);
  const paid = deals.filter((d) => d.paid).length;
  const paidScore = paid / deals.length;
  return Math.round((recencyScore * 0.5 + freqScore * 0.3 + paidScore * 0.2) * 100);
}

// Add N days to an ISO date string and return ISO yyyy-mm-dd.
export function addDays(iso, n) {
  if (!iso) return "";
  const d = parseDate(iso);
  if (!d) return "";
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Compute due date from invoiceDate + terms (net days). Returns "" if either missing.
/**
 * Compute due date from `invoiceDate + terms (net days)`. Returns "" if either
 * is missing.
 * @param {object} d Deal-like with `invoiceDate` and `terms`.
 * @returns {string} ISO date or "".
 */
export function dueDate(d) {
  if (!d.invoiceDate) return "";
  const terms = Number(d.terms || 0);
  return terms ? addDays(d.invoiceDate, terms) : d.invoiceDate;
}

// Days past due (positive = overdue, negative = upcoming, 0 = today, null = not invoiceable).
export function daysPastDue(d) {
  const due = dueDate(d);
  if (!due || d.paid) return null;
  const ms = Date.now() - parseDate(due).getTime();
  return Math.round(ms / 86400000);
}

// Late fee accrued (compounds monthly if rate > 0).
/**
 * Accrued late fee for a deal, compounding monthly at the given rate. Returns 0
 * if not yet overdue, no rate set, or the deal is paid.
 * @param {object} d Deal record.
 * @param {number} [ratePctPerMonth=0] e.g. 1.5 for 1.5%/mo.
 * @returns {number}
 */
export function lateFee(d, ratePctPerMonth = 0) {
  const dpd = daysPastDue(d);
  if (!dpd || dpd <= 0 || !ratePctPerMonth) return 0;
  const monthsLate = dpd / 30;
  const principal = netFee(d);
  // Simple monthly compounding
  return principal * (Math.pow(1 + ratePctPerMonth / 100, monthsLate) - 1);
}

// Bucket an outstanding deal into 0-30 / 31-60 / 61-90 / 90+ days past due.
export function agingBucket(d) {
  const dpd = daysPastDue(d);
  if (dpd == null) return null;
  if (dpd <= 0) return "current";
  if (dpd <= 30) return "0-30";
  if (dpd <= 60) return "31-60";
  if (dpd <= 90) return "61-90";
  return "90+";
}

// Days Sales Outstanding for paid deals only:
//   sum(days from invoiceDate→paidDate) / count
export function dsoOf(deals) {
  const list = deals.filter((d) => d.paid && d.invoiceDate && d.paidDate);
  if (!list.length) return 0;
  const total = list.reduce((s, d) => {
    const a = parseDate(d.invoiceDate); const b = parseDate(d.paidDate);
    return s + Math.max(0, (b - a) / 86400000);
  }, 0);
  return Math.round(total / list.length);
}

// Quarter index 0..3 from a Date.
export function quarterOf(date) {
  const d = typeof date === "string" ? parseDate(date) : date;
  if (!d || isNaN(d)) return null;
  return Math.floor(d.getMonth() / 3);
}

export function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

/**
 * Standard form-field wrapper. `<div class="field"><label>…</label>{control}</div>`
 *
 * `opts` accepts either an object (`{full: true}`) or a bare boolean (`true`)
 * for backwards compatibility — historically views used the boolean form.
 *
 * @param {string} label
 * @param {Node} control
 * @param {boolean|{full?: boolean}} [opts]
 * @returns {HTMLElement}
 */
export function field(label, control, opts) {
  const full = typeof opts === "object" ? !!(opts && opts.full) : !!opts;
  return el("div", { class: `field ${full ? "full" : ""}` }, el("label", {}, label), control);
}

/**
 * Standard KPI card: a small label, a big number, an optional sub-caption,
 * and an optional `dir` ("up" / "down") that tints the card border.
 *
 * Tolerates both legacy positional orders that existed before the hoist:
 *   - `kpi(label, value, sub, dir)` — dashboard's historical `kpiCard` order
 *   - `kpi(label, value, dir, sub)` — order used by brand/banking/tax/reports
 * It detects the "up"/"down" string and routes accordingly.
 *
 * @param {string} label
 * @param {string|number} value
 * @param {string|Node|null} [thirdArg]
 * @param {string|Node|null} [fourthArg]
 * @returns {HTMLElement}
 */
export function kpi(label, value, thirdArg, fourthArg) {
  let sub, dir;
  if (thirdArg === "up" || thirdArg === "down") {
    dir = thirdArg; sub = fourthArg;
  } else if (fourthArg === "up" || fourthArg === "down") {
    sub = thirdArg; dir = fourthArg;
  } else {
    sub = thirdArg; dir = fourthArg;
  }
  return el("div", { class: `card kpi ${dir || ""}` },
    el("div", { class: "kpi-sub" }, label),
    el("div", { class: "kpi-value" }, value),
    sub ? (typeof sub === "string" ? el("div", { class: "kpi-sub" }, sub) : sub) : null,
  );
}
