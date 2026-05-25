/**
 * @file Full-workbook XLSX/CSV round-trip for RodBooks.
 *
 * One "Export workbook" produces a single multi-sheet .xlsx where every Store
 * collection (deals, bills, invoices, transactions, …) becomes a named sheet
 * with the first row as headers. "Import workbook" parses that file back and
 * replaces the collections by name. CSV export writes a .zip of one CSV per
 * collection.
 *
 * Engine: `/lib/sheets/index.js`, exposed on `window.RodmanSheets` by the
 * shim in `accounting/index.html`.
 *
 * @module workbook
 */
import { getState, downloadFile } from "./store.js";

// Collections we round-trip. Order matters for the sheet tab order in Excel.
// Each entry pins the columns we surface (and the order). Anything outside
// this allowlist is dropped on export so we don't leak internal `_dirty`
// flags or migrate-only fields.
const COLLECTIONS = [
  ["invoices",        ["id","number","company","invoiceDate","dueDate","amount","tax","paid","paidDate","paidAmount","notes","createdAt","updatedAt"]],
  ["deals",           ["id","company","contactId","svc","fee","stage","status","invoiceNumber","invoiceDate","paid","paidDate","paidAmount","serviceDate","terms","partnerFeePct","notes","createdAt","updatedAt"]],
  ["bills",           ["id","vendor","date","amount","category","paid","paidDate","notes","createdAt","updatedAt"]],
  ["contacts",        ["id","name","type","company","email","phone","website","notes","confidential","createdAt","updatedAt"]],
  ["accounts",        ["id","name","kind","last4","currency","statementBalance","createdAt","updatedAt"]],
  ["transactions",    ["id","accountId","date","vendor","amount","type","category","dealId","billId","cleared","source","memo","fitid","createdAt","updatedAt"]],
  ["taxPayments",     ["id","year","quarter","date","amount","method","notes","createdAt","updatedAt"]],
  ["salesTax",        ["id","date","state","taxableSales","ratePct","taxCollected","paid","paidDate","notes","createdAt","updatedAt"]],
  ["mileage",         ["id","date","miles","purpose","fromTo","deductible","notes","createdAt","updatedAt"]],
  ["vendorRules",     ["id","match","category","createdAt","updatedAt"]],
  ["csvMappings",     ["id","name","columnMap","sample","createdAt","updatedAt"]],
  ["affiliates",      ["id","brand","platform","code","tiers","notes","createdAt","updatedAt"]],
  ["affiliateEntries",["id","affiliateId","period","revenue","commission","paid","paidDate","createdAt","updatedAt"]],
  ["tips",            ["id","platform","period","amount","supporters","notes","createdAt","updatedAt"]],
  ["assets",          ["id","name","category","purchaseDate","cost","life","notes","createdAt","updatedAt"]],
  ["agents",          ["id","name","email","defaultPct","createdAt","updatedAt"]],
  ["activity",        ["id","ts","type","entity","entityId","label","detail"]],
];

// Sheet name → store key, and store key → sheet name. The sheet name is the
// store key Title-Cased; Excel limits tab names to 31 chars (well under).
const SHEET_NAME = (key) => key.charAt(0).toUpperCase() + key.slice(1);
const STORE_KEY_BY_SHEET = new Map(
  COLLECTIONS.map(([k]) => [SHEET_NAME(k).toLowerCase(), k])
);

function valueToCell(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Objects (e.g. columnMap, tiers, sample): JSON-encode round-trippably.
  try { return JSON.stringify(v); } catch { return String(v); }
}

function cellToValue(s, header) {
  if (s === "" || s == null) return "";
  // Round-trip JSON-encoded payloads (columnMap, tiers, sample) back to
  // objects/arrays. Anything else: keep as a string — the existing UI
  // tolerates string-typed numbers everywhere.
  if (typeof s === "string" && (s.startsWith("{") || s.startsWith("["))) {
    try { return JSON.parse(s); } catch { return s; }
  }
  // Coerce known numeric fields so post-import math behaves.
  if (NUMERIC_FIELDS.has(header) && /^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (BOOLEAN_FIELDS.has(header)) {
    if (s === "true") return true;
    if (s === "false") return false;
  }
  return s;
}

const NUMERIC_FIELDS = new Set([
  "amount","fee","tax","paidAmount","statementBalance","miles","cost","life",
  "ratePct","taxableSales","taxCollected","revenue","commission","supporters",
  "year","quarter","ts","createdAt","updatedAt","defaultPct","partnerFeePct",
]);
const BOOLEAN_FIELDS = new Set([
  "paid","cleared","deductible","confidential","active",
]);

/**
 * Convert every Store collection to the `[{name, rows}]` shape that
 * `lib/sheets` expects for `buildXlsx`. Each sheet has a header row.
 */
export function collectionsToWorkbookSheets() {
  const state = getState();
  const sheets = [];
  for (const [storeKey, cols] of COLLECTIONS) {
    const items = Array.isArray(state[storeKey]) ? state[storeKey] : [];
    const rows = [cols.slice()];
    for (const item of items) {
      rows.push(cols.map((k) => valueToCell(item[k])));
    }
    sheets.push({ name: SHEET_NAME(storeKey), rows });
  }
  return sheets;
}

/**
 * Build a friendly diff between current store and an incoming workbook.
 * Used by the import-confirmation prompt.
 */
function diffCollections(parsedSheets) {
  const state = getState();
  const report = [];
  for (const sheet of parsedSheets) {
    const storeKey = STORE_KEY_BY_SHEET.get(sheet.name.toLowerCase());
    if (!storeKey) continue;
    const incoming = sheet.rows.length > 1 ? sheet.rows.length - 1 : 0;
    const current = Array.isArray(state[storeKey]) ? state[storeKey].length : 0;
    report.push({ name: sheet.name, current, incoming, delta: incoming - current });
  }
  return report;
}

/**
 * Replace each Store collection whose name matches a sheet in `parsedSheets`.
 * Unknown sheets are ignored. Encrypted-at-rest is preserved (we mutate the
 * in-memory cache then let the next `write()` go through the normal path).
 */
function applyParsedSheetsToStore(parsedSheets) {
  const state = getState();
  for (const sheet of parsedSheets) {
    const storeKey = STORE_KEY_BY_SHEET.get(sheet.name.toLowerCase());
    if (!storeKey) continue;
    const rows = sheet.rows;
    if (!rows.length) continue;
    const headers = rows[0].map((h) => String(h || ""));
    const items = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.every((c) => c === "" || c == null)) continue;
      const obj = {};
      for (let c = 0; c < headers.length; c++) {
        obj[headers[c]] = cellToValue(row[c], headers[c]);
      }
      items.push(obj);
    }
    state[storeKey] = items;
  }
}

export async function exportWorkbookXlsx() {
  const lib = window.RodmanSheets;
  if (!lib?.buildXlsx) {
    alert("Spreadsheet engine not loaded — reload the page and try again.");
    return;
  }
  const sheets = collectionsToWorkbookSheets();
  const bytes = lib.buildXlsx(sheets);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`rodbooks-${stamp}.xlsx`, bytes,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export async function exportWorkbookCsvZip() {
  const lib = window.RodmanSheets;
  if (!lib?.unparseCsv) {
    alert("Spreadsheet engine not loaded — reload the page and try again.");
    return;
  }
  const sheets = collectionsToWorkbookSheets();
  // JSZip is loaded as a UMD global in index.html.
  const JSZipCtor = window.JSZip;
  if (!JSZipCtor) {
    alert("ZIP library not loaded — reload the page and try again.");
    return;
  }
  const zip = new JSZipCtor();
  for (const sheet of sheets) {
    const csv = lib.unparseCsv(sheet.rows);
    zip.file(`${sheet.name}.csv`, csv);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadFile(`rodbooks-${stamp}.zip`, blob, "application/zip");
}

export async function importWorkbook(file) {
  const lib = window.RodmanSheets;
  if (!lib?.parseXlsx || !lib?.parseCsv) {
    alert("Spreadsheet engine not loaded — reload the page and try again.");
    return;
  }
  const isCsv = /\.csv$/i.test(file.name);
  let parsedSheets;
  if (isCsv) {
    const text = await file.text();
    const rows = lib.parseCsv(text);
    // Single CSV: infer the sheet name from the filename so users can
    // re-import an exported "Invoices.csv".
    const name = file.name.replace(/\.csv$/i, "");
    parsedSheets = [{ name, rows }];
  } else {
    const buf = new Uint8Array(await file.arrayBuffer());
    parsedSheets = lib.parseXlsx(buf);
  }
  const report = diffCollections(parsedSheets);
  const known = report.filter((r) => r.incoming > 0);
  if (!known.length) {
    alert("This workbook doesn't contain any RodBooks-shaped sheets.\nExpected sheet names: " +
      COLLECTIONS.map(([k]) => SHEET_NAME(k)).join(", "));
    return;
  }
  const summary = known.map((r) =>
    `• ${r.name}: ${r.incoming} rows (was ${r.current})`
  ).join("\n");
  if (!confirm(`Importing will REPLACE these collections:\n\n${summary}\n\nContinue?`)) {
    return;
  }
  applyParsedSheetsToStore(parsedSheets);
  // Persist + broadcast: a no-op subscribe + dummy write via cache mutation
  // would skip the activity log; cleanest is to nudge the store by importing
  // back the JSON we just built.
  const { importJSON } = await import("./store.js");
  importJSON(JSON.stringify(getState()));
  alert("Import complete — " + known.length + " collection" +
    (known.length === 1 ? "" : "s") + " replaced.");
}

/**
 * Wire the command-bar workbook buttons. Idempotent — safe to call multiple
 * times; each call rebinds.
 */
export function mountWorkbookCommandBar() {
  const xlsxBtn = document.getElementById("cbExportXlsx");
  const csvBtn = document.getElementById("cbExportCsvZip");
  const importBtn = document.getElementById("cbImportWorkbook");
  const importInput = document.getElementById("cbImportInput");
  if (xlsxBtn) xlsxBtn.onclick = exportWorkbookXlsx;
  if (csvBtn) csvBtn.onclick = exportWorkbookCsvZip;
  if (importBtn && importInput) {
    importBtn.onclick = () => importInput.click();
    importInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        await importWorkbook(file);
      } catch (err) {
        console.error("[workbook] import failed", err);
        alert("Import failed: " + (err?.message || err));
      } finally {
        e.target.value = "";
      }
    };
  }
}

// Re-render breadcrumbs whenever the route changes (the router sets
// `document.title`; the command bar mirrors it).
export function setCrumbs(pageLabel) {
  const el = document.getElementById("dynCrumbs");
  if (!el) return;
  el.innerHTML = "";
  const root = document.createElement("span");
  root.className = "dyn-crumb";
  root.textContent = "RodBooks";
  el.appendChild(root);
  if (pageLabel) {
    const sep = document.createElement("span");
    sep.className = "dyn-crumb-sep";
    sep.textContent = "›";
    const leaf = document.createElement("span");
    leaf.className = "dyn-crumb dyn-crumb-leaf";
    leaf.textContent = pageLabel;
    el.appendChild(sep);
    el.appendChild(leaf);
  }
}

