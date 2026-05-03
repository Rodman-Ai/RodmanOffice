# RodmanOffice

A complete office suite that runs free in your browser.

## Apps

| App | Folder | Status |
|---|---|---|
| Word Processor | [`word/`](./word/) | Live (vendored from [RodmanWord](https://github.com/Rodman-Ai/RodmanWord)) |
| Spreadsheets | [`sheets/`](./sheets/) | Coming soon |
| Slideshows | [`slides/`](./slides/) | Coming soon |
| Image Editor | [`image/`](./image/) | Coming soon |
| Accounting | [`accounting/`](./accounting/) | Live (vendored from [RodBooks](https://github.com/Rodman-Ai/RodBooks)) |
| CRM | [`crm/`](./crm/) | Live (vendored from [LeoCRM](https://github.com/Rodman-Ai/LeoCRM), built in CI) |

## How it works

Open `/` to see the launcher. Each tile is a regular link to the
sub-app's folder, so the browser only fetches the picked app's assets
— no bundler, no shared runtime. Most sub-apps are self-contained
static sites with their own service worker scoped to their own folder.

The CRM (LeoCRM) is the exception: it's a Next.js 14 app, so its
source lives in `crm/` and the deploy workflow runs `npm ci` +
`scripts/build-demo.sh` to produce a static export under
`/RodmanOffice/crm/` at deploy time. In demo mode, all `/api/*` calls
are routed through a localStorage shim — Google sign-in, Gmail send,
Sheets sync and Anthropic generation are mocked, so the public deploy
is a tour rather than a working CRM.

## Layout

```
RodmanOffice/
├─ index.html, launcher.css, launcher.js, sw.js   ← launcher
├─ manifest.webmanifest, icon.svg, 404.html
├─ word/        ← RodmanWord (vendored)
├─ sheets/      ← stub
├─ slides/      ← stub
├─ image/       ← stub
├─ accounting/  ← RodBooks (vendored)
└─ crm/         ← LeoCRM (vendored, Next.js — built in CI)
```

## Deploy

GitHub Pages, via `.github/workflows/pages.yml`. Pushes to `main`
publish the suite. The workflow installs `crm/`'s npm dependencies
and runs LeoCRM's `scripts/build-demo.sh` (with
`NEXT_PUBLIC_BASE_PATH=/RodmanOffice/crm`) to produce
`crm/out/`, then stages a `_site/` artifact that combines the static
launcher + sub-apps + the LeoCRM export under `crm/`. All other apps
are static drop-ins with no build step.

## Adding an app

1. Create a folder at the suite root (`sheets/`, `slides/`, `image/`, `accounting/`, `crm/`).
2. Put a self-contained static site inside (`index.html` + assets).
3. Add an "← Apps" link back to `../` somewhere in the chrome.
4. Use `localStorage` keys prefixed with the app slug
   (`sheets.*`, `slides.*`, `image.*`, `accounting.*`, `crm.*`) so co-pinned PWAs don't collide.
5. Register the app's service worker with `scope: './'` so it stays
   confined to its own folder.

## Vendor sync

Live apps are vendored copies of upstream repos with a single local
patch each — a "← Apps" button that links to `../`:

- `word/` ← [RodmanWord](https://github.com/Rodman-Ai/RodmanWord). Patched in `word/index.html` (title bar) and `word/styles.css` (`.rodmanoffice-back`).
- `accounting/` ← [RodBooks](https://github.com/Rodman-Ai/RodBooks). Patched in `accounting/index.html` (top of sidebar) and `accounting/styles.css` (`.rodmanoffice-back`).
- `crm/` ← [LeoCRM](https://github.com/Rodman-Ai/LeoCRM) (Next.js, built in CI). Patched in `crm/src/components/AppShell.tsx` — a back-to-launcher anchor in the desktop sidebar and another in the mobile header, both linking to absolute path `/RodmanOffice/` (not Next's `<Link>`, since basePath rewriting would otherwise scope the URL under `/RodmanOffice/crm/`).

To pull updates for `word/` or `accounting/`, re-copy the upstream
repo over the folder and re-apply the one-line patch. For `crm/`,
re-copy the upstream LeoCRM source, re-apply the AppShell patch, and
push — CI rebuilds the static export.
