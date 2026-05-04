# RodBooks

**AI-first books for creators.** Paste a brand brief and get bullets. Paste a contract and get redlines. Let coach mode review your week and tell you what to do next. Snap a receipt photo and the bill fills itself in. RodBooks puts an AI co-pilot on top of a full QuickBooks-style ledger — brand deals, invoices, mileage, taxes, banking — so most of the bookkeeping runs itself.

Runs entirely in the browser. Deploys to GitHub Pages. Desktop + mobile.

## Why

Creator-business books live in a sprawling spreadsheet: brand, fee, contract link, brief, draft due, post date, invoice, paid/unpaid, partner fee %, deliverables, exclusivity windows. RodBooks reframes that as an AI-co-piloted app:

**AI surfaces (need an LLM key in `Settings → Connect`):**
- **Brief summarizer** — paste a brand brief; get the brand+deliverable, key dates, mandatory talking points, exclusivity/usage/kill-fee, and open questions to clarify.
- **AI deal grader** — paste a deal; get a letter grade (A–F), 5 specific red flags + redlines, and a one-line next-round ask, benchmarked against your history.
- **AI contract redline** — paste a contract; get a risk score and 5 redlined bullet flags. Heuristic regex flagger runs even without a key.
- **Coach mode** — looks at your last 7 days (cash collected, new deals, overdue invoices, top brands, concentration) and gives 5 specific next-week moves.

**Always-on AI helpers:**
- **Receipt OCR** — snap a photo, `tesseract.js` extracts vendor / amount / date and pre-fills the bill.
- **Natural-language quick add** — `n` then `Lumira AI $1500 video due May 15 paid` → parsed deal.
- **Sponsorship inbox** — paste a brand outreach email; we extract brand, fee, timing and queue it as a draft lead.
- **Smart fee suggestion** — when you pick a brand+service, the form surfaces median accepted fee from your history.
- **Vendor → category memory** — bills auto-categorize after a few examples.
- **Anomaly detection** — automation engine flags single-bill outliers (>5× median) and monthly spend spikes (>2× trailing-3-month avg).
- **Smart paid-date inference** — in the Banking view, confirming a transaction match against an unpaid deal auto-marks it paid with the deposit's date and txn id. (There's no blind passive matcher — a bank row has to be present.)

Built on a full QuickBooks-style ledger:

- **Brand Deals** — the heart of the app. Fields match what creators actually track (service vs. post date, draft due, contract/brief/draft URLs, partner-fee %, paid status). Each deal has a visual lifecycle tracker: Contract → Brief → Draft due → Draft sent → Service → Posted → Invoiced → Paid.
- **Tableau-style Dashboard** — sticky filter bar (year / service / brand / status / month) cross-filters every chart. KPIs with year-over-year comparison, 24-month income vs. expenses (click a bar to drill into a month), pipeline funnel, brand-mix donut (click a slice to drill into the brand page), service mix, year×month heatmap, cycle-time histogram, top brands and top deals.
- **Brand pages** — drill-down for any brand: lifetime totals, 24-month trend, service mix, deal history.
- **Timeline** — calendar (month) and Gantt (year) views of every milestone — drafts due, service, post, invoice, paid.
- **Automations** — pattern-detection engine that proposes rules based on your data: flag overdue invoices, generate this month's recurring bills, tag repeat brands as Tier 1, draft reminders, backfill invoice numbers, dormant-brand outreach, normalize service codes, tax reserve.
- **Invoices** — auto-numbered, printable / saveable as PDF, generated from any deal.
- **Bills** — recurring software, equipment, travel, meals, home-office.
- **Contacts** — brands, agencies, vendors, partners.
- **Reports** — P&L, income by brand, expenses by category, monthly profit chart, tax reserve.

## Features

- 100% local-first: data stays in `localStorage`. Export/import JSON for backups; CSV export for any table.
- Mobile + desktop responsive. Bottom tab bar on mobile, sidebar on desktop. Installable as a PWA.
- No build step. Vanilla JS ES modules + Chart.js (CDN). Deploys directly to GitHub Pages.
- Keyboard shortcuts: `n` quick-add; `g` then `d/b/t/i/e/c/a/r/s` to jump (dashboard / deals / timeline / invoices / expenses / contacts / automations / reports / settings).
- Sample data seeded on first run: 6 years (2021 → today), 60 fictional brands, ~280 deals on a realistic growth curve, ~250 expenses across recurring software / equipment / travel / contractors. Seeded RNG so the demo is repeatable.

## Run locally

It's a static site — open `index.html` directly, or:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

In RodmanOffice, `.github/workflows/pages.yml` deploys the full suite automatically from `main`. Once it has run successfully:

1. Repo → Settings → Pages
2. Source: **GitHub Actions**

The site will be available at `https://<owner>.github.io/<repo>/`.

You can also serve from any static host (Netlify, Vercel, S3, Cloudflare Pages) — there's nothing to build.

## Data model

All data is stored in `localStorage`. The default profile uses key `rodbooks:v1`; additional profiles use `rodbooks:v1:<profile-id>`. Profile metadata lives at `rodbooks:profiles`; the active profile id at `rodbooks:activeProfile`. When encryption-at-rest is enabled, the profile blob is replaced by a string of the form `enc:v1:<base64(salt|iv|ciphertext)>`.

For the canonical, always-up-to-date list of every collection + every settings field, see [`docs/ARCHITECTURE.md` §3](docs/ARCHITECTURE.md). The high-level shape:

```json
{
  "schema": 1,
  "settings": {
    "businessName", "legalName", "email", "address",
    "taxRate", "currency", "invoicePrefix", "nextInvoiceNumber",
    "theme", "monthlyGoal", "annualGoal", "mileageRate",
    "lockHash", "state", "stateRate", "defaultTerms", "lateFeePct", "cashOnHand",
    "invoiceTemplate": { "logo", "primary", "footer", "taxId" },
    "homeOffice": { "sqft", "totalSqft", "monthlyUtilities" },
    "connect": {
      "plaid": { "clientId", "secret", "env" },
      "stripe": { "publishableKey", "secretKey" },
      "dropboxSign": { "apiKey" },
      "llm": { "provider", "apiKey", "model" }
    }
  },
  "deals": [ /* see ARCHITECTURE.md for full field list — currency/fxRate/wireFee/withholdingPct/approvalStatus/disputes/agentId/agentPct/exclusivity/lineItems/deliverables/partials + standard fee/paid/dates/links */ ],
  "bills": [ /* { vendor, category, amount, date, paid, paidDate, payMethod, recurring, receiptUrl, notes, dealId, taxStatus } */ ],
  "contacts": [ /* { name, company, type, email, phone, notes, tags, wikiMd, defaultRates, audience, testimonials, emailLog, confidential } */ ],
  "invoices": [], "mileage": [], "activity": [], "snapshots": [],
  "taxPayments": [], "contractTemplates": [], "outreachTemplates": [],
  "vendorRules": [], "dealTemplates": [], "agents": [],
  "accounts": [], "transactions": [], "affiliates": [], "affiliateEntries": [],
  "tips": [], "assets": [], "csvMappings": [], "salesTax": [], "reportPresets": []
}
```

Use **Settings → Export JSON** for a full backup. **Import JSON** restores it (after a confirmation dialog). **Snapshots** keep up to 20 in-app restore points.

## Service-type codes

The deal `svc` field uses the same shorthand the spreadsheet did:

| Code | Meaning |
| ---- | ------- |
| `v` | Video |
| `p` | Post |
| `p prep` / `postp` | Pre/Post-post variant |
| `qrt` / `rt` / `qrt rt` | Quote / Repost / both |
| `c+L` | Comment + Like |
| `incentive` | Incentive only |
| `x` | Other / cancelled |

## Roadmap ideas

- Multi-currency conversion
- Recurring invoice generation
- Mileage tracker
- Bank-statement CSV ingestion
- Cloud sync option (optional, with E2E encryption)
