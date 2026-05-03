# RodmanOffice

A complete office suite that runs free in your browser.

## Apps

| App | Folder | Status |
|---|---|---|
| Word Processor | [`word/`](./word/) | Live (vendored from [RodmanWord](https://github.com/Rodman-Ai/RodmanWord)) |
| Spreadsheets | [`sheets/`](./sheets/) | Coming soon |
| Slideshows | [`slides/`](./slides/) | Coming soon |
| Image Editor | [`image/`](./image/) | Coming soon |
| Accounting | [`accounting/`](./accounting/) | Coming soon |
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
├─ accounting/  ← stub
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

`word/` is a vendored copy of RodmanWord with one local patch:
a "← Apps" button in the title bar (see `word/index.html` and the
`.rodmanoffice-back` rule in `word/styles.css`). To pull updates,
re-copy the upstream repo over `word/` and re-apply the patch.
