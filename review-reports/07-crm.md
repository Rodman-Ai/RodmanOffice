# Rodman CRM Review

Scope: `crm/`.

## Findings

### P0 - TypeScript error blocks CRM build and the root Pages deploy

`crm/src/app/api/members/route.ts:23-32` creates a typed `Member`. It then passes that object to `appendRow` at `crm/src/app/api/members/route.ts:33-37`. TypeScript rejects this because `appendRow` expects `Record<string, unknown>` and `Member` does not have an index signature.

Local `npm run typecheck` and escalated `npm run build` both failed with the same error. The root workflow builds CRM through `.github/workflows/pages.yml:59-62`, so this blocks suite deployment.

Recommended fix: align row typing across `appendRow` and app domain types. A local conversion to a plain row object is the quickest unblock; a generic `appendRow<T extends object>` API may be the cleaner longer-term fix.

### P1 - CRM dependencies include critical/high advisories

`crm/package.json:15` pins `next` to `14.2.18`. Local `npm audit --json` reported a critical direct Next vulnerability and several high/moderate advisories. This is especially relevant because CRM uses NextAuth middleware at `crm/src/middleware.ts:1`.

Other audited dependency paths included `googleapis` at `crm/package.json:14`, `next-auth` at `crm/package.json:16`, and `eslint-config-next` at `crm/package.json:26`.

Recommended fix: upgrade Next to the patched non-major release reported by audit, then rerun `npm audit --json`, `npm run typecheck`, and `npm run build`.

### P1 - Public form submissions can be spammed into the owner's CRM

The middleware intentionally excludes API routes from auth at `crm/src/middleware.ts:5-9`. `crm/src/app/api/forms/submit/route.ts:13-146` accepts unauthenticated form submissions, writes Contacts and Leads at `crm/src/app/api/forms/submit/route.ts:56-84`, and can enroll sequences at `crm/src/app/api/forms/submit/route.ts:94-130`.

Impact: public forms are a valid feature, but without rate limiting, CAPTCHA, origin checks, or abuse detection, an attacker can fill the owner's spreadsheet and trigger downstream automation.

Recommended fix: add rate limiting, spam filtering, optional CAPTCHA/turnstile, and duplicate/submission throttling per form slug and IP.

### P2 - API token generation uses non-cryptographic randomness

`crm/src/app/api/tokens/route.ts:7-10` creates API tokens with `Math.random`. The token is then stored directly at `crm/src/app/api/tokens/route.ts:30-43`.

Impact: if these tokens are or become real authentication credentials, they are easier to predict than tokens generated with cryptographic randomness and are exposed if the spreadsheet is shared.

Recommended fix: generate tokens with `crypto.randomBytes` or Web Crypto and store only a hash plus a short preview.

### P2 - Owner credentials endpoint returns a refresh token to the browser

`crm/src/app/api/owner-credentials/route.ts:17-22` returns `LEOCRM_OWNER_REFRESH_TOKEN` to the authenticated browser. The file comment at `crm/src/app/api/owner-credentials/route.ts:6-9` says this is acceptable because the token is already in the user's NextAuth JWT, but it still increases exposure to browser compromise and XSS.

Recommended fix: prefer a one-time reveal flow, reauthentication before display, short-lived setup handoff, and explicit copy warnings.

### P2 - Lint script is not CI-usable

`crm/package.json:9` defines `next lint`. Running it prompted for ESLint configuration instead of linting, which means there is no reliable lint gate.

Recommended fix: add an ESLint config and run lint non-interactively in CI.

## Documentation Notes

- `crm/README.md:89-129` documents a Vercel deployment and says GitHub Pages cannot host the app, but RodmanOffice now exports a static CRM demo through `crm/scripts/build-demo.sh`.
- `crm/README.md:81` says to add six Google Sheet tabs; the schema defines many more tabs from `crm/src/lib/google/schema.ts:6-300`.
- `crm/README.md:89` references `.github/workflows/deploy.yml`; the suite workflow is `.github/workflows/pages.yml`.

## Verification

- `npm ci` completed but reported vulnerabilities.
- `npm run typecheck` failed on `members/route.ts`.
- `npm run build` failed on the same TypeScript error.
- `npm run lint` entered an interactive configuration prompt.
- `npm audit --json` reported 10 vulnerabilities.

