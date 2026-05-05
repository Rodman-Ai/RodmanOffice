# RodmanOffice

A complete office suite that runs free in your browser.

## Apps

| App | Folder | Status |
|---|---|---|
| Word Processor | [`word/`](./word/) | Live (vendored from [RodmanWord](https://github.com/Rodman-Ai/RodmanWord)) |
| Spreadsheets | [`sheets/`](./sheets/) | Live (vendored from [AiCell](https://github.com/Rodman-Ai/AiCell), built in CI) |
| Slideshows | [`slides/`](./slides/) | Live (RodmanSlides — built in-suite) |
| Image Editor | [`image/`](./image/) | Live (vendored from [Retro-paint](https://github.com/Rodman-Ai/Retro-paint)) |
| Accounting | [`accounting/`](./accounting/) | Live (vendored from [RodBooks](https://github.com/Rodman-Ai/RodBooks)) |
| CRM | [`crm/`](./crm/) | Live (vendored from [LeoCRM](https://github.com/Rodman-Ai/LeoCRM), built in CI) |
| File Converter | [`converter/`](./converter/) | Live (built in-suite, uses shared `/lib` engines) |

## How it works

Open `/` to see the launcher. Each tile is a regular link to the
sub-app's folder, so the browser only fetches the picked app's assets
and any shared engines that app imports from `/lib`. Most sub-apps are
static sites with their own service worker scoped to their own folder.
Offline support is app-shell first; shared import/export engines may
need network or a prior browser cache hit unless a feature says otherwise.

Two apps are exceptions and are built at deploy time:

- **Spreadsheets (AiCell)** — pnpm monorepo with a Vite + React 19 web
  app. The workflow runs `pnpm install` and `pnpm --filter @aicell/web
  build` with `VITE_BASE=/RodmanOffice/sheets/` and an empty
  `VITE_API_BASE` (which puts AiCell in demo mode: backend persistence,
  AI cell formulas, and applyable AI plans are disabled; workbook state lives
  in browser storage, and Ask Claude supports per-request BYOK chat).
- **CRM (LeoCRM)** — Next.js 14 app. The workflow runs `npm ci` and
  `scripts/build-demo.sh` with `NEXT_PUBLIC_BASE_PATH=/RodmanOffice/crm`
  to produce a static export. In demo mode, all `/api/*` calls are
  routed through a localStorage shim — Google sign-in, Gmail send,
  Sheets sync and Anthropic generation are mocked, so the public deploy
  is a tour rather than a working CRM.

## Layout

```
RodmanOffice/
├─ index.html, launcher.css, launcher.js, sw.js   ← launcher
├─ manifest.webmanifest, icon.svg, 404.html
├─ word/        ← RodmanWord (vendored)
├─ sheets/      ← AiCell (vendored, pnpm + Vite — built in CI)
├─ slides/      ← RodmanSlides (built in-suite, vanilla static)
├─ image/       ← Retro-paint (vendored)
├─ accounting/  ← RodBooks (vendored)
├─ converter/   ← RodmanConvert (built in-suite, vanilla static)
├─ lib/         ← shared document / sheet / slide / image engines
└─ crm/         ← LeoCRM (vendored, Next.js — built in CI)
```

## Deploy

GitHub Pages, via `.github/workflows/pages.yml`. Pushes to `main`
publish the suite. The workflow:

1. Sets up pnpm and Node 20 (with caches for both `pnpm` and `~/.npm`).
2. Installs `crm/`'s npm dependencies and `sheets/`'s pnpm workspace.
3. Builds LeoCRM with `NEXT_PUBLIC_BASE_PATH=/RodmanOffice/crm` →
   `crm/out/`.
4. Builds AiCell with `VITE_BASE=/RodmanOffice/sheets/` and empty
   `VITE_API_BASE` → `sheets/apps/web/dist/`.
5. Stages a `_site/` artifact: rsyncs everything except the `crm/` and
   `sheets/` source trees, then drops the two build outputs in as
   `_site/crm` and `_site/sheets`.

All other apps are static drop-ins with no build step.

## Adding an app

1. Create a folder at the suite root (`word/`, `sheets/`, `slides/`, `image/`, `accounting/`, `crm/`, `converter/`).
2. Put a self-contained static site inside (`index.html` + assets).
3. Add an "← Apps" link back to `../` somewhere in the chrome.
4. Use `localStorage` keys prefixed with the app slug
   (`sheets.*`, `slides.*`, `image.*`, `accounting.*`, `crm.*`) so co-pinned PWAs don't collide.
5. Register the app's service worker with `scope: './'` so it stays
   confined to its own folder.
6. If the app depends on `/lib`, document which workflows need those
   shared engines and do not claim full offline support unless those
   assets are controlled by that app's service worker.

## Vendor sync

Live apps are vendored copies of upstream repos with a single local
patch each — a "← Apps" button that links to `../`:

- `word/` ← [RodmanWord](https://github.com/Rodman-Ai/RodmanWord). Patched in `word/index.html` (title bar) and `word/styles.css` (`.rodmanoffice-back`).
- `accounting/` ← [RodBooks](https://github.com/Rodman-Ai/RodBooks). Patched in `accounting/index.html` (top of sidebar) and `accounting/styles.css` (`.rodmanoffice-back`).
- `image/` ← [Retro-paint](https://github.com/Rodman-Ai/Retro-paint). Patched in `image/index.html` (head of `.app-header`) and `image/styles.css` (`.rodmanoffice-back`).
- `sheets/` ← [AiCell](https://github.com/Rodman-Ai/AiCell) (pnpm + Vite + React 19, built in CI). Patched in `sheets/apps/web/src/App.tsx` (back-to-launcher anchor at the top-left of the toolbar) and `sheets/apps/web/src/styles.css` (`.rodmanoffice-back`).
- `crm/` ← [LeoCRM](https://github.com/Rodman-Ai/LeoCRM) (Next.js, built in CI). Patched in `crm/src/components/AppShell.tsx` — a back-to-launcher anchor in the desktop sidebar and another in the mobile header, both linking to absolute path `/RodmanOffice/` (not Next's `<Link>`, since basePath rewriting would otherwise scope the URL under `/RodmanOffice/crm/`).
- `converter/` is built in-suite and intentionally consumes shared `/lib` engines.
- `lib/` contains shared document, spreadsheet, slide, and image engines used by multiple apps. Treat changes there as cross-app changes.

To pull updates for `word/` or `accounting/`, re-copy the upstream
repo over the folder and re-apply the one-line patch. For `sheets/`
or `crm/`, re-copy the upstream source, re-apply the patch, and
push — CI rebuilds the static export.
