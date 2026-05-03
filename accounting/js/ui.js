/**
 * @file Modal, toast, confirm — reusable UI primitives. Modals trap focus
 * within the dialog while open and restore focus to whatever was focused
 * when the modal opened.
 *
 * @module ui
 */

import { el } from "./utils.js";

/**
 * Show a toast notification. Auto-dismisses.
 * @param {string} msg
 * @param {"info"|"warn"|"danger"} [kind]
 * @param {number} [ms]
 */
export function toast(msg, kind = "info", ms = 2200) {
  const root = document.getElementById("toast-root");
  const t = el("div", { class: `toast ${kind}` }, msg);
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .25s"; }, ms - 250);
  setTimeout(() => t.remove(), ms);
}

let modalStack = [];

const FOCUSABLE_SEL = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableIn(node) {
  return Array.from(node.querySelectorAll(FOCUSABLE_SEL)).filter((e) => !e.hasAttribute("disabled") && e.offsetParent !== null);
}

/**
 * Open a modal dialog. Traps focus within the dialog while open; restores
 * focus to the previously-focused element on close. Stacks (nested modals
 * supported); only the top of the stack receives Escape.
 *
 * @param {object} cfg
 * @param {string|Node} [cfg.title]
 * @param {string|Node} cfg.body
 * @param {Node} [cfg.footer]
 * @param {() => void} [cfg.onClose]
 * @param {boolean} [cfg.wide] Widen modal to ~880px (e.g. forms with many fields).
 * @returns {{close: () => void}}
 */
export function openModal({ title, body, footer, onClose, wide }) {
  const root = document.getElementById("modal-root");
  const previouslyFocused = document.activeElement;
  const backdrop = el("div", { class: "modal-backdrop" });
  const modal = el(
    "div",
    { class: "modal", style: wide ? { maxWidth: "880px" } : null, role: "dialog", "aria-modal": "true", tabindex: "-1" },
    el(
      "header",
      {},
      el("h2", {}, title || ""),
      el("button", { class: "icon-btn", "aria-label": "Close", onclick: () => close() }, "✕"),
    ),
    el("div", { class: "body" }, body),
    footer && el("footer", {}, footer),
  );
  backdrop.append(modal);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  const onKey = (e) => {
    // Only the topmost modal handles keys.
    if (modalStack[modalStack.length - 1] !== entry) return;
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const focusables = focusableIn(modal);
    if (focusables.length === 0) { e.preventDefault(); modal.focus(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === first || active === modal || !modal.contains(active)) {
        e.preventDefault(); last.focus();
      }
    } else {
      if (active === last) { e.preventDefault(); first.focus(); }
    }
  };
  document.addEventListener("keydown", onKey);
  root.append(backdrop);
  const entry = { backdrop, close };
  modalStack.push(entry);
  // Focus the first focusable element (or the modal itself if none).
  setTimeout(() => {
    const focusables = focusableIn(modal);
    if (focusables.length) focusables[0].focus();
    else modal.focus();
  }, 30);

  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    modalStack = modalStack.filter((m) => m !== entry);
    if (typeof onClose === "function") onClose();
    // Restore focus to whatever was focused before opening.
    if (previouslyFocused && document.contains(previouslyFocused) && typeof previouslyFocused.focus === "function") {
      try { previouslyFocused.focus(); } catch {}
    }
  }

  return { close };
}

export function closeAllModals() {
  while (modalStack.length) modalStack.pop().close();
}

export function confirmDialog({ title = "Are you sure?", body, danger, confirmLabel = "Confirm", cancelLabel = "Cancel" }) {
  return new Promise((resolve) => {
    let m;
    const cancel = el("button", { class: "btn", onclick: () => { m.close(); resolve(false); } }, cancelLabel);
    const ok = el("button", { class: `btn ${danger ? "danger" : "primary"}`, onclick: () => { m.close(); resolve(true); } }, confirmLabel);
    m = openModal({
      title,
      body: el("div", {}, body || ""),
      footer: el("div", { class: "row" }, cancel, ok),
      onClose: () => resolve(false),
    });
  });
}
