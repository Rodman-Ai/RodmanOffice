# Overall RodmanOffice Review

## Findings

### P0 - GitHub Pages deployment is currently blocked by the CRM build

The root Pages workflow builds the CRM demo with `bash scripts/build-demo.sh` at `.github/workflows/pages.yml:59-62`. That script runs `npx next build` at `crm/scripts/build-demo.sh:43`. Locally, both `npm run typecheck` and `npm run build` fail with:

`crm/src/app/api/members/route.ts(37,5): error TS2345: Argument of type 'Member' is not assignable to parameter of type 'Record<string, unknown>'.`

The bad call is `appendRow(..., SHEETS.Members, member)` at `crm/src/app/api/members/route.ts:33-37`. Because CRM is part of the root Pages build, this is not isolated to CRM; it blocks the whole suite deploy.

Recommended fix: adjust the `appendRow` signature or convert `member` into a row object compatible with `Record<string, unknown>`, then run CRM typecheck and the root Pages build path again.

### P1 - CI only protects the two bundled build apps, not the static apps or shared libraries

The root workflow installs CRM and Sheets and then builds only those outputs: `.github/workflows/pages.yml:51-69`. It does not run static syntax checks, browser smoke tests, dependency audits, or app-specific checks for `word`, `slides`, `image`, `accounting`, `converter`, or `/lib`.

This matters because several production-impacting issues are currently invisible to CI: the image service worker precaches a missing file, slides undo/redo buttons are no-ops, converter worker failures can hang conversions, and shared library offline behavior has changed.

Recommended fix: add a root smoke job that runs static JS syntax checks, checks service-worker precache file existence, exercises core static app load paths in a browser, and runs CRM/Sheets audits on a schedule.

### P1 - The offline/PWA model changed, but app service workers still cache as if each app is self-contained

The launcher now advertises shared `/lib/` engines at `index.html:187`, and apps load them from parent paths, for example `word/index.html:1829`, `slides/index.html:365`, `image/index.html:235`, and `converter/app.js:14-15`. App service workers are scoped below each subdirectory, so they cannot reliably precache parent `/lib` files. Word and Slides even document this limitation in service-worker comments at `word/sw.js:12-14` and `slides/sw.js:4-6`.

The result is a confusing user contract: apps still present offline/PWA behavior, but document/PPTX/image/spreadsheet conversions can fail offline depending on whether shared engines and their workers/vendor assets are already in the HTTP cache.

Recommended fix: either serve apps under a shared root service worker that owns `/lib`, move shared engines under each app build output, or update the product copy/docs to say only the shell is offline-guaranteed.

### P1 - Security posture is inconsistent across the suite

The sub-apps mix local-only tooling, hosted API clients, and browser-stored credentials without one suite-level security model:

- CRM depends on vulnerable `next@14.2.18` at `crm/package.json:15`; local audit reported critical/high Next advisories.
- Sheets documents a public static deployment where `VITE_API_TOKEN` is embedded into the browser bundle at `sheets/apps/web/src/api.ts:19-22`.
- Accounting stores provider API keys in browser settings, with plaintext storage explicitly listed as an unresolved security item at `accounting/docs/ARCHITECTURE.md:294`.
- Word stores a GitHub personal access token in `localStorage` at `word/app.js:6454-6456`.

Recommended fix: add a suite security document and per-app threat models that separate local-only tools from hosted/server-backed tools, define what secrets may live in a browser, and specify hardening expectations before public deployment.

### P2 - Root documentation and app inventory are out of sync with the launcher

The root README says the suite has "no shared runtime" at `README.md:20`, but the launcher and apps now rely on shared `/lib` engines. The launcher includes File Converter at `index.html:159`, but the README app table omits `converter/`.

Recommended fix: update the root README app list, deployment description, and vendor-sync instructions to include `converter` and `/lib`.

### P2 - Root build verification does not run the checks developers expect from sub-app docs

Sheets has tests and typechecking, CRM has typechecking, and static apps have enough JavaScript to merit syntax and browser smoke tests. The root workflow currently does not run `pnpm -r test`, `pnpm -r typecheck`, CRM `npm run typecheck`, or a static app smoke pass before deploying.

Recommended fix: split the workflow into `verify` and `publish` jobs. Gate publish on typecheck/build/test/smoke/audit status.

## Verification

- Cloned `main` with `--single-branch`.
- Installed Sheets dependencies with `corepack pnpm install --frozen-lockfile`.
- Installed CRM dependencies with `npm ci`.
- Ran Sheets tests/typecheck/build successfully using direct workspace commands.
- Ran CRM typecheck/build and reproduced the same TypeScript failure.
- Ran CRM and Sheets dependency audits.
- Ran static JavaScript syntax checks for static apps and shared libraries.

