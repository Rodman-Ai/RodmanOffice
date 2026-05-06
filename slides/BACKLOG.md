# RodmanSlides PowerPoint Ribbon Parity Backlog

This backlog tracks PowerPoint ribbon features visible in the reference
screenshots that are not yet exposed as working RodmanSlides controls. Draw and
Acrobat are intentionally out of scope and are not tracked in detail.

Effort key: S = small UI/command wrapper, M = moderate deck behavior, L = large
subsystem or external integration.

## Home

| Feature | Effort | Notes |
|---|---:|---|
| Undo / redo history | M | Visible disabled buttons were removed; needs deck snapshot or command history. |
| Paste dropdown variants | M | Needs paste-as-text/image/format choices. |
| Reset slide and section controls | M | Requires section model and layout reset behavior. |
| Font advanced controls | M | Strikethrough, character spacing, case, and clear-formatting need richer text-state handling. |
| Paragraph advanced controls | M | Line spacing, vertical alignment, columns, and paragraph direction need text layout support. |
| Find / replace / select menu | M | Needs deck-wide text search and object selection helpers. |
| Designer | L | Requires layout recommendation engine. |
| Add-ins and sensitivity labels | L | Requires extension/security and policy models. |

## Insert

| Feature | Effort | Notes |
|---|---:|---|
| Screenshot and photo album | M | Needs browser capture/import workflow and gallery insertion. |
| Icons, 3D models, and SmartArt | L | Needs asset libraries, diagram model, and editing/export support. |
| Charts | M | Needs chart model or shared chart engine for presentation elements. |
| Zoom, action buttons, and richer links | M | Current hyperlink support is basic. |
| True comments | L | Current Review entry opens Ask Claude; comment threads need a separate model. |
| Header & Footer | M | Needs slide/date/footer/number placeholders and export mapping. |
| WordArt | M | Needs text effect model. |
| Symbols and equations | M | Needs symbol/equation picker and text insertion/export behavior. |
| Media variants | M | Audio, embedded media controls, captions, and provider handling are deferred. |

## Design

| Feature | Effort | Notes |
|---|---:|---|
| Theme variants gallery | M | Theme colors are exposed, but PowerPoint-style variants are not. |
| Format background | M | Deck has theme backgrounds; per-slide background UI is deferred. |
| Design suggestions | L | Needs recommendation engine. |
| Full slide-size/page setup | M | 4:3 is saved but editor stage remains 16:9. |

## Transitions

| Feature | Effort | Notes |
|---|---:|---|
| Transition preview button | S | Needs a local preview path without starting full presentation mode. |
| Advanced transition gallery | M | Current transition set is intentionally small. |
| Effect options | M | Needs per-transition parameters. |
| Sound, duration, and advance-slide timing | M | Duration is stored but runtime currently uses fixed CSS timings. |

## Animations

| Feature | Effort | Notes |
|---|---:|---|
| Animation preview button | S | Needs one-element replay in the editor. |
| Animation pane | M | Needs visible list of element animations. |
| Add animation and effect options | M | Current animation command replaces animation state. |
| Trigger menu and animation painter | M | Trigger exists as a select; richer PowerPoint flows are deferred. |
| Reorder animation and timing controls | M | Needs ordered animation list per slide. |

## Slide Show

| Feature | Effort | Notes |
|---|---:|---|
| Custom slide show | M | Needs named subsets and show order. |
| Rehearse with coach and rehearse timings | L | Requires recording/timing pipeline. |
| Set Up Slide Show | M | Needs show options model. |
| Hide slide | M | Needs hidden-slide flag and presenter/runtime handling. |
| Use timings, media controls, presenter view options | M | Presenter view exists separately; full show settings are deferred. |
| Subtitles and subtitle settings | L | Requires speech/caption pipeline. |

## Record

| Feature | Effort | Notes |
|---|---:|---|
| Record audio and screen recording | L | Needs media capture, storage, timeline, and export support. |
| Cameo | L | Needs camera capture and slide element integration. |
| Clear recording and reset cameo | M | Depends on recording/cameo model. |
| Export to video | L | Needs render-to-video pipeline. |

## Review

| Feature | Effort | Notes |
|---|---:|---|
| Spelling and thesaurus | M | Needs local or service-backed language tooling. |
| Accessibility checker | L | Needs semantic checks and remediation UI. |
| Translate and language controls | M | Needs translation/language pipeline. |
| Mark all as read and show changes | L | Needs collaboration/version history. |
| Comment threads and navigation | L | Needs comment model, pane, and slide anchors. |
| Linked notes | L | Requires notes integration. |

## View

| Feature | Effort | Notes |
|---|---:|---|
| Outline, Notes Page, and Reading View | M | Normal and Slide Sorter exist; these views need separate render modes. |
| Slide, Handout, and Notes masters | L | Needs master slide model. |
| Ruler, gridlines, and guides toggles | M | Snap guides exist during drag; persistent overlays are deferred. |
| Color / grayscale / black-and-white views | M | Needs preview filters and print/export behavior. |
| Window management | L | Browser app needs multi-window/session support. |
| Macros | L | Needs script runtime and safety model. |

## Help

| Feature | Effort | Notes |
|---|---:|---|
| Contact support and feedback | S | Needs configured destination. |
| Show training and What's New | S | Needs content source. |
| Mobile app prompt | S | Not relevant unless replaced with RodmanOffice install/help content. |
| Teams and Share integrations | L | Requires hosted identity/integration surface. |
