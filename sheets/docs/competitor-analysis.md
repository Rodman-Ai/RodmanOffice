# Competitor Analysis

A 2026 snapshot of the AI-forward spreadsheet category, focused on what each product does well and where AiCell can win.

## Summary table

| Product | Strength | Gap we exploit |
|---|---|---|
| **MS Excel + Copilot** | Formula breadth, Work IQ context, agent/plan mode, local file edits | Closed ecosystem, slow web, weak connectors, no code cells |
| **Google Sheets + Gemini** | Real-time collab, `=AI()` cell, optimization solver, 70% SpreadsheetBench | Weak large-data perf, limited code-in-cell, ecosystem lock-in |
| **Quadratic** | Python/SQL cells, MCP support, canvas grid, ~75% accuracy | Niche audience, weak collab UX, limited connectors |
| **Sourcetable** | AI-native modeling/reporting, FP&A focus | Smaller ecosystem, fewer integrations |
| **Rows** | Web embeds, connectors | Sunsetting after Superhuman acquisition — opportunity to absorb users |
| **Numerous.ai** | `=INFER()` few-shot transforms, $10/mo plug-in | Just a plug-in, not a full grid |
| **Bricks / Endex / Shortcut / Kuse** | Vertical agentic Excel work | Narrow, brittle, no real-time grid |
| **GPTExcel / Ajelix** | Formula generators | Single-purpose helpers, no platform |

## Detail by product

### Microsoft Excel + Copilot
- "Edit with Copilot" toggles between chat-only and direct editing
- **Plan mode**: Copilot maps step-by-step actions, user reviews & adjusts before any edits
- **Work IQ** auto-injects context from emails, meetings, chats, files
- Multi-step edits to local workbooks on Windows and Mac
- Excel rose 67% in tries-per-user-per-week after rollout
- **Weakness for us:** locked into Microsoft 365, web Excel still sluggish, no first-class Python/SQL cells, connector story is poor outside the Microsoft graph.

### Google Sheets + Gemini
- Build/edit entire spreadsheets via natural language
- `=AI()` cell function for text gen, classification, sentiment, extraction
- Hit **70.48%** on SpreadsheetBench (state of the art at announcement)
- Optimization problem solver (budgets, scheduling, supply chain)
- Conversational analysis sidebar with chart suggestions
- **Weakness for us:** large-dataset perf is poor in the browser, no code cells, ties users to the Google ecosystem.

### Quadratic
- Python/SQL cells alongside spreadsheet cells in one canvas
- Agentic AI writes and debugs code from plain-English description
- Speaks **Model Context Protocol** — agents like Claude/Cursor/ChatGPT can read, write, verify
- ~75% accuracy on benchmarks
- GA4, marketing data integrations
- **Weakness for us:** small ecosystem, collaboration UX is not yet at Sheets/Excel level, fewer business connectors.

### Sourcetable
- "Best overall for AI-native modeling and reporting" per 2026 roundups
- FP&A focus — financial modeling, valuation comparisons
- **Weakness for us:** smaller integration library, less general-purpose than Excel/Sheets.

### Rows (sunsetting)
- Was best-in-class for turning a spreadsheet into an embeddable web page or data form
- Acquired by Superhuman in February 2026, will shut down
- **Opportunity:** existing Rows users need a new home with similar embed/form features.

### Numerous.ai
- `=INFER()` few-shot pattern transformer — describe once, apply across messy text columns
- Plug-in for Excel & Google Sheets, $10/mo
- **Weakness for us:** a plug-in, not a platform. We can ship `=AI()`, `=CLASSIFY()`, `=EXTRACT()` natively with better UX.

### Bricks / Endex / Shortcut / Kuse
- Vertical agentic Excel tools — cash flow modeling, valuation comparisons, etc.
- Live data integrations to market data and financials (Endex, Claude for Excel)
- **Weakness for us:** narrow scope, no real-time grid, no general-purpose collaboration.

### GPTExcel / Ajelix
- Single-purpose formula generators
- GPTExcel ~65% accuracy, Ajelix focuses on chat-driven formula help
- **Weakness for us:** helpers, not products. Easy to leapfrog with native AI cells.

## Differentiation thesis

AiCell wins by combining what no incumbent has stitched together:

1. **Claude-native agent** that plans → diffs → applies edits, with full undo. (Beats Excel's plan mode by being faster and tied to a stronger model surface, beats Quadratic by being collaborative.)
2. **Code-cell grid** with Python (Pyodide), SQL (DuckDB-WASM), and JavaScript cells side-by-side. (Match Quadratic's headline differentiator.)
3. **MCP connectors as a first-class primitive** — the agent and the user share the same tool surface. Connector library beats Quadratic and Sourcetable on day one.
4. **Real-time collab UX** at Sheets-level quality (Yjs CRDT, multi-cursor, follow-mode, version diff).
5. **Cleanest in-cell AI** — `=AI()`, `=CLASSIFY()`, `=EXTRACT()`, `=SUMMARIZE()`, `=TRANSLATE()`, `=SENTIMENT()`, `=EMBED()`, `=SIMILAR()`, `=FORMULA()` — better than Numerous because they're native, faster because of prompt caching.

## Menu & UX comparison

How the leading products organize their chrome — and what AiCell takes from each.

| Product | Top-level structure | Notable choices |
|---|---|---|
| **Excel** | Ribbon (Home · Insert · Page Layout · Formulas · Data · Review · View · Help · Copilot) | Two-row ribbon, deeply faceted; **Copilot** is a top-level peer of File, signalling AI as a first-class surface, not a side panel. |
| **Sheets** | Menubar (File · Edit · View · Insert · Format · Data · Tools · Extensions · Help) + small toolbar | Conventional menubar, every action discoverable; "Help me organize" / Gemini sidebar opens via an icon, not a menu. |
| **Quadratic** | Almost no chrome — a thin toolbar + command palette (`⌘P`) | Menus replaced by the palette and the AI chat panel; relies on power users knowing what to type. |
| **Sourcetable** | AI-first toolbar — prompt input is the primary affordance, conventional menus collapse behind a hamburger | Inverts the hierarchy: the AI input is louder than File/Edit. |
| **Rows** (sunsetting) | Light menubar plus drag-to-canvas dashboard tools | Tuned for embed/share rather than data work; less to learn but less to do. |

**Implication for AiCell.** A six-menu bar (File / Edit / View / Insert / Data / Help) is the lowest-friction option for users coming from Excel or Sheets — every command they reflexively reach for has a home. We **don't** copy Excel's ribbon (too heavy for a Phase-1 product) and we **don't** go full Quadratic (palette-only) because new users need a visible affordance.

The differentiator is what the menus point to: **Ask Claude is the loud primary action** (a blue button in the toolbar above the menus), the empty-state of the side panel tells users they can do anything from chat, and the only menu we invest UI uniquely in is **Insert → Function** — a 50-function picker with search and click-to-insert, because that's the one task where a list beats chat.

## Sources

- [Microsoft 365 Blog — Copilot agentic capabilities GA, April 2026](https://www.microsoft.com/en-us/microsoft-365/blog/2026/04/22/copilots-agentic-capabilities-in-word-excel-and-powerpoint-are-generally-available/)
- [What's New in Microsoft 365 Copilot — March 2026](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/what%E2%80%99s-new-in-microsoft-365-copilot--march-2026/4506322)
- [Google Workspace Blog — Gemini updates, March 2026](https://blog.google/products-and-platforms/products/workspace/gemini-workspace-updates-march-2026/)
- [Google Blog — Gemini in Sheets state-of-the-art on SpreadsheetBench](https://blog.google/products-and-platforms/products/workspace/gemini-google-sheets-state-of-the-art/)
- [Quadratic — homepage and product](https://www.quadratichq.com/)
- [Sourcetable — Best AI Spreadsheet Alternatives 2026](https://sourcetable.com/articles/best-ai-spreadsheet-alternatives-legacy-2026-roundup)
- [Toolworthy — 12 Best AI Spreadsheet Tools 2026](https://www.toolworthy.ai/blog/best-ai-spreadsheet-tools)
- [Numerous.ai — homepage](https://numerous.ai/)
- [Kuse — 10 Best AI Tools for Excel in 2026](https://www.kuse.ai/blog/excel/10-best-ai-tools-for-excel-in-2026-from-formula-bots-to-agentic-coworkers)
- [Querri — Best AI Spreadsheet Tools 2026](https://querri.com/blog/best-ai-spreadsheet-tools/)
