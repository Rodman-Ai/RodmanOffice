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
| CRM | [`crm/`](./crm/) | Coming soon |

## How it works

Open `/` to see the launcher. Each tile is a regular link to the
sub-app's folder, so the browser only fetches the picked app's assets
— no bundler, no shared runtime. Each sub-app is a self-contained
static site with its own service worker scoped to its own folder.

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
└─ crm/         ← stub
```

## Deploy

GitHub Pages, via `.github/workflows/pages.yml`. Pushes to `main`
publish the whole tree as-is. No build step.

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

To pull updates, re-copy the upstream repo over the folder and
re-apply the patch.
