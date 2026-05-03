# Tech Stack & Architecture

Recommended stack for AiCell. Reuse-first: every layer below picks an existing battle-tested library where possible.

## Frontend

- **React 19 + TypeScript + Vite** — SPA shell
- **Custom HTML5 Canvas grid** — million-row virtualization, modeled after Quadratic's renderer
- **[HyperFormula](https://hyperformula.handsontable.com/)** — MIT-licensed formula engine, ~400 Excel-compatible functions; fork to add AI functions
- **Yjs** — CRDT for real-time collab; persists to IndexedDB for offline
- **Pyodide** — in-browser Python cells
- **DuckDB-WASM / sql.js** — SQL cells against connected data
- **TanStack Query** for server state, **Zustand** for UI state
- **shadcn/ui + Tailwind** for component library

## Backend

- **Node.js + TypeScript** with **Hono** (or Fastify) for the REST/tRPC API
- **Rust calc kernel compiled to WASM** for heavy server-side recalc — Phase 2+
- **PostgreSQL** for metadata (users, workspaces, workbooks index)
- **S3** (or compatible) for workbook blob storage
- **Redis** for presence and pubsub
- **Yjs sync gateway** WebSocket server

## AI layer

- **[Claude Agent SDK](https://docs.anthropic.com/en/docs/agents/agent-sdk)** for the agentic side panel
- Model routing:
  - `claude-sonnet-4-6` — default chat / agent loop
  - `claude-opus-4-7` — hard plans, audits, complex reasoning
  - `claude-haiku-4-5` — in-cell `=AI()`, `=CLASSIFY()`, etc. (latency- and cost-sensitive)
- **MCP servers** for every connector (Postgres, Stripe, Gmail, Slack, GitHub, etc.) — agent and user share the same tool surface
- **Aggressive prompt caching** of workbook schema + column samples so per-turn cost is minimal
- **Embeddings** via Voyage or OpenAI for `=EMBED()` and `=SIMILAR()`

## Auth, billing, infra

- **WorkOS** — SSO/SAML, SCIM provisioning (Phase 3)
- **Clerk** — consumer auth in Phases 1–2
- **Stripe** — billing and subscriptions
- **Vercel** for the frontend; **Fly.io** or **AWS** for stateful services (Postgres, Redis, Yjs gateway, agent runtime)

## Repository layout (Phase 0–1)

```
/home/user/AiCell
├── apps/
│   └── web/                       # React + Vite SPA
│       ├── src/grid/              # canvas grid renderer
│       ├── src/ai/sidepanel/      # Claude chat panel
│       ├── src/collab/            # Yjs provider
│       └── src/connectors/        # connector UIs
├── packages/
│   ├── calc/                      # HyperFormula fork + AI functions
│   ├── shared/                    # types, schemas (zod)
│   └── ui/                        # shadcn-based component lib
├── services/
│   ├── api/                       # Hono REST + tRPC
│   ├── ws/                        # Yjs sync gateway
│   └── agent/                     # Claude Agent SDK runtime, MCP servers
└── infra/                         # Terraform / Docker compose
```

## Reuse-first guardrails

- **Do not write a formula engine from scratch.** Fork HyperFormula and extend with AI functions and any missing Excel coverage.
- **Do not write a CRDT.** Use Yjs — battle-tested, integrates with Monaco/ProseMirror, has a healthy ecosystem.
- **Do not write an agent loop.** Use the Claude Agent SDK and define tools via MCP — it gives plan-mode, tool use, memory, and session resumption for free.
- **Do not write a chart library.** Pick one of Vega-Lite, ECharts, or Plotly and theme it.
- **Do not write a Python sandbox.** Pyodide handles the browser; for server, isolate with Firecracker or gVisor.

## Why Claude (not multi-provider, not local)

- **Plan mode + tool use parity** with what users expect from Excel Copilot, with stronger reasoning at the Opus tier
- **MCP** is now a de facto standard — picking Claude lets us share tools across the agent panel and external clients (Cursor, Claude Desktop, etc.)
- **Prompt caching** drops the marginal cost of `=AI()` cells dramatically once the workbook schema is cached
- Multi-provider routing can be added later behind a single internal interface; it is not blocking for V1.
