// Template library: contract templates (#61) + outreach templates (#60).
// Markdown-style with {{merge}} fields. Insert into deal/contact via copy-to-clipboard.

import { el, escHtml } from "../utils.js";
import { ContractTemplates, OutreachTemplates, Settings, Contacts, Deals, subscribe } from "../store.js";
import { openModal, toast, confirmDialog } from "../ui.js";

const SEED_CONTRACTS = [
  {
    name: "Sponsored post — single",
    kind: "post",
    body: `# Sponsored Post Agreement

**Creator:** {{creator_name}}, {{creator_business}}
**Brand:** {{brand_name}}
**Effective date:** {{today}}

## 1. Scope
The Creator agrees to publish one (1) sponsored post on {{platform}} on or about {{post_date}}, in exchange for a fee of $\{{fee}\}.

## 2. Deliverables
- One (1) feed post including @{{brand_handle}} mention and #ad disclosure
- Caption pre-approval window: 3 business days

## 3. Payment
Net {{terms}} from invoice date {{invoice_date}}. Late payments accrue {{late_fee_pct}}% / month.

## 4. Usage rights
Brand may repost organically for 30 days. Paid usage requires separate license at $\{{fee}\} × 0.5 per 30-day window.

## 5. Exclusivity
Creator agrees not to post for direct competitors of {{brand_name}} for 7 days before and 7 days after the post date.

## 6. Approval & kill fee
If Brand cancels after brief delivery, kill fee = 50% of fee. After draft, 75%. After post, 100%.

## 7. Governing law
This agreement is governed by the laws of {{state}}, USA.

Signed,
{{creator_name}}            {{brand_signer_name}}
________________            ________________
Date:                       Date:
`,
  },
  {
    name: "Video — long-form",
    kind: "video",
    body: `# Long-form Video Sponsorship

**Creator:** {{creator_name}}
**Brand:** {{brand_name}}
**Spot type:** Integrated 60–90s segment
**Fee:** $\{{fee}\} (net {{terms}})

## Deliverables
- Script approval (round 1) within 3 business days
- Final cut review (round 2) within 2 business days
- Publish on {{post_date}} on YouTube + cross-post Shorts within 7 days

## Usage rights
Organic boosting only. Paid media usage = 1.5× fee per 30 days. No re-cut without consent.

## Exclusivity
14 days pre/post in the same vertical.

## Approval / kill fee
Same as standard post agreement (50/75/100%).
`,
  },
  {
    name: "Retainer — monthly",
    kind: "retainer",
    body: `# Monthly Retainer Agreement

Term: {{start_date}} → {{end_date}}
Monthly fee: $\{{fee}\}, invoiced on the 1st, net {{terms}}.

## Monthly deliverables
- Two (2) feed posts
- Three (3) stories
- One (1) reel/short

## Renewal
Auto-renews monthly unless either party gives 30-day written notice.

## Termination
Either party may terminate for cause. Pro-rata refund of unused fee.
`,
  },
];

const SEED_OUTREACH = [
  {
    name: "Pitch — cold inbound brand",
    subject: "Quick idea for {{brand_name}} on {{platform}}",
    body: `Hi {{brand_first_name}},

I'm {{creator_name}} — I make {{niche}} content for {{audience_size}} followers on {{platform}}. My audience indexes high on {{audience_attribute}} and I think there's a strong fit with {{brand_name}}.

A specific concept I'd love to pitch:
1) {{idea_1}}
2) {{idea_2}}

My current rate for a {{deliverable}} is $\{{fee}\}, with usage and exclusivity per my standard agreement.

Happy to share a media kit if useful — would Tuesday afternoon work for a 15-min call?

Thanks,
{{creator_name}}
{{creator_business}}
{{creator_email}}`,
  },
  {
    name: "Re-engage — dormant brand",
    subject: "Hey {{brand_first_name}} — has anything changed at {{brand_name}}?",
    body: `Hi {{brand_first_name}},

It's been a while since our last collab on {{last_deal_summary}}. Loved working with the team and wanted to see if Q{{quarter}} budgets are open.

A few quick options on the table:
- Single integrated video at $\{{fee_video}\}
- Two-post burst at $\{{fee_two_posts}\}
- Quarterly retainer at $\{{fee_retainer}\}/mo (saves ~15%)

Want me to send fresh decks?

— {{creator_name}}`,
  },
  {
    name: "Follow-up — invoice past due",
    subject: "Invoice {{invoice_number}} — quick check-in",
    body: `Hi {{brand_first_name}},

Just a friendly follow-up on invoice {{invoice_number}} (sent {{invoice_date}}, $\{{amount\}}). It's now {{days_past_due}} days past the {{terms}} terms.

If it's already in flight, no need to reply. Otherwise, would love to get this closed out — happy to resend the PDF or update payment instructions.

Thanks!
{{creator_name}}`,
  },
];

export default function templatesView() {
  const node = el("div", {});
  let tab = "contracts"; // contracts | outreach

  const render = () => {
    const settings = Settings.get();

    node.innerHTML = "";
    node.append(
      el("div", { class: "page-head" },
        el("div", {},
          el("h1", {}, "Templates"),
          el("div", { class: "sub" }, "Contract drafts and outreach scripts. {{merge_fields}} are filled in when you copy."),
        ),
        el("div", { class: "row" },
          el("button", { class: "btn", onclick: () => seedSamples() }, "Load sample templates"),
          el("button", { class: "btn primary", onclick: () => openTemplateForm({}, tab) }, tab === "contracts" ? "+ New contract" : "+ New script"),
        ),
      ),
      el("div", { class: "row", style: { marginBottom: 12 } },
        el("button", { class: `chip ${tab === "contracts" ? "active" : ""}`, onclick: () => { tab = "contracts"; render(); } }, "Contracts"),
        el("button", { class: `chip ${tab === "outreach" ? "active" : ""}`, onclick: () => { tab = "outreach"; render(); } }, "Outreach"),
      ),
      tab === "contracts" ? renderList(ContractTemplates.all(), "contracts") : renderList(OutreachTemplates.all(), "outreach"),
    );
  };

  function renderList(items, kind) {
    if (!items.length) {
      return el("div", { class: "empty" },
        el("div", { class: "ico" }, "≡"),
        el("div", {}, kind === "contracts" ? "No contract templates yet." : "No outreach scripts yet."),
        el("div", { style: { marginTop: 12 } },
          el("button", { class: "btn primary", onclick: () => openTemplateForm({}, kind) }, "+ Add one"),
          el("button", { class: "btn", style: { marginLeft: 8 }, onclick: () => seedSamples() }, "Or load samples"),
        ),
      );
    }
    return el("div", { class: "stack" },
      ...items.map((t) => el("div", { class: "card" },
        el("div", { class: "spread" },
          el("div", {},
            el("strong", {}, t.name),
            t.kind && el("span", { class: "pill gray", style: { marginLeft: 8 } }, t.kind),
            t.subject && el("div", { class: "small muted", style: { marginTop: 4 } }, "Subject: " + t.subject),
          ),
          el("div", { class: "row" },
            el("button", { class: "btn sm", onclick: () => previewTemplate(t, kind) }, "Preview"),
            el("button", { class: "btn sm", onclick: () => copyMerged(t, kind) }, "Copy"),
            el("button", { class: "btn sm", onclick: () => openTemplateForm(t, kind) }, "Edit"),
            el("button", { class: "btn sm danger", onclick: async () => {
              const ok = await confirmDialog({ title: `Delete "${t.name}"?`, danger: true, confirmLabel: "Delete" });
              if (ok) {
                if (kind === "contracts") ContractTemplates.remove(t.id); else OutreachTemplates.remove(t.id);
                toast("Deleted");
              }
            } }, "Delete"),
          ),
        ),
        el("pre", { class: "tpl-preview" }, (t.body || "").slice(0, 240) + ((t.body || "").length > 240 ? "…" : "")),
      )),
    );
  }

  function seedSamples() {
    SEED_CONTRACTS.forEach((t) => ContractTemplates.save(t));
    SEED_OUTREACH.forEach((t) => OutreachTemplates.save(t));
    toast("Samples loaded");
  }

  const unsub = subscribe(render);
  render();
  return { node, unmount: unsub };
}

function mergeFieldDefaults() {
  const s = Settings.get();
  return {
    today: new Date().toISOString().slice(0, 10),
    creator_name: s.businessName || "[Your name]",
    creator_business: s.businessName || "[Your business]",
    creator_email: s.email || "[your email]",
    state: s.state || "[your state]",
    terms: s.defaultTerms || 30,
    late_fee_pct: s.lateFeePct || 0,
  };
}

function applyMerges(text, overrides = {}) {
  const all = { ...mergeFieldDefaults(), ...overrides };
  return text.replace(/\{\{\s*([a-z_0-9]+)\s*\}\}/gi, (_m, key) => {
    return key in all ? String(all[key]) : `{{${key}}}`;
  });
}

function previewTemplate(t, kind) {
  const merged = applyMerges(t.body || "");
  const preview = el("pre", { style: { whiteSpace: "pre-wrap", maxHeight: "70vh", overflow: "auto", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px", lineHeight: 1.5 } }, merged);
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn primary", onclick: () => { navigator.clipboard.writeText(merged).then(() => toast("Copied")); } }, "Copy to clipboard"),
  );
  openModal({ title: t.name, body: preview, footer, wide: true });
}

function copyMerged(t, kind) {
  const merged = applyMerges(t.body || "");
  navigator.clipboard.writeText(merged).then(
    () => toast(`${t.name} copied`),
    () => toast("Couldn't copy", "warn"),
  );
}

function openTemplateForm(t, kind) {
  const isNew = !t?.id;
  const name = el("input", { class: "input", value: t.name || "", placeholder: "Template name" });
  const tKind = el("input", { class: "input", value: t.kind || "", placeholder: kind === "contracts" ? "post / video / retainer" : "pitch / re-engage / follow-up" });
  const subject = el("input", { class: "input", value: t.subject || "", placeholder: kind === "outreach" ? "Subject line (supports {{merges}})" : "n/a" });
  const body = el("textarea", { class: "textarea", style: { minHeight: "320px", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12px" } }, t.body || "");

  const fields = [
    el("div", { class: "field" }, el("label", {}, "Name"), name),
    el("div", { class: "field" }, el("label", {}, "Kind"), tKind),
    kind === "outreach" && el("div", { class: "field full" }, el("label", {}, "Subject"), subject),
    el("div", { class: "field full" }, el("label", {}, "Body (markdown ok; use {{field_name}} for merge)"), body),
  ];
  const formBody = el("div", { class: "form-grid" }, ...fields);

  let m;
  const save = () => {
    if (!name.value.trim()) { toast("Name required", "warn"); return; }
    const payload = { id: t.id, name: name.value.trim(), kind: tKind.value.trim(), body: body.value };
    if (kind === "outreach") { payload.subject = subject.value; OutreachTemplates.save(payload); }
    else ContractTemplates.save(payload);
    toast(isNew ? "Saved" : "Updated");
    m.close();
  };
  const footer = el("div", { class: "row" },
    el("div", { class: "spacer" }),
    el("button", { class: "btn", onclick: () => m.close() }, "Cancel"),
    el("button", { class: "btn primary", onclick: save }, isNew ? "Create template" : "Save"),
  );
  m = openModal({ title: isNew ? `New ${kind === "contracts" ? "contract" : "outreach"} template` : "Edit template", body: formBody, footer, wide: true });
  setTimeout(() => name.focus(), 30);
}
