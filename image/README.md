# Retro Paint

A browser-based retro paint emulator that runs on desktop, tablet, and phone.
One canvas, three switchable modes — each faithfully themed after a beloved
classic:

| Mode              | Inspiration                | Era    |
| ----------------- | -------------------------- | ------ |
| **MS Paint 95**   | Microsoft Paint on Win 95  | 1995   |
| **Mario Paint**   | Mario Paint on the SNES    | 1992   |
| **Kid Pix**       | Kid Pix on classic Mac OS  | 1989+  |

No build step. No dependencies. Just static HTML, CSS, and vanilla JavaScript
talking to the HTML5 Canvas and Web Audio APIs.

---

## Live demo

Once GitHub Pages is enabled (see [Deploying](#deploying)), the app will be
served at:

    https://rodman-ai.github.io/Retro-paint/

---

## Quick start (local)

```bash
# Any static file server works. Pick one:
python3 -m http.server 8000
# or
npx --yes serve .
```

Then open `http://localhost:8000`. You can also just double-click
`index.html` — everything is loaded with relative paths.

---

## Feature matrix

### MS Paint 95
- Win 95 chrome — beveled gray buttons, blue-gradient titlebar, sunken status
  bar, classic 28-color palette.
- **Tools:** pencil, brush, eraser, flood fill (bucket), eyedropper, spray
  can, line, rectangle (outline + filled), ellipse (outline + filled).
- Live drag-preview for every shape tool (snapshot/restore pattern).

### Mario Paint
- Candy-pink + sky-blue theme, chunky pixel-art buttons with 3D drop shadow.
- **Musical Pencil** — every palette color is mapped to a Web Audio note;
  each click and drag plays the corresponding tone.
- **Stamps** (8 hand-built pixel-art sprites): mushroom, star, heart, flower,
  Yoshi, coin, music note, smile.
- All standard tools (brush, eraser, fill, spray) themed to match.

### Kid Pix
- Bold black-bordered chunky 90s Mac look, hatched diagonals, pop colors.
- **Wacky brushes** (6 styles): rainbow stripes, echo halos, sparkle burst,
  kaleidoscope mirror, scattered colored dots, wobbly noodle.
- **Cartoon stamps** (7): sun, cat, house, tree, UFO, smiley, pop-star.
- **Dynamite** — animated particle explosion + shockwave that wipes the
  canvas to white.
- **Oh No!** — full-screen splash text, then clear.

### Cross-cutting features
- HTML5 Canvas (default 640 × 480, resizable via **New canvas** dialog) with
  responsive aspect-ratio-preserving scale.
- Pointer Events for unified mouse / touch / pen / stylus input, with
  **stylus pressure** mapped to brush width.
- **Undo + Redo** with 16-step history (`Ctrl+Z`, `Ctrl+Shift+Z` or `Ctrl+Y`).
- **Open Image** — load any PNG/JPG into the canvas to trace, color, or remix.
- **Save PNG** (`Ctrl+S`) — Shift-click for HD export at any scale.
- **Live brush cursor preview** sized to your current brush.
- **Recent colors** strip — last 12 colors you used, persisted.
- **Custom HSV color picker** with hue / saturation / value sliders (click
  the big swatches; right-click for the OS picker).
- **Brush opacity slider** (5–100%).
- **Symmetry / mirror** — Off → H → V → Both → 4-way → 8-way kaleidoscope,
  applies to freehand tools, wacky brushes, and stamps.
- **Shift-constrain** — perfect squares, circles, and 0/45/90° lines.
- **Pixel grid** overlay toggle (G) for pixel-art work.
- **Pan & zoom** — Ctrl/Cmd + scroll wheel to zoom (also `+` / `−` / `0`),
  hold Space and drag (or middle-click) to pan.
- **Image filters** — invert, grayscale, sepia, posterize, blur, brighten,
  darken (FX button).
- **Gradient fill** tool — linear gradient using primary → secondary.
- **Smudge brush** — pick up nearby pixels and drag them.
- **Text tool** — click the canvas, type, drop styled text.
- **Rectangular selection** — drag a rect, then drag inside it to move; press
  Delete to clear.
- **Stroke replay** — re-draw your last session's strokes in real time.
- **Animation flipbook** — Shift + F opens a frame strip with prev / next /
  add / delete / play and **onion-skin** preview.
- **Background patterns** behind the canvas — none, grid, dots, graph paper,
  ruled lines, blueprint (cycle with `V`).
- **Tool hotkeys** — single-letter shortcuts per mode.
- **Sound mute** toggle (M), persisted.
- **Autosave** — debounced 1.5 s after every stroke; reloads offer to restore.
- **Installable PWA** with offline support (manifest + service worker).
- **Last-used mode**, brush size, opacity, recent colors all persist.
- **Reset all** — Shift-click ✕ Clear to wipe stored state and reload.
- Web Audio synth for every sound — no audio assets to ship.

---

## Controls

### Mouse / touch
| Action                                      | What it does                          |
| ------------------------------------------- | ------------------------------------- |
| Click / tap a tool                          | Select tool                           |
| Click / tap a palette swatch                | Set primary color                     |
| Shift-click or right-click a swatch         | Set secondary color                   |
| Click the big primary/secondary swatch      | Open OS color picker                  |
| Drag on canvas                              | Draw with current tool                |
| Drag a shape tool                           | Live-preview a line/rect/ellipse      |
| Tap a stamp tool then tap canvas            | Drop a stamp at that point            |
| Tap **Dynamite** then tap canvas            | Animated explosion, then clear        |
| Tap **Oh No!**                              | Splash text, then clear               |

### Keyboard shortcuts
| Key                       | Action                                    |
| ------------------------- | ----------------------------------------- |
| `1` / `2` / `3`           | Switch to MS Paint / Mario Paint / Kid Pix|
| `Ctrl/Cmd + Z`            | Undo                                      |
| `Ctrl/Cmd + Shift + Z`    | Redo (also `Ctrl + Y`)                    |
| `Ctrl/Cmd + S`            | Save canvas as PNG                        |
| `Ctrl/Cmd + O`            | Open image                                |
| `M`                       | Mute / unmute sound                       |
| `Y`                       | Cycle symmetry mirror (Off → H → V → Both)|
| `P` / `B` / `E` / `F`     | Pencil / Brush / Eraser / Fill            |
| `K`                       | Color picker (eyedropper)                 |
| `S`                       | Spray                                     |
| `L` / `R` / `O`           | Line / Rectangle / Oval (MS Paint mode)   |
| Hold `Shift` while drawing| Constrain shape (square, circle, 45° line)|

---

## Architecture

```
Retro-paint/
├── index.html               # Page shell
├── styles.css               # Layout + 3 themed stylesheets
├── manifest.webmanifest     # PWA manifest (installable app)
├── sw.js                    # Service worker (offline cache)
├── icon.svg                 # PWA icon
├── js/
│   ├── app.js               # Canvas engine, tools, mode switching
│   ├── modes.js             # Palettes, tool lists, pixel-art stamps
│   └── sounds.js            # Web Audio synth (notes + SFX)
├── .github/workflows/
│   └── deploy.yml           # GitHub Actions → GitHub Pages
├── .nojekyll                # Tell Pages not to Jekyll-process the site
└── README.md
```

### Drawing engine (`js/app.js`)
- A single `<canvas>` at logical 640 × 480.
- All tools implement `{ down(p), move(p)?, up(p)? }` and are dispatched from
  unified Pointer Event handlers.
- Shape tools snapshot the canvas on `pointerdown` (`getImageData`) and
  restore + redraw on every `pointermove` so previews never accumulate.
- `floodFill` is a stack-based scanline fill on `ImageData`.
- Wacky brushes are pure functions of `(ctx, x, y, lastX, lastY)` and live in
  a small registry inside the file.
- Undo keeps the last 16 `ImageData` snapshots in memory.

### Modes (`js/modes.js`)
- `PaintModes.palettes[mode]` — color list per mode.
- `PaintModes.tools[mode]`    — ordered list of tool buttons per mode.
- `PaintModes.stamps[set]`    — pixel-art stamps as `{ rows, pal, w, h }`,
  rendered with `drawStamp(ctx, stamp, x, y, scale)`.

### Sound (`js/sounds.js`)
- One lazily-created `AudioContext`, resumed on the first user gesture
  (required by Safari / Chrome auto-play policy).
- Helpers for tones, noise bursts, and frequency sweeps. All effects
  (`stampPlop`, `eraseSwoosh`, `wackyBoing`, `sprayHiss`, `pop`, `rainbow`,
  `explosion`, `ohNo`, `noteForColor`) are composed from those.

---

## Deploying

This repo deploys to **GitHub Pages** via a GitHub Actions workflow that uses
the official `actions/deploy-pages` flow. The workflow lives at
`.github/workflows/deploy.yml` and runs on every push to `main` or this
development branch (and via manual `workflow_dispatch`).

### One-time setup (repo owner, ~30 seconds)

1. Open **Settings → Pages** in the GitHub repo.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push (or re-run the workflow from the **Actions** tab).

That's it. Subsequent pushes auto-deploy to
`https://rodman-ai.github.io/Retro-paint/`. The deploy URL also appears at
the top of every successful run.

The workflow has two jobs:

- **build** — checks out the repo, copies only the deployable files
  (`index.html`, `styles.css`, `js/`, `.nojekyll`) into `_site/`, then
  uploads the directory as a Pages artifact.
- **deploy** — calls `actions/deploy-pages@v4` to publish the artifact.

### Deploying somewhere else

The site is fully static with relative paths, so it drops straight into:
- **Netlify** — drag the folder onto netlify.com/drop, or `netlify deploy`.
- **Vercel** — `vercel --prod` from the repo root.
- **Cloudflare Pages** — connect the repo, leave the build command blank,
  set the output directory to `/`.
- **S3 + CloudFront**, **nginx**, **Caddy**, anything that serves files.

---

## Browser support

Tested working in current Chrome, Firefox, Safari, and Edge on desktop, plus
Mobile Safari (iOS) and Chrome (Android). Requires:

- HTML5 Canvas 2D
- Pointer Events
- Web Audio API (sound effects degrade silently if unavailable)
- ES2017+ (object spread, async/await are not used; arrow functions and
  `const`/`let` are)
