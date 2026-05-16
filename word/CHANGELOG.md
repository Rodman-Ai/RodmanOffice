# Changelog

All meaningful releases on `claude/build-word-clone-cXSXu`. Versions
follow `RW_BUILD.version` in `app.js`. Cache key in
`sw.js VERSION` is in lock-step.

## Unreleased — Save dialog unification

The File backstage's Save and Export surfaces collapsed into one
**Save…** tile that opens a unified dialog (PRs #40 / #41 / #42).

- New modal `#saveModal` in `index.html` with filename input,
  grouped format select (Native / Office / OpenDocument / Portable
  / Markup / Structured), and per-format options: rwd.enc password,
  markdown YAML frontmatter toggle, PDF re-encode-from-source with
  five compression levels + searchable-text checkbox when the doc
  was imported from a PDF.
- `Ctrl+S` / `Cmd+S` is wired for the first time (the shortcut was
  silently dead — only the command palette reached it). Default
  format = `.docx` on a fresh tab; the last pick is remembered per
  tab in `sessionStorage`.
- The backstage rail loses the **Export** tab (now 10 sections, not
  11) and Print loses its duplicate **Export PDF** tile. The
  standalone `compress-pdf` flow folds into the PDF branch of the
  dialog. Side tiles **Save to file…** (File System Access) and
  **Save as template** stay separate because they're not
  format-choice operations.
- Encryption logic was extracted to a shared
  `encryptAndDownload(password)` helper used by both the legacy
  "Save with password" modal and the new dialog.
- Sister apps (Sheets / Slides / Image Editor) gained the same
  one-button-opens-the-dialog pattern in PR #42; their `Ctrl+S`
  also opens their respective dialogs.

## [2.1.0] — 2026-05-02 · cache `rwd-v10`

UI polish + plumbing.

- Mobile ribbon now collapses to a single horizontally-scrolling row
  on screens ≤ 720 px. `display: contents` on `.group-row` and
  `flex-direction: row` on `.group` flatten the per-tab structure
  into one row regardless of how many controls a tab has.
- Service worker rewritten to **network-first for every same-origin
  GET**, with the cache as offline fallback. Eliminates the stale-
  asset reload-twice problem.
- `RW_BUILD` constant introduced as the single source of truth for
  the displayed version, build date, and cache key. About dialog
  reads from it.
- Backstage rewritten as Word-style two-pane layout with 11 sections
  (Home / New / Open / Save / Print / Share / Cloud sync / Export /
  Info / Tools / About) plus a search box that filters every section.
- Every ribbon tab reorganised: Lists split out of Paragraph on
  Home, Page-setup split into Margins / Flow on Layout, View split
  into Zoom / Theme / Show / Modes / Read / Writing aids / Macros /
  Markup, References created as its own tab.
- Insert tab consolidated into Pages / Tables / Illustrations /
  Media / Links / Header & Footer / Text / Symbols / Forms / Editing
  with two inline ribbon dropdowns (Pictures, Shapes).
- Ribbon double-click toggles collapse; single click on collapsed
  ribbon switches and re-expands.
- File menu, ARCHITECTURE.md, FEATURES.md, CHANGELOG.md, and
  CONTRIBUTING.md added.

## [2.0.0] — 2026-05-01

The 100-feature plan. Added a new competitor analysis identifying
100 features RodmanWord lacked vs Word / Google Docs / Pages /
LibreOffice / Notion, then shipped all 100.

- **Section A — Review tab + 10 review features**: Review ribbon
  tab; show / hide markup filter; reviewing pane; previous / next
  change / comment; reviewer filter; mark final; inspect document;
  side-by-side compare with synced scrolling; 3-way merge; per-
  section proofing language.
- **Section B — Document model & styles depth (10)**: Document
  themes (Light / Dark / Sepia / Contrast + custom builder);
  theme-aware swatches; style hierarchy; styles import / export;
  heading numbering schemes; restart numbering; line numbers in
  margin; hyphenation control; widow / orphan control; multi-author
  metadata.
- **Section C — Tables advanced (7)**: Cell formulas (`=SUM`,
  `=AVG`, `=COUNT`, `=MAX`, `=MIN`, arithmetic on refs); cell number
  format; cell colour; distribute rows / columns; repeat header row
  on print; caption auto-attach.
- **Section D — Lists & outlining (6)**: Custom bullet characters;
  image bullets; list style gallery; drag-reorder a heading + its
  section in the navigation pane; collapse-all-to-level; smart
  promote / demote of headings on Tab.
- **Section E — Images & media (10)**: Image gallery / carousel /
  linked URL / stylised frames / annotation labels; YouTube /
  Vimeo / iframe / audio embeds; QR code; Code-39 barcode.
- **Section F — Templates & branding (8)**: Template marketplace
  UI; save current doc as template; brand kit; letterhead; cover
  page templates; style cleaner; reset to template; template
  versioning.
- **Section G — References & academic (7)**: DOI lookup → citation;
  ISBN lookup; BibTeX import; citation style switcher; back-of-book
  index; lists of figures / tables / equations; cross-reference
  autocomplete picker.
- **Section H — Forms & fields advanced (5)**: Date-picker form
  field; number form field; required marker; form data CSV export;
  field-code editor.
- **Section I — Editing power-tools (10)**: Multi-cursor; column /
  block selection; duplicate line / paragraph; toggle HTML comment;
  bracket matching; invert selection; expand selection by syntactic
  unit; select all of same heading level; auto-pair tags inside
  `<pre>`.
- **Section J — Search advanced (6)**: Find in selection only; find
  in comments / footnotes / headings; capture-group support; search
  across recent docs; find by formatting; saved searches.
- **Section K — View modes (6)**: True outline view (drag to
  reorder); two-page spread; side-by-side reading; mobile preview;
  full-screen editor; dyslexia preset for reading mode.
- **Section L — Export / interop (10)**: New `interop.js` module
  with ODT / RTF / EPUB / Markdown-with-YAML-frontmatter / AsciiDoc
  / LaTeX exporters and RTF / ODT / EPUB importers; Markdown live-
  preview pane.
- **Section M — Cloud & sharing (5)**: Read-only share link;
  comment-only share link; WebDAV / Nextcloud sync; email this doc;
  copy Slack-Markdown.
- **Real-time WebRTC peer-to-peer collaboration** (the original
  Tier-1 #1 deferred for being server-bound). Manual SDP
  handshake, data-channel snapshot exchange, presence pill.

## [1.1.0]

DOCX + PDF interop without dependencies.

- `docx.js`: hand-rolled OOXML writer + reader with a STORED-method
  ZIP writer and a `DecompressionStream`-based ZIP reader. Supports
  headers, footers, fields, hyperlinks, lists, tables, and images.
- `pdfio.js`: hand-rolled PDF 1.4 writer using the standard 14
  Type-1 fonts; PDF text extractor that decompresses FlateDecode
  via `DecompressionStream` and pulls text from `Tj` / `TJ`
  operators with paragraph-break detection on large `Td` jumps.
- File menu and command palette gain Export DOCX / Export PDF.

## [1.0.0]

Initial Word clone — 80+ features.

- Ribbon UI (File / Home / Insert / Layout / View) with Word-style
  tabs and groups.
- Rich text editing: fonts, sizes, colours, highlights, lists,
  alignment, headings, tables, images, links, symbols, emoji, page
  breaks, dates.
- Page metaphor with A4 / Letter / Legal sizing, orientation,
  margins, zoom.
- File operations: New, Open, Save (.rwd JSON), Export HTML / TXT,
  Print / PDF.
- Find & Replace, dark mode, ruler, recent docs, autosave to
  localStorage.
- Responsive layout for mobile, print stylesheet for clean PDF
  export.
- GitHub Actions workflow that auto-deploys to GitHub Pages.
- PWA: manifest + service worker + installable.
- Power-user: command palette, custom CSS, mail merge, voice
  dictation, read-aloud, compare diff, repeat last action,
  password protect (.rwd.enc, AES-GCM).
- Templates gallery (Resume, Cover letter, Report, Memo, Meeting
  notes, Blank), version history (auto snapshots every 2 min),
  document properties, writing goal, share link.
- Threaded comments, track changes, grammar check.
