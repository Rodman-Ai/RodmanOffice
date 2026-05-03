# SHIPPED — sprint-by-sprint changelog

A stakeholder-facing report of what landed in each sprint and what the next push should target. Numbers in parentheses (`P0 #N`) reference [`top-50-features.md`](./top-50-features.md).

## Pre-Sprint 1 — `4296b06`

**Title:** Menu bar, function picker, undo/redo, copy/paste, exports.

**Impact:**
- The product gained a conventional spreadsheet chrome (File · Edit · View · Insert · Data · Help) so users coming from Excel/Sheets stop bouncing.
- 100-step undo/redo + copy/cut/paste with TSV expansion turned the app into a usable editor.
- A 50-function searchable picker (Insert → Function…) replaced "either know the name or ask Claude".
- Ask Claude empty-state intro now explains the conversational workflow with five click-to-prefill examples.

**Files:** 11 changed · +1261 / −84.

**Closed:** P0 #10 (most shortcuts), Pre-P0 baseline (menus, undo, copy/paste).

---

## Sprint 1 — `4e3770c`

**Title:** Range selection, column resize, more shortcuts.

**Impact:**
- Selection is a `Range` (anchor + focus). Drag, shift-click, click row/col headers, shift-arrows. Status bar shows `A1:B5 · 12 cells`.
- Per-column resize (drag handle, persisted in `Sheet.colWidths`, undoable). Default 100px column width is no longer a permanent jail.
- Filled out the keyboard shortcut sheet: ⌘A select-all, ⌘/ open function picker, ⌘; insert =TODAY(), ⌘⇧; insert =NOW(), Home/End and ⌘Home/End for navigation.
- Copy / Cut / Clear-contents now operate on the full range as one undo step.

**Files:** 6 changed · +379 / −60.

**Closed:** **P0 #1** (multi-cell selection), **P0 #5** (column resize), **P0 #10** (full shortcut set).

---

## Sprint 2 — `99941ad`

**Title:** Cell formatting + find & replace.

**Impact:**
- New `CellFormat` on `@aicell/shared`: bold, italic, underline, alignment, text/fill colors, number-format presets (General/Number/Currency/Percent/Date/Datetime), decimals.
- `FormatToolbar` above the formula bar with B/I/U toggles, alignment, color pickers, number-format dropdown, Clear. New `Format` menu in the menu bar with the same actions plus shortcuts.
- `applyFormat` and `clearFormat` on the workbook api — each is one undo step. `setCell` / `setCellOnSheet` now preserve format when raw is cleared (formatted-but-empty cells stay).
- Number formatting renders correctly via `formatValue` (handles HF Excel-serial dates).
- New `FindReplace` modal (Edit → Find & replace…, ⌘F): case-sensitive toggle, prev/next, Replace, Replace all (one undo step).

**Files:** 8 changed · +751 / −15.

**Closed:** **P0 #2** (cell formatting model — most of), **P0 #3** (find & replace, sans regex / all-sheet scope).

---

## Sprint 3 — `a4bbc8d`

**Title:** Conditional formatting + cell comments.

**Impact:**
- Per-sheet `ConditionalRule[]` in `@aicell/shared`. Nine condition types (>, ≥, <, ≤, =, ≠, between, contains, isEmpty, isNotEmpty) × five preset styles (red/yellow/green/blue fills, bold).
- New `ConditionalFormatModal` (Format → Conditional formatting…) — pick condition, pick preset, applies to current selection. Lists existing rules with remove.
- New helpers in `apps/web/src/conditional.ts`: `matchesCondition`, `resolveFormat` (merges base format with matching rule styles), `rangeBoundsToA1`.
- Per-cell `Cell.comment`: text + author + timestamp. New `CommentModal` (Insert → Comment…) with ⌘Enter to save. Cells with comments get a small red triangle in the corner; hover shows the text via `title`.

**Files:** 8 changed · +794 / −7.

**Closed:** **P0 #6** (conditional formatting; AI rule generation TBD), **P0 #8** (comments — non-threaded, no @-mentions).

---

## Sprint 4 — `8be066c`

**Title:** Column-header chevrons + audit formulas.

**Impact:**
- Hover-revealed ▾ on every column header opens a popup with **Sort A→Z / Sort Z→A / Remove duplicates / Filter (placeholder)**. Sort and dedupe now reachable from menu and the column directly.
- New `AuditPanel` modal (Help → Audit formulas) walks every formula across every sheet, lists those with evaluation errors with sheet, A1 ref, full formula, and error message. Click a cell ref to jump (switches sheet + sets selection).
- New `getComputedOnSheet(sheetName, row, col)` on the workbook api so the panel can probe non-active sheets.

**Files:** 5 changed · +370 / −2.

**Closed:** **P0 #9** (sort half — chevrons + sort + dedupe; filter half deferred), **P1 #18** (audit my formulas).

---

## Review — `3c9d6a3`

**Title:** Sprint 1–4 review — 9 audit fixes + dedupe Range/RangeBounds.

**Impact (correctness):**
1. `setColWidth` now bumps the version tick (consistency with every other mutator).
2. Keyboard handler dep array now includes `selection` so ⌘B/I/U see the current cell's format.
3. Selection resets to A1 on every `replaceWorkbook` (boot path + File → New). No more out-of-bounds anchor reads on a smaller workbook loaded over a larger one.
4. Inline edit cancels when the selection moves off the editing cell (e.g. agent jumping cursor while user types).
5. `CellView` is now `React.memo`-wrapped with a custom comparator. With stable callback refs in the parent, only cells whose anchor / inSelection / format / comment / version actually changed re-render. Big win on imported sheets.
6. `addSheet` / `addSheetByName` push history and call `setActiveSheetId` synchronously (out of `setWorkbook` updater). React batching no longer drops undo steps.
7. `parseTSV` / `serializeRange` now follow Excel/Sheets escaping (cells with tab / newline / quote get wrapped in `"…"`, internal quotes doubled). Round-trip preserves embedded newlines.
8. `formatValue` non-finite-number guard: NaN / +Infinity / -Infinity render as bare strings, no more "$NaN" or "Infinity%".
9. `notEquals` conditional rule now matches whenever `text !== value`, including empty cells.

**Impact (code health):**
10. `Range` (apps/web/src/clipboard.ts) is now a type alias of `RangeBounds` (@aicell/shared) — single source of truth for the persisted shape.
11. `conditional.ts` drops its local `colLet` / `a1` and uses `@aicell/shared` exports.

**Files:** 6 changed · +160 / −65. No test or build regressions (55/55 tests pass, typecheck clean, build succeeds).

---

## What's still P0 deferred

| # | Why deferred |
|---|---|
| **#4 Freeze panes** | Sized as M (was S in the original list). The virtualizer assumes uniform rows/cols and `transform: translateY` for absolute positioning, which conflicts with sticky positioning across the freeze boundary. Needs a separate pane render for frozen rows + sticky CSS for frozen columns. |
| **#7 Data validation list** | Sprint 5 added `Cell.validation` types but discarded the partial during the review pass. Inline dropdown UX inside the virtualized grid is the actual hard part — it deserves a dedicated push. |
| **#9 Filter half of sort/filter chevrons** | The popup placeholder is in place; the actual filter UI (header → values list → hide non-matching rows) was deferred. |

## Status against the top-50

- **P0:** 8 of 10 closed (2 deferred — both on the deck for Sprint 5).
- **P1:** 2 of 15 closed (#15 `=FORMULA()`, #18 audit my formulas).
- **P2:** 0 of 15.
- **P3:** 0 of 10.

The product is now a credible Phase-1 spreadsheet — every "missing-ness moment" except freeze panes and data validation is covered. The next push should clear the last two P0 items, then turn to P1 differentiators (`=AI` cache indicator, Smart Fill, One-click clean) before starting on P2 (pivot tables, tables with structured refs, or SQL cells).
