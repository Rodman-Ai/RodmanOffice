# Top 50 features — what to build next, why, and from whom

A focused build plan: which 50 features carry the most weight given the competitive landscape, ordered by ship-priority. Pairs with [`features.md`](./features.md) (the 100-item backlog) and [`competitor-analysis.md`](./competitor-analysis.md) (the qualitative landscape).

## How this list is built

For each candidate feature we ask:
1. **Do users notice when it's missing?** — table-stakes vs. nice-to-have.
2. **Who already has it?** — Excel + Copilot, Sheets + Gemini, Quadratic, Sourcetable, Numerous, Rows.
3. **Does it support our differentiation thesis?** — Claude-native plan-then-apply agent · code cells · MCP connectors · real-time collab · in-cell AI.
4. **What's the build cost?** — S (≤ 1 day) · M (≤ 1 week) · L (≤ 2 weeks) · XL (multi-week).

We then group into four shipping tiers. Higher tier = ship first.

## Competitor feature matrix (what they have, where we stand)

Y = solid · ~ = partial / weak · — = absent. AiCell column reflects what's on `main` after the menubar / function-picker / undo-redo PR (commit `4296b06`).

| Capability | Excel+Copilot | Sheets+Gemini | Quadratic | Sourcetable | Numerous | AiCell today |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Conventional menus | Y (ribbon) | Y | ~ (palette-led) | ~ | n/a (plug-in) | Y |
| Undo / redo | Y | Y | Y | Y | n/a | Y |
| Copy / paste / TSV expand | Y | Y | Y | Y | Y | Y |
| Multi-cell drag selection | Y | Y | Y | Y | n/a | Y |
| Cell formatting (bold/colors/number) | Y | Y | Y | Y | n/a | Y |
| Conditional formatting | Y | Y | ~ | Y | n/a | Y |
| Find & replace | Y | Y | Y | Y | n/a | Y |
| Freeze panes | Y | Y | Y | Y | n/a | — |
| Tables (auto-expand, headers) | Y | ~ | ~ | Y | n/a | — |
| Pivot tables | Y | Y | ~ | Y | n/a | — |
| Charts (bar/line/pie/etc.) | Y | Y | Y | Y | n/a | ~ (basic, AI-driven) |
| 500+ formulas | Y | Y | Y | Y | n/a | Y (HF built-ins) |
| LAMBDA / LET / named functions | Y | Y | Y | ~ | n/a | Y (HF) |
| Python cells | — | — | Y | ~ | — | — |
| SQL cells | — | — | Y | Y | — | — |
| `=AI()` / agent in cell | Y | Y | Y | Y | Y | Y |
| Plan-then-apply chat agent | Y | Y | Y | ~ | — | Y |
| MCP connector support | — | — | Y | — | — | — |
| Real-time multi-cursor | ~ | Y | ~ | Y | n/a | — |
| Comments | Y | Y | Y | Y | n/a | Y (non-threaded) |
| @-mentions in comments | Y | Y | Y | Y | n/a | — |
| Version history | Y | Y | Y | Y | n/a | — |
| CSV / XLSX import | Y | Y | Y | Y | Y | Y |
| CSV / XLSX export | Y | Y | Y | Y | n/a | Y |
| DB connectors (Postgres/BQ/etc.) | ~ | ~ | Y | Y | — | — |
| REST / webhook connectors | ~ | ~ | Y | Y | ~ | — |
| Public embed / read-only share | — | Y | ~ | Y | — | — |
| SSO / SAML / SCIM | Y | Y | ~ | Y | — | — |
| Audit log | Y | Y | ~ | Y | — | — |
| Data validation rules | Y | Y | ~ | Y | n/a | — |
| Audit my formulas (errors view) | ~ | ~ | ~ | ~ | n/a | Y |

The matrix shows the obvious truth: AiCell ships menus, undo/redo, formulas, exports, and plan-then-apply AI — but is missing the rest of the **Phase-1 grid UX** that any spreadsheet user reflexively reaches for (selection ranges, formatting, filter, freeze, find/replace). That's where most of the P0 list goes.

## Tier P0 — Ship next (10 features)

These are the missing-ness moments — the things users hit in the first 60 seconds and assume are broken if they don't work.

**Status: 8 of 10 done.** ✅ shipped · ◐ partial · ⏳ deferred. Commit refs are the SHA where the feature landed.

| # | Status | Feature | Why now | Effort | Where |
|---|:-:|---|---|---|---|
| 1 | ✅ | Multi-cell drag-selection (rectangular + shift-click + click row/col headers) | Unblocks copy/paste, sort, formatting; everyone has it. | M | Sprint 1 (`4e3770c`) |
| 2 | ✅ | Cell formatting model — bold / italic / color / background / number format | The single biggest visible gap; needed before pivot, conditional fmt, charts feel real. | L | Sprint 2 (`99941ad`) |
| 3 | ✅ | Find & replace (current sheet, plain text + case-sensitive) | One-click in every competitor; we expose the menu item but it's a stub. | M | Sprint 2 (`99941ad`) — regex/all-sheet scope still deferred |
| 4 | ⏳ | Freeze rows / columns + split view | First thing you do on imported data over 50 rows. | M (was sized S) | Sprint 5 punted; needs virtualizer rework |
| 5 | ✅ | Column resize | Default 100px columns hide imported data; users assume the import broke. | S | Sprint 1 (`4e3770c`) — auto-fit & row resize still deferred |
| 6 | ✅ | Conditional formatting (rules + presets) | Excel/Sheets parity; pairs naturally with our agent ("highlight outliers"). | L | Sprint 3 (`a4bbc8d`) — AI rule generation still TBD |
| 7 | ⏳ | Data validation (lists, ranges, custom formulas) | Required for any shared workbook used as a form. | M | Sprint 5 partial typed but unwired (discarded `3c9d6a3`); needs inline-dropdown UX |
| 8 | ◐ | Comments on cells | Collab signal; cheap to ship vs. value. | M | Sprint 3 (`a4bbc8d`) — non-threaded only; @mentions deferred |
| 9 | ◐ | Native column sort + filter UI (header chevrons) | Our Data menu has a stub; users expect spreadsheet headers. | M | Sprint 4 (`8be066c`) — sort + dedupe shipped, filter half deferred |
| 10 | ✅ | Keyboard shortcuts (⌘Z, ⌘C/X/V, ⌘B/I/U, ⌘F, ⌘A, ⌘/, ⌘;, ⌘⇧;, ⇧F3, Home/End, ⌘Home/End) | Power users instantly notice when shortcuts they have in muscle memory don't fire. | S | Sprint 1 (`4e3770c`) + Sprint 2 (`99941ad`) — Cmd+1 number format & F2-rename still deferred |

## Tier P1 — Differentiator (15 features)

Where AiCell can leapfrog. These are the reasons someone would switch from Sheets, not the reasons they'd accept switching.

**Status: 2 of 15 done.**

| # | Status | Feature | Competitor reference | Effort | Where |
|---|:-:|---|---|---|---|
| 11 | ⏳ | **MCP connectors as a first-class tool surface** — same connector library for the user and the Claude agent | Quadratic has it for code cells; nobody else | L | — |
| 12 | ⏳ | **Plan diffs, not just plan steps** — show before / after for every cell the agent will touch, with side-by-side preview | Excel Copilot plan mode is the closest, weaker | M | — |
| 13 | ⏳ | **Per-workbook + per-user agent memory** — conventions, named ranges, formatting preferences | None ship this well | M | — |
| 14 | ⏳ | **`=AI(prompt, range)` with prompt caching** + cache hit indicator | We have `=AI()`; competitors don't expose caching | S | Caching shipped pre-sprints; UI indicator TBD |
| 15 | ✅ | **`=FORMULA("show me last week's revenue by region")`** — natural language → formula text the user inserts | GPTExcel/Ajelix do this badly | S | `packages/calc/src/ai-plugin.ts` (pre-sprints) |
| 16 | ⏳ | **Smart Fill from examples** (Flash Fill on steroids) — type 2 examples in column B, AI fills the rest | Excel has Flash Fill; ours uses Claude few-shot | M | — |
| 17 | ⏳ | **`=EMBED()` + `=SIMILAR()`** — vector embeddings + semantic match in-cell | Numerous/Quadratic don't | M | — |
| 18 | ✅ | **Audit my formulas** — agent flags broken refs, type errors, perf hot spots | None ship this | M | Sprint 4 (`8be066c`) — Help → Audit formulas |
| 19 | ⏳ | **One-click clean** — dates, names, addresses, phone, email, currency | Excel data prep is manual; Sheets weak | M | — |
| 20 | ⏳ | **Auto fuzzy-join** — agent suggests join key with confidence | Sourcetable does basic; we can be cleaner | M | — |
| 21 | ⏳ | **Schema inference + "table-from-mess"** — turn a copy/pasted blob into a normalized table | None | M | — |
| 22 | ⏳ | **Forecasting (`=FORECAST(range, periods)`)** with confidence bands | Sheets has FORECAST.ETS; we add LLM ensemble | L | Basic linear-regression forecast tool exists for the agent only |
| 23 | ⏳ | **Anomaly detection on scheduled refresh** with email/Slack alerts | None ship this on grid data | L | — |
| 24 | ⏳ | **Voice input + spoken summaries** in the agent panel | Excel Copilot has spoken responses on mobile | M | — |
| 25 | ⏳ | **One-click PPTX exec summary deck** from a sheet | Bricks/Endex do narrow versions | L | — |

## Tier P2 — Power features (15)

What advanced users and analysts switch for. These compound over time and lock in users with workflows.

**Status: 0 of 15 done.** All deferred ⏳.

| # | Feature | Competitor reference | Effort |
|---|---|---|---|
| 26 | Python cells (Pyodide in browser, server runtime for heavy jobs) | Quadratic flagship | XL |
| 27 | SQL cells (DuckDB-WASM against in-sheet tables + remote DBs) | Quadratic, Sourcetable | L |
| 28 | JavaScript/TypeScript cells with sandbox | Quadratic | L |
| 29 | Pivot tables with drill-down + AI-generated pivot from prompt | Excel/Sheets | L |
| 30 | Tables (auto-expand, header row, totals row, structured refs `Table[Col]`) | Excel | M |
| 31 | Native Postgres / MySQL / Snowflake / BigQuery connectors | Quadratic, Sourcetable | XL |
| 32 | REST API connector with OAuth / API-key / header auth + caching | Quadratic, Sourcetable | L |
| 33 | Inbound webhooks → append rows | Rows had this | M |
| 34 | Scheduled refresh with diff notifications | Excel/Sheets via Power Automate | M |
| 35 | Geo maps with auto-geocoding + choropleth | Sheets weak, none great | L |
| 36 | 30+ chart types incl. heatmap, treemap, sankey, candlestick | Excel/Sheets | L |
| 37 | Dashboard builder — drag charts to a canvas with cross-filters | Rows-style | XL |
| 38 | Public embed: read-only dashboard URLs + iframes | Rows, Sheets | M |
| 39 | Real-time multi-cursor editing (Yjs CRDT) + presence + follow-mode | Sheets, Quadratic | XL |
| 40 | Version history with named snapshots and visual diff | Sheets, Excel | L |

## Tier P3 — Enterprise & moat (10)

The features that close 5-figure deals and prevent customer churn at scale.

**Status: 0 of 10 done.** All deferred ⏳.

| # | Feature | Competitor reference | Effort |
|---|---|---|---|
| 41 | SSO / SAML / SCIM provisioning + MFA | Excel, Sheets, Sourcetable | L |
| 42 | RBAC with cell- and column-level permissions | Excel partial | L |
| 43 | Audit log with Claude-summarized activity digests | Excel/Sheets enterprise | M |
| 44 | Data residency selection (US / EU / regional) | Excel, Sheets | L |
| 45 | PII / DLP policies enforced at edit-time and on AI calls | Excel Copilot has framework | L |
| 46 | Workbook approval workflows (lock + sign-off + Slack inline approval) | None integrated | L |
| 47 | Encryption at rest, per-workspace KMS, BYOK | Excel/Sheets enterprise | L |
| 48 | Two-way Excel/Sheets sync — open `.xlsx`, edit, save back without lossy round-trip | None reliable | XL |
| 49 | Workbook PR-style change requests with AI code review | None | L |
| 50 | Granular sharing — workbook / sheet / range / cell with link & permission | Sheets has range, no cell | M |

## Sprint history

- **Pre-1** (`4296b06`) — Menu bar, function picker, undo/redo, copy/paste, exports, Ask-Claude empty-state intro.
- **Sprint 1** (`4e3770c`) — P0 #1 (range selection), #5 (column resize), #10 (shortcuts).
- **Sprint 2** (`99941ad`) — P0 #2 (cell formatting), #3 (find & replace).
- **Sprint 3** (`a4bbc8d`) — P0 #6 (conditional formatting), #8 (cell comments).
- **Sprint 4** (`8be066c`) — P0 #9 (sort half — chevrons), P1 #18 (audit formulas).
- **Review** (`3c9d6a3`) — 9 audit fixes, Range/RangeBounds dedupe.
- **Sprint 5** — punted (freeze panes virtualizer rework + data validation inline dropdown deserve a dedicated push).

## Recommended sequencing (next)

1. **Sprint 5 (next)** — P0 #4 freeze panes (M, was sized S), P0 #7 data validation list dropdown (M). Closes the last two P0 items.
2. **Sprint 6** — first P1 differentiators: P1 #14 (`=AI` cache hit indicator, S), P1 #16 (Smart Fill from examples, M), P1 #19 (One-click clean, M).
3. **Sprint 7+** — start P2: P2 #29 pivot tables (L) or P2 #30 Tables (M) for "look like a real spreadsheet"; or pivot to P2 #27 SQL cells (L) for the Quadratic-class differentiator.

## What we deliberately don't do

- **Match Excel's ribbon** — too heavy for our user base, conflicts with the Ask-Claude-first thesis. The 6-menu bar shipped on `main` is the deliberate ceiling for chrome.
- **Build a marketplace before product-market fit** — feature #91 in `features.md` (smart templates marketplace) is gated until enterprise tier ships.
- **Ship every chart type up front** — start with bar/line/area/pie/scatter (already there) + heatmap, treemap, sankey, candlestick (P2 #36); leave the long tail for community plug-ins.
- **Reinvent formula syntax** — HyperFormula gives us 400+ Excel-compatible functions for free; we only add custom ones that are genuinely AI-flavored or platform-specific (`=AI`, `=FETCH`, `=SIMILAR`).
