# RodmanWord — Features Catalogue

Generated from the 98 capability banners in `app.js` plus the ribbon
markup in `index.html`. Each entry: short description, source
location, keyboard shortcut where applicable. Microsoft Word parity gaps
that are not exposed as working controls are tracked in `BACKLOG.md`.

The big ones first, then the per-tab catalogue.

## Cross-cutting foundations

| Feature | Source |
|---|---|
| **Live-field engine** — `{page}` / `{pages}` / `{date}` / `{time}` / `{docTitle}` / `{author}` / `{wordCount}` plus citations / captions / cross-references all refresh on every edit (200 ms debounce). | `app.js` `// FOUNDATION: Live-field engine` |
| **Section index** at the top of `app.js` mapping line ranges to feature regions. | `app.js:1–95` |
| **Backstage section router** with search across every section. | `app.js` `BACKSTAGE_SECTIONS`, `renderBackstageSection`. |
| **Ribbon double-click to collapse**, single-click to switch + auto-expand. | `app.js` `// Tabs` near top. |
| **Theme picker** — Light / Dark / Sepia / High contrast — with CSS custom properties. | `app.js` `// IMPROVEMENT: Theme picker` |
| **Service worker** — network-first, offline fallback. | `sw.js` |
| **PWA manifest** — installable. | `manifest.webmanifest` |

## File menu (backstage)

Word-style backstage with 11 sections. Each section is a tile grid
of action cards.

| Section | Tiles |
|---|---|
| **Home**       | Quick actions (New, Open, Save, Print) + Recent documents list. |
| **New**        | Templates gallery (Resume, Cover letter, Report, Memo, Meeting notes, Blank, plus user-saved templates from STORE_USER_TEMPLATES). |
| **Open**       | Browse from device · Open from File System (FSA API) · Recent. |
| **Save / Save As** | Save .rwd · Save to file (FSA) · Save with password (.rwd.enc, AES-GCM) · Save as template. |
| **Print**      | Print / Save as PDF (Ctrl+P) · Print preview · Export PDF. |
| **Share**      | Share link (URL hash) · Share read-only · Share comment-only · Collaborate (P2P) · Email this doc · Copy Slack-Markdown. |
| **Cloud sync** | GitHub Gist · WebDAV / Nextcloud. |
| **Export**     | Word .docx · PDF · HTML · Markdown · Plain text · ODT · RTF · EPUB · AsciiDoc · LaTeX. |
| **Info**       | Properties · Version history · Writing goal · Inspect document. |
| **Tools**      | Mail merge · Compare · Markdown live preview · Translate · Document themes · Brand kit · Custom CSS · Styles import / export · Save as template · Reset to template · Style cleaner. |
| **About**      | Version + build date + cache key (read from `RW_BUILD`). |

Source: `BACKSTAGE_SECTIONS` map in `app.js`.

## Home tab

| Group | Buttons | Source |
|---|---|---|
| Clipboard | Cut · Copy · Paste · Format painter | `app.js` `// FEATURE: Cut / Copy / Paste`, `// FEATURE: Format painter` |
| Font | family · size · B / I / U / S / sub / sup · font colour swatches · highlight swatches · clear formatting · change case | `app.js` `// IMPROVEMENT: Color swatches palette + recent colors` |
| Paragraph | Bulleted · Numbered · Multi-level (1.1.1) · Bullet style · Collapse-to-level · Align L / E / R / J · indent / outdent · line spacing | `app.js` `// FEATURE: Multi-level numbered lists`, `Section D — Lists & outlining`, `// FEATURE: Line / paragraph spacing controls` |
| Styles | Block style · Custom style · Manage styles | `app.js` `// FEATURE: Custom paragraph styles` |
| Editing | Undo · Redo · Find & Replace (Ctrl+F) — regex, whole-word, scope, format filter, saved searches | `app.js` `// ---------- Find & Replace`, `Section J — Search advanced` |
| Voice | Dictate | `app.js` `// FEATURE: Voice dictation` |

## Insert tab

| Group | Buttons / dropdowns |
|---|---|
| Pages | Cover page · Blank page · Page break |
| Tables | Table · Text→Table · Table→Text |
| Illustrations | Picture · Pictures dropdown (Gallery / Carousel / Linked URL) · Shapes dropdown (Rectangle / Ellipse / Arrow / Text box) · Chart from CSV |
| Media | Video (YouTube / Vimeo) · Audio · Iframe · QR code · Code-39 barcode |
| Links | Link (Ctrl+K) · Bookmark · Bookmarks dropdown |
| Comments | Comment (threaded) |
| Header & Footer | Header · Footer · Page number field · Field dropdown |
| Text | Word art · Drop cap · Pull quote · Code block · Quick parts · Tab stop · Lorem · Date · Hr |
| Symbols | Equation (LaTeX → MathML) · Symbol picker (categorised) · Emoji picker (categorised) |
| Forms | Text field · Checkbox · Dropdown · Date field · Number field · Form data CSV · Field codes |

## Design tab

| Group | Controls |
|---|---|
| Document Formatting | Document themes · Paragraph spacing presets |
| Page Background | Watermark |

Source: `Section F — Templates, themes, branding`, `// FEATURE: Line / paragraph spacing controls`, `// IMPROVEMENT: DRAFT / CONFIDENTIAL watermark`.

## References tab

| Group | Buttons |
|---|---|
| Contents | TOC · List of figures / tables / equations |
| Footnotes & captions | Footnote · Caption (auto-numbered) · Cross-reference (autocomplete picker) |
| Citations | Cite · Bibliography · Citation style picker (APA / MLA / Chicago / IEEE / Harvard / Vancouver) |
| Lookup | DOI lookup · ISBN lookup · BibTeX import |
| Index | Mark index entry · Insert back-of-book index |

Source: `Section G — References & academic`, `// FEATURE: Citations + bibliography`, `// IMPROVEMENT: Auto-TOC`, `// IMPROVEMENT: Footnotes`.

## Layout tab

| Group | Controls |
|---|---|
| Page | Size (Letter / A4 / Legal) · Orientation (Portrait / Landscape) |
| Page setup | Margins (Normal / Narrow / Wide) · Columns (1 / 2 / 3) · Breaks |
| Flow | Line numbers · Hyphenation · Widow / orphan |
| Numbering | Heading numbering scheme (1.1.1 / I.A.1 / A.1.a / 1) / off) · Restart numbering at this heading |

Source: `Section B — Document model & styles depth (#11–#20)`.

## Mailings tab

| Group | Controls |
|---|---|
| Start Mail Merge | Mail merge modal for CSV + `{{Field}}` placeholders |

Source: `// FEATURE: Mail merge ({{Field}} + CSV)`.

## Review tab

| Group | Controls |
|---|---|
| Proofing | Spell check · Grammar · Word-count details |
| Speech | Read aloud |
| Comments | New · Pane · Resolve · Prev / Next |
| Tracking | Track changes toggle · Show-markup filter (All / Insertions / Deletions / Comments only / None) · Reviewer filter · Reviewing pane |
| Changes | Prev / Next · Accept / Reject · Accept-all / Reject-all |
| Compare | Compare · Side-by-side (synced scrolling) · 3-way merge |
| Protect | Restrict editing · Mark final · Inspect document |
| Language | Language picker · Section language tag · Translate |

Source: `// FEATURE: Review tab — restructure + 9 review-depth items (#1–#10)`, `// FEATURE: Track changes (Tier 1, gap #2)`, `// FEATURE: Compare two documents`, `// FEATURE: Threaded comments with @-mentions`, `// FEATURE: Grammar check`.

## View tab

| Group | Controls |
|---|---|
| Zoom | − · slider · + · 100 % label · Fit width · Fit page · 100 % button (Ctrl+= / Ctrl+- / Ctrl+0) |
| Theme | Light / Dark / Sepia / High contrast |
| Show | Ruler · Navigation · Comments pane · Grammar pane |
| Modes | Focus (F11) · Read · Full-screen · More dropdown (Outline edit · Two-page spread · Side-by-side reading · Mobile preview · Dyslexia preset) |
| Writing aids | Spell check · Auto-correct (smart quotes + typos + smart caps + Markdown auto-format + symbol shortcuts) · Smart Compose ghost text |
| Macros | Record · Run macros |
| Properties | Document properties |
| Markup | Track changes · Restrict editing |

## Help tab

| Group | Controls |
|---|---|
| Help | Keyboard shortcuts · About RodmanWord |

## Status bar

| Item | Source |
|---|---|
| Dirty indicator (●) | `// IMPROVEMENT: Dirty indicator + last-edit timestamp` |
| Page X of Y | live-field engine |
| Word count (clickable → details modal with readability, Flesch, Flesch-Kincaid grade) | `// FEATURE: Word count details modal`, `// FEATURE: Readability stats` |
| Characters | computed live |
| Reading time | computed live |
| Cursor position (Ln X, Col Y) | `// IMPROVEMENT: Cursor position` |
| Document size in KB | `// IMPROVEMENT: Document size` |
| Goal progress bar | `// FEATURE: Writing goal` + `// IMPROVEMENT: Writing-goal completion celebration` |
| Dictation indicator | `// FEATURE: Voice dictation` |
| TTS indicator | `// FEATURE: Read aloud` |
| Format-painter indicator | `// FEATURE: Format painter` |
| Saved / last-edit timestamp | autosave |

## Hidden / power-user

| Feature | Source |
|---|---|
| Command palette (Ctrl+Shift+P) — searchable list of every action | `// FEATURE: Command palette` |
| Repeat last action (Ctrl+Alt+Y) | `// FEATURE: Repeat last action` |
| Right-click context menu (cut / copy / paste / format / link / comment / find-all) | `// IMPROVEMENT: Right-click context menu` |
| Keyboard cheatsheet (?) | `// FEATURE: Keyboard shortcuts cheatsheet` |
| Multi-cursor (Alt+Click) | `// Section I` |
| Block / column selection (Alt+Shift+Drag) | `// Section I` |
| Bracket matching | `// Section I` |
| Invert selection (Ctrl+Shift+I) | `// Section I` |
| Expand selection by syntactic unit (Ctrl+Shift+W) | `// Section I` |
| Toggle HTML comment (Ctrl+/) | `// Section I` |
| Duplicate line / paragraph (Ctrl+D) | `// Section I` |
| Move paragraph up / down (Alt+↑ / ↓) | `// IMPROVEMENT: Move paragraph / line up & down` |
| Smart bracket / quote auto-pair around selection | `// IMPROVEMENT: Smart auto-format helpers` |
| Markdown shortcuts (`**bold**`, `*italic*`, `` `code` ``) | `// IMPROVEMENT: Smart auto-format helpers` |
| Auto-link URLs on space | `// IMPROVEMENT: Smart auto-format helpers` |
| Smart list auto-conversion (`- `, `1. `) | `// IMPROVEMENT: Smart auto-format helpers` |
| Smart sentence capitalisation | `// IMPROVEMENT: Smart auto-format helpers` |
| Symbol shortcuts (`-->`, `(c)`, `(r)`, `(tm)`, …) | `// IMPROVEMENT: Inline symbol shortcuts` |
| TSV / CSV smart paste → table | `// IMPROVEMENT: TSV/CSV smart paste → table` |
| Drag-and-drop file open | `// IMPROVEMENT: Drag-and-drop file to open` |
| Toast notification system | `// IMPROVEMENT: Toast notifications` |
| Custom confirm dialog | `// IMPROVEMENT: Custom confirm dialog` |
| Outline pane (with mini-map, word count, drag-to-reorder) | `// FEATURE: Document outline / navigation pane`, `// FEATURE: Mini map`, `// IMPROVEMENT: Outline pane resize handle` |

## How this list was generated

```bash
grep -n '// FEATURE:\|// IMPROVEMENT:\|// FOUNDATION:' app.js
```

Returns 98 entries today. The headings above group them by ribbon
tab; the source-code anchors match the banner text exactly so a
`grep` always finds the implementation.
