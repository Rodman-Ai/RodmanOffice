// /inbox — paste-import sponsorship requests. Parses with NL helper, queues
// as draft deals (status "n/a", paid:false, marked draftLead).

import { el, todayISO } from "../utils.js";
import { Deals, subscribe } from "../store.js";
import { parseDealText } from "../nl.js";
import { go } from "../router.js";
import { toast, confirmDialog } from "../ui.js";

export default function inboxView() {
  const node = el("div", {});

  const render = () => {
    const leads = Deals.all().filter((d) => d.draftLead);

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Sponsorship inbox"),
          el("div", { class: "sub" }, "Paste a brand outreach email; we'll extract brand, fee, timeline, and queue it as a lead deal."),
        ),
      ),
      el("div", { class: "card" },
        el("h3", {}, "Paste an email"),
        (function () {
          const ta = el("textarea", {
            class: "textarea",
            style: { minHeight: "200px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" },
            placeholder: "From: alex@brandX.com\nSubject: Q3 sponsorship — $5,000 video, due Aug 12\n\nHi! We're a friend of...\n\nWe'd love a 60s integrated YouTube spot for our launch on Aug 12. Budget is $5,000, due 2 weeks before publish.",
          });
          const preview = el("div", { class: "small muted", style: { marginTop: 8 } });
          const refresh = () => {
            const parsed = parseDealText(ta.value || "");
            if (!parsed) { preview.textContent = ""; return; }
            const parts = [];
            if (parsed.company) parts.push(`brand: ${parsed.company}`);
            if (parsed.fee) parts.push(`fee: $${parsed.fee}`);
            if (parsed.svc) parts.push(`type: ${parsed.svc}`);
            if (parsed.draftDue) parts.push(`due: ${parsed.draftDue}`);
            if (parsed.serviceDate) parts.push(`service: ${parsed.serviceDate}`);
            if (parsed.postDate) parts.push(`post: ${parsed.postDate}`);
            preview.textContent = parts.length ? "Extract: " + parts.join("  ·  ") : "(no structured fields detected)";
          };
          ta.addEventListener("input", refresh);

          return el("div", {},
            ta, preview,
            el("div", { class: "row", style: { marginTop: 12, gap: 8 } },
              el("button", { class: "btn primary", onclick: () => {
                if (!ta.value.trim()) { toast("Paste something first", "warn"); return; }
                const parsed = parseDealText(ta.value) || {};
                Deals.save({
                  company: parsed.company || "Unsorted lead",
                  svc: parsed.svc || "p",
                  fee: parsed.fee || 0,
                  serviceDate: parsed.serviceDate || "",
                  postDate: parsed.postDate || "",
                  draftDue: parsed.draftDue || "",
                  paid: false,
                  notes: ta.value.length > 280 ? ta.value.slice(0, 280) + "…" : ta.value,
                  draftLead: true,
                  approvalStatus: "draft",
                });
                ta.value = ""; preview.textContent = "";
                toast("Lead queued");
              } }, "Queue as lead"),
              el("button", { class: "btn", onclick: () => { ta.value = ""; preview.textContent = ""; } }, "Clear"),
            ),
          );
        })(),
      ),
      el("div", { class: "card" },
        el("h3", {}, `Queued leads (${leads.length})`),
        leads.length === 0
          ? el("div", { class: "empty small" }, "No leads yet — paste a brand email above to get started.")
          : el("table", { class: "data" },
              el("thead", {}, el("tr", {},
                el("th", {}, "Brand"),
                el("th", {}, "Type"),
                el("th", { class: "num" }, "Fee"),
                el("th", {}, "Service"),
                el("th", {}, "Due"),
                el("th", {}, ""),
              )),
              el("tbody", {}, ...leads.map((d) => el("tr", {},
                el("td", { onclick: () => go(`/deals/${d.id}`), style: { cursor: "pointer", fontWeight: 600 } }, d.company),
                el("td", {}, el("span", { class: "pill gray" }, d.svc || "—")),
                el("td", { class: "num" }, d.fee ? `$${d.fee}` : "—"),
                el("td", { class: "small muted" }, d.serviceDate || "—"),
                el("td", { class: "small muted" }, d.draftDue || "—"),
                el("td", { class: "row" },
                  el("button", { class: "btn sm primary", onclick: () => { Deals.save({ id: d.id, draftLead: false, approvalStatus: "approved" }); toast("Promoted to active deal"); } }, "Promote"),
                  el("button", { class: "btn sm danger", onclick: async () => {
                    const ok = await confirmDialog({ title: "Discard lead?", body: d.company, danger: true, confirmLabel: "Discard" });
                    if (ok) { Deals.remove(d.id); toast("Discarded"); }
                  } }, "Discard"),
                ),
              ))),
            ),
      ),
    );
  };

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}
