# Documentation Review

Scope: root docs plus sub-app docs and documentation embedded in app pages.

## Findings

### P1 - Offline/PWA documentation is out of date across multiple apps

Several docs still imply full offline behavior, but the suite now uses shared `/lib` engines outside sub-app service-worker scopes:

- Word says the editor works fully offline after first visit at `word/README.md:120-122`, while `word/sw.js:12-14` says `/lib/docs` cannot be precached.
- Slides has no README, and `slides/sw.js:4-6` says `/lib/slides` cannot be precached.
- Image claims PWA offline support at `image/README.md:145`, but `image/sw.js:12` includes a missing precache asset and shared `/lib/images` is outside the app cache.
- Converter says it works offline once loaded at `converter/index.html:79`, but `converter/app.js:14-15` and `converter/worker.js:16` load shared engines outside scope.

Recommended fix: add an offline support matrix at the root that separates app shell, editing, import/export, and vendor-worker behavior for each app.

### P1 - Deployment docs conflict with the actual RodmanOffice workflow

The suite workflow is `.github/workflows/pages.yml`, but several app docs reference app-local or old workflows:

- Word: `word/README.md:113` references `.github/workflows/deploy.yml`.
- Accounting: `accounting/README.md:57` and `accounting/docs/ARCHITECTURE.md:413` reference `.github/workflows/deploy.yml`.
- CRM: `crm/README.md:89-129` describes Vercel deployment and says GitHub Pages cannot host the app, while the current suite creates a static CRM demo through `crm/scripts/build-demo.sh`.
- Sheets: `sheets/README.md:62` still points to an `AiCell` GitHub Pages URL shape rather than RodmanOffice.

Recommended fix: centralize RodmanOffice deployment docs at the root and have sub-app docs link to it, with separate notes for standalone upstream apps if needed.

### P2 - Root README misses current apps and architecture

`README.md:20` says there is "no shared runtime", but `index.html:187` advertises shared `/lib` engines. `index.html:159` includes the File Converter app, but the root README app list omits `converter/`.

Recommended fix: update the root app inventory, shared-library description, and vendor-sync process.

### P2 - Word docs still describe pre-shared-library files

`word/README.md:62-67` and `word/ARCHITECTURE.md:43-46` describe local `docx.js`, `pdfio.js`, and `interop.js`. Current Word bridges shared engines from `../lib/docs/index.js` at `word/index.html:1829`.

Recommended fix: update Word docs around architecture, syntax checks, cache versioning, and shared engine ownership.

### P2 - Sheets architecture and tech-stack docs are stale

`sheets/docs/architecture.md:58-59` references `MenuBar.tsx` and `FormatToolbar.tsx`, but the current app uses `Ribbon.tsx`. `sheets/docs/architecture.md:92` says 55 tests; the current direct test run passed 66. `sheets/docs/tech-stack.md:29-31` lists default Claude model choices that differ from `sheets/services/api/src/ai/client.ts:57-59`.

Recommended fix: update the docs after the Ribbon/model changes and record the current verification commands.

### P2 - Image docs understate dependencies and security boundaries

`image/README.md:9` says "No dependencies", but the app depends on shared `/lib/images`, vendored `ag-psd`, and PDF.js. The Script-Fu feature is labeled as sandboxed in code at `image/js/app.js:4989`, but it uses `new Function` at `image/js/app.js:5004`.

Recommended fix: document dependencies, vendor update process, and the trust model for script execution.

### P2 - Accounting docs need tax-constant and roadmap cleanup

The default mileage rate in code is 2024's 67 cents/mile at `accounting/js/store.js:38`. Official IRS sources list 70 cents/mile for 2025 and 72.5 cents/mile for 2026:

- https://www.irs.gov/tax-professionals/standard-mileage-rates
- https://www.irs.gov/newsroom/irs-sets-2026-business-standard-mileage-rate-at-725-cents-per-mile-up-25-cents

The README roadmap still lists mileage tracking at `accounting/README.md:120`, while the current app imports `mileageView` at `accounting/js/app.js:22`.

Recommended fix: add a yearly tax-rate review checklist and prune shipped features from the roadmap.

### P2 - CRM docs do not match the current schema or static demo

`crm/README.md:81` says to add six Google Sheet tabs, but `crm/src/lib/google/schema.ts:6-300` defines a much larger schema. The README also describes Vercel as the deployment path and GitHub Pages as only a placeholder, which conflicts with the current static demo build.

Recommended fix: regenerate CRM docs from `schema.ts` or add a schema summary script so tab counts and headers do not drift again.

### P2 - Slides and Converter need app-level READMEs

There is no `slides/README.md` and no `converter/README.md`. Both apps have enough behavior and risk to need maintainer docs: format support, local storage, offline limits, keyboard shortcuts, import/export trust boundaries, and known gaps.

### P3 - Missing root operating docs

The repository needs a concise "maintainer runbook" covering:

- Clone/install commands per sub-app.
- The exact root Pages build path.
- The full verification suite expected before merge.
- Security/audit process for npm/pnpm and vendored browser dependencies.
- Shared library ownership and compatibility expectations.
- Offline support matrix and service-worker scope explanation.

