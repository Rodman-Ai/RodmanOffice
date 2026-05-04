# UX/UI Review Across RodmanOffice

Scope: launcher, Word, Sheets, Slides, Image, Accounting, CRM, Converter.

This pass is based on the app structure, CSS, copy, and interaction code. I was not able to run a live screenshot pass in this workspace because browser automation was unavailable.

## Most Pressing

### P1 - Align product promises with what users can safely rely on

The largest UX problem is trust. The suite repeatedly tells users that apps are offline/PWA-capable or AI-native, while key parts are unavailable, outside service-worker scope, demo-only, or disabled.

Examples:

- The launcher says each app can be pinned and used offline at `index.html:177` and mentions service workers for offline support at `index.html:186`.
- Converter says it works offline once loaded at `converter/index.html:79`, but conversion engines live under shared `/lib`.
- Sheets presents "Ask Claude" prominently at `sheets/apps/web/src/App.tsx:476-479`, even when the panel must explain AI is not configured at `sheets/apps/web/src/SidePanel.tsx:120-122`.
- Image claims offline/PWA support in docs, but its service worker precaches a missing file and shared image engines are outside its cache.

Why this is most pressing: office/productivity tools ask users to trust them with work. If "offline", "saved", "AI", "export", or "undo" does not behave as expected, users lose confidence very quickly.

Recommended UX fix: create explicit capability states for every app: Online, Offline-ready, Demo mode, AI disabled, Export engine unavailable, Save failed. Make those states visible in title/status bars and disable or relabel actions that cannot work.

### P1 - Remove no-op and placeholder controls from primary toolbars

Slides exposes undo/redo buttons at `slides/index.html:81-82`, but the handlers are placeholders at `slides/app.js:969-971`. Sheets shows disabled font controls at `sheets/apps/web/src/Ribbon.tsx:108-116` and "coming soon" ribbon content at `sheets/apps/web/src/Ribbon.tsx:272-275`.

Why this matters: ribbon UIs imply parity with familiar Office apps. A visible command that does nothing is worse than not having the command at all.

Recommended UX fix: ship no-op controls as disabled with clear labels only in secondary menus, or hide them until implemented. For undo/redo specifically, prioritize real history before more feature breadth.

### P1 - Standardize save, autosave, and recovery communication

The apps vary widely:

- Word has a visible saved/saving/save-failed status at `word/index.html:797` and `word/app.js:661-673`.
- Slides has a small save indicator, but many destructive operations still use native confirm dialogs.
- Image silently catches localStorage autosave failures at `image/js/app.js:1730`.
- Accounting uses toasts and modals well, but encrypted persistence can fail out of order at the data layer.

Recommended UX fix: define a suite-wide save contract: visible saved state, visible save-failed state, recovery path, storage quota messaging, and "last saved" timestamp. Use the same language across apps.

## Cross-App UX Findings

### P2 - The suite feels like a collection of prototypes rather than one product family

Naming and visual language vary heavily: RodmanWord, RodmanSheets, RodmanSlides, RodmanConvert, RodBooks, LeoCRM, "AiCell" in the root README/launcher, and "Retro modes" in Image. Examples include `accounting/index.html:10`, `crm/src/app/layout.tsx:7`, `sheets/apps/web/src/App.tsx:451`, and `image/index.html:96`.

Recommended UX fix: keep the sub-brand names if desired, but add one consistent suite frame: app switcher, help/about pattern, status language, PWA/offline language, icon style, and destructive-action treatment.

### P2 - Native alerts/confirms break flow and undercut the app feel

Word, Slides, Image, and Sheets still use browser `alert()` / `confirm()` for many important states, including destructive actions and export failures. Examples: `slides/app.js:924-961`, `image/js/app.js:1572-1740`, `word/app.js:4820-4838`, and `sheets/apps/web/src/App.tsx:451`. Accounting and CRM already have stronger custom modal/toast primitives.

Recommended UX fix: reuse Accounting/CRM-style dialog primitives across the static apps, with consistent button labels, danger styling, and recovery language.

### P2 - Dense ribbons need progressive disclosure

Word, Sheets, and Slides deliberately mimic Office ribbons. That is useful for discoverability, but Word in particular exposes a very large command surface directly in the ribbon, with many icon/text combinations and touch-hostile title-tooltip reliance. On mobile, Word compresses the ribbon into a single horizontal row at `word/styles.css:2543-2558`.

Recommended UX fix: keep core editing controls in the ribbon, move advanced/specialty tools into command palette/search or grouped dialogs, and make the mobile toolbar task-based rather than a shrunken desktop ribbon.

### P2 - Accessibility is uneven

The launcher and some app back buttons use ARIA well, but many toolbar buttons rely on `title` text and symbolic/emoji labels. Examples: Word ribbon buttons around `word/index.html:66-120` and Slides ribbon buttons around `slides/index.html:81-82`.

Recommended UX fix: add real `aria-label`s to icon-only controls, make disabled states screen-reader clear, and avoid relying on hover-only title text for command meaning.

### P2 - Demo/disabled modes need more direct task guidance

Sheets and CRM have demo/disabled states, but users need clearer guidance about what they can still accomplish. Sheets has "Demo mode (no backend)" status at `sheets/apps/web/src/App.tsx:392-397`, and CRM has a demo banner at `crm/src/components/DemoBanner.tsx:13-26`.

Recommended UX fix: replace passive banners with task-aware affordances: "Try formulas", "Import sample CSV", "AI unavailable in demo", "Connect backend to save workbooks", "Reset demo".

## App-By-App Notes

### Launcher

Good: clear app tiles and simple suite framing.

Needs work: the offline/PWA promise is too broad for the current shared-library architecture. The launcher should tell users which apps are demos, which are local-only, and which workflows need a backend/network.

### Word

Good: best save-state communication in the suite, rich editing surface, strong status bar.

Needs work: too many advanced controls are exposed at once, many controls rely on hover titles, and native confirmations make major actions feel rough. Mobile ribbon is functional but cognitively heavy.

### Sheets

Good: strongest Office-style visual consistency with Word/Slides, clear grid-first focus, visible demo/backend status.

Needs work: AI is branded as a core affordance even when disabled, and visible disabled/coming-soon controls reduce confidence. The side panel should become contextual only when AI is available.

### Slides

Good: recognizable PowerPoint-style structure and presenter/status affordances.

Needs work: visible undo/redo no-ops are the top Slides UX problem. Import/export errors and destructive actions also need custom dialogs.

### Image

Good: playful visual modes and strong tool density for a creative app.

Needs work: the app leans into retro affordances, but important modern expectations like autosave failures, offline install, and advanced script execution need clearer safety/state messaging.

### Accounting

Good: one of the most coherent UX systems in the repo: sidebar, tabbar, modals, focus trapping, toasts, and mobile drawer are all intentional.

Needs work: financial/tax features need higher-trust copy around stale rates, API keys, encryption, and persistence. The nav is large enough that task-based onboarding or favorites would help.

### CRM

Good: most polished SaaS-style UX: command palette, quick add, demo banner, bottom mobile nav, toasts/modals, and clear cards.

Needs work: demo vs real mode should be more action-oriented, and some pages still fall back to native confirms. PWA install prompting should be carefully gated because CRM is server-backed and not truly offline-first.

### Converter

Good: simplest and clearest first-run UX in the suite. The drop zone and queue model are easy to understand.

Needs work: status handling must cover worker/import failure and offline-unavailable engines. A conversion that hangs is the worst possible Converter experience.

## Recommended Fix Order

1. Rewrite the launcher and per-app status copy around offline/demo/AI/export capabilities.
2. Remove or disable primary-toolbar no-ops, starting with Slides undo/redo.
3. Add a shared save/recovery/status pattern and surface storage/quota failures.
4. Replace native alert/confirm calls in Word, Slides, Image, and Sheets with shared dialogs/toasts.
5. Add a lightweight suite design system: naming, app switcher/back button, status bars, danger dialogs, empty states, command palette behavior, and accessibility labels.
6. Do a mobile-specific pass on Word/Sheets/Slides ribbons and Accounting/CRM dense operational screens.

