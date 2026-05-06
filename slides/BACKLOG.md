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
| Advanced reset slide and section controls | M | Basic slide reset exists; section model and section controls remain deferred. |
| Advanced font controls | M | Strikethrough, character spacing, change case, and basic clear-formatting exist; richer typography remains deferred. |
| Advanced paragraph controls | M | Basic line spacing exists; vertical alignment, columns, and paragraph direction remain deferred. |
| Advanced find / replace / select menu | M | Basic deck-wide find, replace, and select-all controls exist; richer scoped search options remain deferred. |
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
| Advanced Header & Footer | M | Basic footer text and slide-number insertion exist; date/header placeholders and export mapping remain deferred. |
| Advanced WordArt | M | Basic styled WordArt text insertion exists; richer text effects remain deferred. |
| Symbols and equations | M | Basic prompt-based symbol/equation text insertion exists; picker UI and rendered equation export remain deferred. |
| Media variants | M | Video and direct audio URL insertion exist; captions, camera, and richer provider handling are deferred. |

## Design

| Feature | Effort | Notes |
|---|---:|---|
| Theme variants gallery | M | Theme colors are exposed, but PowerPoint-style variants are not. |
| Advanced format background | M | Basic per-slide solid background color exists; gradient/picture/background pane options remain deferred. |
| Design suggestions | L | Needs recommendation engine. |
| Full slide-size/page setup | M | 4:3 is saved but editor stage remains 16:9. |

## Transitions

| Feature | Effort | Notes |
|---|---:|---|
| Advanced transition gallery | M | Current transition set is intentionally small. |
| Effect options | M | Needs per-transition parameters. |
| Sound and advanced advance-slide timing | M | Duration, on-click, and automatic advance timing exist; transition sounds and richer effect timing remain deferred. |

## Animations

| Feature | Effort | Notes |
|---|---:|---|
| Advanced animation pane | M | Basic animation list is exposed; reorderable pane editing remains deferred. |
| Add animation and effect options | M | Current animation command replaces animation state. |
| Trigger menu and animation painter | M | Trigger exists as a select; richer PowerPoint flows are deferred. |
| Reorder animation and advanced timing controls | M | Duration and delay controls exist; ordered animation lists remain deferred. |

## Slide Show

| Feature | Effort | Notes |
|---|---:|---|
| Custom slide show | M | One-off custom shows by slide-number ranges exist; named subsets and reusable show order remain deferred. |
| Rehearse with coach and rehearse timings | L | Requires recording/timing pipeline. |
| Set Up Slide Show | M | Needs show options model. |
| Advanced hide slide | M | Hidden-slide flag and presentation skipping exist; custom-show and print/export options remain deferred. |
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
| Advanced ruler, gridlines, and guides | M | Persistent editor overlays now exist; snapping, settings, and print/export behavior remain deferred. |
| Advanced color / grayscale / black-and-white views | M | Editor preview filters now exist; print/export behavior remains deferred. |
| Window management | L | Browser app needs multi-window/session support. |
| Macros | L | Needs script runtime and safety model. |

## Help

| Feature | Effort | Notes |
|---|---:|---|
| Teams and Share integrations | L | Requires hosted identity/integration surface. |
