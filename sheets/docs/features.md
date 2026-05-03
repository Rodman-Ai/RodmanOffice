# 100 Features

The AiCell backlog. Numbered 1–100 so the roadmap can reference them by ID.

## Core spreadsheet engine (1–15)
1. Virtualized canvas grid (10M+ rows, 16K+ cols)
2. Multi-sheet workbooks with tabs, color, reordering
3. Rich cell types: number, text, date/time, currency, %, boolean, JSON, image, link
4. Full formatting: fonts, colors, borders, number formats, conditional formatting
5. Named ranges and Excel-style structured references (`Table[Column]`)
6. First-class Tables (auto-expand, header row, totals row)
7. Freeze panes, split views, multi-window
8. Merge cells, wrap text, row/col grouping & outlining
9. Find & replace with regex and across-sheet scope
10. Full undo/redo with branching history timeline
11. Threaded cell comments with @mentions
12. Multi-column filter & sort with saved views
13. Pivot tables with drill-down
14. Data validation (lists, rules, custom formulas)
15. Sparklines + in-cell mini-charts

## Formulas & code cells (16–25)
16. 500+ Excel-compatible functions (SUM, XLOOKUP, INDEX/MATCH, FILTER, etc.)
17. Dynamic arrays + spill ranges
18. LAMBDA, LET, named custom functions library
19. Python cells (Pyodide in-browser, server runtime for heavy jobs)
20. SQL cells against connected DBs and in-sheet tables (DuckDB)
21. JavaScript/TypeScript cells with sandbox
22. Regex functions (REGEXEXTRACT, REGEXMATCH, REGEXREPLACE)
23. `=FETCH(url, options)` HTTP function with caching
24. Live market data: stocks, FX, crypto, commodities
25. Geospatial functions (DISTANCE, GEOCODE, REVERSE_GEOCODE)

## Data import & connectors (26–35)
26. CSV/TSV/XLSX/Parquet/JSON/NDJSON import & paste
27. PDF table extraction (Claude vision)
28. Image-to-table — snap a screenshot, get a sheet
29. Native DB connectors: Postgres, MySQL, Snowflake, BigQuery, Redshift, MSSQL
30. Cloud storage pull: GDrive, OneDrive, Dropbox, S3
31. REST API connector with OAuth/API-key/header auth
32. Inbound webhooks → append rows
33. Scheduled refresh with diff notifications
34. Gmail / Outlook mailbox queries as a data source
35. Native connectors: Stripe, Salesforce, HubSpot, Notion, Airtable, Linear, GitHub

## Charts & dashboards (36–42)
36. 30+ chart types (bar, line, area, scatter, heatmap, treemap, sankey, candlestick, etc.)
37. AI chart recommendation ("best chart for this data")
38. Drag-to-canvas dashboard builder with cross-filters
39. Geo maps with auto-geocoding & choropleth
40. Custom chart themes + workspace branding
41. Timeline / animated charts ("play" through dates)
42. Public embed: read-only dashboard URLs and iframes

## Collaboration & sharing (43–50)
43. Real-time multi-cursor editing (Yjs CRDT)
44. Presence indicators + follow-mode
45. Granular sharing: workbook / sheet / range / cell
46. Comment threads with @mentions, email & Slack digests
47. Version history with named snapshots and visual diff
48. Suggestion mode (track-changes)
49. Public publish with view-only or commenter links
50. Slack/Teams change notifications & inline approvals

## AI: in-cell intelligence (51–60)
51. `=AI(prompt, range)` Claude-powered cell function
52. `=CLASSIFY(text, labels)` few-shot categorization
53. `=EXTRACT(text, schema)` JSON entity extraction
54. `=SUMMARIZE(range, style)`
55. `=TRANSLATE(text, lang)` with auto-detect
56. `=SENTIMENT(text)` returning score + label
57. `=GENERATE_IMAGE(prompt)` embedded image cell
58. `=EMBED(text)` vector embedding column
59. `=SIMILAR(query, range, k)` semantic fuzzy match
60. `=FORMULA("show me last week's revenue by region")` natural-language → formula

## AI: agentic chat & editing (61–70)
61. Workbook-scoped Claude side panel with full grid context
62. **Plan-then-apply** agent: generate a diff, user approves, then writes
63. Multi-turn agent that creates sheets, charts, formulas, and pivots
64. Agent runs MCP tools — same connectors users use, same auth
65. "Explain this workbook" interactive walkthrough
66. "Audit my formulas" — broken refs, type errors, perf hot spots
67. Voice input + spoken summaries (live transcription)
68. Screen-share coaching mode (user demos, agent learns)
69. Per-workbook + per-user memory of conventions and style
70. Scheduled agent jobs ("every Monday 9am, refresh and email summary")

## AI: data cleaning & transformation (71–78)
71. One-click clean: dates, names, addresses, phone, email
72. Duplicate detection & merge with confidence scores
73. Smart Fill from examples (Flash Fill on steroids)
74. Outlier detection with natural-language explanations
75. Schema inference + "table-from-mess" reshaping
76. PII detection + one-click redaction
77. Auto fuzzy-join two tables with key suggestion
78. Type-coercion suggestions with bulk apply

## AI: analysis & insights (79–85)
79. Auto-insights panel ("3 things I noticed in this sheet")
80. Natural-language → pivot or chart
81. Forecasting (ARIMA + Prophet + LLM ensemble) with confidence bands
82. What-if scenarios + AI-suggested goal-seek levers
83. Anomaly alerts on scheduled refresh (email/Slack)
84. One-click PPTX exec summary deck from a sheet
85. "Ask your data" chat with citations linking back to source cells

## AI: automation & workflows (86–92)
86. Macro recorder emitting both code and natural-language script
87. AI workflow builder ("when X happens, do Y") — Zapier-class in-grid
88. AI form builder with field-type suggestions and validation
89. Scheduled report generation & email/Slack delivery
90. Natural-language conditional formatting rules
91. Smart templates marketplace (templates auto-fill from your data)
92. AI code review on shared workbook PR-style change requests

## Enterprise & governance (93–100)
93. SSO/SAML, SCIM provisioning, MFA
94. RBAC + cell- and column-level permissions
95. Audit log with Claude-summarized activity digests
96. Data residency selection (US / EU / regional)
97. PII / DLP policies enforced at edit-time and on AI calls
98. Workbook approval workflows (lock + sign-off)
99. Encryption at rest, per-workspace KMS, BYOK option
100. Two-way Excel/Sheets sync — open `.xlsx`, edit, save back
