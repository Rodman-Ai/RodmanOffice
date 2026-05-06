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
| Advanced icons library | M | Basic icon insertion exists; bundled searchable icon gallery remains deferred. |
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
| Advanced Page Color | M | Basic persisted page color control exists; print/export-safe document metadata is still deferred. |
| Advanced Page Borders | M | Basic page border toggle exists; border presets and export mapping remain deferred. |

## Layout

| Feature | Effort | Notes |
|---|---:|---|
| Advanced paragraph indent controls | M | Basic numeric left/right indent controls exist; first-line/hanging presets remain deferred. |
| Advanced before/after paragraph spacing controls | M | Basic numeric before/after controls exist; style-aware spacing presets remain deferred. |
| Breaks dropdown with all Word break types | M | Current section/page breaks cover only the basics. |
| Advanced line-number options | M | Current line numbers are a toggle. |
| Advanced hyphenation options | M | Current hyphenation is a toggle. |
| Ribbon Arrange controls | L | Position, wrap, bring/send, group, rotate, and selection pane need reliable object selection/state. |

## References

| Feature | Effort | Notes |
|---|---:|---|
| Advanced endnotes | M | Basic endnotes exist; conversion, renumbering options, and export mapping remain deferred. |
| Manage Sources | M | Current citations are lightweight. |
| Citation provider switching | M | Needs provider abstraction beyond local source records. |
| Table of Authorities | L | Requires legal citation model and marked authorities. |

## Mailings

| Feature | Effort | Notes |
|---|---:|---|
| Advanced envelopes | M | Basic envelope layout insertion exists; presets and print setup remain deferred. |
| Advanced labels | M | Basic repeated label sheet insertion exists; template sizes and merge integration remain deferred. |
| Recipient list manager | M | Current mail merge accepts pasted CSV only. |
| Edit recipient list | M | Needs table UI for CSV rows. |
| Address block and greeting line | M | Needs field mapping helpers. |
| Rules, Match Fields, Update Labels | M | Requires richer merge source state. |
| Preview results and find recipient | M | Needs preview mode before download. |
| Check for errors | M | Needs validation pass over template and recipients. |
| Finish & Merge destinations | M | Current output is merged HTML download only. |

## Review

| Feature | Effort | Notes |
|---|---:|---|
| Advanced thesaurus | M | Ribbon opens the selected word in Merriam-Webster; local/service-backed synonym data remains deferred. |
| Accessibility checker | L | Needs semantic checks and actionable issue panel. |
| Linked notes / OneNote-style integration | L | Requires external integration or local notes model. |
| Ink hide/show parity | L | Needs ink/stylus model first. |

## View

| Feature | Effort | Notes |
|---|---:|---|
| Print Layout / Web Layout / Outline / Draft view modes | L | Current modes are focus/read/full plus advanced reader options. |
| Side-to-side page movement | M | Needs multi-page viewport model. |
| New Window / Arrange All / Split / Switch Windows | L | Browser app needs multi-window document session support. |
| SharePoint properties | L | Requires SharePoint integration. |

## Help

| Feature | Effort | Notes |
|---|---:|---|
| Advanced training content | M | Current Help tab has a starter training guide; richer guided tutorials remain deferred. |
