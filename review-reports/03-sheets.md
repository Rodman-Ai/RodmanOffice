# Rodman Sheets Review

Scope: `sheets/`.

## Findings

### P1 - The documented public API token model is not a real secret for a static client

The web app embeds `VITE_API_TOKEN` into the browser bundle and sends it as a bearer token at `sheets/apps/web/src/api.ts:16-22`. The API then gates `/workbooks/*` and `/ai/*` with that single shared token at `sheets/services/api/src/app.ts:24-27` and `sheets/services/api/src/app.ts:63-69`.

This can be acceptable for a private demo, but it is not a public security boundary. Anyone who can load the static client can read the token from the built JavaScript and call the workbook and AI endpoints directly. Because `/workbooks` lists all workbooks at `sheets/services/api/src/app.ts:76-78`, the current model also has no per-user ownership or tenant boundary.

Recommended fix: for any real hosted deployment, move to user auth and per-workbook authorization. Keep `VITE_API_TOKEN` only as a private-demo convenience or remove it from public deployment docs.

### P1 - Dependency audit found unresolved vulnerabilities

Local `corepack pnpm audit --json` reported four moderate vulnerabilities:

- `vite`, through `sheets/apps/web/package.json:26` and Vitest's Vite dependency.
- `esbuild`, through the Vite dependency chain.
- `@anthropic-ai/sdk`, declared at `sheets/services/api/package.json:15`.

Recommended fix: update Vite/Vitest/esbuild-compatible ranges and bump `@anthropic-ai/sdk` to a non-vulnerable release, then rerun `corepack pnpm audit --json`.

### P2 - Top-level scripts assume a bare `pnpm` binary in PATH

`sheets/package.json:10-12` defines scripts as `pnpm -r build`, `pnpm -r typecheck`, and `pnpm -r test`. In this Windows shell, `corepack pnpm -r ...` works, but running the top-level scripts failed because the nested script could not find bare `pnpm`.

Recommended fix: either document that Corepack must shim `pnpm` into PATH or change scripts/CI invocation so local developer commands are reliable across shells.

### P2 - The production web bundle is large

The Sheets build passed, but Vite warned that the main bundle was `1,780.82 kB` uncompressed and `499.19 kB` gzip. That is a noticeable cost for GitHub Pages and low-powered devices.

Recommended fix: split large optional features, lazy-load AI/import-export panels, and review dependency weight.

### P2 - Architecture docs are stale

`sheets/docs/architecture.md:58-59` references `MenuBar.tsx` and `FormatToolbar.tsx`, but the current UI is mounted through `Ribbon.tsx` from `sheets/apps/web/src/App.tsx`. `sheets/docs/architecture.md:92` says there are 55 tests; the current workspace test run passed 66 tests.

`sheets/docs/tech-stack.md:29-31` describes `claude-sonnet-4-6` as default chat/agent, while the current code uses `claude-opus-4-7` for chat/agent and `claude-haiku-4-5` for cell calls at `sheets/services/api/src/ai/client.ts:57-59`.

Recommended fix: update architecture and tech-stack docs after the current Ribbon/model changes.

### P3 - Frontend still has no automated tests

The architecture doc acknowledges this at `sheets/docs/architecture.md:92`. Given the size of the grid and formatting surface, manual verification plus typecheck is thin coverage.

Recommended fix: add focused component/hook tests for selection, paste, formatting, undo/redo, and API mode behavior.

## Verification

- `corepack pnpm -r test` passed: 66 tests across codecs, calc, and API packages.
- `corepack pnpm -r typecheck` passed.
- `corepack pnpm -r build` passed with the large-bundle warning.
- `corepack pnpm audit --json` reported 4 moderate vulnerabilities.

