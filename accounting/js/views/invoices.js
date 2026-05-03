import { el, fmtMoney, fmtDate, netFee, escHtml, debounce } from "../utils.js";
import { Deals, Settings, Contacts, subscribe } from "../store.js";
import { go } from "../router.js";
import { openDealForm } from "../forms.js";
import { openModal, toast } from "../ui.js";
import { downloadIcs } from "../ics.js";
import { runScheduler } from "../scheduler.js";
import { withHtml2Pdf } from "../pdf.js";

export default function invoices() {
  const node = el("div", {});
  let filters = { search: "", status: "all" };

  const render = () => {
    const all = Deals.all().filter((d) => d.invoiceNumber || d.invoiceDate || d.invoiceUrl || d.paid);
    const filtered = all.filter((d) => {
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!`${d.company} ${d.invoiceNumber}`.toLowerCase().includes(q)) return false;
      }
      if (filters.status === "paid" && !d.paid) return false;
      if (filters.status === "unpaid" && d.paid) return false;
      if (filters.status === "overdue") {
        const dueDays = 30;
        const ref = parseDateOrNow(d.invoiceDate || d.serviceDate);
        const overdue = ref && (Date.now() - ref.getTime()) / 86400000 > dueDays && !d.paid;
        if (!overdue) return false;
      }
      return true;
    }).sort((a, b) => (b.invoiceDate || b.serviceDate || "").localeCompare(a.invoiceDate || a.serviceDate || ""));

    const totalPaid = filtered.filter((d) => d.paid).reduce((s, d) => s + (d.paidAmount || netFee(d)), 0);
    const totalUnpaid = filtered.filter((d) => !d.paid).reduce((s, d) => s + netFee(d), 0);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Invoices"),
          el("div", { class: "sub" }, `${filtered.length} · Paid ${fmtMoney(totalPaid)} · Outstanding ${fmtMoney(totalUnpaid)}`),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => { const created = runScheduler(); toast(created.length ? `Generated ${created.length} retainer invoice${created.length === 1 ? "" : "s"}` : "All retainers up to date"); } }, "Run retainer batch"),
          el("button", { class: "btn", onclick: () => { downloadIcs(Deals.all().filter((d) => d.invoiceDate || d.paidDate), "rodbooks-invoices.ics"); toast("Calendar exported"); } }, "Export .ics"),
          el("button", { class: "btn primary", onclick: () => openDealForm() }, "+ New invoice"),
        ),
      ),
      el("div", { class: "table-wrap" },
        el("div", { class: "table-toolbar" },
          (function () {
            const i = el("input", { class: "input search", placeholder: "Search by brand or invoice #", value: filters.search });
            i.addEventListener("input", debounce((e) => { filters.search = e.target.value; render(); }, 150));
            return i;
          })(),
          (function () {
            const s = el("select", { class: "select" });
            for (const o of [
              { value: "all", label: "All" },
              { value: "unpaid", label: "Outstanding" },
              { value: "paid", label: "Paid" },
              { value: "overdue", label: "Overdue (30d)" },
            ]) {
              const opt = el("option", { value: o.value }, o.label);
              if (o.value === filters.status) opt.selected = true;
              s.append(opt);
            }
            s.addEventListener("change", () => { filters.status = s.value; render(); });
            return s;
          })(),
        ),
        el("div", { class: "table-scroll" },
          filtered.length === 0
            ? el("div", { class: "empty" }, el("div", { class: "ico" }, "⎈"), "No invoices yet — create a deal to start.")
            : (function () {
                const t = el("table", { class: "data" });
                t.append(
                  el("thead", {}, el("tr", {},
                    el("th", {}, "Invoice #"),
                    el("th", {}, "Brand"),
                    el("th", {}, "Issued"),
                    el("th", { class: "num" }, "Amount"),
                    el("th", {}, "Status"),
                    el("th", {}, "Paid"),
                    el("th", {}, "Method"),
                    el("th", {}, ""),
                  )),
                );
                const tbody = el("tbody");
                filtered.forEach((d) => {
                  const overdue = !d.paid && d.invoiceDate && (Date.now() - new Date(d.invoiceDate).getTime()) / 86400000 > 30;
                  tbody.append(el("tr", { onclick: () => go(`/deals/${d.id}`) },
                    el("td", {}, d.invoiceNumber || "—"),
                    el("td", {}, d.company),
                    el("td", { class: "small muted" }, fmtDate(d.invoiceDate) || "—"),
                    el("td", { class: "num" }, fmtMoney(d.paid ? (d.paidAmount || netFee(d)) : netFee(d))),
                    el("td", {}, el("span", { class: `pill ${d.paid ? "green" : overdue ? "red" : "amber"}` }, d.paid ? "Paid" : overdue ? "Overdue" : "Outstanding")),
                    el("td", { class: "small muted" }, fmtDate(d.paidDate) || "—"),
                    el("td", { class: "small muted" }, d.payMethod || "—"),
                    el("td", {},
                      !d.paid ? el("button", { class: "btn sm", title: "Compose reminder email", onclick: (e) => { e.stopPropagation(); composeReminder(d); } }, "Remind") : null,
                      el("button", { class: "btn sm", onclick: (e) => { e.stopPropagation(); previewInvoice(d); } }, "Print"),
                    ),
                  ));
                });
                t.append(tbody);
                return t;
              })(),
        ),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function parseDateOrNow(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function composeReminder(deal) {
  // Auto-reminder mailto (#42). Picks tone by days-past-due (gentle / firm / final).
  const dpd = (function () {
    const issue = deal.invoiceDate || deal.serviceDate;
    if (!issue || deal.paid) return 0;
    const due = new Date(issue);
    due.setDate(due.getDate() + (deal.terms || Settings.get().defaultTerms || 30));
    return Math.round((Date.now() - due.getTime()) / 86400000);
  })();
  const contact = Contacts.get(deal.contactId);
  const s = Settings.get();
  const yourName = s.businessName || "Creator";
  const amount = deal.paidAmount ? `$${(+deal.paidAmount).toFixed(2)}` : `$${(+deal.fee || 0).toFixed(2)}`;
  let tone = "gentle", subject, body;
  if (dpd <= 0) { tone = "preview"; }
  else if (dpd <= 14) tone = "gentle";
  else if (dpd <= 45) tone = "firm";
  else tone = "final";

  if (tone === "preview") {
    subject = `Invoice ${deal.invoiceNumber || ""} — heads up before due`;
    body = `Hi,\n\nQuick heads-up that invoice ${deal.invoiceNumber || ""} for ${amount} is approaching its due date${deal.invoiceDate ? ` (issued ${deal.invoiceDate}, net ${deal.terms || s.defaultTerms || 30}).` : "."}\n\nLet me know if there's anything else you need from me to process it.\n\nThanks,\n${yourName}`;
  } else if (tone === "gentle") {
    subject = `Friendly reminder · invoice ${deal.invoiceNumber || ""}`;
    body = `Hi,\n\nJust a friendly nudge — invoice ${deal.invoiceNumber || ""} for ${amount} is now ${dpd} day${dpd === 1 ? "" : "s"} past the net ${deal.terms || s.defaultTerms || 30} terms. If it's already in flight, no need to reply. Otherwise, happy to resend the PDF or update payment instructions.\n\nThanks,\n${yourName}`;
  } else if (tone === "firm") {
    subject = `Past due · invoice ${deal.invoiceNumber || ""}`;
    body = `Hi,\n\nFollowing up on invoice ${deal.invoiceNumber || ""} for ${amount}, which is now ${dpd} days past due.\n\nCould you let me know the status? Happy to provide whatever you need to get this processed.\n\nBest,\n${yourName}`;
  } else {
    subject = `Final notice · invoice ${deal.invoiceNumber || ""}`;
    body = `Hi,\n\nThis is a final reminder that invoice ${deal.invoiceNumber || ""} for ${amount} is now ${dpd} days past due. Please confirm a payment date by end of week, or let me know what's holding it up so we can resolve it.\n\nBest,\n${yourName}`;
  }
  const to = contact?.email || "";
  const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = url;
  toast("Composed in your mail client");
}

export function previewInvoice(deal) {
  const s = Settings.get();
  const tpl = s.invoiceTemplate || {};
  const primary = tpl.primary || "#22c55e";
  const contact = Contacts.get(deal.contactId);
  const amount = deal.paid ? (deal.paidAmount || netFee(deal)) : netFee(deal);
  const issued = deal.invoiceDate || deal.serviceDate || new Date().toISOString().slice(0, 10);

  const styled = `
    <div style="background:#fff;color:#111;padding:32px;border-radius:8px;font-family:-apple-system,sans-serif;line-height:1.5;border-top:6px solid ${primary}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px">
        <div style="display:flex;align-items:flex-start;gap:14px">
          ${tpl.logo ? `<img src="${escHtml(tpl.logo)}" style="max-height:48px;max-width:140px;border-radius:6px" />` : ""}
          <div>
            <div style="font-size:22px;font-weight:700;margin-bottom:4px">${escHtml(s.businessName || "Your Creator Business")}</div>
            <div style="color:#666;font-size:13px">${escHtml(s.email || "")}</div>
            <div style="color:#666;font-size:13px;white-space:pre-wrap">${escHtml(s.address || "")}</div>
            ${tpl.taxId ? `<div style="color:#666;font-size:12px;margin-top:4px">${escHtml(tpl.taxId)}</div>` : ""}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:28px;font-weight:800;color:${primary};letter-spacing:.04em">INVOICE</div>
          <div style="color:#666;font-size:13px">#${escHtml(deal.invoiceNumber || "—")}</div>
          <div style="color:#666;font-size:13px">Issued ${escHtml(fmtDate(issued))}</div>
        </div>
      </div>
      <div style="display:flex;gap:32px;margin-bottom:24px">
        <div style="flex:1">
          <div style="text-transform:uppercase;font-size:11px;color:#666;letter-spacing:.06em;margin-bottom:4px">Bill to</div>
          <div style="font-weight:600">${escHtml(deal.invoiceTo || deal.company)}</div>
          ${contact?.email ? `<div style="color:#666;font-size:13px">${escHtml(contact.email)}</div>` : ""}
        </div>
        <div style="flex:1">
          <div style="text-transform:uppercase;font-size:11px;color:#666;letter-spacing:.06em;margin-bottom:4px">Status</div>
          <div style="font-weight:600;color:${deal.paid ? "#22c55e" : "#f59e0b"}">${deal.paid ? "PAID" : "DUE"}</div>
          ${deal.paid && deal.paidDate ? `<div style="color:#666;font-size:13px">Paid ${escHtml(fmtDate(deal.paidDate))}</div>` : ""}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="border-bottom:2px solid #111;text-align:left">
            <th style="padding:10px 0;font-size:11px;text-transform:uppercase;color:#666">Description</th>
            <th style="padding:10px 0;font-size:11px;text-transform:uppercase;color:#666;text-align:right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr style="border-bottom:1px solid #eee">
            <td style="padding:14px 0">
              <div style="font-weight:600">${escHtml(deal.company)} — ${escHtml(deal.svc ? deal.svc.toUpperCase() : "Sponsorship")}</div>
              ${deal.serviceDate ? `<div style="color:#666;font-size:13px;margin-top:2px">Service: ${escHtml(fmtDate(deal.serviceDate))}</div>` : ""}
              ${deal.postDate ? `<div style="color:#666;font-size:13px">Post: ${escHtml(fmtDate(deal.postDate))}</div>` : ""}
            </td>
            <td style="padding:14px 0;text-align:right;font-variant-numeric:tabular-nums">${escHtml(fmtMoney(deal.fee))}</td>
          </tr>
          ${deal.partnerFeePct ? `<tr><td style="padding:8px 0;color:#666">Partner fee (${deal.partnerFeePct}%)</td><td style="padding:8px 0;text-align:right;color:#666">−${escHtml(fmtMoney(deal.fee * deal.partnerFeePct / 100))}</td></tr>` : ""}
        </tbody>
        <tfoot>
          <tr style="border-top:2px solid #111">
            <td style="padding:14px 0;font-weight:700;font-size:16px">Total ${deal.paid ? "Paid" : "Due"}</td>
            <td style="padding:14px 0;text-align:right;font-weight:700;font-size:18px">${escHtml(fmtMoney(amount))}</td>
          </tr>
        </tfoot>
      </table>
      ${deal.notes ? `<div style="color:#666;font-size:13px;border-top:1px solid #eee;padding-top:16px"><strong>Notes:</strong> ${escHtml(deal.notes)}</div>` : ""}
      ${tpl.footer ? `<div style="margin-top:24px;color:#666;font-size:12px;white-space:pre-wrap;border-top:1px solid #eee;padding-top:12px">${escHtml(tpl.footer)}</div>` : ""}
      <div style="margin-top:24px;color:#999;font-size:11px;text-align:center">Generated by RodBooks</div>
    </div>
  `;
  const body = el("div", { html: styled });
  const filename = `invoice-${deal.invoiceNumber || deal.company || "draft"}.pdf`.replace(/\s+/g, "-");
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => copyInvoice(body) }, "Copy"),
    el("button", { class: "btn", onclick: () => downloadInvoicePDF(body.firstElementChild, filename) }, "Download PDF"),
    el("button", { class: "btn", onclick: () => printInvoice(styled) }, "Print"),
  );
  openModal({ title: `Invoice ${deal.invoiceNumber || ""}`.trim(), body, footer, wide: true });
}

function copyInvoice(body) {
  const text = body.innerText;
  navigator.clipboard.writeText(text).then(() => toast("Copied"), () => toast("Copy failed", "warn"));
}

async function downloadInvoicePDF(element, filename) {
  toast("Generating PDF…");
  try {
    await withHtml2Pdf((html2pdf) => html2pdf().set({
      margin: 10,
      filename,
      html2canvas: { scale: 2, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
    }).from(element).save());
  } catch (e) { toast(e.message, "warn", 4000); }
}

function printInvoice(html) {
  const w = window.open("", "_blank", "width=820,height=1080");
  if (!w) return;
  w.document.write(`<html><head><title>Invoice</title><style>body{margin:0;background:#eee;padding:24px}@media print{body{background:#fff;padding:0}}</style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
