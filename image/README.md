# Rodman Image Editor

A browser-based image editor with a Photoshop-style workspace — menu bar,
docked tools, layers panel, document tabs, adjustment dialogs, history,
snapshots — that ships **nine retro paint emulators as bonus modes**:
MS Paint 95, Mario Paint, Kid Pix, MacPaint, Tux Paint, Paint Shop Pro,
Procreate, Aseprite, and GIMP.

No build step. No dependencies. Just static HTML, CSS, and vanilla JavaScript
talking to the HTML5 Canvas and Web Audio APIs.

| Mode               | Inspiration                | Where           |
| ------------------ | -------------------------- | --------------- |
| **Photoshop** *(default)* | Modern PS-style workspace | Default mode   |
| MS Paint 95        | Microsoft Paint on Win 95  | Bonus menu      |
| Mario Paint        | Mario Paint on the SNES    | Bonus menu      |
| Kid Pix            | Kid Pix on classic Mac OS  | Bonus menu      |
| MacPaint           | MacPaint on classic Mac    | Bonus menu      |
| Tux Paint          | Tux Paint for kids         | Bonus menu      |
| Paint Shop Pro     | JASC Paint Shop Pro        | Bonus menu      |
| Procreate          | Procreate on iPad          | Bonus menu      |
| Aseprite           | Aseprite pixel-art editor  | Bonus menu      |
| GIMP               | GNU Image Manipulation Program | Bonus menu  |

---

## Live demo

Once GitHub Pages is enabled (see [Deploying](#deploying)), the app is
served at:

    https://rodman-ai.github.io/RodmanOffice/image/

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

## The Photoshop workspace

Photoshop mode is the default. The layout:

- **Menu bar** — File, Edit, Image, Layer, Select, Filter, View, Window,
  Help, About, **Bonus**.
- **Tools panel (left)** — 22 canonical Photoshop tools: Marquee, Lasso,
  Wand, Crop, Eyedropper, Brush, Pencil, Eraser, Bucket, Gradient,
  Airbrush, Smudge, Clone, Dodge, Burn, Pen, Text, Line, Rectangle (out +
  filled), Oval (out + filled).
- **Canvas (center)** — HTML5 Canvas with Photoshop-style dark grey backing
  and a soft drop shadow on the document.
- **Palette + Layers (right)** — small swatches strip + the docked Layers
  panel (add / duplicate / merge down / delete).
- **Status bar (bottom)** — current tool, cursor position, mode label.
- **Dark charcoal theme** with blue accent (`#2d6cdb`).

### What lives where in the menu bar

| Menu     | Items                                                        |
| -------- | ------------------------------------------------------------ |
| File     | New Canvas · Open · Save PNG · Save HD · Clear · Reset All   |
| Edit     | Undo · Redo · Keyboard Shortcuts · History · Snapshots       |
| Image    | Image Size · Adjustments (Levels / HSL / Color Balance / Threshold) · Replay |
| Layer    | New · Duplicate · Merge Down · Delete                        |
| Select   | (selection ops via the Marquee tool)                         |
| Filter   | Filter Gallery · Invert · Grayscale · Sepia · Posterize · Blur · Brighten · Darken |
| View     | Zoom In / Out / Reset · Pixel Grid · Mirror · BG Pattern     |
| Window   | History · Snapshots · Mute / Unmute Sound                    |
| Help     | Keyboard Shortcuts & help                                    |
| About    | About this app                                               |
| **Bonus**| **Retro modes** — MS Paint 95 · Mario Paint · Kid Pix · MacPaint · Tux Paint · Paint Shop Pro · Procreate · Aseprite · GIMP |

---

## Bonus retro modes

Each retro mode swaps the palette, tool list, themed chrome, sound effects,
and chrome-only flourishes (Mario stamps, Kid Pix dynamite, Tux Paint
mascot, MacPaint 1-bit dither, etc.). Pick any of them from the **Bonus**
menu — the canvas content carries through, and you can hop back to
Photoshop the same way.

Highlights:

- **MS Paint 95** — Win 95 chrome, beveled gray buttons, classic 28-color
  palette. Pencil, brush, eraser, fill, eyedropper, spray, line, shapes
  with live drag-preview.
- **Mario Paint** — Candy-pink theme. **Musical Pencil** maps every palette
  color to a Web Audio note. 8 hand-built pixel-art stamps.
- **Kid Pix** — 90s Mac look. Six wacky brushes, seven cartoon stamps,
  **Dynamite** (animated explosion → wipe), **Oh No!** splash.
- **MacPaint** — 1-bit B&W with FatBits, lasso, Goodies (invert / flip /
  rotate / threshold) and dithered fills.
- **Tux Paint** — Bright primaries for kids, magic effects (rainbow, blur,
  sparkles, foam, mosaic, drip, fisheye, cartoon, emboss, snow…) and a
  penguin mascot.
- **Paint Shop Pro** — Pro toolbox: marquee, lasso, wand, crop, clone,
  dodge, burn, saturate, color-replace, plus Levels / HSL / Color Balance
  / Threshold dialogs and a layers panel.
- **Procreate** — Touch-first chunky toolbar, QuickShape, StreamLine,
  ColorDrop fill.
- **Aseprite** — Pixel-art focused, indexed PICO-8-style palette, tile
  mode, color cycling, GIF export.
- **GIMP** — Quick Mask, Script-Fu, paths, brush dynamics, vector pen,
  layer styles, smart objects, timeline, batch actions, and a hundred
  more tools.

---

## Cross-cutting features

- HTML5 Canvas (default 640 × 480, resizable via **File → New Canvas**)
  with responsive aspect-ratio-preserving scale.
- Pointer Events for unified mouse / touch / pen / stylus input, with
  **stylus pressure** mapped to brush width.
- **Undo + Redo** with 16-step history (`Ctrl+Z`, `Ctrl+Shift+Z` / `Ctrl+Y`).
- **Open Image** — load any PNG/JPG into the canvas to trace, color, remix.
- **Save PNG** (`Ctrl+S`) — Shift-click for HD export at any scale.
- **Live brush cursor preview**, **recent colors** strip,
  **custom HSV color picker**, **brush opacity slider**.
- **Symmetry / mirror** — Off → H → V → Both → 4-way → 8-way kaleidoscope.
- **Shift-constrain** — perfect squares, circles, 0/45/90° lines.
- **Pixel grid** overlay toggle (`G`).
- **Pan & zoom** — Ctrl/Cmd + scroll to zoom (`+` / `−` / `0`),
  hold Space and drag (or middle-click) to pan.
- **Image filters** — invert, grayscale, sepia, posterize, blur, brighten,
  darken (Filter menu).
- **Adjustments** — Levels, HSL, Color Balance, Threshold (Image menu).
- **Layers** — multi-layer documents with opacity / blend / merge down.
- **History** + **Snapshots** panels.
- **Animation flipbook** — `Shift + F` opens a frame strip with
  add / delete / play and onion-skin preview.
- **Sound mute** toggle (`Shift+M`), persisted.
- **Autosave** — debounced 1.5 s after every stroke; reloads offer to restore.
- **Installable PWA** with offline support (manifest + service worker).
- **Last-used mode**, brush size, opacity, recent colors all persist.
- **Reset all** — Shift-click ✕ Clear (or *File → Reset All Settings*).

---

## Keyboard shortcuts

### Tools (Photoshop mode)
| Key | Tool          | Key | Tool      |
| --- | ------------- | --- | --------- |
| `M` | Marquee       | `B` | Brush     |
| `L` | Lasso         | `N` | Pencil    |
| `W` | Wand          | `E` | Eraser    |
| `C` | Crop          | `S` | Clone     |
| `I` | Eyedropper    | `O` | Dodge     |
| `P` | Pen           | `T` | Text      |
| `U` | Rectangle     |     |           |

`1`–`9` select the first nine tools in the toolbox by position.

### Modes
| Key                   | Action                                              |
| --------------------- | --------------------------------------------------- |
| Bonus → *(any mode)*  | Switch to a retro mode                              |
| `1`–`9` *(retro modes only)* | Cycle the nine retro modes by position       |

### Edit / view
| Key                       | Action                                    |
| ------------------------- | ----------------------------------------- |
| `Ctrl/Cmd + Z`            | Undo                                      |
| `Ctrl/Cmd + Shift + Z`    | Redo (also `Ctrl + Y`)                    |
| `Ctrl/Cmd + S`            | Save canvas as PNG                        |
| `Ctrl/Cmd + O`            | Open image                                |
| `Ctrl/Cmd + A/C/X/V/D/I`  | Select all / copy / cut / paste / deselect / invert |
| `Shift + M`               | Mute / unmute sound                       |
| `Y`                       | Cycle symmetry mirror (Off → H → V → Both → 4-way → 8-way) |
| `G`                       | Toggle pixel grid                         |
| `V`                       | Cycle background pattern                  |
| `+` / `−` / `0`           | Zoom in / out / reset                     |
| `Space` + drag            | Pan (also middle-click drag)              |
| `Shift` + drag (shape)    | Constrain to square / circle / 45° line   |
| `Shift + F`               | Open animation flipbook                   |
| `?`                       | Help dialog                               |

In retro modes, each mode has its own per-mode tool letter shortcuts —
hover any tool button to see its hint.

---

## Architecture

```
image/
├── index.html               # Page shell + menu bar markup
├── styles.css               # Layout + Photoshop theme + 9 retro themes
├── manifest.webmanifest     # PWA manifest (installable app)
├── sw.js                    # Service worker (offline cache)
├── icon.svg                 # PWA icon
├── js/
│   ├── app.js               # Canvas engine, tools, mode switching
│   ├── modes.js             # Palettes, tool lists, pixel-art stamps
│   ├── menus.js             # Menu bar dropdowns, dispatch
│   └── sounds.js            # Web Audio synth (notes + SFX)
└── README.md
```

### Drawing engine (`js/app.js`)
- A single `<canvas>` at logical 640 × 480.
- All tools implement `{ down(p), move(p)?, up(p)? }` and are dispatched
  from unified Pointer Event handlers.
- Multi-layer documents (Photoshop / PSP modes) — each layer is its own
  offscreen canvas; the visible canvas is composited every frame.
- Undo keeps the last 16 `ImageData` snapshots in memory.
- Tools that aren't reachable from the toolbar are exposed to the menu
  bar through a small `window.RP` bridge (Levels, HSL, Color Balance,
  Threshold, History, Snapshots, layer ops, filters, etc.).

### Modes (`js/modes.js`)
- `PaintModes.palettes[mode]` — color list per mode.
- `PaintModes.tools[mode]`    — ordered list of tool buttons per mode.
- `PaintModes.stamps[set]`    — pixel-art stamps as `{ rows, pal, w, h }`,
  rendered with `drawStamp(ctx, stamp, x, y, scale)`.

### Menu bar (`js/menus.js`)
- Reusable click/hover dropdown behavior.
- Declarative menu trees for File / Edit / Image / Layer / Select /
  Filter / View / Window. Each item dispatches by clicking an existing
  toolbar button (`document.getElementById(id).click()`) or by calling a
  function on `window.RP`.
- Bonus dropdown items keep the original `class="mode-btn"` and
  `data-mode` attributes so the existing `setMode()` click handler in
  `app.js` continues to wire them up — the menu is purely a re-shell.

### Sound (`js/sounds.js`)
- One lazily-created `AudioContext`, resumed on the first user gesture
  (required by Safari / Chrome auto-play policy).
- Helpers for tones, noise bursts, and frequency sweeps. All effects
  (`stampPlop`, `eraseSwoosh`, `wackyBoing`, `sprayHiss`, `pop`,
  `rainbow`, `explosion`, `ohNo`, `noteForColor`) are composed from those.

---

## Deploying

This repo deploys to **GitHub Pages** via a GitHub Actions workflow at
`.github/workflows/pages.yml`. The workflow rsyncs the repo into `_site/`
on each push to `main` and the active development branch.

### One-time setup (repo owner, ~30 seconds)

1. Open **Settings → Pages** in the GitHub repo.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push (or re-run the workflow from the **Actions** tab).

### Deploying somewhere else

The site is fully static with relative paths, so it drops straight into:
- **Netlify** — drag the folder onto netlify.com/drop, or `netlify deploy`.
- **Vercel** — `vercel --prod` from the repo root.
- **Cloudflare Pages** — connect the repo, leave the build command blank,
  set the output directory to `/`.
- **S3 + CloudFront**, **nginx**, **Caddy**, anything that serves files.

---

## Browser support

Tested working in current Chrome, Firefox, Safari, and Edge on desktop,
plus Mobile Safari (iOS) and Chrome (Android). Requires:

- HTML5 Canvas 2D
- Pointer Events
- Web Audio API (sound effects degrade silently if unavailable)
- ES2017+ (object spread, async/await are not used; arrow functions and
  `const`/`let` are)
