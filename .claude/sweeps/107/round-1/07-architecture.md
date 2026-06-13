# Sweep 7 — Architecture conformance (round 1)

Scope: working trees of `orbit-ui-mobile` + `orbit-api`. Only objective violations of WRITTEN rules in `apps/web/CLAUDE.md`, `apps/mobile/CLAUDE.md`, `packages/shared/CLAUDE.md`, orbit-api root + per-project `CLAUDE.md`. Established patterns verified before flagging. Deferrals honored: DEF-2 (file lengths), DEF-3 (version pins). Uncertain → not a finding.

Established patterns verified first:
- Web reads: client hooks `fetch`/`fetchJson` relative `/api/*` (BFF catch-all) using `API` constants. Web mutations: Server Actions via `serverAuthFetch`.
- Mobile: all API traffic through `apiClient` (`lib/api-client.ts`); `apiClient` 401-path dynamically imports `refreshSessionToken` from `stores/auth-store.ts`.
- orbit-api: handlers take `IGenericRepository<T>` + `IUnitOfWork`; handler lives in the same file as its Command/Query record (verified across all 80 records).

---

## Check 1 — web: "All mutations through Server Actions in `app/actions/*.ts`. Never call the API from a client component."

- **MED · apps/web/app/(auth)/login/use-login-flow.ts:105,128,163 + apps/web/app/(auth)/auth-callback/page.tsx:136 + apps/web/stores/auth-store.ts:67** · Rule: "All mutations through Server Actions in `app/actions/*.ts`. Never call the API from a client component." The auth subsystem performs mutation POSTs from client code (`fetchAuthEndpoint('/api/auth/send-code')`, `'/api/auth/verify-code'`, `fetch('/api/auth/google')`, `fetch('/api/auth/logout')`) against dedicated BFF route handlers, while `app/actions/auth.ts` proves auth Server Actions exist (requestDeletion/confirmDeletion). The exception is systematic but unwritten. Fix: move login/logout mutations into Server Actions (`cookies()` can set/clear the httpOnly cookie) or amend apps/web/CLAUDE.md to name the auth-route exception.
- **LOW · apps/web/hooks/use-chat-composer.ts:453** · Same rule. Client hook POSTs `API.chat.stream` directly (via BFF stream route). Server Actions cannot return streaming responses, so the deviation is platform-forced — but unlike the mobile twin (`apps/mobile/lib/chat-stream.ts` JSDoc documents WHY), nothing on web documents the exception. Fix: document the streaming exception (JSDoc on the hook or a line in apps/web/CLAUDE.md).
- **LOW · apps/web/app/api/subscriptions/checkout/route.ts:1-46** · Same rule (mutation path discipline). This dedicated BFF mutation route has zero production callers — `app/(app)/upgrade/page.tsx:868` uses the `createCheckoutSession` Server Action; only the route's own test imports it. An orphaned parallel mutation path violates the single-mutation-path rule and root Code Standard 2 (delete unused code). Fix: delete the route + `__tests__/app/api/subscriptions-checkout-route.test.ts`.

## Check 2 — mobile: "All mutations through `apiClient` (`lib/api-client.ts`). Never call `fetch` directly."

- **MED · apps/mobile/stores/auth-store.ts:228** · Rule: "Never call `fetch` directly." Logout POST uses raw `fetch(`${...}${API.auth.logout}`)`. `apiClient` handles this call fine (bearer attach is harmless; body passthrough works); no WHY comment. Fix: route through `apiClient`.
- **MED · apps/mobile/lib/google-auth.ts:54** · Same rule. `exchangeGoogleSession` raw-fetches `API.auth.google` and hand-rolls error shaping (`mergeRequestIdIntoPayload` duplicates `apiClient`'s `attachRequestIdToPayload`). `apiClient` works tokenless (`if (token)` guard). Fix: use `apiClient`, delete the duplicated error shaping.
- **LOW · apps/mobile/stores/auth-store.ts:118** · Same rule. `refreshSessionToken` raw-fetches `API.auth.refresh`. Structurally motivated (apiClient's 401 path calls this function — recursion guard), but undocumented; the codebase's own pattern for sanctioned exceptions is a WHY JSDoc (see `lib/chat-stream.ts:28-32`). Fix: add the WHY JSDoc (or route through `apiClient` relying on its `path !== API.auth.refresh` guard).

Not findings: `lib/chat-stream.ts` (expo/fetch SSE — WHY documented), `lib/version-check.ts` (third-party iTunes endpoint, outside `apiClient`'s `API_BASE` scope, JSDoc'd).

## Check 3 — shared: "Never hardcode an API path inline. If the path doesn't exist here, add it here first."

- **MED · apps/web/app/actions/{habits,profile,goals,notifications,tags,auth,support}.ts — 50 occurrences** · Rule quoted above (packages/shared/CLAUDE.md); apps/web/CLAUDE.md's own Server Actions example uses `API.habits.create`. Every path below already exists in `packages/shared/src/api/endpoints.ts`; the other six action files (api-keys, calendar, subscription, user-facts, checklist-templates, chat) import `API` correctly, proving the convention. Full enumeration:
  - `habits.ts` (15): 23, 30, 37, 46, 56, 63, 70, 77, 84, 91, 101, 111, 118, 127, 137
  - `profile.ts` (14): 17, 24, 31, 38, 45, 52, 59, 66, 73, 79, 85, 91, 97, 103 (line 103 is `/api/calendar/dismiss` = `API.calendar.dismiss`)
  - `goals.ts` (7): 13, 20, 27, 36, 46, 53, 63
  - `notifications.ts` (6): 6, 12, 18, 24, 35, 50
  - `tags.ts` (5): 6, 13, 24, 31, 40
  - `auth.ts` (2): 9, 19
  - `support.ts` (1): 7
  Fix: replace each literal with its existing `API.*` constant.
- **LOW · 13 occurrences in web client/lib/BFF files** · Same rule. All but one have existing constants:
  - `stores/auth-store.ts:67` (`API.auth.logout` exists), `app/(auth)/login/use-login-flow.ts:105,163` (`API.auth.sendCode`), `:128` (`API.auth.verifyCode`), `app/(auth)/auth-callback/page.tsx:136` (`API.auth.google`), `lib/auth-api.ts:194` (`API.auth.refresh`), `app/api/auth/send-code/route.ts:22`, `app/api/auth/verify-code/route.ts:25`, `app/api/auth/google/route.ts:25`, `app/api/auth/logout/route.ts:16`, `app/api/subscriptions/plans/route.ts:41` (`API.subscription.plans`), `app/api/subscriptions/checkout/route.ts:40` (`API.subscription.checkout`), `app/api/chat/stream/route.ts:19` (`API.chat.stream`).
  - `stores/auth-store.ts:35` `'/api/auth/session'` — web-BFF-only path with no constant anywhere ("If the path doesn't exist here, add it here first"); fix is a web-local route constant (a shared constant would pollute mobile).
  Exempt: `proxy.ts:79` (`pathname.startsWith('/api/')` middleware check, not an endpoint), `app/api/[...path]/route.ts:82-83` (the documented proxy mechanism — "the only place that touches the upstream API URL").
- Mobile: **zero** hardcoded `/api/` literals. Clean.

## Check 4 — "Query keys from `@orbit/shared/query` — never invent inline keys."

- **MED · apps/web/app/(app)/advanced/page.tsx:148 + apps/mobile/app/advanced.tsx:76** · Rule: "never invent inline keys" / shared CLAUDE.md "never invent ad-hoc keys". `queryKey: ['ai-capabilities']` is an invented literal duplicated across both apps; no factory exists in `packages/shared/src/query/keys.ts`. Fix: add `aiKeys.capabilities()` to shared keys and consume it in both apps.
- **LOW · apps/web/hooks/use-billing.ts:23 + apps/mobile/hooks/use-billing.ts:10** · Same rule. `[...subscriptionKeys.all, 'billing']` re-derives `subscriptionKeys.billing()` (keys.ts:59) inline in both apps. Fix: call the factory.
- **LOW · apps/web/hooks/use-summary.ts:76** · Same rule. `[...habitKeys.all, 'summary']` re-derives `habitKeys.summaryPrefix()` (keys.ts:13); the mobile twin uses the factory (`apps/mobile/hooks/use-resolve-clarification.ts:35`). Fix: call `habitKeys.summaryPrefix()`.

## Check 5 — "Named exports only."

- **LOW · apps/mobile/lib/i18n.ts:32** · Rule: "Named exports only" (apps/mobile/CLAUDE.md). `export default i18n` on an app-owned module; not an Expo Router screen, not framework-required (named export works with i18next/initReactI18next). Fix: convert to named export and update importers.
- Exempt (framework-required or interface-mirroring, not counted): all Next.js `page/layout/error/not-found` files; `apps/web/i18n/request.ts` (next-intl requires default); all Expo Router screens + `_layout.tsx`; config files (`next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`); `apps/mobile/test-mocks/*` (must mirror mocked modules' default exports); `apps/mobile/modules/orbit-widget/src/*` (Expo Modules API template convention — borderline, not counted per uncertainty rule). `packages/shared`: only config-file defaults. Clean otherwise.

## Check 6 — web: "`'use client'` only when you need hooks, events, browser APIs, or context."

All nine candidates read in full; each has zero hooks, zero event handlers, zero browser APIs, zero context — pure render-from-props (or static markup). Fix for each: remove the directive (they remain client when imported by client parents).

- **LOW · apps/web/app/(app)/streak/_components/streak-sections.tsx:1**
- **LOW · apps/web/app/(app)/achievements/_components/achievement-category-section.tsx:1**
- **LOW · apps/web/components/habits/habit-list/date-group-section.tsx:1**
- **LOW · apps/web/components/habits/habit-detail-sections.tsx:1**
- **LOW · apps/web/app/(app)/profile/_components/profile-nav-icon.tsx:1** (static SVG switch)
- **LOW · apps/web/components/ui/local-image.tsx:1** (`createElement('img', props)` renders fine server-side)
- **LOW · apps/web/app/(chat)/layout.tsx:1** (renders `<Providers>`/Tour children that carry their own directives; layout itself could be a Server Component — rule: "If you can render on the server, do.")
- **LOW · apps/web/app/(auth)/layout.tsx:1** (static shell + client children)
- **LOW · apps/web/app/(public)/layout.tsx:1** (static shell + client child)

Excluded after reading: `components/navigation/web-nav.tsx` (its props are event handlers — "events" justification), `lib/overlay-stack.ts` (module-level mutable client-only singleton; directive guards against server-side shared state).

## Check 7 — shared purity: "No React, no Next.js, no React Native imports."

**ZERO FINDINGS.** No `react`/`react-dom`/`next`/`react-native`/`expo` imports anywhere in `packages/shared/src`.

## Check 8 — orbit-api layer boundaries

Named boundaries are CLEAN:
- Domain (`Orbit.Domain.csproj`): zero ProjectReferences; zero `using Orbit.Application|Infrastructure|Api`; zero `Microsoft.EntityFrameworkCore`/`Microsoft.Extensions` usings; zero `[Required]/[Key]/[StringLength]` attributes.
- Application (`Orbit.Application.csproj`): references Domain only; zero `using Orbit.Infrastructure|Api` in source.

- **MED · orbit-api/src/Orbit.Application/Orbit.Application.csproj:15 (+36 source files)** · Rule (src/Orbit.Infrastructure/CLAUDE.md): "**DbContext is the only thing that knows about EF.** Repositories abstract it." Application carries a `Microsoft.EntityFrameworkCore` PackageReference and 36 files (`Habits/Queries/GetHabitScheduleQuery.cs`, `Habits/Commands/LogHabitCommand.cs`, `Goals/Queries/GetGoalsQuery.cs`, `Gamification/Services/GamificationService.cs`, Chat tools, …) `using Microsoft.EntityFrameworkCore` for EF LINQ operators on repository IQueryables. Per the systematic-pattern instruction this is flagged ONCE against the written claim, not per file: the established architecture is "repositories return IQueryable, EF operators allowed in Application", and the CLAUDE.md sentence is what's wrong. Fix: reword the Infrastructure CLAUDE.md line (e.g., "DbContext lives only in Infrastructure; Application may use EF LINQ operators on repository IQueryables but never DbContext") — or, if the wall is intended, move EF operator usage behind repository methods (large refactor).
- Note (not counted — no written rule names it): `Orbit.Infrastructure.csproj:4` references `Orbit.Application` (33+ files use `Orbit.Application.Common`, `Habits.Services`, `Chat.Tools`). The root one-pager diagram (`Api → Application → Domain ← Infrastructure`) does not show this edge; no prohibition text exists. Consider documenting the edge in the one-pager.

## Check 9 — skipped (covered by sweep 5).

## Check 10 — CQRS structure + validators

Structure: handler-in-same-file holds for every Command/Query inspected (all 80 record declarations show the handler class in the same file). Per-feature `Commands/ Queries/ Validators/ Services/` layout holds. CLEAN.

Missing validators — rule (src/Orbit.Application/CLAUDE.md): "Validate ALL invalid/edge cases — date ranges (end after start), time ranges, numeric bounds…"; root CLAUDE.md: "Every new feature needs validators". The codebase's own benchmark is `GetHabitScheduleQueryValidator` (end-after-start + `AppConstants.MaxRangeDays` + paging bounds):

- **MED · orbit-api/src/Orbit.Application/Habits/Queries/GetCalendarMonthQuery.cs:17** · `(UserId, DateOnly DateFrom, DateOnly DateTo)` bound raw from `[FromQuery]` (HabitsController.cs:196-201); no validator → end-after-start and range-cap unchecked at the pipeline. Fix: `GetCalendarMonthQueryValidator` mirroring the schedule validator's range rules.
- **MED · orbit-api/src/Orbit.Application/Habits/Queries/GetDailySummaryQuery.cs:13** · `(UserId, DateFrom, DateTo, Language)` raw from `[FromQuery]` (HabitsController.cs:211-217); no validator; unbounded range also feeds AI-summary generation. Fix: validator with range + cap.
- **MED · orbit-api/src/Orbit.Application/Habits/Queries/GetAllHabitLogsQuery.cs:8** · `(UserId, DateFrom, DateTo)` raw from `[FromQuery]` (HabitsController.cs:444-449) and MCP (`Mcp/Tools/HabitTools.cs:287`); no validator. Fix: validator with range + cap.
- **LOW · orbit-api/src/Orbit.Application/UserFacts/Commands/BulkDeleteUserFactsCommand.cs:9** · `IReadOnlyList<Guid> FactIds` unbounded/un-NotEmpty'd; the twin `BulkDeleteHabitsCommandValidator` enforces NotEmpty + `AppConstants.MaxBulkOperationSize`. Rule names "numeric bounds". Fix: mirror the habits bulk validator.
- **LOW · orbit-api/src/Orbit.Application/Auth/Commands/ConfirmAccountDeletionCommand.cs:11** · `string Code` with no validator while sibling `VerifyCodeCommandValidator` validates code input in the same feature. Fix: small validator (NotEmpty, length).
- **LOW · orbit-api/src/Orbit.Application/Notifications/Commands/UnsubscribePushCommand.cs:8** · `string Endpoint` with no validator while sibling `SubscribePushCommandValidator` exists. Fix: NotEmpty/format rule.

Explicitly NOT findings (per the parameterless carve-out, extended to nothing-to-validate inputs, and verified delegations): all userId-only / Guid-only / bool-only commands and queries (~35: GetProfileQuery, GetTagsQuery, GetNotificationsQuery(UserId), MarkNotificationRead, DeleteTag, RevokeApiKey, DeleteChecklistTemplate, DeleteHabit, DuplicateHabit, CompleteOnboarding/Tour, ResetTour/Account, SetAiMemory/SetAiSummary(bool), SetCalendarAutoSync(bool), Dismiss*/Run* calendar, ClaimAdReward, CreatePortalSession, ExportUserData, Gamification queries, Referral commands/queries, etc.); `GetRetrospectiveQuery` (controller derives dates from a whitelisted period switch with `_ => 7` default — valid by construction, HabitsController.cs:243-249); `HandleWebhookCommand`/`HandlePlayNotificationCommand` (signature/RTDN verification is the documented boundary control); `SetThemePreferenceCommand`/`SetColorSchemeCommand` (validated via Result-returning domain guards `User.SetThemePreference/SetColorScheme` — the rule's "domain-entity guards" arm).

## Check 11 — Domain factories from Application

**ZERO FINDINGS.** No `new <Entity>(` or `new <Entity>{` for any of the 28 Domain entities anywhere in Orbit.Application or Orbit.Api — construction goes through factories.

## Check 12 — Repository/UoW vs DbContext in handlers

**ZERO FINDINGS.** Zero `DbContext` references in Orbit.Application; every handler signature inspected takes `IGenericRepository<T>` (+ `IUnitOfWork` for writes). The pattern claimed by CLAUDE.md holds at the DbContext level (the EF-operator drift is the single check-8 finding).

---

## Verdict

**28 findings: 0 HIGH · 9 MED · 19 LOW**

| Check | Result |
|---|---|
| 1 web mutation path | 1 MED, 2 LOW |
| 2 mobile raw fetch | 2 MED, 1 LOW |
| 3 hardcoded API paths | 1 MED (50 occurrences enumerated), 1 LOW (13 enumerated); mobile clean |
| 4 query keys | 1 MED, 2 LOW |
| 5 named exports | 1 LOW |
| 6 unnecessary 'use client' | 9 LOW |
| 7 shared purity | clean |
| 8 layer boundaries | 1 MED (EF-in-Application vs written claim); references clean |
| 10 CQRS validators | 3 MED, 3 LOW; structure clean |
| 11 entity factories | clean |
| 12 repository/UoW | clean |
