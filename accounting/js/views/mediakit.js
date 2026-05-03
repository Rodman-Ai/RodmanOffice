// /mediakit — generate a public-ready media kit HTML file.
// Pulls from contacts (rate cards, audience snapshots, testimonials) and deals
// (recent flagship work, top brands). Confidential brands are excluded.

import { el, fmtMoney, initials } from "../utils.js";
import { Deals, Contacts, Settings, downloadFile, subscribe } from "../store.js";
import { toast } from "../ui.js";

export default function mediaKitView() {
  const node = el("div", {});
  let preview = false;

  const render = () => {
    const s = Settings.get();
    const tagline = (s.businessName ? s.businessName + " — " : "") + "Creator media kit";

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Media kit"),
          el("div", { class: "sub" }, "Auto-generated from your data. Confidential brands are excluded."),
        ),
        el("div", { class: "row" },
          el("button", { class: `btn ${preview ? "" : "primary"}`, onclick: () => { preview = !preview; render(); } }, preview ? "Hide preview" : "Show preview"),
          el("button", { class: "btn", onclick: () => downloadHtml() }, "Download HTML"),
          el("button", { class: "btn", onclick: async () => {
            const html = buildHtml();
            await navigator.clipboard.writeText(html);
            toast("HTML copied — paste into any web host");
          } }, "Copy HTML"),
          el("button", { class: "btn", onclick: async () => {
            const wrapper = document.createElement("div"); wrapper.innerHTML = bodyHtml();
            toast("Generating PDF…");
            try {
              const { withHtml2Pdf } = await import("../pdf.js");
              await withHtml2Pdf((html2pdf) => html2pdf().set({ margin: 8, filename: "media-kit.pdf", html2canvas: { scale: 2, backgroundColor: "#ffffff" }, jsPDF: { unit: "mm", format: "letter", orientation: "portrait" } }).from(wrapper).save());
            } catch (e) { toast(e.message, "warn", 4000); }
          } }, "Download PDF"),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "What's included"),
        el("ul", { style: { paddingLeft: 20, margin: "8px 0 0", color: "var(--muted)", fontSize: "13px" } },
          el("li", {}, "Headline + business name from Settings"),
          el("li", {}, "Audience totals (latest snapshot per platform across non-confidential brands)"),
          el("li", {}, "Rate card (median fee per service type from your history)"),
          el("li", {}, "Recent brand wall (last 12 brands paid, excluding confidential)"),
          el("li", {}, "Up to 3 featured testimonials"),
          el("li", {}, "Contact email"),
        ),
      ),
      preview ? el("div", { class: "card", style: { padding: 0, overflow: "hidden", border: "2px solid var(--accent)" } },
        el("iframe", { srcdoc: buildHtml(), style: { width: "100%", height: "640px", border: 0, background: "#fff" } }),
      ) : null,
    );
  };

  function bodyHtml() {
    const s = Settings.get();
    const allDeals = Deals.all();
    const allContacts = Contacts.all();

    // Confidential brands hidden
    const confidentialNames = new Set(allContacts.filter((c) => c.confidential).map((c) => (c.name || "").toLowerCase()));
    const dealsPublic = allDeals.filter((d) => !confidentialNames.has((d.company || "").toLowerCase()));

    // Audience: pick latest count per platform across all brands (sum)
    const audByPlatform = {};
    allContacts.filter((c) => !c.confidential).forEach((c) => {
      (c.audience || []).forEach((a) => {
        if (!audByPlatform[a.platform] || audByPlatform[a.platform].date < a.date) {
          audByPlatform[a.platform] = a;
        }
      });
    });

    // Rate card: median by service over paid deals
    const bySvc = {};
    dealsPublic.filter((d) => d.paid && +d.fee > 0).forEach((d) => {
      const k = d.svc || "—";
      (bySvc[k] = bySvc[k] || []).push(+d.fee);
    });
    const rateCard = Object.entries(bySvc).map(([svc, list]) => {
      const sorted = list.sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      return { svc, median, n: list.length };
    }).sort((a, b) => b.median - a.median);

    // Recent brand wall
    const recentBrands = Array.from(new Set(
      [...dealsPublic].filter((d) => d.paid).sort((a, b) => (b.paidDate || "").localeCompare(a.paidDate || "")).map((d) => d.company),
    )).slice(0, 12);

    // Testimonials
    const testimonials = allContacts.filter((c) => !c.confidential).flatMap((c) =>
      (c.testimonials || []).map((t) => ({ ...t, brand: c.name }))
    ).sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 3);

    const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const primary = s.invoiceTemplate?.primary || "#22c55e";

    return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#111;background:#fff;max-width:780px;margin:0 auto;padding:48px 32px;line-height:1.55">
  <header style="text-align:center;border-bottom:4px solid ${primary};padding-bottom:24px;margin-bottom:32px">
    <div style="font-size:14px;text-transform:uppercase;color:#666;letter-spacing:0.2em;margin-bottom:8px">Media kit</div>
    <h1 style="font-size:36px;margin:0;font-weight:800">${escape(s.businessName || "Creator")}</h1>
    ${s.email ? `<div style="margin-top:6px;color:#444;font-size:14px">${escape(s.email)}</div>` : ""}
  </header>

  ${Object.keys(audByPlatform).length ? `
  <section style="margin:24px 0">
    <h2 style="font-size:13px;text-transform:uppercase;color:#666;letter-spacing:0.1em;margin-bottom:12px">Audience</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">
      ${Object.entries(audByPlatform).map(([p, a]) => `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:11px;text-transform:uppercase;color:#666">${escape(p.toUpperCase())}</div>
          <div style="font-size:22px;font-weight:800;margin-top:4px">${(+a.count || 0).toLocaleString()}</div>
        </div>
      `).join("")}
    </div>
  </section>` : ""}

  ${rateCard.length ? `
  <section style="margin:24px 0">
    <h2 style="font-size:13px;text-transform:uppercase;color:#666;letter-spacing:0.1em;margin-bottom:12px">Rates (typical)</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tbody>
        ${rateCard.map((r) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${escape(r.svc.toUpperCase())}</td><td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${fmtMoney(r.median)}</td></tr>`).join("")}
      </tbody>
    </table>
    <div style="font-size:11px;color:#999;margin-top:6px">Final pricing depends on usage rights, exclusivity, and timeline.</div>
  </section>` : ""}

  ${recentBrands.length ? `
  <section style="margin:24px 0">
    <h2 style="font-size:13px;text-transform:uppercase;color:#666;letter-spacing:0.1em;margin-bottom:12px">Recent partners</h2>
    <div style="display:flex;flex-wrap:wrap;gap:6px">
      ${recentBrands.map((b) => `<span style="display:inline-block;border:1px solid #e5e7eb;background:#fafafa;padding:4px 10px;border-radius:999px;font-size:12px">${escape(b)}</span>`).join("")}
    </div>
  </section>` : ""}

  ${testimonials.length ? `
  <section style="margin:24px 0">
    <h2 style="font-size:13px;text-transform:uppercase;color:#666;letter-spacing:0.1em;margin-bottom:12px">Testimonials</h2>
    ${testimonials.map((t) => `<blockquote style="border-left:3px solid ${primary};margin:8px 0;padding:6px 14px;color:#333"><div>“${escape(t.quote)}”</div><footer style="font-size:12px;color:#999;margin-top:6px">— ${escape(t.brand)}</footer></blockquote>`).join("")}
  </section>` : ""}

  <footer style="margin-top:48px;text-align:center;color:#999;font-size:11px">Generated by RodBooks · ${new Date().toLocaleDateString()}</footer>
</div>`;
  }

  function buildHtml() {
    const body = bodyHtml();
    return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Media kit · ${(Settings.get().businessName || "Creator").replace(/[<>&"]/g, "")}</title></head><body style="margin:0;background:#f6f7fb;padding:24px 0">${body}</body></html>`;
  }

  function downloadHtml() {
    downloadFile(`media-kit-${new Date().toISOString().slice(0, 10)}.html`, buildHtml(), "text/html");
    toast("Media kit downloaded");
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}
