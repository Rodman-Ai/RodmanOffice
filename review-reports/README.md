# RodmanOffice Deep-Dive Review

Repository reviewed: `https://github.com/Rodman-Ai/RodmanOffice`, `main` branch.

This folder contains separate reports for the suite as a whole, the shared libraries, each sub-app, and the documentation set.

## Reports

- `00-overall.md` - app-wide build, deploy, CI, security, and architecture issues
- `01-shared-libraries.md` - `/lib` document, spreadsheet, slide, and image engines
- `02-word.md` - `word/`
- `03-sheets.md` - `sheets/`
- `04-slides.md` - `slides/`
- `05-image.md` - `image/`
- `06-accounting.md` - `accounting/`
- `07-crm.md` - `crm/`
- `08-converter.md` - `converter/`
- `09-documentation.md` - cross-repo documentation drift and missing docs
- `10-ux-ui.md` - cross-app UX/UI review and most pressing UX priorities
- `11-ranked-issues.md` - deduplicated ranked backlog, sorted by impact and effort
- `12-current-code-review-findings.md` - latest code-review findings after the follow-up pass

## Severity Key

- `P0` - blocks deploy/release or breaks a primary workflow
- `P1` - security, data loss, or serious correctness risk
- `P2` - important reliability, maintainability, or user-facing gap
- `P3` - polish, docs, or lower-risk follow-up

## Local Verification Snapshot

- `sheets`: direct workspace commands passed: `corepack pnpm -r test`, `corepack pnpm -r typecheck`, and `corepack pnpm -r build`.
- `crm`: `npm run typecheck` and an escalated `npm run build` failed on the same TypeScript error in `crm/src/app/api/members/route.ts`.
- `crm`: `npm audit --json` reported 10 vulnerabilities, including a critical direct `next` issue.
- `sheets`: `corepack pnpm audit --json` reported 4 moderate vulnerabilities.
- Static JavaScript syntax checks passed for `word`, `converter`, `image`, `slides`, `accounting`, and `lib`, excluding vendored files.
