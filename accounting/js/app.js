import { register, start, go } from "./router.js";
import { getState, loadSampleData, Deals, Bills, Contacts, subscribe, subscribePersistence, rawIsEncrypted, unlockVaultAndLoad } from "./store.js";
import { openQuickAdd } from "./forms.js";
import { applyTheme } from "./theme.js";
import { isLockEnabled, isUnlocked, showLockScreen } from "./lock.js";
import { openPalette } from "./palette.js";
import { applyDensity, pushRecent } from "./prefs.js";
import { openHelp } from "./help.js";
import { generateProposals } from "./automations.js";

import dashboard from "./views/dashboard.js";
import { dealsList, dealDetail } from "./views/deals.js";
import invoices from "./views/invoices.js";
import bills from "./views/bills.js";
import contacts from "./views/contacts.js";
import reports from "./views/reports.js";
import settingsView from "./views/settings.js";
import brandPage from "./views/brand.js";
import timelineView from "./views/timeline.js";
import automationsView from "./views/automations.js";
import kanban from "./views/kanban.js";
import mileageView from "./views/mileage.js";
import activityView from "./views/activity.js";
import taxView from "./views/tax.js";
import templatesView from "./views/templates.js";
import bankingView from "./views/banking.js";
import incomeView from "./views/income.js";
import customReportView from "./views/custom-report.js";
import bookingView from "./views/booking.js";
import connectView from "./views/connect.js";
import mediaKitView from "./views/mediakit.js";
import inboxView from "./views/inbox.js";
import contractsView from "./views/contracts.js";
import { runScheduler } from "./scheduler.js";

// First-run: if there's no data at all, offer sample data automatically (once).
// CRITICAL: bail when the vault is encrypted. read() returns defaults() for an
// `enc:v1:` blob until the user unlocks it; without this guard, firstRun would
// see "empty" data and overwrite the encrypted blob with sample data.
(async function firstRun() {
  if (rawIsEncrypted()) return;
  const s = getState();
  const empty = !s.deals.length && !s.bills.length && !s.contacts.length;
  const seedKey = "rodbooks:seeded:v3";
  const seeded = localStorage.getItem(seedKey);
  if (empty && !seeded) {
    await loadSampleData();
    localStorage.setItem(seedKey, "1");
  }
})();

// Apply theme + density + lock gate before showing content
applyTheme();
applyDensity();
if (isLockEnabled() && !isUnlocked()) showLockScreen();

// Encrypted-at-rest unlock screen (#70).
if (rawIsEncrypted()) {
  showVaultUnlock();
}
async function showVaultUnlock() {
  const { el } = await import("./utils.js");
  const wrap = el("div", { id: "vault-unlock", style: { position: "fixed", inset: 0, background: "var(--bg)", display: "grid", placeItems: "center", zIndex: 9998, padding: "20px" } });
  const passphrase = el("input", { class: "input", type: "password", placeholder: "Enter your encryption passphrase", style: { fontSize: "16px", textAlign: "center", maxWidth: "320px" } });
  const err = el("div", { class: "small", style: { color: "var(--danger)", height: "16px", marginTop: "8px", textAlign: "center" } });
  const submit = async () => {
    try {
      await unlockVaultAndLoad(passphrase.value);
      wrap.remove();
    } catch (e) {
      err.textContent = e.message || "Wrong passphrase";
      passphrase.value = "";
      passphrase.focus();
    }
  };
  passphrase.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  wrap.append(el("div", { class: "lock-card" },
    el("div", { class: "logo", style: { width: "44px", height: "44px", margin: "0 auto 16px", fontSize: "16px" } }, "RB"),
    el("div", { style: { fontSize: "18px", fontWeight: 600, textAlign: "center" } }, "RodBooks vault"),
    el("div", { class: "small muted", style: { marginTop: 4, textAlign: "center" } }, "Your books are encrypted on this device. Enter the passphrase to decrypt."),
    el("div", { style: { marginTop: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" } },
      passphrase,
      el("button", { class: "btn primary", style: { minWidth: 140 }, onclick: submit }, "Unlock vault"),
    ),
    err,
  ));
  document.body.append(wrap);
  setTimeout(() => passphrase.focus(), 50);
}

// PWA: register service worker (#90), capture install prompt.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// Drain offline capture queue when back online (#91).
async function drainOfflineQueue() {
  try {
    const { drain, pendingCount } = await import("./offlineQueue.js");
    if (!(await pendingCount())) return;
    const { ocrImage, extractReceiptFields } = await import("./ocr.js");
    const { Bills } = await import("./store.js");
    const { toast } = await import("./ui.js");
    const processed = await drain(async (item) => {
      if (item.kind !== "receipt" || !item.dataUrl) return;
      const blob = await (await fetch(item.dataUrl)).blob();
      const text = await ocrImage(blob).catch(() => "");
      const f = extractReceiptFields(text);
      Bills.save({
        vendor: item.vendorHint || f.vendor || "Captured receipt",
        amount: f.amount || 0,
        date: f.date || new Date().toISOString().slice(0, 10),
        category: "Other",
        receiptUrl: item.dataUrl,
        notes: "Auto-imported from offline queue",
      });
    });
    if (processed > 0) toast(`Synced ${processed} offline receipt${processed === 1 ? "" : "s"}`);
  } catch (e) { /* swallow */ }
}
window.addEventListener("online", drainOfflineQueue);
if (navigator.onLine) drainOfflineQueue();
let _deferredInstall = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _deferredInstall = e;
  document.body.classList.add("can-install");
});
window.addEventListener("appinstalled", () => {
  _deferredInstall = null;
  document.body.classList.remove("can-install");
});
window.installPrompt = async () => {
  if (!_deferredInstall) return false;
  _deferredInstall.prompt();
  const { outcome } = await _deferredInstall.userChoice;
  _deferredInstall = null;
  return outcome === "accepted";
};

// Run recurring-deal scheduler on every load.
try { runScheduler(); } catch (e) { console.warn("scheduler:", e); }

let lastPersistenceToastAt = 0;
subscribePersistence(async (status) => {
  if (status.kind !== "error") return;
  const now = Date.now();
  if (now - lastPersistenceToastAt < 4000) return;
  lastPersistenceToastAt = now;
  const { toast } = await import("./ui.js");
  const msg = status.error?.message || "Browser storage rejected the save.";
  toast(`Save failed: ${msg}`, "warn", 6000);
});

// Routes
register("/", () => dashboard());
register("/dashboard", () => dashboard());
register("/deals", () => dealsList());
register("/deals/:id", (p) => dealDetail(p));
register("/brand/:name", (p) => brandPage(p));
register("/pipeline", () => kanban());
register("/invoices", () => invoices());
register("/bills", () => bills());
register("/mileage", () => mileageView());
register("/contacts", () => contacts());
register("/timeline", () => timelineView());
register("/automations", () => automationsView());
register("/activity", () => activityView());
register("/reports", () => reports());
register("/reports/custom", () => customReportView());
register("/tax", () => taxView());
register("/templates", () => templatesView());
register("/contracts", () => contractsView());
register("/banking", () => bankingView());
register("/income", () => incomeView());
register("/booking", () => bookingView());
register("/inbox", () => inboxView());
register("/mediakit", () => mediaKitView());
register("/connect", () => connectView());
register("/settings", () => settingsView());

const TITLES = {
  "/": "Dashboard",
  "/dashboard": "Dashboard",
  "/deals": "Brand Deals",
  "/pipeline": "Pipeline",
  "/invoices": "Invoices",
  "/bills": "Bills & Expenses",
  "/mileage": "Mileage",
  "/contacts": "Contacts",
  "/timeline": "Timeline",
  "/automations": "Automations",
  "/activity": "Activity",
  "/reports": "Reports",
  "/tax": "Tax",
  "/templates": "Templates",
  "/contracts": "Contract scanner",
  "/banking": "Banking",
  "/income": "Other income",
  "/booking": "Booking",
  "/inbox": "Inbox",
  "/mediakit": "Media kit",
  "/connect": "Connect",
  "/reports/custom": "Custom report",
  "/settings": "Settings",
};

const outlet = document.getElementById("view");
start({
  outlet,
  onChange: ({ path }) => {
    // active link state
    const baseRoute = path === "/" ? "dashboard" : path.split("/")[1];
    document.querySelectorAll("[data-route]").forEach((a) => {
      a.classList.toggle("active", a.dataset.route === baseRoute);
    });
    // page title
    const title = TITLES[path] || (baseRoute === "deals" && "Deal") || (baseRoute === "brand" && "Brand") || "RodBooks";
    document.getElementById("pageTitle").textContent = title;
    // close mobile menu after nav
    document.body.classList.remove("menu-open");
    // track recently visited (skip dashboard root to avoid noise)
    if (path !== "/" && path !== "/dashboard") {
      pushRecent({ kind: "Page", label: title + (baseRoute === "deals" || baseRoute === "brand" ? " — " + decodeURIComponent(path.split("/")[2] || "") : ""), path });
    }
  },
});

// Sidebar nav badges: small counts next to each section.
function refreshNavBadges() {
  const counts = {
    deals: Deals.all().length,
    pipeline: Deals.all().filter((d) => !d.paid).length,
    invoices: Deals.all().filter((d) => d.invoiceNumber || d.invoiceDate || d.invoiceUrl).length,
    bills: Bills.all().length,
    contacts: Contacts.all().length,
    automations: generateProposals().length,
  };
  document.querySelectorAll("#primary-nav a[data-route]").forEach((a) => {
    const k = a.dataset.route;
    let badge = a.querySelector(".nav-badge");
    if (!(k in counts)) { badge?.remove(); return; }
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "nav-badge";
      a.append(badge);
    }
    badge.textContent = counts[k] || "";
    badge.style.display = counts[k] ? "" : "none";
    badge.classList.toggle("alert", k === "automations" && counts[k] > 0);
  });
}
subscribe(refreshNavBadges);
refreshNavBadges();

// Mobile menu
const menuBtn = document.getElementById("menuBtn");
menuBtn.addEventListener("click", () => document.body.classList.toggle("menu-open"));
document.addEventListener("click", (e) => {
  if (!document.body.classList.contains("menu-open")) return;
  if (e.target.closest(".sidebar") || e.target.closest("#menuBtn")) return;
  document.body.classList.remove("menu-open");
});

// Quick add
document.getElementById("quickAddBtn").addEventListener("click", () => openQuickAdd());

// Multi-entity profile switcher (#69)
import("./profiles.js").then(({ listProfiles, getActiveProfileId, activateProfile, createProfile }) => {
  const sel = document.getElementById("profileSwitcher");
  if (!sel) return;
  const refresh = () => {
    sel.innerHTML = "";
    const list = listProfiles();
    const active = getActiveProfileId();
    list.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id; o.textContent = p.name;
      if (p.id === active) o.selected = true;
      sel.append(o);
    });
    const newOpt = document.createElement("option");
    newOpt.value = "__new"; newOpt.textContent = "+ New profile…";
    sel.append(newOpt);
    const manageOpt = document.createElement("option");
    manageOpt.value = "__manage"; manageOpt.textContent = "Manage profiles…";
    sel.append(manageOpt);
  };
  sel.addEventListener("change", () => {
    if (sel.value === "__new") {
      const name = prompt("Name the new profile (e.g. LLC, Personal)");
      if (name) {
        const p = createProfile(name);
        activateProfile(p.id);
      } else refresh();
    } else if (sel.value === "__manage") {
      go("/settings");
      refresh();
    } else {
      activateProfile(sel.value);
    }
  });
  refresh();
});
// Topbar buttons
document.getElementById("searchBtn")?.addEventListener("click", () => openPalette());
document.getElementById("helpBtn")?.addEventListener("click", () => openHelp());
document.getElementById("densityBtn")?.addEventListener("click", async () => {
  const { toggleDensity } = await import("./prefs.js");
  toggleDensity();
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  // Cmd/Ctrl+K opens command palette anywhere
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openPalette();
    return;
  }
  if (e.target.matches("input, textarea, select, [contenteditable]")) return;
  if (e.key === "?" || (e.shiftKey && e.key === "/")) { e.preventDefault(); openHelp(); return; }
  if (e.key === "n" && !e.metaKey && !e.ctrlKey) { openQuickAdd(); }
  if (e.key === "/" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openPalette(); }
  if (e.key === "g") {
    const next = (ev) => {
      const map = { d: "/", b: "/deals", k: "/pipeline", i: "/invoices", e: "/bills", m: "/mileage", c: "/contacts", t: "/timeline", a: "/automations", l: "/activity", r: "/reports", x: "/tax", p: "/templates", n: "/banking", o: "/income", s: "/settings" };
      const r = map[ev.key];
      if (r) go(r);
      document.removeEventListener("keydown", next, true);
    };
    document.addEventListener("keydown", next, true);
  }
});
