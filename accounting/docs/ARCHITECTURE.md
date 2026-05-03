# RodBooks — Architecture & Code Review

This document is the canonical reference for the RodBooks codebase. It exists because the app grew from a one-shot static site into ~30 modules + 23 view files across seven shipped phases, and tracing intent from imports alone is now expensive.

> **Status:** maintained on `main` after the audit-fix wave (PRs #15–#18). The 100-feature backlog itself was used to plan Phases 1–7; the running totals live in the commit log.

---

## 1. Overview

RodBooks is a **static, single-page, AI-first creator-business app**. Zero backend. Zero build step. Zero npm install. Everything runs from `localStorage` in the browser, deploys to GitHub Pages on every push to `main`, and works on desktop + mobile (PWA-installable).

```
            ┌─────────────────────────────────────┐
            │  index.html (shell)                 │
            │  ┌─────────┐  ┌────────────────────┐│
            │  │ sidebar │  │ topbar             ││
  user      │  │  + nav  │  │ ┌────────────────┐ ││
  click  ──▶│  │ groups  │  │ │ #view (outlet) │ ││
            │  └─────────┘  │ │  ← view render │ ││
            │  ┌─────────┐  │ └────────────────┘ ││
            │  │ tabbar  │  │                    ││
            │  │ (mobile)│  └────────────────────┘│
            │  └─────────┘                        │
            └─────────────────────────────────────┘
                          │
                          ▼
                  app.js (router + topbar wiring)
                          │
                          ▼
              router.js  →  view function (e.g. dashboard())
                          │
                          ▼
         store.js  ←──────┴────→  ui.js / utils.js / forms.js
       (in-memory cache         (modals, toasts, formatters,
        + localStorage)          DOM-builder helpers)
                ▲ subscribers
                │
        every save fans out to subscribers,
        which trigger re-render of the active view
```

### Data flow on a click

1. User clicks **+ New deal** → `forms.js: openDealForm()` mounts a modal.
2. Save → `Deals.save(item)` → `upsertCollection` in `store.js` → write to `localStorage` → `subscribers.forEach(fn => fn(state))`.
3. The dashboard / list view's `subscribe(render)` callback fires → re-renders with fresh data.
4. The `Activity` log captures the create automatically; snapshots can be taken anytime via Settings.

### Init sequence (`app.js` top-down)

1. Apply theme (CSS-variable swap).
2. Apply density mode.
3. If passcode lock is enabled, show lock screen.
4. If the localStorage blob starts with `enc:v1:`, show vault unlock screen.
5. Register service worker (`sw.js`).
6. Capture `beforeinstallprompt` → palette command "Install RodBooks".
7. Run scheduler — materialise any due deal-template instances.
8. Drain offline-capture queue if online.
9. Register all routes; start router.
10. Wire topbar + sidebar profile switcher + nav-badge updater.
11. Bind keyboard shortcuts.

---

## 2. File-by-file responsibilities

### Root

| File | Purpose |
|---|---|
| `index.html` | SPA shell: topbar, sidebar (grouped: AI / Books / Reports / System), `#view` outlet, mobile tabbar (12 items, 6×2 grid), modal + toast roots. |
| `styles.css` | All styling. CSS custom properties for theming; `[data-theme="light"]` overrides; `[data-density="compact"]` table tightening. |
| `manifest.webmanifest` | PWA install metadata. Description leads with AI features. |
| `sw.js` | Service worker. Cache-first shell, network-first same-origin JS, stale-while-revalidate for CDN. **Cache name is versioned** (`rodbooks-shell-vN`) — bump on shell changes. |
| `.nojekyll` | Stops GH Pages from running Jekyll on the repo. |

### Core (`js/`)

| File | Purpose |
|---|---|
| `app.js` | Entry point. Imports every view, registers routes, wires topbar buttons (palette / density / help / quick-add), profile switcher, nav badges, keyboard shortcuts (`?`, `Cmd+K`, `n`, `g`-chords), PWA + offline-queue init. |
| `router.js` | Hash router. Routes can be `/path` or `/path/:param`. Supports `?key=value` query strings via `getQuery()` / `setQuery()`. Exports `register`, `start`, `go`. |
| `store.js` | Single source of truth. Manages 25 collections + Settings. `upsertCollection` → activity log + subscriber broadcast. Encryption-at-rest support via `cryptoVault.js`. Multi-profile via `profiles.js`. |
| `ui.js` | Reusable modals (`openModal`), toast (`toast`), confirm dialog (`confirmDialog`). |
| `utils.js` | Format helpers (`fmtMoney`, `fmtDate`, `fmtMoneyShort`, `fmtDateShort`), DOM DSL (`el`), date math (`addDays`, `parseDate`, `quarterOf`), business helpers (`netFee`, `dealStatus`, `serviceMeta`, `dealStageAge`, `brandWarmth`, `brandHealth`, `lastTouchedAt`, `dueDate`, `daysPastDue`, `lateFee`, `agingBucket`, `dsoOf`), `parseSearchOperators`, `csvFromString`, `escHtml`/`escapeHtml`. |
| `forms.js` | Form builders for Deal / Bill / Contact / quick-add. Owns the largest forms in the app. Plugs into camera/OCR (`ocr.js`), NL parser (`nl.js`), vendor-rule learning (`store.js`). |

### UX & preferences

| File | Purpose |
|---|---|
| `theme.js` | dark / light / auto theme toggle. Listens to `prefers-color-scheme`. |
| `prefs.js` | Density + recently-viewed list. |
| `lock.js` | UI-only passcode gate (SHA-256, NOT encryption — see `cryptoVault.js` for the real thing). |
| `palette.js` | `Cmd+K` palette. Searches deals + brands + contacts + bills + pages + commands + recently-viewed. AI commands kind:"AI". |
| `help.js` | `?` shortcut overlay listing every keyboard binding. |

### Data, integration, AI

| File | Purpose |
|---|---|
| `synth.js` | Deterministic 6-year fictional dataset for first-run / demo. |
| `profiles.js` | Multi-entity vault scaffolding. Each profile keys its own localStorage blob via `dataKeyFor(id)`. |
| `cryptoVault.js` | AES-GCM 256 encryption-at-rest. PBKDF2-SHA256 (200k iterations). |
| `offlineQueue.js` | IndexedDB queue for receipt photos taken offline; drained on `online` event. |
| `ics.js` | Build `.ics` calendar exports of deal milestones. |
| `ofx.js` | Parser for OFX 1.x (SGML) and 2.x (XML) bank statements. |
| `ocr.js` | Lazy-loads `tesseract.js` and parses receipt images → `{vendor, amount, date}`. |
| `share.js` | Build accountant share-bundle (HTML report + CSVs + JSON ZIP via JSZip). |
| `digest.js` | Render the weekly digest as printable HTML / PDF. |
| `automations.js` | Generates 11 kinds of automation proposals from data (overdue, recurring fill, repeat-brand tier, draft reminders, invoice-# backfill, dormant outreach, code normalization, tax reserve, subscription price-change, anomalies, paid-date inference). |
| `scheduler.js` | One-shot scheduler invoked at app boot. Materialises new deals from active `dealTemplates`. |
| `aiActions.js` | LLM-backed surfaces: brief summarizer (#85), deal grader (#86), coach mode (#89). All gracefully degrade if no LLM key. |
| `llm.js` | Provider-agnostic LLM client (Anthropic / OpenAI / Google / Ollama). Reads from `Settings.connect.llm`. |
| `nl.js` | Natural-language deal-text parser. |

### Views (`js/views/`)

23 views, each export a default function returning `{ node, unmount }`. Pattern: subscribe on render, unsubscribe on unmount.

| Route | View | Purpose |
|---|---|---|
| `/` `/dashboard` | `dashboard.js` | KPIs, AI co-pilot strip, Tableau-style cross-filters, charts. |
| `/deals` `/deals/:id` | `deals.js` | List + detail. Smart-fee suggestion, deliverables, partial-payments, disputes. |
| `/brand/:name` | `brand.js` | Brand drill-down: lifetime KPIs, 24-mo chart, audience snapshots, testimonials. |
| `/pipeline` | `kanban.js` | Drag-to-advance deal-stage board. |
| `/timeline` | `timeline.js` | Month calendar + year Gantt of deal milestones. Also exports `dealStageTracker`. |
| `/booking` | `booking.js` | Per-day availability heatmap; manual block / unblock. |
| `/invoices` | `invoices.js` | Invoice list, batch retainer generator, PDF / ICS / Print, mailto reminder. |
| `/bills` | `bills.js` | Expense list + receipt gallery modal. |
| `/banking` | `banking.js` | Accounts / ledger / vendor rules / matcher / reconciliation. |
| `/income` | `income.js` | Affiliates, tips, AdSense importer, UTM link generator. |
| `/mileage` | `mileage.js` | Trip log with Maps deep links. |
| `/contacts` | `contacts.js` | Contact list with last-touched + brand-health pills. |
| `/automations` | `automations.js` | Proposal cards. |
| `/templates` | `templates.js` | Contract + outreach template library. |
| `/contracts` | `contracts.js` | Risk-clause flagger + AI redline ("Ask AI"). |
| `/inbox` | `inbox.js` | Sponsorship request paste-import. |
| `/mediakit` | `mediakit.js` | Public-ready media-kit HTML/PDF generator. |
| `/connect` | `connect.js` | Plaid / Stripe / Dropbox-Sign / LLM API keys. |
| `/activity` | `activity.js` | Audit log feed. |
| `/reports` | `reports.js` | P&L, quarterly tax, margin-by-service, cohort, DSO, aging, profit attribution. |
| `/reports/custom` | `custom-report.js` | Pivot table builder. |
| `/tax` | `tax.js` | Tax workbench: Schedule C, SE, state, sales tax, depreciation, 1099. |
| `/settings` | `settings.js` | Business profile, profiles, lock, encryption, snapshots, CSV import, theme. |

---

## 3. Data model

### Core collections

| Collection | Key fields |
|---|---|
| `deals` | `id`, `contactId`, `company`, `svc`, `fee`, `quotedFee`, `partnerFeePct`, `paidAmount`, `paid`, `paidDate`, `payMethod`, `serviceDate`, `postDate`, `draftDue`, `contractUrl`/`briefUrl`/`draftUrl`/`portalUrl`/`notesUrl`, `invoiceNumber`, `invoiceDate`, `invoiceUrl`, `invoiceTo`, `transactionId`, `terms`, `creditNoteOf`, `currency`, `fxRate`, `hoursWorked`, `perfPlatform`/`perfViews`/`perfEngagements`, `wireFee`, `withholdingPct`, `withholdingTreaty`, `approvalStatus`, `approvalNote`, `disputes[]`, `agentId`, `agentPct`, `exclusivityFrom`/`exclusivityTo`, `usageRightsUntil`, `lineItems[]`, `deliverables[]`, `partials[]`, `draftLead`, `notes`, `createdAt`, `updatedAt`. |
| `bills` | `id`, `vendor`, `category`, `amount`, `date`, `paid`, `paidDate`, `payMethod`, `recurring`, `receiptUrl`, `notes`, `dealId` (COGS link), `taxStatus` (deductible / preTax / personal), timestamps. |
| `contacts` | `id`, `name`, `company`, `type` (brand / agency / vendor / partner / personal), `email`, `phone`, `notes`, `tags[]`, `wikiMd`, `defaultRates: {svc → fee}`, `audience[]`, `testimonials[]`, `emailLog[]`, `confidential`, timestamps. |
| `invoices` | (Reserved for standalone invoices — current usage embeds invoice fields directly on deals.) |
| `mileage` | `id`, `date`, `miles`, `purpose`, `fromAddr`, `toAddr`, `fromTo`, `notes`, timestamps. |
| `activity` | `id`, `ts`, `type` (create/update/delete), `entity`, `entityId`, `label`, `detail`. Capped at 500 entries. |
| `snapshots` | `id`, `ts`, `label`, `payload` (full state JSON). Capped at 20. |
| `taxPayments` | `id`, `year`, `quarter`, `date`, `amount`, `method`, `notes`. |
| `contractTemplates` / `outreachTemplates` | `id`, `name`, `kind`, `body`, (optional `subject`). |
| `vendorRules` | `id`, `match` (substring), `category`. Auto-learns from saved bills. |
| `dealTemplates` | `id`, `name`, `contactId`, `company`, `svc`, `fee`, `partnerFeePct`, `terms`, `deliverables`, `cadence` (weekly/monthly/yearly), `dayOfMonth`, `lastRunAt`, `active`. |
| `agents` | `id`, `name`, `email`, `defaultPct`. |
| `accounts` | `id`, `name`, `kind` (checking/savings/credit), `last4`, `currency`, `statementBalance`. |
| `transactions` | `id`, `accountId`, `date`, `vendor`, `amount`, `type` (debit/credit), `category`, `dealId`, `billId`, `cleared`, `source` (csv/ofx). |
| `affiliates` / `affiliateEntries` | `affiliates`: brand, platform, code, tiered commission table. `affiliateEntries`: month, revenue, commission, paid status. |
| `tips` | Platform / period / amount / supporters (Patreon, AdSense imports, etc.). |
| `assets` | `name`, `category`, `purchaseDate`, `cost`, `life` (MACRS-5 / Section179). |
| `csvMappings` | Saved column maps for the bank-import wizard. |
| `salesTax` | Per-state nexus entries with rate, taxable sales, tax collected. |
| `reportPresets` | Saved custom-report dimension/measure configs. |

### Settings shape

```js
{
  businessName, legalName, email, address, taxRate, currency,
  invoicePrefix, nextInvoiceNumber, theme ("auto"|"dark"|"light"),
  monthlyGoal, annualGoal, mileageRate, lockHash, state, stateRate,
  defaultTerms, lateFeePct, cashOnHand,
  invoiceTemplate: { logo, primary, footer, taxId },
  homeOffice: { sqft, totalSqft, monthlyUtilities },
  connect: {
    plaid: { clientId, secret, env },
    stripe: { publishableKey, secretKey },
    dropboxSign: { apiKey },
    llm: { provider, apiKey, model }
  }
}
```

---

## 4. Routing map

All routes are hash-based (`#/path`). Source: `js/app.js` `register()` calls.

| Path | View handler | File |
|---|---|---|
| `/` `/dashboard` | `dashboard()` | `views/dashboard.js` |
| `/deals` | `dealsList()` | `views/deals.js` |
| `/deals/:id` | `dealDetail()` | `views/deals.js` |
| `/brand/:name` | `brandPage()` | `views/brand.js` |
| `/pipeline` | `kanban()` | `views/kanban.js` |
| `/invoices` | `invoices()` | `views/invoices.js` |
| `/bills` | `bills()` | `views/bills.js` |
| `/mileage` | `mileageView()` | `views/mileage.js` |
| `/contacts` | `contacts()` | `views/contacts.js` |
| `/timeline` | `timelineView()` | `views/timeline.js` |
| `/automations` | `automationsView()` | `views/automations.js` |
| `/activity` | `activityView()` | `views/activity.js` |
| `/reports` | `reports()` | `views/reports.js` |
| `/reports/custom` | `customReportView()` | `views/custom-report.js` |
| `/tax` | `taxView()` | `views/tax.js` |
| `/templates` | `templatesView()` | `views/templates.js` |
| `/contracts` | `contractsView()` | `views/contracts.js` |
| `/banking` | `bankingView()` | `views/banking.js` |
| `/income` | `incomeView()` | `views/income.js` |
| `/booking` | `bookingView()` | `views/booking.js` |
| `/inbox` | `inboxView()` | `views/inbox.js` |
| `/mediakit` | `mediaKitView()` | `views/mediakit.js` |
| `/connect` | `connectView()` | `views/connect.js` |
| `/settings` | `settingsView()` | `views/settings.js` |

### Keyboard shortcuts

| Key(s) | Action |
|---|---|
| `Cmd/Ctrl+K` or `/` | Command palette |
| `?` (or `Shift+/`) | Help overlay |
| `n` | Quick add (NL deal parser) |
| `g d` | Dashboard |
| `g b` | Brand deals |
| `g k` | Pipeline (kanban) |
| `g t` | Timeline |
| `g i` | Invoices |
| `g e` | Bills / expenses |
| `g m` | Mileage |
| `g c` | Contacts |
| `g a` | Automations |
| `g l` | Activity |
| `g r` | Reports |
| `g x` | Tax |
| `g p` | Templates |
| `g n` | Banking |
| `g o` | Other income |
| `g s` | Settings |

---

## 5. Module dependency graph

**Static imports** (parsed at module-load):

- Every view imports: `../utils.js`, `../store.js`, `../router.js`, `../ui.js`, `../forms.js`.
- `app.js` imports every view + `router.js`, `store.js`, `forms.js`, `theme.js`, `lock.js`, `palette.js`, `help.js`, `automations.js`, `scheduler.js`, `prefs.js`, `profiles.js`.
- `forms.js` → `utils.js`, `store.js`, `ui.js`, `nl.js`.
- `palette.js` → `utils.js`, `store.js`, `router.js`, `forms.js`, `ui.js`, `prefs.js`, `help.js`.
- `automations.js` → `store.js`.
- `scheduler.js` → `store.js`, `utils.js`.
- `aiActions.js` → `utils.js`, `llm.js`, `store.js`, `ui.js`.
- `llm.js` → `store.js`.

**Dynamic (lazy) imports** — code-split points:

- `store.js` → `cryptoVault.js`, `synth.js`
- `app.js` → `utils.js` (vault unlock UI), `offlineQueue.js`, `ocr.js`, `profiles.js`, `prefs.js`
- `views/deals.js` → `aiActions.js` ("Summarize brief" / "Grade deal")
- `views/dashboard.js` → `aiActions.js` (AI co-pilot strip), `router.js`, `ui.js`
- `views/contracts.js` → `llm.js`, `ui.js` (Ask AI)
- `views/reports.js` → `aiActions.js` (coach mode), `digest.js`
- `forms.js` → `ocr.js`, `offlineQueue.js`
- `views/banking.js` → `ofx.js`
- `views/settings.js` → `share.js`
- `palette.js` → `theme.js`, `aiActions.js`, `store.js`, `ui.js`
- `views/connect.js` → no actual integrations loaded; key storage only.

**No cycles detected.**

---

## 6. Defects, smells, dead code

> Severity tiers: **C** (critical: data loss / runtime crash / security), **M** (major: UX regression / partial feature), **m** (minor: cleanup / consistency). The post-audit PRs #15–#18 closed most of the items below; the rest live in §6.1 *Open*.

### 6.1 Open (worth a follow-up PR)

| File:lines | Severity | Description | Suggested fix |
|---|---|---|---|
| `js/store.js` settings.connect.llm.apiKey + settings.connect.{plaid.secret,stripe.secretKey,dropboxSign.apiKey} | C (security) | API keys stored plaintext when encryption-at-rest is off. A curious local user opening DevTools can read them. | Either gate API-key storage behind enabled encryption, or surface a strong warning in `/connect` until the user opts in. |
| `js/views/dashboard.js render()` | m | The arrow body declares ~55 top-level consts. The duplicate-`runwayCard` regression in PR #14 was caused by accidental re-declaration. | Wire the duplicate-const detector in §7.2 into a CI step. |
| `js/digest.js` PDF generation race | resolved | Used to fail silently if `html2pdf` hadn't loaded yet. PR #16 introduced `js/pdf.js withHtml2Pdf()` which polls up to 3 s. | — |

### 6.2 Closed by recent PRs

| File:lines | Severity | Description | Closed by |
|---|---|---|---|
| `js/app.js` duplicate `import { runScheduler }` | m | Listed twice. | PR #15 |
| `forms.js`, `views/banking.js`, `views/mileage.js`, `views/income.js`, `views/settings.js`, `views/tax.js` (local `field()`) | M | Each file declared its own local `field()`. | PR #16 (hoisted to `utils.js`) |
| `views/dashboard.js (kpiCard)`, plus 7 other views (local `kpi()`) | M | Same KPI-card primitive redefined in many files. | PR #16 (hoisted to `utils.js` as `kpi()`) |
| `js/digest.js`, `views/tax.js` (local `escapeHtml()`) | m | Same helper duplicated. | PR #15 (hoisted to `utils.js`; both now import) |
| `js/ui.js: openModal` (focus trap) | M (a11y) | Tab could leave the modal. | PR #16 (focus trap + previously-focused restoration) |
| `sw.js: CACHE = rodbooks-shell-v1` (cache key never bumps) | C | Old shell stays cached after deploys. | PR #15 (bumped to `v2`) |
| `js/profiles.js` cryptoVault wiring | M (security) | In-flight async encrypt could write into the wrong profile's blob during switch. | PR #16 (`activateProfile()` helper drops crypto state + resets cache; `store.write()` captures `KEY()` per dispatch) |
| `index.html` mobile tabbar a11y | m (a11y) | Icon-only links had no `aria-label`. | PR #15 |
| Deal-form fields not displayed on detail (`currency`, `fxRate`, `disputes`, `agentId`, etc.) | M | Re-opening a deal in detail wouldn't show ~15 collected fields. | PR #17 (Commercials / Approval & disputes / Exclusivity & rights / Line items cards) |
| `views/tax.js` `field` + `field2` duplicate | m | Legacy refactor leftover. | PR #16 |
| `js/forms.js` deal-save validation | M | Only validated company non-empty. | PR #16 (fee, partner-fee %, FX rate, withholding %, paid≥service, exclusivity range) |
| `js/store.js: importJSON` overwrites without confirm | M | One slip → wiped data. | PR #16 (`Settings → Import JSON` now goes through `confirmDialog`) |
| `views/connect.js` sensitive inputs | M (security) | Audit suggested verifying `type="password"`. | Already correct (verified in PR #17 scan) |
| Duplicate `kpi()` / `field()` / `escapeHtml()` | m | Three identical helpers across many files. | PR #15 + PR #16 |

### 6.3 Bugs surfaced by external code review (post-audit)

| File:lines | Severity | Description | Closed by |
|---|---|---|---|
| `js/app.js` firstRun racing with encrypted vault | C (data loss) | If `enc:v1:` blob exists but the first-run-seed flag is missing, `getState()` returns defaults (vault still locked) and `loadSampleData()` overwrites the encrypted blob with seed data. | This PR — `firstRun` bails when `rawIsEncrypted()`. |
| `js/forms.js` `svc.addEventListener` before `const svc` | C (runtime) | TDZ ReferenceError — *every* deal-form open path crashed. | This PR — wiring moved after the `const svc` declaration. |
| `js/router.js` `setQuery` → `suppressNext` | M (UX) | `pushState`/`replaceState` don't fire `hashchange`; the suppressed-next flag stays armed and swallows the next *real* navigation (e.g. clicking a sidebar link after changing a filter). | This PR — `suppressNext` removed entirely. |
| `js/views/banking.js` CSV preview innerHTML | M (XSS) | A malicious CSV cell could inject HTML into the preview during import. | This PR — preview rebuilt with `textContent` only. |
| `js/views/tax.js` Schedule C totals included `taxStatus=personal` and `preTax` bills | M (correctness) | Personal expenses got deducted on Schedule C. | This PR — both filtered out in the live view and the year-end PDF. |
| `js/automations.js` tax-reserve uses `d.paidAmount || 0` | m (correctness) | Older / imported paid deals with no `paidAmount` contributed $0 to the reserve calc. | This PR — falls back to `netFee(d)` like the rest of the app. |
| `js/forms.js` "+ New agent" select option | — | Reviewer flagged as missed (false positive — `[a].concat(b, c)` flattens both args correctly). | This PR refactors to `[..., ...arr, ...]` for clarity anyway. |
| `README.md` paid-date inference framing | m (docs) | Read as "passive matcher" but the code only fires from a confirmed bank-row match in `/banking`. | This PR rewords + drops the dead `slice(0, 0)` placeholder in `automations.js`. |

### Out-of-scope (audit-flagged) follow-up PRs

- Hoist `field()` and `kpi()` into `utils.js` (#2, #3) — touches 8+ files.
- Display every form-collected field on the deal detail view (#10) — needs UI design pass.
- Encryption-gated API key storage with migration (#14, #19) — UX flow design.
- Modal focus-trap (#5) — small but should land with a11y testing.
- A real test runner — see §7.

---

## 7. Test recommendations

There is no test suite. These five smoke checks would have caught every blank-page or broken-route regression we've seen in prior phases.

### 7.1 Module-load smoke (CI)

```bash
# Spawn a headless browser, load index.html, assert no console errors and
# that the dashboard route renders content. Pseudocode:
playwright test --project=chromium <<'EOF'
test("dashboard renders", async ({ page }) => {
  const errs = [];
  page.on("pageerror", (e) => errs.push(e.message));
  await page.goto("http://localhost:8765/");
  await page.waitForSelector("#view .card"); // any rendered card
  expect(errs).toEqual([]);
});
EOF
```

Catches: duplicate `const` parse errors, missing imports, broken dynamic imports, runtime exceptions in render.

### 7.2 Duplicate-const detector (CI)

```bash
python3 - <<'PY'
import re, sys, glob
bad = []
for f in glob.glob("js/views/*.js") + glob.glob("js/*.js"):
    src = open(f).read()
    for m in re.finditer(r"(?:const render\s*=\s*\(\)\s*=>\s*\{|^function\s+\w+\s*\([^)]*\)\s*\{)", src, re.M):
        # Slice from match end to matching brace; flag duplicate consts within.
        i, depth, start = m.end(), 1, m.end()
        while depth and i < len(src):
            if src[i] == "{": depth += 1
            elif src[i] == "}": depth -= 1
            i += 1
        body = src[start:i]
        names = []
        d = 0
        for line in body.split("\n"):
            t = line.strip()
            if d == 0 and t.startswith("const "):
                mm = re.match(r"const\s+(\w+)", t)
                if mm: names.append(mm.group(1))
            d += t.count("{") - t.count("}")
        from collections import Counter
        for k, v in Counter(names).items():
            if v > 1:
                bad.append(f"{f}: duplicate const '{k}' (×{v})")
sys.exit("\n".join(bad)) if bad else None
print("ok")
PY
```

### 7.3 Roundtrip persistence (manual or browser-test)

Open a deal form, set `currency: "EUR"`, `fxRate: 1.08`, `hoursWorked: 4`, save. Reload. Open the same deal — verify fields survive. Catches schema mismatches between `forms.js` (writes) and `views/deals.js` (reads) flagged as defect #10.

### 7.4 Profile-switch encryption isolation (manual)

Create profile A. Settings → Enable encryption with passphrase `pass-A`. Switch to profile B. Reload. Verify B is plaintext. Switch back to A. Reload. Verify the vault unlock screen prompts.

### 7.5 Offline drain (manual)

DevTools → Network → Offline. Open Bills → Capture receipt → save image. Re-enable network. Reload. Verify a Bill entry was created via the offline-queue drainer in `app.js`.

---

## 8. How to run, build, deploy

- **Run locally:** `python3 -m http.server 8765` from the repo root, then visit `http://localhost:8765/`.
- **Build:** there is no build. Edit a file → reload.
- **Deploy:** push to `main`. `.github/workflows/deploy.yml` publishes `main` to GitHub Pages.
- **Live:** `https://rodman-ai.github.io/RodBooks/` — Pages source must be set to **GitHub Actions** in repo Settings → Pages.

---

## 9. Conventions

- ES modules everywhere. **No** bundler. **No** `npm install`.
- Vendored deps are CDN-only via `<script defer>` in `index.html` (Chart.js, html2pdf, JSZip, Tesseract.js loaded on demand).
- `el(tag, attrs, ...children)` is the universal DOM builder. Pass `class` (string), `style` (object — values must be valid CSS strings, e.g. `"6px"` not `6`), `html` (raw innerHTML — assume caller pre-escaped), `on*` (handlers).
- All writes go through `store.js`'s typed APIs (`Deals.save`, `Bills.remove`, etc.) so the activity log + subscriber broadcast fires.
- All views return `{ node, unmount }` with `unmount` cleaning up subscribers + `Chart` instances.
- Theme via CSS custom properties; nothing should hard-code colour outside `styles.css` `:root` / `[data-theme="light"]` blocks.

---

*Last updated: post-audit-fix PR #18 (firstRun guard, deal-form TDZ, router suppressNext, CSV-preview escape, Sched C taxStatus filter, tax-reserve netFee fallback, agent-select clarity, README paid-date framing).*
