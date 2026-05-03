# Architecture

A stakeholder-grade tour of how AiCell fits together. Two pages. For the per-feature changelog see [`SHIPPED.md`](./SHIPPED.md); for what's deferred see [`roadmap.md`](./roadmap.md).

## Repo layout

```
apps/web/          Vite + React + TypeScript SPA — the UI
packages/shared/   Cross-package types (Workbook, Sheet, Cell, CellFormat, ConditionalRule, RangeBounds, …)
packages/calc/     HyperFormula wrapper + AI cell-function plugin
services/api/      Hono server: workbook persistence + AI endpoints
docs/              Strategy, status, this file
.github/workflows/ Pages deploy
```

The `apps/web` is the centre of gravity (~3 700 LoC across 22 files). `packages/calc` and `services/api` are smaller and load-bearing in narrow ways: `calc` owns the formula engine and the AI sentinel cache; `api` owns persistence and Claude-call plumbing.

## Data flow

```
        ┌──────────────┐  user input    ┌──────────────────┐
        │  Grid / menu │ ─────────────▶ │ useWorkbook hook │  React state, undo/redo
        └──────────────┘                └────────┬─────────┘
                ▲                                │ mirror
                │ render                         ▼
        ┌──────────────┐  computed   ┌──────────────────────┐
        │  CellView    │ ◀────────── │ HyperFormula engine  │  ~400 functions + AI plugin
        └──────────────┘             └──────────┬───────────┘
                                                │ debounced 800 ms
                                                ▼
                                       ┌────────────────┐
                                       │ services/api   │  file or Postgres store
                                       └────────────────┘
```

The **single source of truth is React state in `useWorkbook`** — the engine is a calculation cache, and the API is a persistence sink. Every mutator (set cell, apply format, add conditional rule, set comment, etc.) updates state first, then mirrors into HyperFormula. A `version` tick is bumped after every mutation; the Grid invalidates `getComputed` on each tick.

### Undo / redo

Snapshot-based, capped at 100 entries. `useWorkbook` keeps `pastRef` and `futureRef` arrays of full `Workbook` clones (`structuredClone`). Every mutator calls `pushHistory()` *synchronously* before `setWorkbook(...)` to capture pre-mutation state. `undo` / `redo` swap the active snapshot, rebuild the engine via `reloadEngine`, and bump version. The choice of snapshot-over-command-stack keeps the model simple at the cost of memory; the 100-step cap keeps it bounded.

### AI cell registry (the sentinel pattern)

`packages/calc/src/ai-plugin.ts` registers seven Claude-backed functions (`AI`, `CLASSIFY`, `EXTRACT`, `SUMMARIZE`, `TRANSLATE`, `SENTIMENT`, `FORMULA`) with HyperFormula. On first evaluation the plugin returns the sentinel `AI_LOADING` and asynchronously calls the registered runner (the API server). When the answer arrives, the registry notifies subscribers — `useWorkbook` calls `engine.recalculate()` and bumps version, so all dependent cells refresh. Aggressive prompt caching of the system prompt + workbook context lives in `services/api/src/ai/cell.ts`.

### Persistence

The API exposes `WorkbookStore` (file-backed JSON or Postgres, picked by `DATABASE_URL`). The client autosaves the entire workbook 800 ms after the last edit. Crude but correct; delta encoding is on the backlog.

### Formatting & conditional formatting

`Cell.format` (typography, alignment, colors, number format) merges with any matching `ConditionalRule` styles at render time via `resolveFormat(base, rules, row, col, raw, value)` in `apps/web/src/conditional.ts`. Rules are ordered; later matches override earlier ones. Both are persisted as part of the `Workbook` JSON.

## Where each feature lives

| Feature | Primary file(s) |
|---|---|
| Menu bar | `apps/web/src/MenuBar.tsx`, mounted by `App.tsx` |
| Format toolbar | `apps/web/src/FormatToolbar.tsx` |
| Function picker | `apps/web/src/FunctionPicker.tsx` + `apps/web/src/functions.ts` |
| Find & replace | `apps/web/src/FindReplace.tsx` |
| Conditional formatting | `apps/web/src/ConditionalFormatModal.tsx` + `apps/web/src/conditional.ts` |
| Comments | `apps/web/src/CommentModal.tsx`, `Cell.comment` in shared |
| Audit panel | `apps/web/src/AuditPanel.tsx` |
| Range selection / drag / resize | `apps/web/src/Grid.tsx`, `apps/web/src/clipboard.ts` |
| Undo / redo / history | `apps/web/src/useWorkbook.ts` |
| Imports / exports | `apps/web/src/csv.ts` |
| Sheet tabs | `apps/web/src/SheetTabs.tsx` |
| Charts | `apps/web/src/Chart.tsx` + `apps/web/src/ChartStrip.tsx` |
| Side-panel agent | `apps/web/src/SidePanel.tsx`, `services/api/src/ai/agent.ts`, `tools.ts` |
| AI cell functions | `packages/calc/src/ai-plugin.ts`, `services/api/src/ai/cell.ts` |
| Cross-package types | `packages/shared/src/index.ts` |
| Persistence | `services/api/src/storage.ts`, `storage-pg.ts`, `app.ts` |

## Load-bearing for the differentiation thesis

- **Plan-then-apply agent.** `services/api/src/ai/agent.ts` runs Claude Opus 4.7 with adaptive thinking and five tools (`set_cell`, `add_sheet`, `create_chart`, plus read-only `audit_formulas` and `forecast`). The user reviews each step before any edit lands. This is the single biggest behavioural differentiator vs. Excel Copilot's dialog-only plan mode.
- **AI cell registry.** `=AI()` and friends are first-class formulas that share the recalc graph. Competitors generally bolt these on as side calls; ours are part of the sheet's evaluation order, with prompt caching for cost control.
- **MCP-readiness.** Architectural decision (not yet implemented): the agent's tool surface is normalized so plugging in Model Context Protocol servers later is mostly a registry change in `services/api/src/ai/tools.ts`. Tracked as P1 #11.
- **Stay-skinny chrome.** A six-menu bar, not a ribbon. Investment goes into the `Insert → Function` picker and the side-panel intro instead — the places where chat is genuinely worse than UI.

## Boundary lines (what each piece never touches)

- **`packages/calc` never** reaches into React or fetches over the network. The AI sentinel pattern means the runner is injected; the calc engine is otherwise purely functional.
- **`services/api` never** owns workbook structure beyond opaque JSON. The shape lives in `@aicell/shared`. The API stores blobs and runs Claude — that's it.
- **The model lives in the client** so undo, formatting, conditional rules, and selection don't round-trip the network. Persistence is downstream of state, not on the critical path.

## Known fragility / debt

After the post-Sprint-4 audit pass (`3c9d6a3`), most of what's left is scope, not bugs:

- **No frontend tests.** Calc engine and API have vitest suites (55 tests). The `apps/web` package has zero — every Grid / hook / modal change is verified by manual run + typecheck. Adding component tests is its own scoped pass.
- **Bundle is fat.** ~1.7 MB minified (~485 KB gzipped). HyperFormula + xlsx + Recharts dominate. Code-splitting the agent panel and the chart strip would shave it, deferred until perf becomes user-visible.
- **Single-cell selection assumption persists in a few menu actions.** The Data menu's "Sort by selected column" reads the *anchor* column even with a multi-cell range selected. Fine for now; tighten if it confuses someone.
- **Persistence writes the whole workbook on every save.** Delta encoding is item #7 on the next-units list in `roadmap.md`.
- **Freeze panes is sized M, not S.** The virtualizer's transform-positioning conflicts with sticky-across-freeze; ship requires a split-pane render. P0 #4 is still on the deck.
- **Data validation list dropdown** needs an inline popover inside the virtualized grid. Sprint 5 typed `Cell.validation` then discarded the partial during the review pass. P0 #7 is still on the deck.

For the corresponding 50-feature build list with sprint sequencing, see [`top-50-features.md`](./top-50-features.md).
