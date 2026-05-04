# Rodman Accounting Review

Scope: `accounting/`.

## Findings

### P1 - Encrypted vault writes can resolve out of order and overwrite newer data

`accounting/js/store.js:193` defines `write()`. When encryption is enabled, it calls the async encrypt callback and then writes to localStorage in a `.then(...)` at `accounting/js/store.js:199-201`. There is no sequencing, cancellation, or "latest write wins" guard.

Impact: rapid state changes can start multiple encryptions. If an older encryption finishes last, it can overwrite newer state. Closing the tab before the promise resolves can also drop the latest save.

Recommended fix: serialize encrypted writes through a queue or monotonic revision. Only commit the encrypted blob if it matches the latest revision.

### P1 - The default IRS mileage rate is stale

The default settings use `mileageRate: 0.67` with a comment "IRS standard 2024" at `accounting/js/store.js:38`. The IRS lists 70 cents/mile for business use in 2025 and announced 72.5 cents/mile for business use beginning January 1, 2026:

- IRS standard mileage table: https://www.irs.gov/tax-professionals/standard-mileage-rates
- IRS 2026 announcement: https://www.irs.gov/newsroom/irs-sets-2026-business-standard-mileage-rate-at-725-cents-per-mile-up-25-cents

Impact: new users can get wrong mileage deduction estimates unless they manually update settings.

Recommended fix: update the default, store the effective tax year with the setting, and add documentation that tax constants must be reviewed yearly.

### P2 - Provider API keys are browser-stored, and plaintext mode is still an open security issue

Settings include Plaid, Stripe, Dropbox Sign, and LLM keys at `accounting/js/store.js:50-51`. The browser-side LLM client sends user API keys directly from the browser at `accounting/js/llm.js:40-84`. The architecture doc already lists plaintext API key storage as an unresolved security issue at `accounting/docs/ARCHITECTURE.md:294`.

Impact: this is expected for a local-first static tool, but it needs a strong product warning and should be gated behind encryption for users who add real provider keys.

Recommended fix: require encryption before storing provider secrets or show a persistent warning until encryption is enabled.

### P2 - Offline service-worker coverage is thinner than the app's static import graph

The service worker precaches only a small shell at `accounting/sw.js`, while `accounting/js/app.js:1-34` statically imports many modules and views. Those modules may be fetched before the service worker controls the page, making "after first visit" offline behavior dependent on browser HTTP cache rather than an explicit app cache.

Recommended fix: generate the service-worker asset list from the module graph or run a browser offline smoke test that verifies every route can render.

### P2 - There is no automated test gate for a large financial app

The app has many stateful modules and a sizable architecture doc, but the root workflow does not run Accounting-specific smoke tests. The architecture doc recommends smoke-style checks at `accounting/docs/ARCHITECTURE.md:360`, but no root CI step enforces them.

Recommended fix: add syntax checks, service-worker asset validation, route render smoke tests, and focused tests for tax/mileage/invoice calculations.

## Documentation Notes

- `accounting/README.md:57` and `accounting/docs/ARCHITECTURE.md:413` reference `.github/workflows/deploy.yml`; the suite deploys with `.github/workflows/pages.yml`.
- `accounting/README.md:119-120` still lists recurring invoices and mileage tracker as roadmap items, while current code includes recurring/deal templates and a mileage view at `accounting/js/app.js:22`.
- The docs should include a recurring annual tax-constant review checklist.

## Verification

Static JavaScript syntax checks passed for Accounting files. IRS mileage-rate values were checked against official IRS pages linked above.

