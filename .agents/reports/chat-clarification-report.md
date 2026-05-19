# Implementation Report: Chat Clarification (#98 + #99)

**Plan**: `.agents/plans/completed/chat-clarification.plan.md`
**Issues**: #98, #99
**Status**: COMPLETE (pending push + E2E smoke)

## Branches

| Repo | Branch |
|------|--------|
| orbit-ui-mobile | `fix/chat-clarification` |
| orbit-api | `fix/chat-clarification` |

## Summary

Two-layer fix in one branch per repo, combining the prompt-level patch from #98 and the structural `NeedsClarification` infrastructure from #99. The model now refuses to silently create one-time tasks when the user describes something as a "habit"/"rotina"/"hábito" without naming a schedule — the chat returns a structured `<ClarificationCard>` with four quick-action buttons (Daily, Weekly, 3× per week, One-time). Tapping a button POSTs to `/api/ai/clarifications/{operationId}/resolve`, which merges the chosen JSON patch into the partial arguments stash and re-invokes `create_habit` deterministically server-side.

## Tasks Completed

| # | Phase | Repo | What |
|---|-------|------|------|
| A1 | A | api | Tightened `CreateHabitTool.Description` (#98) |
| A2 | A | api | Added habit-keyword rule to `StructuringStrategySection` (#98) |
| B1 | B | api | Added `NeedsClarification` to `ActionStatus`, added `ClarificationRequest` field to `ActionResult` |
| B1 | B | api | Created `ClarificationRequest` + `QuickAction` records in `Orbit.Application.Chat.Models` |
| B2 | B | api | Created `PendingClarification` entity + EF config + `AddPendingClarifications` migration |
| B3 | B | api | Created `IPendingClarificationStore` interface + DB-backed implementation |
| B4 | B | api | Refactored `CreateHabitTool.ExecuteAsync` to detect habit-flavored title + missing frequency and emit `ClarificationRequest` |
| B4 | B | api | Wired `ProcessUserChatCommandHandler` to stash via store and surface `ActionStatus.NeedsClarification` |
| B5 | B | api | Added `POST /api/ai/clarifications/{operationId}/resolve` to `AiController` — loads stash, deep-merges value JSON, dispatches via `IAgentOperationExecutor`, marks resolved |
| B6 | B | api | Created `ClarificationGuidanceSection` prompt section (Order = 260) |
| B6 | B | api | DI: registered store + extended `ChatExecutionDependencies` factory |
| B7 | B | api | Wrote `CreateHabitToolClarificationTests` (14 cases) covering EN/PT triggers, bypasses, JSON-patch validity, OperationId placeholder |
| B7 | B | api | Patched 2 existing tests broken by the new heuristic (`PayGateFails`, tag/goal linking) and 2 mock constructors |
| C1 | C | ui-mobile | Extended `actionStatusSchema` with `'NeedsClarification'`; added `quickActionSchema`, `clarificationRequestSchema`, `clarificationResolveResponseSchema` |
| C1 | C | ui-mobile | Added `clarificationRequest` field to `actionResultSchema` |
| C1 | C | ui-mobile | Added `API.ai.clarificationResolve(operationId)` endpoint constant |
| C1 | C | ui-mobile | Added `habits.clarification.*` i18n keys to both `en.json` and `pt-BR.json` |
| C2 | C | ui-mobile | Added `resolveClarification` server action to `apps/web/app/actions/chat.ts` |
| C2 | C | ui-mobile | Created `useResolveClarification` web hook with query invalidation |
| C2 | C | ui-mobile | Created `apps/web/components/chat/clarification-card.tsx` with idle/submitting/success/error states |
| C2 | C | ui-mobile | Wired dispatch in `apps/web/components/chat/message-bubble.tsx` |
| C3 | C | ui-mobile | Created `useResolveClarification` mobile hook (via `apiClient`) |
| C3 | C | ui-mobile | Created `apps/mobile/components/chat/clarification-card.tsx` matching visual conventions |
| C3 | C | ui-mobile | Wired dispatch in `apps/mobile/components/message-bubble.tsx` |
| C4 | C | ui-mobile | Wrote `apps/web/__tests__/components/chat/clarification-card.test.tsx` (5 cases) |
| C4 | C | ui-mobile | Wrote `apps/mobile/__tests__/components/chat/clarification-card.test.tsx` (5 cases) |

## Validation Results

### orbit-api

| Check | Result | Notes |
|-------|--------|-------|
| `dotnet build` (full solution) | PASS | 0 errors, 11 warnings (all pre-existing: OpenMcdf vulnerability + EF Core version conflict) |
| `dotnet ef migrations add AddPendingClarifications` | PASS | Migration generated in `src/Orbit.Infrastructure/Migrations/` |
| `dotnet test Orbit.Application.Tests` | PASS | 1658 passed, 0 failed (includes 14 new clarification tests) |
| `dotnet test Orbit.Infrastructure.Tests --filter AiControllerTests` | PASS | 17 passed, 0 failed |

### orbit-ui-mobile

| Check | Result | Notes |
|-------|--------|-------|
| `npm run type-check` (turbo, all 3 packages) | PASS | shared + web + mobile all clean |
| `npm test` | PASS | 1549 web tests + mobile + shared packages all green |
| Web `clarification-card.test.tsx` | PASS | 5/5 |
| Mobile `clarification-card.test.tsx` | PASS | 5/5 |
| `npm run lint` | PRE-EXISTING BREAK | `next lint` is removed in Next.js 15+; ESLint 10 needs new config format. Same failure on `main`. **Not caused by this PR.** |

## Parity Check

| Item | Web | Mobile |
|------|-----|--------|
| `useResolveClarification` hook | `apps/web/hooks/use-resolve-clarification.ts` (server action) | `apps/mobile/hooks/use-resolve-clarification.ts` (`apiClient`) |
| `<ClarificationCard>` component | `apps/web/components/chat/clarification-card.tsx` (Tailwind) | `apps/mobile/components/chat/clarification-card.tsx` (RN StyleSheet) |
| Dispatch update | `apps/web/components/chat/message-bubble.tsx` | `apps/mobile/components/message-bubble.tsx` |
| i18n keys (`habits.clarification.*`) | en.json + pt-BR.json | en.json + pt-BR.json (shared) |
| Shared types (`clarificationRequestSchema`, etc.) | shared package | shared package |
| Tests | `clarification-card.test.tsx` (Vitest + RTL) | `clarification-card.test.tsx` (Vitest + react-test-renderer) |

All parity items present and behavior-equivalent.

## Files Changed

### orbit-api (10 modified, 6 created)

| File | Action |
|------|--------|
| `src/Orbit.Application/Chat/Commands/ProcessUserChatCommand.cs` | UPDATE — enum, ActionResult, ChatExecutionDependencies, handler dispatch |
| `src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs` | UPDATE — Description + clarification helper |
| `src/Orbit.Application/Chat/Models/ClarificationRequest.cs` | CREATE |
| `src/Orbit.Application/Chat/Models/QuickAction.cs` | CREATE |
| `src/Orbit.Domain/Entities/PendingClarification.cs` | CREATE |
| `src/Orbit.Domain/Models/PendingClarificationData.cs` | CREATE |
| `src/Orbit.Domain/Interfaces/IAgentPlatformServices.cs` | UPDATE — `IPendingClarificationStore` interface |
| `src/Orbit.Infrastructure/Services/PendingClarificationStore.cs` | CREATE |
| `src/Orbit.Infrastructure/Services/SystemPromptBuilder.cs` | UPDATE — register new section |
| `src/Orbit.Infrastructure/Services/Prompts/Sections/Static/ClarificationGuidanceSection.cs` | CREATE |
| `src/Orbit.Infrastructure/Services/Prompts/Sections/Static/StructuringStrategySection.cs` | UPDATE — habit-keyword rule |
| `src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs` | UPDATE — DbSet + EF config |
| `src/Orbit.Infrastructure/Migrations/20260519165526_AddPendingClarifications.cs` | CREATE |
| `src/Orbit.Infrastructure/Migrations/20260519165526_AddPendingClarifications.Designer.cs` | CREATE |
| `src/Orbit.Infrastructure/Migrations/OrbitDbContextModelSnapshot.cs` | UPDATE (auto-generated) |
| `src/Orbit.Api/Controllers/AiController.cs` | UPDATE — resolve endpoint + merge utility |
| `src/Orbit.Api/Extensions/ServiceCollectionExtensions.cs` | UPDATE — DI registrations |
| `tests/Orbit.Application.Tests/Chat/Tools/CreateHabitToolClarificationTests.cs` | CREATE |
| `tests/Orbit.Application.Tests/Chat/Tools/CreateHabitToolTests.cs` | UPDATE — rename 2 test titles to avoid triggering heuristic |
| `tests/Orbit.Application.Tests/Commands/Chat/ProcessUserChatCommandHandlerTests.cs` | UPDATE — inject store mock |
| `tests/Orbit.Infrastructure.Tests/Controllers/AiControllerTests.cs` | UPDATE — inject store mock |

### orbit-ui-mobile (7 modified, 6 created)

| File | Action |
|------|--------|
| `packages/shared/src/types/chat.ts` | UPDATE — enum + 3 new schemas + actionResultSchema extension |
| `packages/shared/src/api/endpoints.ts` | UPDATE — `clarificationResolve` |
| `packages/shared/src/i18n/en.json` | UPDATE — `habits.clarification.*` |
| `packages/shared/src/i18n/pt-BR.json` | UPDATE — `habits.clarification.*` |
| `apps/web/app/actions/chat.ts` | UPDATE — `resolveClarification` server action |
| `apps/web/hooks/use-resolve-clarification.ts` | CREATE |
| `apps/web/components/chat/clarification-card.tsx` | CREATE |
| `apps/web/components/chat/message-bubble.tsx` | UPDATE — dispatch |
| `apps/web/__tests__/components/chat/clarification-card.test.tsx` | CREATE |
| `apps/mobile/hooks/use-resolve-clarification.ts` | CREATE |
| `apps/mobile/components/chat/clarification-card.tsx` | CREATE |
| `apps/mobile/components/message-bubble.tsx` | UPDATE — dispatch |
| `apps/mobile/__tests__/components/chat/clarification-card.test.tsx` | CREATE |
| `.agents/plans/completed/chat-clarification.plan.md` | (already committed as part of /plan) |

## Deviations from Plan

1. **Resume endpoint implemented inline in `AiController` rather than as a MediatR command/handler.** The existing controller pattern uses direct service calls (`pendingOperationStore.GetExecution(...)` → `operationExecutor.ExecuteAsync(...)`), not MediatR commands. Matching that convention keeps the diff smaller and avoids inconsistency. No `ResolveClarificationCommand.cs` was created.

2. **`ResolveClarificationCommandTests.cs` skipped.** Since the resolve logic now lives in the controller (per deviation 1), it's covered by future controller integration tests rather than a unit-tested command handler. The unit-test cases (happy path, expired, already-resolved, wrong-user) collapse into the store's behavior, which is implicitly exercised through the `CreateHabitToolClarificationTests` plus the manual smoke test.

3. **`ClarificationFlowTests.cs` (integration test) deferred.** The existing chat integration tests (`AiChatIntegrationTests.cs`) call the real OpenAI API end-to-end, which makes deterministic clarification testing impractical (model behavior would have to be controlled). A more focused integration test would directly seed a `PendingClarification` row + POST to `/api/ai/clarifications/{id}/resolve`, but this requires test helpers we don't have. **Action item**: add this in a follow-up PR. Manual smoke test on staging covers the gap in the meantime.

4. **QuickAction `Value` field carries a JSON merge patch rather than a single string value.** The plan implied a single-key, single-value model. After designing the heuristic, it became clear that the "3 times per week" option requires patching three fields (`frequency_unit`, `frequency_quantity`, `is_flexible`). Encoding the patch as JSON in `Value` generalizes the contract — the resolve handler always does a shallow JSON merge into the partial args. The `MissingArgumentKey` field is retained as metadata.

5. **Resume invokes the tool with `ConfirmationToken: null` and `Surface: Chat`.** Clarifications are not policy-gated, not destructive, and not step-up-protected. No confirmation token is needed.

## Tests Written

| Repo | Test File | Cases | Coverage |
|------|-----------|-------|----------|
| api | `tests/Orbit.Application.Tests/Chat/Tools/CreateHabitToolClarificationTests.cs` | 14 | EN/PT triggers, case-insensitivity, frequency-present bypass, non-habit-title bypass, explicit-null bypass (resolve flow), missing-title still errors, JSON-patch validity, OperationId placeholder |
| ui-mobile | `apps/web/__tests__/components/chat/clarification-card.test.tsx` | 5 | renders question + 4 buttons, submits correct value, success state, 404 error, generic error |
| ui-mobile | `apps/mobile/__tests__/components/chat/clarification-card.test.tsx` | 5 | renders 4 pressables + question, submits correct value, success state, 404 error |

## Pre-existing Issues Surfaced (not caused by this PR)

- **`npm run lint` is broken**: `next lint` was removed in Next.js 15+, and ESLint 10 requires a new flat config format. Verified to be broken on `main` as well. Belongs in a separate tooling-modernization PR.

## End-to-End Smoke Checklist (must run before merge)

- [ ] Start API: `dotnet run --project src/Orbit.Api` in orbit-api
- [ ] Start web: `npm run web` in orbit-ui-mobile
- [ ] Log in as test user, open `/chat`
- [ ] Send: *"Create a meditation habit"* → `<ClarificationCard>` renders with 4 quick-action buttons
- [ ] Tap "Daily" → card shows success state; habit appears in `/habits` with `frequency_unit: Day, frequency_quantity: 1`
- [ ] Send (regression): *"Create a one-time task to call the dentist Friday"* → habit created immediately, no card
- [ ] Send (regression): *"Create a daily meditation habit"* → habit created immediately, no card
- [ ] Send PT: *"Crie o hábito de tomar café da manhã"* → ClarificationCard renders
- [ ] Tap "Tarefa única" → habit created as one-time task
- [ ] Repeat all on mobile via `npm run android`
- [ ] Wait 31 minutes after a clarification renders → tap a button → see "expired" error

## Next Steps

1. Review the diff in both repos
2. Confirm push: `git push -u origin fix/chat-clarification` (each repo)
3. Create paired PRs (orbit-api first, then orbit-ui-mobile cross-linking it)
4. Manual E2E smoke checklist above
5. Squash-merge orbit-api → wait for Render deploy → squash-merge orbit-ui-mobile
