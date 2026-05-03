# Phased Roadmap

Feature numbers reference [`features.md`](./features.md).

## Status snapshot

Branch `claude/review-gh-pages-deployment-2o9as` (rolling up to `main`). What follows is the honest "shipped vs. deferred" picture as of the post-Sprint-4 review (commit `3c9d6a3`). The original Phase 1 + 2 plan was a 9-month roadmap; we've delivered a focused subset.

For the per-sprint changelog, see [`SHIPPED.md`](./SHIPPED.md). For the prioritized next-50, see [`top-50-features.md`](./top-50-features.md).

### Sprints 1–4 (May 2026)

Four feature sprints landed on top of the Phase-1 base. See [`SHIPPED.md`](./SHIPPED.md) for the full report.

| Sprint | Commit | Headline |
|---|---|---|
| Pre-1 | `4296b06` | Menu bar, function picker, undo/redo, copy/paste, exports |
| 1 | `4e3770c` | Range selection, column resize, expanded shortcuts |
| 2 | `99941ad` | Cell formatting model + format toolbar, find & replace |
| 3 | `a4bbc8d` | Conditional formatting, cell comments |
| 4 | `8be066c` | Column-header chevrons, audit-formulas panel |
| Review | `3c9d6a3` | 9 audit fixes + Range/RangeBounds dedupe |

### ✅ Shipped

**Core grid & formulas** — features 1 (basic), 2, 3 (basic), 4 (most of), 9, 10, 11 (non-threaded), 12 (sort/dedupe), 16
- Virtualized HTML/div grid via TanStack Virtual (canvas renderer is deferred)
- Multi-sheet workbooks with tab UI (`apps/web/src/SheetTabs.tsx`)
- Range selection (drag, shift-arrows, click row/col headers), column resize with persisted widths
- Cell formatting model: bold, italic, underline, alignment, text/fill colors, number formats
- Conditional formatting: 9 conditions × 5 preset styles, resolved per-cell at render
- Per-cell comments with corner indicator
- Full undo/redo via workbook-snapshot history (100 steps)
- Find & replace (case-sensitive toggle, replace-all as one undo step)
- Sort and remove-duplicates per column (menu + header chevron)
- 400+ Excel-compatible functions through HyperFormula

**Import / export** — features 26 + complement
- CSV, TSV (PapaParse) and XLSX (SheetJS), multi-sheet import
- CSV (active sheet) and XLSX (whole workbook) export
- File: `apps/web/src/csv.ts`

**Editing UX**
- Menu bar (File · Edit · View · Insert · Format · Data · Help) with keyboard shortcuts
- Format toolbar above the formula bar
- Function picker (50 most-used functions, click-to-insert)
- Audit-formulas panel (lists evaluation errors with click-to-jump)
- TSV-correct copy/paste (Excel-style escaping; round-trip preserves embedded newlines/tabs/quotes)

**Persistence** — feature carried from Phase 0
- File-based store (JSON-on-disk, atomic write) and Postgres adapter behind a single `WorkbookStore` interface
- Picks Postgres when `DATABASE_URL` is set, otherwise file
- Files: `services/api/src/storage.ts`, `services/api/src/storage-pg.ts`
- Debounced 800ms autosave from the client

**AI in-cell functions** — features 51–56, 60
- `=AI`, `=CLASSIFY`, `=EXTRACT`, `=SUMMARIZE`, `=TRANSLATE`, `=SENTIMENT`, `=FORMULA`
- Async-via-cache pattern: HF returns sentinel "…", server fetches via Claude Haiku 4.5, registry notifies → recalc
- Files: `packages/calc/src/ai-plugin.ts`, `services/api/src/ai/cell.ts`

**AI side panel — chat + plan-then-apply** — features 61, 62, partial 63, partial 65, partial 66, partial 80, partial 81
- Workbook-scoped Claude Opus 4.7 agent with adaptive thinking
- Five tools wired: `set_cell`, `add_sheet`, `create_chart` (mutating, recorded as plan), `audit_formulas`, `forecast` (read-only, executed server-side)
- Side panel shows plan as checkboxed step list; user picks which to apply
- Aggressive prompt caching of system prompt + workbook context
- Files: `services/api/src/ai/agent.ts`, `services/api/src/ai/tools.ts`, `apps/web/src/SidePanel.tsx`

**Charts** — features 36 (subset), 37 (via agent)
- Recharts integration: bar / line / area / pie / scatter
- Charts attached per-sheet, rendered in a strip below the grid
- Created exclusively through the agent's `create_chart` tool today (no manual UI yet)
- Files: `apps/web/src/Chart.tsx`, `apps/web/src/ChartStrip.tsx`

### 🚧 Explicitly deferred (NOT shipped)

These are real, non-trivial features. Each is days-to-weeks of work and is not yet attempted.

| # | Feature | Why deferred |
|---|---|---|
| 4 | Cell formatting: fonts, borders, font size, font family | Sprint 2 shipped the model + B/I/U/align/colors/number formats, but typography & borders need more UI surface |
| 5–8, 13, 15 | Named ranges, full Tables, freeze panes, merge cells, pivot tables, sparklines | Each non-trivial; freeze panes was sized in Sprint 5 but punted on virtualizer-rewrite cost |
| 11 | Threaded cell comments with @mentions | Sprint 3 shipped non-threaded comments only |
| 14 | Data validation (lists, rules, custom formulas) | Sprint 5 partial typed but unwired; deferred for inline-dropdown UX work |
| 17 | Dynamic arrays / spill ranges | Requires HyperFormula extension |
| 18–21 | LAMBDA/LET, Python cells, SQL cells, JS cells | Pyodide + DuckDB-WASM + sandboxed JS — multi-week each |
| 22–25 | Regex / FETCH / market data / geospatial functions | Each its own integration |
| 27, 28 | PDF table extraction, image-to-table | Needs vision pipeline |
| 29–35 | DB connectors (Postgres/Snowflake/BigQuery/etc.), cloud storage, REST connector, webhooks, scheduled refresh, mailbox queries, Stripe/Salesforce/HubSpot/Notion/Airtable/Linear/GitHub native connectors | Each its own integration; weeks each |
| 38, 39, 40, 41, 42 | Drag-to-canvas dashboards, geo maps, themes, animated charts, public embeds | UX-heavy |
| 43, 44, 45, 47, 48, 49, 50 | Yjs CRDT real-time edit, presence, granular sharing, version history with diff, suggestion mode, public publish, Slack/Teams integration | Yjs alone is a full sync server + client integration |
| 57, 58, 59 | `=GENERATE_IMAGE`, `=EMBED`, `=SIMILAR` | Need an image pipeline + embeddings provider |
| 64, 67, 68, 69, 70 | MCP tool surface, voice I/O, screen-share coaching, agent memory, scheduled agent jobs | MCP and memory are tractable next; voice/screen-share are large surfaces |
| 72, 74–78 | Dedup, outliers, schema infer, PII redact, fuzzy join, type coercion | Each its own pipeline |
| 82, 83, 84, 85 | What-if + goal-seek, anomaly alerts, PPTX export, "ask your data" with citations | PPTX export needs a generation library |
| 86–92 | Macro recorder, AI workflow builder, form builder, scheduled reports, NL conditional formatting, template marketplace, AI code review | Phase 3 platform work |
| 93–100 | SSO/SAML/SCIM, RBAC, audit log, data residency, DLP, approval workflows, BYOK, Excel two-way sync | Phase 3 enterprise work |

The original phase split for these (Phase 0 spike → Phase 1 MVP → Phase 2 V1 → Phase 3 enterprise) is preserved below for reference.

---

## Original phase split (for reference)

### Phase 0 — Spike (Weeks 1–4)

Prove the grid + formula engine + persistence work end-to-end. Goal: open a CSV, edit cells, see formulas recalc, save/reload from Postgres.

- **Features:** 1, 2, 3, 16, 26 (CSV/XLSX subset)
- **Exit criteria:** 100k-row CSV opens in <2s; edit a cell, formulas recalc, reload preserves state.
- **Status:** ✅ all checked except the 100k-row perf budget (not measured yet).

### Phase 1 — MVP (Months 2–5)

A usable web spreadsheet with the most magical AI features. Goal: an FP&A analyst can replace Google Sheets for 70% of tasks.

- **Features:** 1–17, 26, 36–37, 43–46, 51–55, 60, 61–62, 71, 73, 79, 80
- **Hard cuts:** no Python/SQL cells yet, no enterprise SSO, only CSV/XLSX/Postgres connectors
- **Exit criteria:** "build me a P&L from this CSV" works end-to-end via plan-and-apply; two browsers can edit live.
- **Status:** 🟢 most of P0 is now done (range selection, formatting, conditional formatting, comments, find/replace, sort/dedupe, undo/redo, function picker, audit). Plan-and-apply works. Still missing: freeze panes, data validation list dropdown, full Tables, pivots, named ranges, two-browser live edit (Yjs collab).

### Phase 2 — V1 (Months 6–9)

Become genuinely competitive with Sheets+Gemini and Excel+Copilot for power users.

- **Features:** 18–25, 27–35, 38–42, 47–50, 56–59, 63–70, 72, 74–78, 81–85
- **Status:** 🔴 only forecasting (#81, basic linear regression) and audit (#66) shipped as agent tools. Everything else deferred.

### Phase 3 — V2 (Months 10–14)

Platform & enterprise. Goal: pass enterprise procurement and start moving teams off Excel.

- **Features:** 86–100
- **Status:** 🔴 not started.

---

## Cross-cutting tracks (run in parallel)

- **Performance:** target 60fps scroll on 1M rows by end of Phase 1; recalc <500ms for 100K formulas by end of Phase 2. Not measured yet.
- **Eval & quality:** SpreadsheetBench score tracked weekly from Phase 1 onward; golden-workbook suite (P&L model, CRM extract, marketing dashboard) added to CI. Not started.
- **Security:** threat model from Phase 1; pen test before Phase 3 GA. Not started.

## Suggested next units of work (rank-ordered)

See [`top-50-features.md`](./top-50-features.md) for the prioritized 50-feature build list with effort estimates. The shortest list of immediate-next:

1. **Freeze panes** (#7 in features.md / P0 #4 in top-50) — virtualizer rework needed; high user-noticed value.
2. **Data validation list dropdown** (#14 / P0 #7 in top-50) — Sprint 5 typed but unwired; needs inline-dropdown UX in the virtualized grid.
3. **Yjs collab** (#43, #44) — biggest unlock for the "two browsers edit live" Phase-1 exit criterion.
4. **Python/SQL cells via Pyodide + DuckDB-WASM** (#19, #20) — Quadratic's headline differentiator.
5. **Manual chart-create UI** — currently charts come only from the agent.
6. **Canvas grid renderer** — perf budget for million-row sheets.
7. **One DB connector** (#29 — Postgres) end-to-end with credential vault.
8. **MCP tool surface** (#64) — enables agent to use the same connectors users see.
9. **Persistence: smarter workbook state** — current store writes the entire workbook on every save; needs delta encoding.
