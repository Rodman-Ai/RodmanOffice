# RodmanWord Microsoft Word Parity Backlog

This backlog tracks Microsoft Word ribbon features visible in the reference
screenshots that are not yet exposed as working RodmanWord controls. Acrobat is
intentionally excluded.

Effort key: S = small UI/command wrapper, M = moderate document behavior, L =
large subsystem or format model work.

## Home

| Feature | Effort | Notes |
|---|---:|---|
| Paste dropdown variants | M | Needs paste-special choices such as plain text, merge formatting, and keep source formatting. |
| Rich Styles gallery previews | M | Current styles are selects; Word uses a horizontal visual gallery. |
| Editor pane parity | L | Current spelling/grammar tools are lighter than Word Editor. |
| Add-ins surface | L | Needs extension manifest/security model before add-ins are trustworthy. |
| Sensitivity labels | L | Requires policy/tenant model, labels, and export metadata. |
| Request signatures | L | Needs real signing workflow or integration. |

## Insert

| Feature | Effort | Notes |
|---|---:|---|
| SmartArt | L | Needs diagram model, editing UI, and export behavior. |
| Icons library | M | Could start with a bundled icon picker. |
| 3D Models | L | Needs asset handling and renderer/export strategy. |
| Screenshot insertion | M | Browser capture permissions and fallback UX required. |
| Full online video provider picker | M | Current video insert is basic. |
| eSignature fields | L | Requires field schema and signing semantics. |

## Design

| Feature | Effort | Notes |
|---|---:|---|
| Word-like theme gallery strip | M | Current Document Themes modal is functional but not a ribbon gallery. |
| Separate Colors, Fonts, and Effects menus | M | Existing document themes bundle these together. |
| Set as Default | M | Needs persistent default theme/style behavior. |
| Page Color | M | Needs print/export-safe page background handling. |
| Page Borders | M | Needs page-level border model and export mapping. |

## Layout

| Feature | Effort | Notes |
|---|---:|---|
| Numeric left/right indent controls | M | Current indent/outdent commands are coarse. |
| Numeric before/after paragraph spacing controls | M | Current spacing select is preset-based. |
| Breaks dropdown with all Word break types | M | Current section/page breaks cover only the basics. |
| Advanced line-number options | M | Current line numbers are a toggle. |
| Advanced hyphenation options | M | Current hyphenation is a toggle. |
| Ribbon Arrange controls | L | Position, wrap, bring/send, group, rotate, and selection pane need reliable object selection/state. |

## References

| Feature | Effort | Notes |
|---|---:|---|
| Endnotes | M | Footnotes exist; endnotes need separate collection and rendering. |
| Manage Sources | M | Current citations are lightweight. |
| Citation provider switching | M | Needs provider abstraction beyond local source records. |
| Update TOC/table buttons | S | Current generated fields update through the live-field engine, but explicit update controls are not exposed. |
| Table of Authorities | L | Requires legal citation model and marked authorities. |

## Mailings

| Feature | Effort | Notes |
|---|---:|---|
| Envelopes | M | Needs envelope page presets and address layout. |
| Labels | M | Needs label sheet templates and repeated layout. |
| Recipient list manager | M | Current mail merge accepts pasted CSV only. |
| Edit recipient list | M | Needs table UI for CSV rows. |
| Highlight merge fields | S | Could visually mark `{{Field}}` placeholders. |
| Address block and greeting line | M | Needs field mapping helpers. |
| Insert merge field dropdown | S | Can be powered by parsed CSV headers after a source is loaded. |
| Rules, Match Fields, Update Labels | M | Requires richer merge source state. |
| Preview results and find recipient | M | Needs preview mode before download. |
| Check for errors | M | Needs validation pass over template and recipients. |
| Finish & Merge destinations | M | Current output is merged HTML download only. |

## Review

| Feature | Effort | Notes |
|---|---:|---|
| Thesaurus | M | Needs local or service-backed synonym data. |
| Accessibility checker | L | Needs semantic checks and actionable issue panel. |
| Linked notes / OneNote-style integration | L | Requires external integration or local notes model. |
| Ink hide/show parity | L | Needs ink/stylus model first. |

## View

| Feature | Effort | Notes |
|---|---:|---|
| Print Layout / Web Layout / Outline / Draft view modes | L | Current modes are focus/read/full plus advanced reader options. |
| Gridlines | S | Could be an editor overlay toggle. |
| Side-to-side page movement | M | Needs multi-page viewport model. |
| New Window / Arrange All / Split / Switch Windows | L | Browser app needs multi-window document session support. |
| SharePoint properties | L | Requires SharePoint integration. |

## Help

| Feature | Effort | Notes |
|---|---:|---|
| What's New | S | Needs release-note source. |
| Contact Support | S | Needs support URL/mail target. |
| Feedback | S | Needs feedback destination. |
| Show Training | M | Needs training content. |
| Get Word Mobile App equivalent | S | Likely not relevant unless replaced with RodmanOffice install help. |
