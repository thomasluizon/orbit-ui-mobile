# Sweep 06 — Code Quality (the 10 Code Standards) — issue #107, ROUND 3 (verification)

Date: 2026-06-13 · Read-only verification of WORKING TREES at committed green baseline.
- orbit-ui-mobile: `main` @ 6399d00 ("docs: finalize wave-3 deferral register").
- orbit-api: `dec5bcc` ("fix(api): ship errorCode from all controller failures + BulkSkip/count perf + naming").

Method: `npm run lint` + `npm run type-check` per workspace (both **3/3 green, ZERO warnings** — full logs reviewed, mobile `expo lint` re-run uncached → exit 0 / no output) + AST measurement scripts in `.claude/sweeps/107/round-3/*.mjs` (read-only: `measure-fns.mjs`, `measure-dup.mjs`, `dead-check.mjs`) + per-symbol importer verification scanning ALL files **including `__tests__` + barrels + paired Zod schemas**. dotnet NOT run (verified 0/0 prior). Deferral registers honored: DEF-1..DEF-8, DEF-2b, and every `DEFER:root` / `SKIP:not-a-function` in `wave3-deferrals.md` (62 parsed entries) — never reported.

## Headline: cleanup/D33/wave-3 fixes landed PARTIALLY since round 2

- **Rule 3 (`any`), Rule 4 (`console`/`Console.Write`): ZERO** in production code both repos (all `any` in `__tests__`; the single web `console.error` is the sanctioned centralized `logAuthRouteFailure` server logger for D23 BFF 500s, funnelled through one named fn — not debug spam).
- **Rule 8: BOTH round-2 findings FIXED.** OAuth cleanup-timer now logs via `LogCleanupFailed` source-gen; web `preferences` language-swallow gone (logic moved to `use-preference-controls.ts:42` which now rolls back `selectedLanguage`+cookie on catch, mirroring mobile). C# JsonException parse-fallbacks remain acceptable (round-2 ruling).
- **Rule 9: ALL 4 C# naming findings FIXED.** `var data`→`serviceTickStatuses`; `var info`→`goalSummary`/`metricsSummary`/`habitSummary`.
- **Rule 2 dead code: LARGELY RESOLVED.** `apps/mobile/lib/typography.ts` deleted; `motion.ts` `*ForTests`/`getReanimatedEasing`/`getSpringConfig` removed; `auth-api.ts` `getTokenExpiry`/`ResolvedServerSession` converted to internal (used, not exported); `isTokenRefreshRequired`/`getAuthToken` deleted; `HabitEmojiOption` removed; `extractErrorMessage` now consumed by `buildAuthErrorPayload`. Only **5 genuine dead exports survive.** The 21 shared `types/*` are confirmed FALSE POSITIVES (every paired schema is `.safeParse`-tested in `types.test.ts` and/or prod-used).
- **Rule 10 DRY: PARTIAL (D33).** Shared cores wired for `useTagSelection` + `useDismissGuard` (apps import `@orbit/shared/hooks`), but the React wrapper bodies are still byte-identical, and `highlightText` was NOT rewired (apps still define it locally). **24 still-open** ≥300-char duplications.
- **Rule 7 function size: wave-3 splits landed UNEVENLY.** 211 function-like nodes >100L measured (vs 210 round-2). Mobile splits genuinely landed for ~8 roots (breakdown-suggestion/notification-bell/support/retrospective/chat-input-area/onboarding-flow now sit at documented residuals); but the web side + many mobile screens were never split. **154 genuine oversized FUNCTIONS remain** (after excluding 22 literal-bodied `StyleSheet.create`/data factories, all `(anon)` JSX/effect callbacks, and 62 registered DEFER:root/SKIP/DEF-2b roots).

---

## Findings

### Rule 7 — TS function size (>100 lines). 154 genuine functions still over cap (NOT registered, NOT literal-bodied).

Measured by `measure-fns.mjs` (TS AST, line-span of every Function/Arrow/Method node). Excluded: 22 literal-bodied nodes (StyleSheet.create / data-array factories — calibration SKIP), 5 `(anon)` nodes (useMemo-returns-JSX inside DEF-2b roots, Zustand `create<>()` factory bodies, `.map(x=>{...})` inline list renderers — not standalone logic fns), and all 62 `wave3-deferrals.md` + DEF-2b registered roots. The 154 residual are byte-present, control-flow functions over the 100-line hard cap. All **HIGH · rule 7 · split into subcomponents/sub-hooks**. Notable head of distribution:

- HIGH · apps/mobile/app/calendar-sync.tsx:71 · rule 7 · `CalendarSyncScreen` 718L
- HIGH · apps/mobile/hooks/use-chat-composer.ts:141 · rule 7 · `useChatComposer` 652L  ← D11/D31 said MUST attempt split; still unsplit, not registered
- HIGH · apps/web/hooks/use-chat-composer.ts:102 · rule 7 · `useChatComposer` 635L  ← same
- HIGH · apps/web/components/habits/habit-form-fields.tsx:868 · rule 7 · `HabitFormFields` 631L
- HIGH · apps/mobile/app/upgrade.tsx:335 · rule 7 · `UpgradeScreen` 592L
- HIGH · apps/web/app/(app)/page.tsx:61 · rule 7 · `TodayPage` 580L
- HIGH · apps/web/app/(chat)/chat/page.tsx:37 · rule 7 · `ChatPage` 554L
- HIGH · apps/mobile/app/ai-settings.tsx:58 · rule 7 · `AiSettingsScreen` 545L
- HIGH · apps/web/app/(app)/advanced/page.tsx:132 · rule 7 · `AdvancedPage` 540L
- HIGH · apps/web/app/(app)/calendar-sync/page.tsx:260 · rule 7 · `CalendarSyncPage` 532L
- HIGH · apps/mobile/app/login.tsx:86 · rule 7 · `LoginScreen` 516L
- HIGH · apps/web/components/goals/goal-detail-drawer.tsx:141 · rule 7 · `GoalDetailDrawer` 490L
- HIGH · apps/mobile/app/advanced.tsx:75 · rule 7 · `AdvancedScreen` 482L
- HIGH · apps/mobile/components/goals/goal-detail-drawer.tsx:97 · rule 7 · `GoalDetailDrawer` 451L
- HIGH · apps/mobile/app/(tabs)/calendar.tsx:120 · rule 7 · `CalendarScreen` 445L
- HIGH · apps/mobile/app/preferences.tsx:56 · rule 7 · `PreferencesScreen` 407L  ← mobile mirror NOT decomposed (web PreferencesPage was)
- … 138 more (full list: `.claude/sweeps/107/round-3/measure-fns.mjs` output; split breakdown web 81 / mobile 73 / shared 0).

Distribution: **81 web · 73 mobile · 0 shared**. All HIGH.

> Note: this is *lower* than round-2's 206 only because the wave-3 register grew from 4 DEF-2b roots to 62 formally-justified DEFER:root/SKIP entries and ~8 mobile components were genuinely split. The web platform's >100L functions are essentially untouched since round 1.

### Rule 10 — DRY: 24 byte-identical web↔mobile function bodies ≥300 normalized chars still not lifted.

Measured by `measure-dup.mjs` (AST body text, whitespace+quote normalized, ≥300 chars, web↔mobile pairs). D33 lifted the *cores* for tag-selection + dismiss-guard, but both apps' React **wrappers** are still byte-identical (could be lifted whole to `@orbit/shared/hooks` with a thin `'use client'` re-export); `highlightText` was never rewired. All **MED · rule 10 · lift to packages/shared** (or fully share the wrapper):

- MED · apps/web/hooks/use-tag-selection.ts:55 + apps/mobile/hooks/use-tag-selection.ts:53 · `useTagSelection` (2282; core shared, wrapper still identical)
- MED · apps/web/hooks/use-dismiss-guard.ts:11 + apps/mobile/hooks/use-dismiss-guard.ts:9 · `useDismissGuard` (880; core shared, wrapper byte-identical)
- MED · apps/web/components/ui/highlight-text.tsx:15 + apps/mobile/components/ui/highlight-text.tsx:21 · `highlightText` (699; shared `utils/highlight-text.ts` exists but NOT imported — still local both sides)
- MED · apps/web/components/onboarding/onboarding-create-goal.tsx:74 + apps/mobile/.../onboarding-create-goal.tsx:113 · anon (611)
- MED · apps/web/hooks/use-tour-mock-data.ts:66 + apps/mobile/hooks/use-tour-mock-data.ts:65 · anon `restore` (567)
- MED · apps/web/hooks/use-tags.ts:186 + apps/mobile/hooks/use-tags.ts:246 · `onMutate` (509)
- MED · apps/web/hooks/use-tags.ts:217 + apps/mobile/hooks/use-tags.ts:294 · `onMutate` (483)
- MED · apps/web/hooks/use-login-code-entry.ts:71 + apps/mobile/hooks/use-login-code-entry.ts:70 · `onCodeInput` (480; NEW since round-2 — AUTH-FIX batch-5 surface)
- MED · apps/web/lib/pending-notification-deletes.ts:33 + apps/mobile/lib/pending-notification-deletes.ts:33 · `queuePendingNotificationDelete` (462)
- MED · apps/web/app/(app)/support/page.tsx:74 + apps/mobile/app/support.tsx:275 · anon (459)
- MED · apps/web/hooks/use-checklist-templates.ts:42 + apps/mobile/hooks/use-checklist-templates.ts:38 · `onMutate` (446)
- MED · apps/web/app/(app)/advanced/page.tsx:157 + apps/mobile/app/advanced.tsx:106 · anon `scopeOptions` (434)
- MED · apps/web/app/(app)/streak/page.tsx:44 + apps/mobile/app/streak.tsx:71 · anon `encouragement` (421)
- MED · apps/web/hooks/use-habits.ts:141 + apps/mobile/lib/habit-mutation-helpers.ts:374 · `findCachedGoals` (412)
- MED · apps/web/components/onboarding/onboarding-complete.tsx:35 + apps/mobile/.../onboarding-complete.tsx:109 · anon `recapItems` (409)
- MED · apps/web/components/ui/create-api-key-modal.tsx:63 + apps/mobile/components/ui/create-api-key-modal.tsx:322 · anon (393)
- MED · apps/web/components/chat/breakdown-suggestion.tsx:95 + apps/mobile/components/chat/breakdown-suggestion.tsx:332 · `handleConfirm` (390)
- MED · apps/web/hooks/use-tour-mock-data.ts:46 + apps/mobile/hooks/use-tour-mock-data.ts:45 · anon (383)
- MED · apps/web/hooks/use-habit-form.ts:175 + apps/mobile/hooks/use-habit-form.ts:176 · anon `setGeneral` (380)
- MED · apps/web/hooks/use-tags.ts:249 + apps/mobile/hooks/use-tags.ts:346 · `onMutate` (374)
- MED · apps/web/components/habits/habit-detail-drawer.tsx:54 + apps/mobile/.../habit-detail-drawer.tsx:378 · anon `summaryStrip` (356)
- MED · apps/web/hooks/use-checklist-templates.ts:79 + apps/mobile/hooks/use-checklist-templates.ts:82 · `onMutate` (333)
- MED · apps/web/hooks/use-goals.ts:65 + apps/mobile/hooks/use-goals.ts:222 · `onMutate` (329)
- MED · apps/web/components/goals/goal-card.tsx:85 + apps/mobile/components/goal-card.tsx:114 · anon (327)

(7 more pairs measure 302–323 chars: tour-provider anon 323, use-notifications onMutate ×3 [314/314/302], checklist-templates anon 310, use-habit-form anon 304, onboarding-flow anon 303 — all MED · rule 10, just over the 300 floor; same character as above. <300-char identical bodies = DEF-8, not reported.)

### Rule 2 — dead code: only 5 genuine dead exports survive (declaration present + ZERO references anywhere incl. tests/barrels).

Re-verified per-symbol against the round-2 list via `dead-check.mjs` (scans all .ts/.tsx incl. `__tests__` + barrels) + paired-schema scan for shared types. 71 of 76 round-2 items resolved (deleted, de-exported, or now consumed). Survivors:

Runtime (MED · rule 2 · delete or drop `export`):
- MED · apps/mobile/lib/offline-runtime.ts:9 · `getCachedConnectivity` (exported, zero refs)
- MED · apps/web/app/actions/subscription.ts:32 · `claimAdReward` (exported Server Action, zero refs)
- MED · apps/web/hooks/use-summary.ts:72 · `useInvalidateSummary` (exported hook, zero refs)
- MED · apps/web/lib/auth-proxy.ts:54 · `buildEmailLogContext` (exported, zero refs)

Type-only (LOW · rule 2 · delete or drop `export`):
- LOW · apps/mobile/components/habits/habit-form-fields/types.ts:8 · `SectionThemeProps` (exported interface, zero refs)

### Rule 5 — comments outside lint scope (config files; still open, both round-2 items).

- LOW · apps/web/next.config.ts:17 · rule 5 · narration WHY without URL ("HSTS: 2 years, include subdomains. Production traffic is HTTPS-only via Vercel.") in a lint-exempt config — delete or attach upstream doc link.
- LOW · apps/mobile/eslint.config.js:7-10 · rule 5 · WHY block ("eslint-config-expo@55 ships react-hooks v5 …") has no URL — add the upstream issue link or delete. (Line 1 `// https://...` is URL-bearing → allowed.)

---

## Confirmed FIXED since round 2 (do NOT re-report)

- **Rule 2 (71/76 resolved):** `typography.ts` deleted (resolveFontFamily/typeRoleStyle gone); `motion.ts` trimmed (4 dead fns gone); `auth-api.ts` getTokenExpiry+ResolvedServerSession→internal-and-used, isTokenRefreshRequired+getAuthToken deleted; `HabitEmojiOption` removed; `extractErrorMessage` now used by buildAuthErrorPayload; `CalendarEventsResult` now imported by mobile twin+test. All remaining round-2 "type-only" + "shared-type" entries are LIVE-INTERNAL (genuinely used in their declaring file as param/return/generic types) or schema-test-used — NOT dead.
- **Rule 2 shared types (21) — FALSE POSITIVES confirmed:** every paired schema is `.safeParse`-tested in `packages/shared/src/__tests__/types.test.ts` (test_refs 4–6) and/or prod-used (`scheduledReminderTimeSchema` 11 prod refs; `subscriptionSourceSchema` used in profileSchema:39). Under D13 (delete only when schema AND type both unused) none qualify.
- **Rule 8 (both):** OAuthAuthorizationStore cleanup-timer → `LogCleanupFailed(logger, ex)`; web preferences language-swallow → `use-preference-controls.ts` rolls back on catch.
- **Rule 9 (all 4 C#):** BackgroundServiceHealthCheck `var data`→`serviceTickStatuses`; GoalTools×2 `var info`→`goalSummary`/`metricsSummary`; HabitTools `var info`→`habitSummary`.
- **Rule 7 mobile splits (landed):** breakdown-suggestion (254→111), notification-bell (250→164), support (227→165), retrospective (387→167), chat-input-area (211→102), onboarding-flow (252→196), create-api-key-modal, create/edit-goal-modal, habit-row, habit-detail-drawer, _layout RootLayoutNav — all sit at their documented residuals; extracted child components verified present in tree.

## Evaluated — NOT findings

- `(anon)` >100L nodes (5): `(tabs)/index.tsx:1030` useMemo-returns-JSX inside DEF-2b `TodayScreen`; `auth-store.ts:177` `create<AuthState>()` Zustand factory (SKIP-registered); `calendar-sync/page.tsx:544` + `advanced/page.tsx:368` `.map(x=>{...})` inline list renderers; `fresh-start-animation.tsx:41` useEffect body — none are standalone rule-7 logic functions.
- Literal-bodied >100L (22): all `StyleSheet.create({...})` / `defineConfig({...})` / `createTourStoreState` object-literal / `createTourMockHabits` data array — calibration SKIP (count FUNCTIONS not constructs).
- TS empty `catch {}` corpus (~40 sites): round-2 triaged these as intentional best-effort (localStorage/history/optimistic fire-and-forget with finally); only the preferences swallow was a finding (now fixed). Not re-flagged — would be scope creep beyond the round-2 baseline.
- C# `catch (JsonException) {}` parse-fallbacks (WebApplicationExtensions:320, ProcessUserChatCommand:737, GoogleTokenService:95): defined-default boundary fallbacks — acceptable per round-2.
- web `console.error` in `auth-proxy.ts:50` (`logAuthRouteFailure`): the single centralized server-side logger for D23 BFF 500s, called by all 4 auth routes — the project's server log primitive, not Rule-4 debug logging.
- C# single-letter `var g/m/h` (GoalTools/HabitTools result.Value aliases): terse but NOT on Rule-9's banned-name list (data/info/stuff/temp/obj/helper/util); not flagged.

## Verdict

| Severity | Count | Breakdown |
|---|---|---|
| HIGH | 154 | rule 7: 154 TS functions >100L (211 measured − 22 literal − 5 anon − 62 registered roots; web 81 / mobile 73) |
| MED  | 28  | rule 10: 24 byte-identical ≥300-char web↔mobile bodies · rule 2: 4 dead runtime exports |
| LOW  | 3   | rule 2: 1 dead type-only export · rule 5: 2 config-file comments |
| **Total** | **185** | |

Zero-finding checks: rule 3 (`any`), rule 4 (`console`/`Console.Write`), rule 8 (both round-2 fixed; C# fallbacks acceptable), rule 9 (all 4 C# fixed; TS clean), TS strict type-check (3/3 green), lint (3/3 green, ZERO warnings — mobile re-run uncached), C# rule 7 (round-2 verified all 11 fixed; not re-measured this pass per scope), shared-type dead-code (21 false positives confirmed via schema-test scan).
