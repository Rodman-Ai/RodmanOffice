# AiCell

An AI-forward, browser-first spreadsheet — a Microsoft Excel clone built around Claude from day one.

## Repo layout

```
apps/web/          Vite + React + TypeScript SPA (the UI you see)
packages/shared/   Cross-package types (Workbook, Sheet, Cell, ChartSpec)
packages/calc/     HyperFormula wrapper + AI cell-function plugin
services/api/      Hono server: workbook persistence + AI endpoints
docs/              Strategy docs (competitor analysis, features, roadmap)
.github/workflows/ CI / Pages deployment
```

## What's built

- **Grid UX**: virtualized scroll, multi-sheet workbooks, range selection (drag, shift+arrows, click row/col headers for whole row/col), per-column resize, column-header chevron with sort and remove-duplicates.
- **Menus**: File · Edit · View · Insert · Format · Data · Help, with keyboard shortcuts (⌘Z / ⌘⇧Z, ⌘C / ⌘X / ⌘V, ⌘B / ⌘I / ⌘U, ⌘F, ⌘A, ⌘/, ⌘; , ⌘⇧;, ⇧F3, Cmd+Home/End).
- **Editing**: full undo/redo (snapshot history, 100 steps), copy/cut/paste with TSV expansion, find & replace (case-sensitive, replace-all as one undo step), CSV/XLSX import + export.
- **Formatting**: cell-format model (bold, italic, underline, alignment, text/fill colors, number formats — General / Number / Currency / Percent / Date / Datetime), format toolbar above the formula bar.
- **Conditional formatting**: 9 condition types (>, ≥, <, ≤, =, ≠, between, contains, empty/non-empty) × 5 preset styles, applied to ranges and resolved per-cell at render time.
- **Comments**: per-cell text with a corner indicator and hover tooltip.
- **Function picker**: Insert → Function… opens a searchable modal of the 50 most-used spreadsheet functions, click-to-insert.
- **Audit panel**: Help → Audit formulas walks every formula in every sheet, lists evaluation errors, click a cell ref to jump.
- **Formulas**: ~400 Excel-compatible functions via HyperFormula.
- **AI cell functions**: `=AI`, `=CLASSIFY`, `=EXTRACT`, `=SUMMARIZE`, `=TRANSLATE`, `=SENTIMENT`, `=FORMULA` (Claude Haiku 4.5 with prompt caching).
- **Plan-then-apply agent**: Claude Opus 4.7 with tool use proposes a plan (set_cell / add_sheet / create_chart) plus read-only audit/forecast helpers; user reviews and applies. Side panel empty-state has five click-to-prefill example prompts.
- **Charts**: bar / line / area / pie / scatter via Recharts, attached per-sheet.
- **Persistence**: file-based store by default; Postgres adapter when `DATABASE_URL` is set.

See [`docs/SHIPPED.md`](docs/SHIPPED.md) for the per-sprint changelog, [`docs/architecture.md`](docs/architecture.md) for how the pieces fit together, and [`docs/roadmap.md`](docs/roadmap.md) for "shipped vs. deferred". Big deferred items: freeze panes, data-validation dropdown, Yjs real-time collab, Python/SQL/JS code cells, DB/SaaS connectors, voice, MCP, full enterprise/SSO.

## Local development

```sh
pnpm install
pnpm dev            # boots api on :3000 and web on :5173 in parallel
# or run them separately:
pnpm dev:api
pnpm dev:web
```

To enable AI features, set `ANTHROPIC_API_KEY` in the API service environment before booting:

```sh
ANTHROPIC_API_KEY=sk-ant-... pnpm dev:api
```

Without a key, the side panel and AI cell functions surface a clear "AI is not configured" notice; the rest of the app works normally.

## Deployment

### GitHub Pages (static frontend, demo mode)

A workflow at `.github/workflows/pages.yml` builds `apps/web` and publishes it to GitHub Pages on every push to `main` (or via manual trigger from the Actions tab).

The Pages build is **demo mode**: `VITE_API_BASE` is empty, so the app skips every backend call. Persistence and AI features are disabled — you get a working spreadsheet UI and the formula engine, no chat panel, no autosave. The toolbar shows "Demo mode (no backend)".

**One-time setup:**
1. In the repo settings → **Pages** → set **Source** to **GitHub Actions**.
2. Merge this branch (or any branch with the workflow) to `main`. The workflow runs and the site appears at `https://<owner>.github.io/AiCell/`.
3. To deploy from a feature branch for preview, run the workflow manually from the **Actions** tab via the **Run workflow** button.

If your repo is forked under a different name, update `VITE_BASE` in the workflow to `/<your-repo-name>/`.

### Pages with a hosted backend

To run a real (non-demo) deployment on Pages, host the API somewhere reachable (Fly.io, Railway, Render, etc.) and set `VITE_API_BASE` to its absolute URL in the workflow. **Always set both env vars below on the API server before exposing it publicly** — without them the API is open to the world and any origin can spend your Anthropic key.

```yaml
# .github/workflows/pages.yml
env:
  VITE_BASE: /AiCell/
  VITE_API_BASE: https://api.example.com
  VITE_API_TOKEN: ${{ secrets.AICELL_API_TOKEN }}   # must match server
```

```sh
# On the API host
ANTHROPIC_API_KEY=sk-ant-...
AICELL_ALLOWED_ORIGINS=https://rodman-ai.github.io   # comma-separated allowlist
AICELL_API_TOKEN=$(openssl rand -hex 32)             # bearer token shared with web client
pnpm dev:api
```

CORS defaults to localhost-only (`5173`/`4173`); requests from any other origin are dropped. The bearer token gates `/workbooks/*` and `/ai/*` (but not `/health`). Both can be omitted in dev.

## Differentiation thesis

Claude-native agent that **plans → diffs → applies** edits with full undo, paired with a code-cell grid (Python/SQL/JS — deferred), MCP connectors as a first-class primitive (deferred), and the cleanest collab UX in the category (deferred).

## Targets

- **Form factor:** Web app (browser-first)
- **AI:** Anthropic Claude (Opus 4.7 for the agent, Haiku 4.5 for in-cell)
- **Phase 1 user:** an FP&A analyst who can replace Google Sheets for 70% of tasks
- **Phase 2 quality bar:** ≥75% on SpreadsheetBench
