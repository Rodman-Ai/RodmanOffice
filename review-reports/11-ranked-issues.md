# Ranked Engineering + UX/UI Issue Backlog

This is the combined backlog across engineering, documentation, and UX/UI. UX/UI issues are not separated into a later polish bucket: trust-breaking interface problems, misleading states, and no-op controls are ranked alongside build, security, and data-loss issues.

Ranking favors important and easy fixes first, then moves toward less important or harder work.

Effort key:

- `S` - localized fix, usually same day
- `M` - one to three focused days
- `L` - cross-app or architectural work
- `XL` - larger product/design initiative

Tag key:

- `[Build]` - build, deploy, CI, or tooling
- `[Security]` - vulnerability, abuse, secret handling, or untrusted input
- `[Data]` - persistence, data loss, or correctness
- `[PWA]` - offline, service worker, installability, or shared runtime availability
- `[UX]` - interaction, affordance, state clarity, accessibility, or product trust
- `[Docs]` - documentation, README, release notes, or runbooks

## Progress

First resolution pass completed:

- Done: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12.
- Adjusted by preference: 14. The Sheets disabled AI button stays visible as an intentional setup affordance, with an inline code comment so future cleanup does not remove it.
- Verified: CRM `npm run typecheck`, CRM `npm run build`, Sheets `corepack pnpm -r typecheck`, and focused static JavaScript syntax checks.

## Do First

1. `P0 / S` `[Build]` - Fix the CRM TypeScript build blocker.
   Area: CRM, deploy. `crm/src/app/api/members/route.ts` passes `Member` where `appendRow` expects `Record<string, unknown>`. This blocks CRM build and root Pages deploy.

2. `P1 / S` `[PWA] [UX]` - Remove the missing `./js/io.js` asset from Image service-worker precache.
   Area: Image, PWA. This is a tiny fix that unblocks service-worker install.

3. `P1 / S` `[UX] [PWA]` - Sync Word cache metadata with the service worker.
   Area: Word. `word/sw.js` uses `rwd-v10`, while `word/app.js` and changelog still say `rwd-v9`.

4. `P1 / S` `[Data] [UX]` - Update Accounting's default IRS mileage rate and label it by tax year.
   Area: Accounting. Current default is 2024's `0.67`; 2025 and 2026 rates are higher.

5. `P1 / S` `[UX]` - Disable or hide Slides undo/redo until they work.
   Area: Slides, UX. The buttons are visible but command handlers are placeholders. Hiding or disabling is the fast fix; real history can follow.

6. `P1 / S` `[Docs] [Build]` - Fix the stale `/lib` ownership comment.
   Area: Shared libraries. `lib/index.js` says only Converter consumes shared libraries, but Word, Slides, Image, and Converter all do.

7. `P1 / S` `[UX] [PWA] [Docs]` - Rewrite the launcher's broad offline/PWA promise.
   Area: Launcher, UX/docs. The current copy says each app can be used offline, which is not reliably true for shared-library workflows.

8. `P1 / S` `[Docs] [UX]` - Update root README app inventory and shared-runtime description.
   Area: Docs. Add Converter and remove the "no shared runtime" claim.

9. `P1 / S` `[Docs] [Build]` - Fix deploy workflow references in docs.
   Area: Docs. Word, Accounting, and CRM still point at old or standalone deployment stories instead of RodmanOffice's Pages workflow.

10. `P1 / S` `[UX] [Security]` - Relabel Image Script-Fu from "sandboxed" to trusted JavaScript execution.
    Area: Image, UX/security. The quick fix is wording; true sandboxing is a later architecture item.

11. `P2 / S` `[UX] [Build]` - Add converter worker `onerror` and `onmessageerror` handling.
    Area: Converter. This prevents the worst UX failure: conversions hanging forever.

12. `P2 / S` `[UX] [Data]` - Add UI feedback for Image autosave/localStorage quota failures.
    Area: Image. Right now save failures can be silently swallowed.

13. `P2 / S` `[UX]` - Replace the Sheets `about` browser alert with an in-app modal.
    Area: Sheets, UX. Low effort and removes an obvious native-browser rough edge.

14. `P2 / S` `[UX]` - Document the Sheets AI-disabled title-bar affordance as intentional.
    Area: Sheets, UX. Keep the disabled/setup affordance visible, but leave a code comment so future cleanup does not remove it.

15. `P2 / S` `[UX]` - Remove or demote Sheets "coming soon" ribbon rows.
    Area: Sheets, UX. Primary ribbons should not advertise unavailable work.

16. `P2 / S` `[Security]` - Fix CRM API token generation to use cryptographic randomness.
    Area: CRM. Replace `Math.random` token generation and plan token hashing next.

17. `P2 / S` `[Docs] [Security]` - Add a vendored dependency inventory for `/lib/images`.
    Area: Shared libraries/docs. List `ag-psd`, PDF.js, versions, licenses, and update process.

18. `P2 / S` `[Docs] [PWA]` - Update Word docs for shared `/lib/docs` engines.
    Area: Word docs. The app no longer owns local `docx.js`, `pdfio.js`, and `interop.js` files.

19. `P2 / S` `[Docs] [UX]` - Update Image README dependency and trust-boundary language.
    Area: Image docs. It currently says "No dependencies" and understates shared/vendor code.

20. `P2 / S` `[Docs] [UX]` - Add app READMEs for Slides and Converter.
    Area: Docs. Both apps need basic supported-format, offline, and known-gap docs.

## Do Next

21. `P1 / M` `[Security] [Build]` - Upgrade CRM dependencies to clear critical/high advisories.
    Area: CRM security. Start with patched Next.js, then rerun audit/build/typecheck.

22. `P1 / M` `[Security] [Build]` - Upgrade Sheets vulnerable dependencies.
    Area: Sheets security. Address Vite/esbuild and `@anthropic-ai/sdk` audit findings.

23. `P1 / M` `[Security] [Data]` - Add archive limits to `lib/docs` ZIP reading.
    Area: Shared libraries/security. Cap archive size, entry count, per-entry uncompressed size, and total uncompressed output.

24. `P1 / M` `[Security] [UX]` - Sanitize imported Slides deck HTML.
    Area: Slides security. User-supplied deck JSON can put raw HTML into rendered slides.

25. `P1 / M` `[Data] [Security]` - Serialize Accounting encrypted writes.
    Area: Accounting data loss. Add revision/queue logic so older encryptions cannot overwrite newer state.

26. `P1 / M` `[Security] [UX]` - Add abuse protection to CRM public form submissions.
    Area: CRM security/UX. Add rate limiting, spam controls, duplicate throttling, and optional CAPTCHA/turnstile.

27. `P1 / M` `[UX] [Build]` - Add converter worker failure UI and retry path.
    Area: Converter UX. Pair worker error handling with a visible status and a "try again" path.

28. `P1 / M` `[UX] [PWA]` - Add suite capability states.
    Area: Cross-app UX. Standard labels for Online, Offline-ready, Demo mode, AI disabled, Export unavailable, Save failed.

29. `P1 / M` `[UX] [Data]` - Standardize save/recovery language in app status bars.
    Area: Cross-app UX. Word is closest; Image, Slides, Accounting, and Converter need clearer save/recovery feedback.

30. `P1 / M` `[Build] [PWA]` - Add static app smoke checks to CI.
    Area: CI. Cover service-worker precache assets, JS syntax, app shell load, and basic route render.

31. `P1 / M` `[Build]` - Add root verification gates for CRM and Sheets.
    Area: CI. Run CRM typecheck/build, Sheets tests/typecheck/build, and audits before publish.

32. `P1 / M` `[Security] [UX] [Docs]` - Add a suite security/trust model document.
    Area: Security docs. Clarify local-only secrets, hosted backends, browser storage, AI keys, PATs, and public forms.

33. `P2 / M` `[Security] [UX]` - Gate Accounting provider secrets behind encryption or stronger warnings.
    Area: Accounting UX/security. Users adding Plaid/Stripe/LLM keys need a clear risk path.

34. `P2 / M` `[Security] [UX]` - Strengthen Word GitHub PAT storage warnings or use session-only storage.
    Area: Word UX/security. LocalStorage PAT persistence should be explicit and minimal-scope.

35. `P2 / M` `[UX]` - Replace native alerts/confirms in Slides with suite dialogs/toasts.
    Area: Slides UX. Start with destructive reset, PPTX import/export errors, and layout replacement.

36. `P2 / M` `[UX]` - Replace native alerts/confirms in Image with app toasts/modals.
    Area: Image UX. This will make errors and tool guidance feel like part of the app.

37. `P2 / M` `[UX]` - Replace native alerts/confirms in Word's high-impact flows.
    Area: Word UX. Start with destructive style reset, restore version, shared-link open, iframe embed, and table delete.

38. `P2 / M` `[Security] [UX]` - Make CRM owner refresh-token reveal a safer setup flow.
    Area: CRM UX/security. Add reauth/one-time reveal/copy warning rather than returning it as routine settings data.

39. `P2 / M` `[Build]` - Add a non-interactive CRM ESLint config.
    Area: CRM tooling. The current lint script prompts interactively.

40. `P2 / M` `[Build]` - Fix Sheets top-level `pnpm` script portability.
    Area: Sheets tooling. The scripts assume a bare `pnpm` shim even when `corepack pnpm` works.

41. `P2 / M` `[Build] [PWA]` - Add service-worker asset validation.
    Area: CI/PWA. This would have caught Image's missing precache file.

42. `P2 / M` `[Docs] [UX]` - Update CRM docs to match schema and static demo.
    Area: CRM docs. Schema has far more tabs than README says, and deployment docs do not match RodmanOffice.

43. `P2 / M` `[Docs] [Build]` - Update Sheets architecture and model docs.
    Area: Sheets docs. Component names, test counts, and default model references are stale.

44. `P2 / M` `[Docs] [Data]` - Update Accounting roadmap and tax-constant process docs.
    Area: Accounting docs. Remove shipped items from roadmap and add yearly tax-rate review.

45. `P2 / M` `[Build] [Security]` - Add shared-library tests for malformed files and round trips.
    Area: Shared libraries. Start with `lib/docs` and `lib/slides` fixtures.

46. `P2 / M` `[Build] [Data]` - Add Accounting smoke/calculation tests.
    Area: Accounting. Prioritize tax, mileage, invoices, import/export, and route render.

47. `P2 / M` `[Build] [UX]` - Add Converter fixture tests.
    Area: Converter. Verify common conversions, unsupported conversions, worker failure, and bulk ZIP output.

## Then

48. `P1 / L` `[Security] [UX]` - Fix public Sheets API auth/tenancy model.
    Area: Sheets security/product. Browser-embedded `VITE_API_TOKEN` is not a real public security boundary. Real fix needs user auth and per-workbook authorization.

49. `P1 / L` `[PWA] [UX]` - Decide the shared-library offline architecture.
    Area: PWA architecture. Either root service worker, app-local bundled shared engines, or honest "shell-only offline" product copy.

50. `P2 / L` `[UX] [PWA]` - Make Word/Slides/Image/Converter import-export offline states accurate.
    Area: Cross-app PWA UX. Once architecture is chosen, each app needs clear disabled/error states for missing engines.

51. `P2 / L` `[UX] [Build]` - Reduce Sheets production bundle size.
    Area: Sheets performance. Requires code splitting and dependency review.

52. `P2 / L` `[Build] [UX]` - Add frontend tests for Sheets.
    Area: Sheets quality. Cover selection, paste, formatting, undo/redo, and API/demo behavior.

53. `P2 / L` `[UX]` - Add accessibility labels to icon-heavy toolbars.
    Area: Cross-app UX/accessibility. Word, Slides, Image, and Sheets rely heavily on symbolic buttons and hover titles.

54. `P2 / L` `[UX]` - Improve demo/disabled task guidance.
    Area: UX. Demo banners should point to useful actions: try formulas, import samples, connect backend, reset demo.

55. `P2 / L` `[UX]` - Unify app switcher/back button, help/about, empty states, and danger dialogs.
    Area: Suite UX. This gives the suite one product feel without erasing app personality.

56. `P2 / L` `[UX]` - Improve Accounting mobile navigation for dense workflows.
    Area: Accounting UX. The system is coherent, but the nav is large and would benefit from favorites/recent/task onboarding.

57. `P2 / L` `[UX] [PWA]` - Gate CRM PWA install prompts carefully.
    Area: CRM UX. CRM is server-backed and not offline-first, so install copy must not imply offline reliability.

58. `P2 / L` `[Security] [UX]` - Build a real Image Script-Fu sandbox.
    Area: Image security/architecture. The quick label fix is earlier; true sandboxing needs an iframe/worker capability boundary.

## Later

59. `P2 / XL` `[UX]` - Progressive-disclosure pass for dense ribbons.
    Area: Word/Sheets/Slides UX. Keep core editing visible, move advanced tools to command search or grouped dialogs.

60. `P2 / XL` `[UX]` - Mobile-specific redesign for Word/Sheets/Slides ribbons.
    Area: Mobile UX. A shrunken desktop ribbon works, but it is not the right long-term mobile model.

61. `P2 / XL` `[UX]` - Suite identity and naming cleanup.
    Area: Product. RodmanWord, RodmanSheets, RodBooks, LeoCRM, AiCell, and RodmanConvert need a consistent family model.

62. `P3 / S` `[Security]` - Remove `allow-same-origin` from Word inserted iframes unless needed.
    Area: Word security hardening. Low priority but easy if no feature depends on it.

63. `P3 / M` `[Docs] [Build]` - Add a root maintainer runbook.
    Area: Docs. Include install/build/test commands, Pages build path, audit process, and release checklist.

64. `P3 / M` `[Build]` - Add broader Converter conversion fixture coverage.
    Area: Converter quality. Valuable, but behind deploy blockers and safety fixes.

65. `P3 / M` `[UX]` - Replace remaining lower-risk native confirms in CRM/Accounting.
    Area: CRM/Accounting polish. These apps already have better primitives; clean up stragglers later.

66. `P3 / L` `[Security] [Build]` - Add richer shared-library dependency/security automation.
    Area: Shared libraries. Beyond inventory, automate vendored dependency checks where practical.

## Suggested First Sprint

If you want a tight first sprint, take items 1 through 20. They are mostly localized, high-signal fixes that will make the suite feel more trustworthy quickly.
