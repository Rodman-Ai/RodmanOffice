# Excel Ribbon Parity Backlog

This backlog tracks Excel ribbon features visible in the reference screenshots
that are not yet exposed as working RodmanSheets controls. Draw and Acrobat are
intentionally out of scope. Automate is tracked here only; it is not a live
ribbon tab until script/macro behavior exists.

Effort key: S = small UI/command wrapper, M = moderate model or workflow, L =
large subsystem or integration.

## Home

| Feature | Effort | Notes |
|---|---:|---|
| Paste dropdown variants | M | Needs paste-special options such as values, formulas, formatting, transpose, and text import behavior. |
| Format painter | M | Needs reusable copied-format state and range application. |
| Font family and font size | M | Requires cell-format schema extension and renderer/export support. |
| Borders and border presets | M | Requires cell-format schema extension and range edge handling. |
| Wrap text, text orientation, merge cells | M | Needs layout changes in the virtualized grid. |
| Format as Table and Cell Styles galleries | L | Needs table model, style definitions, totals/header semantics, and export mapping. |
| Insert/Delete/Format cell operations | M | Needs row/column insertion/deletion and workbook-shift semantics. |
| Add-ins and sensitivity labels | L | Requires extension/security and policy models. |

## Insert

| Feature | Effort | Notes |
|---|---:|---|
| PivotTable and Recommended PivotTables | L | Needs pivot model, field well, aggregation engine, and drill-down. |
| Full Table object | L | Needs structured references, auto-expand, header row, totals row, and styles. |
| Forms | M | Needs form builder/source mapping rather than a static button. |
| Illustrations and shapes | M | Needs overlay object layer for images/shapes/icons. |
| Checkbox cells | M | Needs boolean cell rendering and edit affordances. |
| Recommended charts and richer chart menus | M | Manual chart insertion exists; recommendations and chart galleries are deferred. |
| Sparklines | M | Needs in-cell mini-chart renderer. |
| Slicers and timelines | L | Depends on Tables/Pivots/filter model. |
| Links, text boxes, and symbols | M | Needs richer cell/object/link model. |

## Page Layout

| Feature | Effort | Notes |
|---|---:|---|
| Themes, colors, fonts, effects | M | Needs workbook theme model and format defaults. |
| Margins, orientation, size, print area, breaks, background, print titles | M | Needs print/page setup model and export/print handling. |
| Scale to fit | M | Needs print layout pipeline. |
| Gridlines/headings print toggles | M | View toggles exist; print settings are separate and deferred. |
| Arrange controls | L | Requires overlay object layer and selection pane. |

## Formulas

| Feature | Effort | Notes |
|---|---:|---|
| Recently used and category-specific function galleries | S | Function picker exists; ribbon category shortcuts are not exposed. |
| More Functions menu | S | Can route into the existing function picker with filters. |
| Name Manager, Define Name, Use in Formula, Create from Selection | M | Needs named-range model and structured reference integration. |
| Trace precedents/dependents and remove arrows | L | Needs dependency graph visualization over the grid. |
| Show formulas | M | Needs grid-level formula display mode. |
| Error checking and evaluate formula | M | Audit panel exists; step-by-step evaluation is deferred. |
| Watch window and calculation options | M | Needs watch state and recalc-mode controls. |

## Data

| Feature | Effort | Notes |
|---|---:|---|
| Get & Transform data sources | L | CSV/XLSX import exists; connectors and Power Query-style transforms are deferred. |
| Queries & Connections | L | Depends on connector/query model. |
| Data Types: Stocks and Currencies | L | Needs external market/reference data providers. |
| Filter UI and advanced filter | M | Sort/dedupe exist; full filter state and UI are deferred. |
| Text to Columns | M | Needs split preview and batch transform behavior. |
| Data validation | M | Deferred until inline dropdown/rule UX is built. |
| Consolidate, relationships, and data model | L | Requires workbook-level relational model. |
| What-if analysis and Forecast Sheet | M | Basic agent forecasting exists; native ribbon workflows are deferred. |
| Grouping and outline | M | Needs row/column grouping model. |

## Review

| Feature | Effort | Notes |
|---|---:|---|
| Spelling and thesaurus | M | Needs local or service-backed language tooling. |
| Workbook statistics | S | Could summarize sheets, formulas, charts, comments, and used range. |
| Check performance | M | Formula audit exists; performance-specific diagnostics are deferred. |
| Accessibility checker | L | Needs semantic workbook checks and issue remediation UI. |
| Translate | M | Needs hosted or BYOK translation workflow beyond formula functions. |
| Show changes and threaded comment navigation | L | Needs collaboration/version history and comment-thread model. |
| Notes | M | Needs a separate note type or migration from current comments. |
| Protect sheet/workbook and allow edit ranges | L | Requires permissions/locking model and export semantics. |
| Ink controls | L | Requires drawing layer; Draw ribbon remains out of scope. |

## View

| Feature | Effort | Notes |
|---|---:|---|
| Sheet View and custom views | L | Needs saved view/filter/sort state. |
| Normal/Page Break Preview/Page Layout workbook views | L | Needs print/page layout renderer. |
| Switch modes and dark mode | M | App chrome theme work is separate from workbook data. |
| Ruler and focus cell | M | Needs viewport overlay and active-cell emphasis modes. |
| Zoom controls | M | Needs grid scaling without breaking virtualization. |
| Window management and split/freeze panes | L | Freeze panes were deferred because they affect the virtualizer. |
| Macros | L | Needs macro/script runtime and safety model. |

## Automate

| Feature | Effort | Notes |
|---|---:|---|
| New Script and View Scripts | L | Needs script editor, runtime, permissions, and workbook API. |
| Office Scripts gallery | L | Depends on script runtime and template packaging. |
| Power Automate templates | L | Requires workflow/integration platform. |

## Help

| Feature | Effort | Notes |
|---|---:|---|
| Contact support and feedback | S | Needs configured destination. |
| Show training and What's New | S | Needs content source. |
| Community and blog links | S | Needs public URLs. |
| Mobile app prompt | S | Not relevant unless replaced with RodmanOffice install/help content. |
