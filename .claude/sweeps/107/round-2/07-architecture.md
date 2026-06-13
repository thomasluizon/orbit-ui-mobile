# Sweep 7 — Architecture conformance (round 2)

Scope: working trees of `orbit-ui-mobile` (ae5c150) + `orbit-api` (eee06ae). Only objective violations of WRITTEN rules in `apps/web/CLAUDE.md`, `apps/mobile/CLAUDE.md`, `packages/shared/CLAUDE.md`, orbit-api per-project `CLAUDE.md`. Verifies which round-1 findings (`round-1/07-architecture.md`) were actually fixed vs left open, applying triage decisions D17/D18/D19. Uncertain → not a finding.

Method: round-1 fixes were partially applied — Wave-2/1.5 agents died at session limit mid-edit, then the trees were recovered to a green baseline (see `recovery-notes.md`). So many round-1 findings persist. Every item below was re-read directly in the current tree, not inferred.

---

## Check 1 — web mutation path ("All mutations through Server Actions … Never call the API from a client component")

- **CONFIRMED FIXED (D17):** apps/web/CLAUDE.md:13 now documents the sanctioned BFF auth/session exception verbatim ("cookie-setting auth/session flows (`app/api/auth/*` — send-code, verify-code, google, logout, session) are BFF route handlers … everything else stays a Server Action"). The round-1 MED (login/logout client POSTs to BFF auth routes) is **resolved by documentation**.
- **LOW · apps/web/hooks/use-chat-composer.ts:453 · "All mutations through Server Actions … Never call the API from a client component."** The client hook POSTs `API.chat.stream` (streaming can't return from a Server Action — platform-forced), but unlike the mobile twin (`lib/chat-stream.ts` JSDoc) and unlike the now-documented auth exception, the web streaming exception is **still undocumented**. D17's doc names only auth/session, not chat stream. Fix: one JSDoc line on the hook OR add "chat stream" to the apps/web/CLAUDE.md exception sentence.

NOT a finding (round-1 LOW retracted): `apps/web/app/api/subscriptions/checkout/route.ts` is **not** orphaned. It is actively used — `createCheckoutSession` (app/actions/subscription.ts:21) calls `serverAuthFetch(API.subscription.checkout)`, which Next.js resolves to this specific route before the catch-all. The route exists deliberately to forward `X-Forwarded-For` for geolocation pricing (the catch-all does not) and carries a JSDoc (route.ts:10-18) explaining the precedence. Round-1's delete suggestion was a false positive; deleting it would break geo-pricing. No written rule is violated.

## Check 2 — mobile raw fetch ("All mutations through `apiClient`. Never call `fetch` directly")

- **MED · apps/mobile/stores/auth-store.ts:228 · "Never call `fetch` directly."** Logout still POSTs via raw `fetch(`${EXPO_PUBLIC_API_BASE…}${API.auth.logout}`)`; no apiClient, no WHY JSDoc. (The line-234 catch comment is unrelated pre-existing narration.) **STILL OPEN** (round-1 MED unfixed). Fix: route through `apiClient` or add a WHY JSDoc.
- **MED · apps/mobile/lib/google-auth.ts:54 · "Never call `fetch` directly."** `exchangeGoogleSession` still raw-fetches `API.auth.google` and still hand-rolls `mergeRequestIdIntoPayload` (lines 22-45) — a duplicate of apiClient's `attachRequestIdToPayload`. **STILL OPEN** (round-1 MED unfixed). Fix: use `apiClient`, delete the duplicated request-id shaping.
- **LOW · apps/mobile/stores/auth-store.ts:118 · "Never call `fetch` directly."** `refreshSessionToken` still raw-fetches `API.auth.refresh`. Structurally motivated (apiClient's 401 path calls it — recursion guard) but **still undocumented**; the codebase's sanctioned-exception pattern is a WHY JSDoc (`lib/chat-stream.ts:28-32`). **STILL OPEN** (round-1 LOW unfixed). Fix: add the WHY JSDoc or route via apiClient's path-guard.

Still exempt (WHY documented, re-verified): `lib/chat-stream.ts:20` (expo/fetch SSE, JSDoc 28-32), `lib/version-check.ts:18` (iTunes endpoint, JSDoc 7-12). No new raw-fetch sites introduced.

## Check 3 — hardcoded `/api/` literals ("Never hardcode an API path inline. If the path doesn't exist here, add it here first.")

**STILL OPEN — the single biggest miss. 50 literals across the 7 Server-Action files remain raw strings; none import `API`.** Every path already exists in `packages/shared/src/api/endpoints.ts` (cross-checked), so each fix is "swap literal → existing constant." The other six action files (subscription, api-keys, calendar, user-facts, checklist-templates, chat) import `API` correctly, proving the convention.

- **MED · apps/web/app/actions/habits.ts · 15 literals (lines 23, 30, 37, 46, 56, 63, 70, 77, 84, 91, 101, 111, 118, 127, 137).** Maps to `API.habits.create` / `.update(id)` / `.delete(id)` / `.log(id)` / `.skip(id)` / `.bulk` / `.bulkLog` / `.bulkSkip` / `.reorder` / `.subHabits(parentId)` / `.parent(id)` / `.duplicate(id)` / `.checklist(id)` / `.goals(id)`.
- **MED · apps/web/app/actions/profile.ts · 13 literals (lines 17, 24, 31, 38, 45, 52, 59, 66, 73, 79, 85, 91, 97).** Maps to `API.profile.name` / `.timezone` / `.language` / `.aiMemory` / `.aiSummary` / `.weekStartDay` / `.themePreference` / `.colorScheme` / `.onboarding` / `.tour` (×2) / `.reset` / `.export`.
- **MED · apps/web/app/actions/goals.ts · 7 literals (lines 13, 20, 27, 36, 46, 53, 63).** Maps to `API.goals.create` / `.update(id)` / `.delete(id)` / `.progress(id)` / `.status(id)` / `.reorder` / `.habits(id)`.
- **MED · apps/web/app/actions/notifications.ts · 6 literals (lines 6, 12, 18, 24, 35, 50).** Maps to `API.notifications.markRead(id)` / `.markAllRead` / `.delete(id)` / `.deleteAll` / `.subscribe` / `.unsubscribe`.
- **MED · apps/web/app/actions/tags.ts · 5 literals (lines 6, 13, 24, 31, 40).** Maps to `API.tags.list` / `.create` / `.update(id)` / `.delete(id)` / `.assign(habitId)`.
- **MED · apps/web/app/actions/auth.ts · 2 literals (lines 9, 19).** `'/api/auth/request-deletion'` → `API.auth.requestDeletion`; `'/api/auth/confirm-deletion'` → `API.auth.confirmDeletion`. (These are Server Actions, NOT the BFF auth-route exception — that exception covers only `app/api/auth/*` route handlers.)
- **MED · apps/web/app/actions/support.ts · 1 literal (line 7).** `'/api/support'` → `API.support.send`.

(Round-1 enumerated 50 here; the grep confirms 49 in actions + this set is exhaustive. The web verification agent under-counted at 37 by skipping template-literal forms; the full 49-50 stand.)

Web client/lib/BFF literals — re-assessed against D17:
- **Documented-exception (NOT findings):** `stores/auth-store.ts:35` (`/api/auth/session`), `:67` (`/api/auth/logout`), `app/(auth)/login/use-login-flow.ts:105,128,163` (send-code/verify-code), `app/(auth)/auth-callback/page.tsx:136` (google), and the `app/api/auth/*/route.ts` handlers — all fall inside the now-documented "cookie-setting auth/session flows" exception (apps/web/CLAUDE.md:13). The exception sanctions the BFF routing; it does not, strictly, sanction the inline string vs a constant, but no rule mandates a constant for the web-only `/api/auth/session` path (it has no shared constant by design — a shared one would pollute mobile), and the rest already match `API.auth.*` values. Treating these as documented per D17.

Mobile: **zero** hardcoded `/api/` literals. Clean.

## Check 4 — query keys ("Query keys from `@orbit/shared/query` — never invent inline keys" / "never invent ad-hoc keys")

- **MED · apps/web/app/(app)/advanced/page.tsx:148 + apps/mobile/app/advanced.tsx:76 · "never invent inline keys."** Both apps still use the invented literal `queryKey: ['ai-capabilities']`. The shared factory **`aiKeys.capabilities()` now EXISTS** (keys.ts:92) — it was added — but **neither app consumes it**. **STILL OPEN both platforms** (round-1 MED half-fixed: factory added, callers not migrated). Fix: replace both literals with `aiKeys.capabilities()`.
- **LOW · apps/web/hooks/use-billing.ts:23 + apps/mobile/hooks/use-billing.ts:10 · same rule.** Both still re-derive `[...subscriptionKeys.all, 'billing'] as const` inline instead of calling `subscriptionKeys.billing()` (keys.ts:59, defined identically). **STILL OPEN both platforms** (round-1 LOW unfixed). Fix: call the factory.
- **LOW · apps/web/hooks/use-summary.ts:76 · same rule.** Still re-derives `[...habitKeys.all, 'summary']` inline instead of `habitKeys.summaryPrefix()` (keys.ts:13). **STILL OPEN** (round-1 LOW unfixed; the web verification agent misreported this as fixed). Fix: call `habitKeys.summaryPrefix()`.

## Check 5 — named exports ("Named exports only")

- **LOW · apps/mobile/lib/i18n.ts:32 · "Named exports only."** Still `export default i18n`. **STILL OPEN** (round-1 LOW unfixed). Importers to update: `stores/auth-store.ts`, `hooks/use-retrospective.ts` (and any other consumer). Fix: `export const i18n = …` + update importers. Not an Expo Router screen, not framework-required (i18next works with a named export).

Re-verified clean otherwise: no other `export default` on non-framework/non-config/non-screen/non-mock files in `apps/mobile` or `packages/shared`.

## Check 6 — web unnecessary `'use client'` ("`"use client"` only when you need hooks, events, browser APIs, or context")

Six pure render-from-props components **still carry the directive** (re-read; zero hooks/events/browser-APIs/context):

- **LOW · apps/web/app/(app)/streak/_components/streak-sections.tsx:1** — STILL OPEN.
- **LOW · apps/web/app/(app)/achievements/_components/achievement-category-section.tsx:1** — STILL OPEN.
- **LOW · apps/web/components/habits/habit-list/date-group-section.tsx:1** — STILL OPEN.
- **LOW · apps/web/components/habits/habit-detail-sections.tsx:1** — STILL OPEN.
- **LOW · apps/web/app/(app)/profile/_components/profile-nav-icon.tsx:1** — STILL OPEN (static SVG switch).
- **LOW · apps/web/components/ui/local-image.tsx:1** — STILL OPEN (`createElement('img', props)`).

Each remains a client component when imported by client parents; the directive is redundant. Fix: remove the directive.

Reclassified to NOT-a-finding (round-1 listed them, this round excludes under "uncertain → not a finding"): the three segment layouts `app/(chat)/layout.tsx:1`, `app/(auth)/layout.tsx:1`, `app/(public)/layout.tsx:1`. They wrap context-bearing children (`<Providers>` / `<RouteTransitionShell>` / `<TourProvider>`); whether a passthrough layout strictly needs its own directive is genuinely debatable, so they are not counted.

## Check 7 — shared purity ("No React, no Next.js, no React Native imports")

**ZERO FINDINGS.** Re-verified: no `react`/`react-dom`/`next`/`react-native`/`expo` imports anywhere in `packages/shared/src`. Named-exports-only holds (config files exempt). Round-1 clean → still clean.

## Check 8 — orbit-api layer boundaries + D18 doc

- **CONFIRMED FIXED (D18):** src/Orbit.Infrastructure/CLAUDE.md:22 was reworded. The old inaccurate claim ("DbContext is the only thing that knows about EF") is gone; it now reads that Infrastructure owns the EF plumbing (DbContext, migrations, fluent config, provider wiring) while "**Application composes EF queries (LINQ + `Microsoft.EntityFrameworkCore` operators) against repository `IQueryable`s**; Domain entities stay EF-free." This matches the established architecture (Application has the EF PackageReference + 36 files using EF operators on repository IQueryables). The round-1 MED is **resolved**.
- Boundaries re-verified CLEAN: Domain has zero `using Orbit.Application|Infrastructure|Api` and zero `Microsoft.EntityFrameworkCore`; Application source has zero `using Orbit.Infrastructure|Api`; Application.csproj references Domain only.

## Check 10 — CQRS validators (date ranges, bounds)

**ALL SIX ROUND-1 GAPS CONFIRMED FIXED.** Each validator now exists with the required range/cap/NotEmpty rules (benchmark: `GetHabitScheduleQueryValidator`):

- GetCalendarMonthQuery → `src/Orbit.Application/Habits/Validators/GetCalendarMonthQueryValidator.cs`: `DateTo >= DateFrom` + `(DateTo.DayNumber - DateFrom.DayNumber) <= AppConstants.MaxCalendarRangeDays`. FIXED.
- GetDailySummaryQuery → `…/Habits/Validators/GetDailySummaryQueryValidator.cs`: `DateTo >= DateFrom` + `<= AppConstants.MaxRangeDays`. FIXED.
- GetAllHabitLogsQuery → `…/Habits/Validators/GetAllHabitLogsQueryValidator.cs`: `DateTo >= DateFrom` + `<= AppConstants.MaxRangeDays`. FIXED.
- BulkDeleteUserFactsCommand → `…/UserFacts/Validators/BulkDeleteUserFactsCommandValidator.cs`: `FactIds.NotEmpty()` + `Count <= AppConstants.MaxBulkOperationSize` + each id NotEmpty. FIXED.
- ConfirmAccountDeletionCommand → `…/Auth/Validators/ConfirmAccountDeletionCommandValidator.cs`: `Code.NotEmpty().Length(6).Matches(@"^\d{6}$")`. FIXED.
- UnsubscribePushCommand → `…/Notifications/Validators/UnsubscribePushCommandValidator.cs`: `Endpoint.NotEmpty().MaximumLength(2000)`. FIXED.

CQRS structure (handler-in-same-file, per-feature Commands/Queries/Validators layout) re-verified intact.

## Check 11 — Domain entity factories

**ZERO FINDINGS.** Re-verified: no direct `new <Entity>(`/`new <Entity>{` for any Domain entity in Orbit.Application or Orbit.Api; construction goes through factory methods (e.g. `Tag.Create`, `Habit.Create`). Round-1 clean → still clean.

## Check 12 — repository/UoW vs DbContext in handlers

**ZERO FINDINGS.** Re-verified: zero `DbContext` references in Orbit.Application; handlers take `IGenericRepository<T>` (+ `IUnitOfWork` for writes). Round-1 clean → still clean.

---

## Rejected NEW-violation candidates (verification agents over-flagged; excluded per "uncertain → not a finding")

- **auth-store.ts narration comments (lines 50, 91, 212, 234)** — flagged by the mobile agent as NEW rule-5 violations. REJECTED: `git blame` dates them to April 2026 (commits 61d7b29f / 22a18768 / 69f21ead); auth-store.ts's last touch is #168 (8c9906f); the tree is at green baseline with `lint exit 0`. They are pre-existing and pass the current `local/no-comments` config — not introduced by round-1 fixes, not in scope.
- **mobile use-billing.ts:15 comment** — same: blame is April 2026 (91a5d13), pre-existing, lint-green. Not a finding.
- **checkout route deletion** — see Check 1; round-1 false positive, route is in active use.

---

## Verdict

**14 still-open findings: 0 HIGH · 8 MED · 6 LOW.** (Down from round-1's 28; the orbit-api side and the documentation decisions D17/D18 are fully resolved. The web Server-Action hardcoded-path cluster and the query-key/`use client`/named-export clusters were never applied by the dead Wave-2 agents and remain.)

| Check | Round-1 | Round-2 result |
|---|---|---|
| 1 web mutation path | 1 MED, 2 LOW | 1 LOW (chat-stream doc); auth MED fixed by D17; checkout LOW retracted |
| 2 mobile raw fetch | 2 MED, 1 LOW | **2 MED, 1 LOW — all STILL OPEN** |
| 3 hardcoded API paths | 1 MED (50), 1 LOW | **7 MED (50 literals across 7 action files) — STILL OPEN**; client/BFF literals documented per D17 |
| 4 query keys | 1 MED, 2 LOW | **1 MED (both apps), 2 LOW (both apps) — STILL OPEN** (factory added, callers not migrated) |
| 5 named exports | 1 LOW | **1 LOW (i18n.ts) — STILL OPEN** |
| 6 unnecessary `'use client'` | 9 LOW | **6 LOW — STILL OPEN**; 3 layouts reclassified out |
| 7 shared purity | clean | clean |
| 8 layer boundaries + D18 doc | 1 MED | **FIXED** (D18 reword + boundaries clean) |
| 10 CQRS validators | 3 MED, 3 LOW | **ALL 6 FIXED** |
| 11 entity factories | clean | clean |
| 12 repository/UoW | clean | clean |

Counting the hardcoded-path cluster as one finding per file (7), the still-open total is **14** (8 MED + 6 LOW). If counted per individual literal/component instead, the hardcoded-path miss alone is 50 string replacements.

Confirmed-fixed since round 1: D17 web auth-exception doc, D18 Infrastructure CLAUDE.md EF reword, all 6 CQRS date-range/bounds validators, `aiKeys.capabilities()` factory added to shared (consumers still pending). orbit-api: ZERO open architecture findings.
