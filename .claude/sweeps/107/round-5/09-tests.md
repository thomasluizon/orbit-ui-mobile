# Sweep #9 — Test coverage & quality, issue #107 ROUND 5 (final verification)

Read-only. Method: read the actual round-4 test bodies (not filenames/grep substrings); traced each round-4 EXTRACTED sub-hook/component to its parent test to decide behavior-coverage; re-ran the dead-export discipline (count `__tests__` importers). Suites not run (declared green). Baselines: ui-mobile `3520d10`, orbit-api `fcfdc95`.

`__tests__` importer counts: **apps/web 163, apps/mobile 109, packages/shared 77, orbit-api 304** test files.

Format: `SEVERITY · file:line · rule · fix`.

---

## Round-4 added tests — verified landed

- **API SkipHabit filtered-include** — `tests/Orbit.Application.Tests/Commands/Habits/SkipHabitCommandHandlerTests.cs` is NEW (13 `[Fact]`s): one-time postpone, recurring advance, overdue-not-scheduled, not-found, wrong-user (`HabitNotOwned` errorCode), completed, future-date, not-yet-due, summary-cache invalidation, linked-streak-goal minimum, flexible-with-remaining (adds log), flexible-all-done (`AllInstancesDone` errorCode). Covers the round-4 filtered-include command end-to-end including the streak-goal ThenInclude path. RESOLVED.
- **API errorcode-coherence** — `ErrorCodesAndMessagesTests.cs:79-93` adds `ErrorMessages_EveryCodeIsAKnownErrorCodeOrDomainError`, iterating every `ErrorMessages` `AppError` field and asserting its `.Code` ∈ (`ErrorCodes` string consts ∪ `DomainErrors` `AppError` codes). This is exactly the round-3 LOW ("no test iterating `ErrorMessages` asserting each `.Code` exists") — a wrong baked-in `Code` is now caught. RESOLVED.
- **API N+1 batching tests** — `AssignTagsToolTests.cs`, `CreateHabitToolTests.cs`, `UserFactCommandHandlerTests.cs` rewired their mocks from `FindOneTrackedAsync` → `FindTrackedAsync` (returning a list), so the batched implementations are behavior-covered (the existing assertions on resulting tags/facts still hold against the new query shape). RESOLVED.
- **FE** — `apps/web/__tests__/hooks/use-profile.test.ts` gained coverage for the new locale-cookie-reload effect (+4 lines); `goal-list.test.tsx` / `use-push-notification-preferences.test.ts` / `advanced.test.tsx` updated alongside the round-4 source edits and remain green (declared).

## Round-4 EXTRACTED sub-hooks/components — behavior-coverage through parents

The round-4 split moved logic out of `useChatComposer`/`ChatPage`/`CalendarSync` into standalone files. Per the round-5 mandate, I traced each to its parent test. **Key finding: the splits introduced NO NEW uncovered logic** — every extracted branch existed inline at the round-3 baseline (`6399d00`) and was ALREADY untested through the parent. Confirmed by reading `git show 6399d00:apps/web/hooks/use-chat-composer.ts` (image-validation, `handlePaste`, `confirmPendingOperation`, `prepareStepUpForBubble`, `verifyStepUpForBubble` were all inline + uncovered pre-split). The extraction is behavior-preserving; it merely makes the pre-existing gap a discrete, now-namable unit. Disposition: LOW, pre-existing residual (not a regression).

Coverage status of each extracted unit:
- **mobile `use-pending-operation-execution.ts`** — `confirmAndExecutePendingOperation` IS covered: `apps/mobile/__tests__/hooks/use-chat-composer.test.tsx:319-354` drives it through the parent (asserts both `apiClient` calls + the appended agent message). `prepareStepUpForBubble`/`verifyStepUpForBubble` (the step-up branches) are NOT exercised (grep for them in the test = 0) — pre-existing gap.
- **web `use-chat-pending-operations.ts` + `use-chat-image-attachment.ts`** — NEITHER's returned functions are called in `apps/web/__tests__/hooks/use-chat-composer.test.tsx` (its 6 tests exercise only `sendMessage`/`retryLastSend` streaming). So `confirmAndExecutePendingOperation`, `prepareStepUpForBubble`, `verifyStepUpForBubble`, and the entire image-attachment validation/paste flow are uncovered through the parent — pre-existing gap, now in two standalone files.
- **web `chat-composer-bar.tsx` / `chat-empty-state.tsx`, mobile `calendar-sync-auto-section.tsx` / `calendar-sync-styles.ts`** — presentational extractions. `chat/page.tsx` and `calendar-sync.tsx` render them; the parent screen tests (`apps/mobile/__tests__/screens/calendar-sync.test.tsx`) cover the wired screen. No new untested logic (the auto-sync section's behavior was already screen-tested).

→ This is captured as ONE consolidated LOW below (it absorbs and updates the round-3 chat-coverage residual; it is NOT a round-4 regression).

---

## STILL-OPEN findings (all LOW, all pre-existing residuals)

- **LOW · `apps/web/hooks/use-chat-pending-operations.ts` (3 exported flows) + `apps/web/hooks/use-chat-image-attachment.ts` (validation/paste) + `apps/mobile/hooks/use-pending-operation-execution.ts` step-up branches · every-new-feature-needs-tests, behavior-over-implementation · these branches are not driven through the parent `use-chat-composer.test.tsx` on either platform (web: none; mobile: only `confirmAndExecutePendingOperation`). Logic is pre-existing (inline + uncovered at round-3 baseline); the round-4 split surfaced it as discrete units · Fix: small renderHook unit tests on the two web hooks + the mobile step-up pair (mock `@/app/actions/chat` / `apiClient`); assert the confirm→execute→onExecuted chain, the step-up confirm→issue→verify→execute chain, and the image `type`/`size`→i18n-key mapping.**
- **LOW · `apps/web/app/api/auth/session/route.ts` + `logout/route.ts` (no route test) + `apps/web/lib/auth-proxy.ts` pure helpers · the session/logout cookie-I/O routes remain untested; `auth-proxy` helpers exercised only transitively · note: round-4 REMOVED `buildEmailLogContext` from the untested helper set, shrinking it to 7 (`isRecord`, `extractErrorMessage`, `resolveRequestId`, `buildRequestIdResponseHeaders`, `resolveResponseRequestId`, `buildAuthErrorPayload`, `logAuthRouteFailure`) · Fix: thin `auth-proxy.test.ts` + session/logout smoke tests.** (round-3 LOW, partially improved.)
- **LOW · `apps/mobile/hooks/use-review-reminder.ts` · gating matrix + StoreReview→Linking fallback still only store-tested, no hook test · Fix: renderHook matrix over store states + mocked `expo-store-review`/`Linking`.** Unchanged.
- **LOW · mobile mirrors still missing direct tests: `apps/mobile/hooks/use-summary.ts`, `use-habit-form.ts`, `use-resolve-clarification.ts` · thin wrappers over tested `@orbit/shared` logic; the uncovered mobile seam is `use-resolve-clarification`'s success-gated invalidation set · Fix: thin renderHook ports; prioritize the invalidation.** Unchanged.
- **LOW · `apps/web/__tests__` class-name / CSS-selector assertions (~10 files) · still assert Tailwind classes/selectors vs behavior (`login.test.tsx` `toHaveClass`, `streak.test.tsx` `.streak-hero__count`, goal-card/habit-checklist `line-through`, goal-list `drag-chosen`, etc.) · violates apps/web/CLAUDE.md "assert behavior + data attributes" · Fix: role/test-id/data-attribute queries.** Unchanged.
- **LOW · `orbit-api` reflection / private-member tests (6 AI-service files via `BindingFlags.NonPublic`; `GetHabitByIdQueryHandlerTests` writes private `Habit._children`) · renaming a private breaks tests with no behavior change · Fix: assert at the mocked AI-client boundary; build the graph via public `Habit` API.** Unchanged.
- **LOW · hand-rolled `NormalizedHabit` fixtures (12+ files) duplicate ~35-field literals instead of `packages/shared/src/__tests__/factories.ts#createMockHabit` · Fix: replace local `makeHabit` helpers with `createMockHabit(overrides)`.** Unchanged.
- **LOW · thin wrappers only-ever-mocked · `apps/mobile/lib/offline-runtime.ts` (note: `getCachedConnectivity` was deleted round-4, so only `setCachedConnectivity`/`getCurrentConnectivity` remain), `use-horizontal-swipe.ts` threshold math, `use-date-format.ts` + twin, `use-calendar-events.ts` — never exercised directly · Fix: small unit tests where cheap.** Mostly unchanged (one dead fn removed).
- **LOW · `apps/mobile/components/ui/create-api-key-modal.tsx` · still does not import the shared `MAX_API_KEY_NAME_LENGTH`/`parseApiKeyExpiryUtc`; no mobile name-length/expiry test; `MAX_API_KEY_NAME_LENGTH` has no direct value assertion in shared · Fix: adopt the shared validators then mirror the web modal test.** Unchanged.

## Fresh-coverage scan (round-4 logic)

Beyond the chat sub-hook gap above, no round-4 production logic has zero coverage: the API filtered-include/N+1/errorcode-coherence changes are all tested; the FE locale-cookie effect is tested (`use-profile.test.ts`); the dead exports removed this round (`useInvalidateSummary`, `claimAdReward`, `getCachedConnectivity`, `buildEmailLogContext`) shrink the untested-symbol surface rather than grow it. Per calibration, the 21 `types/*` schemas remain `.safeParse`-tested in `__tests__/types.test.ts` — NOT dead.

## Verdict

**HIGH 0 · MED 0 · LOW 9.** All 9 are pre-existing round-3 residuals — none is a round-4 regression. The round-4-introduced tests (SkipHabit 13-fact suite, errorcode-coherence iteration, N+1 batched-mock rewires, locale-cookie effect) all landed and are behavior-asserting. The dominant round-5 question — "do the round-4 splits add NEW uncovered logic?" — answers NO: every extracted chat sub-hook branch existed inline + untested at the round-3 baseline, so the split is behavior-preserving; the chat-coverage residual is consolidated into one LOW (now naming the discrete extracted units). Two round-3 LOWs shrank this round (auth-proxy `buildEmailLogContext` + offline-runtime `getCachedConnectivity` deleted).
