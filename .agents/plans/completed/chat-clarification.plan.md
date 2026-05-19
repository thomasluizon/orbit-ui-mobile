# Plan: Chat Clarification — Stop silent one-time tasks + structural `NeedsClarification` fix

*Combines GitHub issues #98 (prompt-level fix) and #99 (structural fix). One branch per repo: `fix/chat-clarification` in both `orbit-ui-mobile` and `orbit-api`.*

---

## Summary

The AI chat creates a habit as a one-time auto-completing task whenever the model forgets to pass `frequency_unit` — the habit vanishes after one check-off. This plan ships a two-layer fix in a single branch per repo:

1. **Prompt layer (#98)** — tighten `CreateHabitTool.Description` and add a rule to `StructuringStrategySection` so the model asks the user for a schedule before calling `create_habit` on a habit-flavored title.
2. **Structural layer (#99)** — new `ActionStatus.NeedsClarification` value, structured `ClarificationRequest` payload on `ActionResult`, server-side `PendingClarificationStore` keyed by `OperationId`, dedicated `POST /api/ai/clarifications/{operationId}/resolve` endpoint, and parity-paired `<ClarificationCard>` web + mobile components. `CreateHabitTool` becomes the first consumer; future tools can adopt the same pattern.

The two layers reinforce each other. If the prompt layer drifts, the tool still refuses to silently create a one-time task. If the tool's heuristic is too narrow, the prompt still catches it first.

## User Story

**As an** in-app chat user
**I want** the AI to ask me what schedule I meant when I describe something as a habit without giving a frequency
**So that** my habit doesn't silently disappear after one check-off

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX + NEW_CAPABILITY |
| Complexity | HIGH |
| Repos | both |
| Parity Required | yes |
| GitHub Issues | #98, #99 |
| Web Affected | yes |
| Mobile Affected | yes |
| API Affected | yes |

---

## Key design decisions

### D1 — Resume mechanism: server-side store

**Picked Option 2 from #99's tech notes.** New `PendingClarification` entity + `PendingClarificationStore` + `POST /api/ai/clarifications/{operationId}/resolve`.

**Why:**
- Survives page reload (state doesn't live in JS component state).
- Avoids LLM re-interpretation: the resolved arg is merged deterministically by the backend, not re-parsed by the model.
- Codebase already has a precedent (`PendingAgentOperationStore` at `src/Orbit.Infrastructure/Services/PendingAgentOperationStore.cs`). Frontend pattern already exists (`pending-operation-card.tsx` follows the same callback-driven shape).
- The brittle multilingual `[clarification:frequency=daily]` synthetic-message approach is rejected.

**Why a NEW store rather than overloading `PendingAgentOperationStore`:**
- Confirmation operations have a policy / fingerprint / SHA256-token / step-up lifecycle.
- Clarifications have *none* of that — they're a partial-args stash with a missing field to fill in.
- Overloading the table would force conceptual mixing.

### D2 — `CreateHabitTool` heuristic

The tool returns `NeedsClarification` iff **both**:
1. `frequency_unit` is absent (parsed as `null`)
2. `title` contains case-insensitive substring `"habit"`, `"rotina"`, or `"hábito"` (matches both English and pt-BR)

Intentionally narrow. Verb-phrase detection is unreliable in C# without NLP. Broader cases are handled by the prompt rule from #98, which fires *before* the tool is called.

### D3 — Status sits on `ActionResult`, payload on a new field

Mirror the existing `Suggestion` pattern: `ActionResult.Status = NeedsClarification`, and add `ActionResult.ClarificationRequest: ClarificationRequest?` next to `SuggestedSubHabits`.

In the handler at `ProcessUserChatCommand.cs:413` (special-case for `suggest_breakdown`), add a parallel branch that recognizes a `ClarificationRequest` payload from `ToolResult.Payload` and packages it into `ActionStatus.NeedsClarification`. Before returning, the handler calls `PendingClarificationStore.Create(...)` to stash the partial args server-side.

### D4 — Capability registration

Add `AgentCapabilityIds.ClarifyHabitArguments` (or reuse `HabitsWrite`?). **Pick: reuse `HabitsWrite`.** Clarification is a synthetic intermediate state of `create_habit` — same capability, same risk class. No new policy gate needed.

### D5 — Resolve endpoint authorization

`POST /api/ai/clarifications/{operationId}/resolve` is authenticated (JWT bearer) and scoped to the owning user. Store lookup compares `operationId.UserId == principal.UserId` and rejects 404 otherwise. No fresh-confirmation token needed — clarifications are non-destructive intermediate steps.

### D6 — Re-execution

On resolve, the endpoint:
1. Loads the stashed `PartialArgumentsJson` + `MissingArgumentKey`.
2. Merges the user's `value` into the partial args (e.g., `frequency_unit = "Day"`, `frequency_quantity = 1`).
3. Constructs an `AgentExecuteOperationRequest` for the original tool (`create_habit`).
4. Dispatches via `IAgentOperationExecutor.ExecuteAsync` (same path the chat handler uses).
5. Marks the clarification resolved (one-shot — second call returns 410 Gone).
6. Returns a minimal `ClarificationResolveResponse { status, entityId?, entityName?, error? }`.

The frontend, on success, triggers `queryClient.invalidateQueries({ queryKey: habitKeys.lists() })` and renders a local success state in the card — mirroring `BreakdownSuggestion.onConfirmed`.

### D7 — Lifecycle / TTL

`PendingClarification` rows expire after **30 minutes** (matching `AgentPlatformSettings.PendingOperationTtlMinutes`). After expiry the resolve endpoint returns 410 Gone; the frontend renders "this clarification expired — please ask again."

---

## Patterns to follow

### Backend — Tool returning a structured payload

**Existing precedent**: `SuggestBreakdownTool` returns `ToolResult(success: true, EntityName: title)` and the handler at `ProcessUserChatCommand.cs:413-420` special-cases the name to surface `SuggestedSubHabits`.

```csharp
// SOURCE: src/Orbit.Application/Chat/Commands/ProcessUserChatCommand.cs:413-420
if (call.Name == "suggest_breakdown")
{
    return new ActionResult(
        ToolNameToPascalCase(call.Name),
        ActionStatus.Suggestion,
        EntityName: result.EntityName,
        SuggestedSubHabits: ExtractSuggestedSubHabits(call.Args));
}
```

We will **not** add another name-keyed special case. Instead, the tool returns the payload on `ToolResult.Payload` and the handler checks `if (result.Payload is ClarificationRequest cr) { ... }`. This generalizes the pattern so future tools (delete-by-name disambiguation, bulk-op scope) can adopt `NeedsClarification` without editing the handler.

### Backend — Pending store (precedent to mirror, not extend)

```csharp
// SOURCE: src/Orbit.Infrastructure/Services/PendingAgentOperationStore.cs
public async Task<PendingAgentOperation> Create(/* ... */) {
    // checks for existing, builds entity, saves to DB, returns view
}
```

New `PendingClarificationStore` mirrors the shape but drops everything related to confirmation tokens, step-up, fingerprint dedup, policy state. Just: create → get → resolve (one-shot).

### Backend — Endpoint precedent

```csharp
// SOURCE: src/Orbit.Api/Controllers/AiController.cs:254-296
[HttpPost("pending-operations/{id:guid}/execute")]
public async Task<IActionResult> Execute(Guid id, [FromBody] ExecutePendingOperationRequest body, CancellationToken ct) { ... }
```

New endpoint sits as a sibling: `[HttpPost("clarifications/{operationId:guid}/resolve")]` on the same controller.

### Backend — Prompt section

```csharp
// SOURCE: src/Orbit.Infrastructure/Services/Prompts/Sections/Static/StructuringStrategySection.cs
public int Order => 250;
public bool ShouldInclude(PromptContext context) => true;
public string Build(PromptContext context) { /* return rule list */ }
```

Add a NEW section `ClarificationGuidanceSection` (e.g. `Order = 260`, always include) that teaches the model: *"You may return `NeedsClarification` from any tool by setting `clarification` on the response. The user will see a card with your question + quick actions. Prefer this over plain text when the missing argument is a discrete enum (frequency unit, day of week, scope)."*

### Frontend — Status dispatch (web)

```tsx
// SOURCE: apps/web/components/chat/message-bubble.tsx (lines ~53-138)
// Existing filters Suggestion and routes to <BreakdownSuggestion>
const suggestionActions = actions.filter(a => a.status === 'Suggestion' && a.suggestedSubHabits?.length)
const nonSuggestionActions = actions.filter(a => a.status !== 'Suggestion' /* not Suggestion */)
```

Add a parallel filter for `a.status === 'NeedsClarification' && a.clarificationRequest`. Mount `<ClarificationCard>` instead of `<BreakdownSuggestion>` for those.

### Frontend — Mobile dispatch

```tsx
// SOURCE: apps/mobile/components/message-bubble.tsx (lines ~115-234)
```

Same structure, React Native primitives.

### Frontend — Card visual conventions

Match `BreakdownSuggestion` exactly:

- Web: `bg-surface-elevated/50 border border-border-muted rounded-[var(--radius-xl)] p-4 shadow-[var(--shadow-sm)]`
- Mobile: `backgroundColor: colors.surfaceOverlay, borderRadius: radius.xl, padding: 16, ...shadows.sm, elevation: 2`

Quick-action buttons follow the existing **chip pattern** at `apps/mobile/components/chat/suggestion-chips.tsx:54-61` (full-pill `borderRadius: 9999`, `bg-surface-elevated`, tap → submit). Web uses Tailwind equivalents.

### Frontend — Hook precedent

```ts
// SOURCE: apps/web/hooks/use-habits.ts (TanStack mutation pattern)
export function useBulkCreateHabits() {
  return useMutation({ mutationFn: ..., onSuccess: () => queryClient.invalidateQueries({ queryKey: habitKeys.lists() }) })
}
```

Create `useResolveClarification` in both `apps/web/hooks/` and `apps/mobile/hooks/` using the same mutation shape.

### Shared — Endpoint constant precedent

```ts
// SOURCE: packages/shared/src/api/endpoints.ts
export const API = {
  // ... existing nested structure ...
}
```

Add `ai.clarifications.resolve(operationId)` next to the existing pending-operation endpoints.

### Shared — Zod chat types

```ts
// SOURCE: packages/shared/src/types/chat.ts:34-36
export const actionStatusSchema = z.enum(['Success', 'Failed', 'Suggestion'])
```

Becomes `z.enum(['Success', 'Failed', 'Suggestion', 'NeedsClarification'])`. Add `clarificationRequestSchema` (zod) with the matching shape from the backend record.

### Tests

```csharp
// SOURCE: tests/Orbit.Application.Tests/Chat/Tools/BulkLogHabitsToolTests.cs
public class BulkLogHabitsToolTests {
  [Fact] public async Task ExecutesSuccessfully() { ... }
}
```

```tsx
// SOURCE: apps/web/__tests__/components/chat/breakdown-suggestion.test.tsx
test('renders + cancels + submits', () => { ... })
```

---

## Files to change

### orbit-api (branch `fix/chat-clarification`)

| File | Action | Purpose |
|------|--------|---------|
| `src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs` | UPDATE | Tighten Description (#98); add heuristic that returns `ToolResult` with `ClarificationRequest` payload (#99) |
| `src/Orbit.Infrastructure/Services/Prompts/Sections/Static/StructuringStrategySection.cs` | UPDATE | Add rule between line 49 and 51: "If the user calls something a habit/rotina/hábito without stating a schedule, ASK before calling `create_habit`." (#98) |
| `src/Orbit.Application/Chat/Commands/ProcessUserChatCommand.cs` | UPDATE | Add `NeedsClarification` to `ActionStatus` enum (line 47); add `ClarificationRequest? ClarificationRequest` to `ActionResult` (line 38-45); add handler branch to recognize `ToolResult.Payload is ClarificationRequest` and stash it via `IPendingClarificationStore` before returning |
| `src/Orbit.Application/Chat/Models/ClarificationRequest.cs` | CREATE | Record: `Question`, `OperationId`, `MissingArgumentKey`, `QuickActions: IReadOnlyList<QuickAction>` |
| `src/Orbit.Application/Chat/Models/QuickAction.cs` | CREATE | Record: `Label`, `Value`, `Description?` |
| `src/Orbit.Application/Chat/Commands/ResolveClarificationCommand.cs` | CREATE | MediatR command + handler. Loads pending clarification, merges value, dispatches via `IAgentOperationExecutor`, returns `ClarificationResolveResponse` |
| `src/Orbit.Application/Common/Interfaces/IPendingClarificationStore.cs` | CREATE | Methods: `Create`, `GetById`, `Resolve` |
| `src/Orbit.Domain/Entities/PendingClarification.cs` | CREATE | `Id`, `UserId`, `ToolName`, `PartialArgumentsJson`, `MissingArgumentKey`, `Question`, `QuickActionsJson`, `CreatedAtUtc`, `ResolvedAtUtc?`, `ExpiresAtUtc` |
| `src/Orbit.Infrastructure/Services/PendingClarificationStore.cs` | CREATE | DB-backed implementation |
| `src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs` | UPDATE | Add `DbSet<PendingClarification> PendingClarifications` |
| `src/Orbit.Infrastructure/Persistence/Configurations/PendingClarificationConfiguration.cs` | CREATE | EF configuration (PK, indexes on `UserId + CreatedAtUtc`, `ExpiresAtUtc`) |
| `src/Orbit.Infrastructure/Migrations/<ts>_AddPendingClarifications.cs` | CREATE | EF migration |
| `src/Orbit.Api/Controllers/AiController.cs` | UPDATE | Add `POST /api/ai/clarifications/{operationId:guid}/resolve` — dispatches `ResolveClarificationCommand` |
| `src/Orbit.Infrastructure/Services/Prompts/Sections/Static/ClarificationGuidanceSection.cs` | CREATE | New prompt section explaining the `NeedsClarification` flow to the model |
| `src/Orbit.Infrastructure/Services/SystemPromptBuilder.cs` | UPDATE | Register `ClarificationGuidanceSection` in `_sections` |
| `src/Orbit.Api/Extensions/ServiceCollectionExtensions.cs` | UPDATE | DI: `AddScoped<IPendingClarificationStore, PendingClarificationStore>()` |
| `tests/Orbit.Application.Tests/Chat/Tools/CreateHabitToolClarificationTests.cs` | CREATE | Unit tests: triggers (habit keyword + no freq), bypasses (one-time markers, freq present, non-habit title) |
| `tests/Orbit.Application.Tests/Chat/Commands/ResolveClarificationCommandTests.cs` | CREATE | Unit tests: happy path, expired, already-resolved, wrong-user, missing arg key |
| `tests/Orbit.IntegrationTests/Chat/ClarificationFlowTests.cs` | CREATE | E2E: chat returns NeedsClarification → resolve endpoint → habit created with correct frequency |

### orbit-ui-mobile (branch `fix/chat-clarification`)

| File | Action | Purpose |
|------|--------|---------|
| `packages/shared/src/types/chat.ts` | UPDATE | Add `'NeedsClarification'` to `actionStatusSchema`; add `clarificationRequestSchema` + `quickActionSchema`; add `clarificationRequest` field to `actionResultSchema` |
| `packages/shared/src/api/endpoints.ts` | UPDATE | Add `ai.clarifications.resolve(operationId)` |
| `packages/shared/src/query/keys.ts` | UPDATE | (optional) no new keys needed — re-uses `habitKeys.lists()` for invalidation |
| `packages/shared/src/i18n/en.json` | UPDATE | Add `habits.clarification.*` keys (see below) |
| `packages/shared/src/i18n/pt-BR.json` | UPDATE | pt-BR equivalents |
| `apps/web/components/chat/clarification-card.tsx` | CREATE | Web `<ClarificationCard>` — matches `BreakdownSuggestion` visual language |
| `apps/mobile/components/chat/clarification-card.tsx` | CREATE | Mobile parallel, React Native primitives |
| `apps/web/components/chat/message-bubble.tsx` | UPDATE | Add filter for `status === 'NeedsClarification'`; mount `<ClarificationCard>` |
| `apps/mobile/components/message-bubble.tsx` | UPDATE | Mobile parallel |
| `apps/web/app/actions/chat.ts` | UPDATE | Add `resolveClarification(operationId, value)` server action that POSTs to the backend resolve endpoint |
| `apps/web/hooks/use-resolve-clarification.ts` | CREATE | TanStack mutation that calls the server action + invalidates `habitKeys.lists()` |
| `apps/mobile/hooks/use-resolve-clarification.ts` | CREATE | Mobile parallel using `apiClient` |
| `apps/web/__tests__/components/chat/clarification-card.test.tsx` | CREATE | Renders question + quick actions; tap submits + invalidates |
| `apps/mobile/__tests__/components/chat/clarification-card.test.tsx` | CREATE | Mobile parallel |

### i18n keys

```json
"habits": {
  "clarification": {
    "questionFallback": "What schedule should this be on?",
    "quickAction": {
      "daily": "Daily",
      "weekly": "Weekly",
      "xPerWeek": "{n} times per week",
      "oneTime": "One-time task"
    },
    "submitting": "Setting up…",
    "successCreated": "Created '{name}'",
    "errorExpired": "This clarification expired. Please ask again.",
    "errorGeneric": "Something went wrong. Please try again."
  }
}
```

---

## Tasks

Execute in this order. Tasks 1–3 are #98 (prompt-only — ship-able alone). Tasks 4–17 are #99 backend. Tasks 18–25 are #99 frontend. Tests interleave.

### Phase A — Prompt-level fix (#98)

#### Task 1: Tighten `CreateHabitTool.Description`
- **Repo**: api
- **File**: `src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs`
- **Action**: UPDATE lines 22-23
- **Implement**: Add explicit phrase: *"For one-time tasks, omit `frequency_unit` ONLY if the user explicitly described it as a one-time task (e.g., 'just once', 'this Friday only', 'one-time', 'uma vez'). If the user called it a habit/rotina/hábito or did not mention frequency, ASK first via clarification."*
- **Validate**: `dotnet build`

#### Task 2: Add structuring rule for habit-flavored titles
- **Repo**: api
- **File**: `src/Orbit.Infrastructure/Services/Prompts/Sections/Static/StructuringStrategySection.cs`
- **Action**: UPDATE — insert new rule between the existing "Ask ONE targeted clarifying question when" block (line 37-43) and "NEVER ask a question (act immediately) when" block (line 45-49)
- **Implement**: *"User calls something a 'habit' / 'rotina' / 'hábito' without stating daily / weekly / X times per week / a specific schedule → ASK before calling `create_habit`. Offer: daily, weekly with specific days, X times per week, or one-time task."*
- **Validate**: `dotnet build`

#### Task 3: Manual smoke test (post-deploy of Phase A only — optional gate)
- Verify on local dev:
  - PT: `"Crie o hábito de tomar café da manhã. Eu geralmente como pão, ovos e uma porção de frutas. Gostaria que cada item desse fosse um checklist"` → AI asks before creating
  - EN: `"Create a meditation habit"` → AI asks
  - Regression: `"Create a one-time task to call the dentist Friday"` → AI creates without asking
  - Regression: `"Create a daily meditation habit"` → AI creates without asking
- Skippable if Phase A and Phase B ship in the same PR.

### Phase B — Backend structural fix (#99)

#### Task 4: Add `ActionStatus.NeedsClarification` + `ClarificationRequest` field
- **Repo**: api
- **File**: `src/Orbit.Application/Chat/Commands/ProcessUserChatCommand.cs`
- **Action**: UPDATE
  - Line 47: enum becomes `{ Success, Failed, Suggestion, NeedsClarification }`
  - Lines 38-45: add `ClarificationRequest? ClarificationRequest = null` to `ActionResult` record (after `SuggestedSubHabits`)
- **Validate**: `dotnet build`

#### Task 5: Define `ClarificationRequest` + `QuickAction` records
- **Repo**: api
- **File**: `src/Orbit.Application/Chat/Models/ClarificationRequest.cs` (CREATE), `src/Orbit.Application/Chat/Models/QuickAction.cs` (CREATE)
- **Implement**:
  ```csharp
  public record ClarificationRequest(
      string Question,
      Guid OperationId,
      string MissingArgumentKey,
      IReadOnlyList<QuickAction> QuickActions);
  public record QuickAction(string Label, string Value, string? Description = null);
  ```
- **Validate**: `dotnet build`

#### Task 6: Create `PendingClarification` entity + EF config + migration
- **Repo**: api
- **Files**:
  - `src/Orbit.Domain/Entities/PendingClarification.cs` (CREATE)
  - `src/Orbit.Infrastructure/Persistence/Configurations/PendingClarificationConfiguration.cs` (CREATE)
  - `src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs` (UPDATE — add `DbSet`)
- **Entity fields**: `Id` (Guid PK), `UserId` (Guid, indexed), `ToolName` (string), `PartialArgumentsJson` (text), `MissingArgumentKey` (string), `Question` (string), `QuickActionsJson` (text), `CreatedAtUtc`, `ExpiresAtUtc` (indexed), `ResolvedAtUtc?`
- **Mirror**: `src/Orbit.Domain/Entities/PendingAgentOperationState.cs` for entity structure conventions
- **Validate**: `dotnet build`, then `dotnet ef migrations add AddPendingClarifications --project src/Orbit.Infrastructure --startup-project src/Orbit.Api`

#### Task 7: Implement `PendingClarificationStore`
- **Repo**: api
- **Files**:
  - `src/Orbit.Application/Common/Interfaces/IPendingClarificationStore.cs` (CREATE)
  - `src/Orbit.Infrastructure/Services/PendingClarificationStore.cs` (CREATE)
- **Implement**:
  - `Task<PendingClarification> Create(Guid userId, string toolName, JsonElement partialArgs, string missingKey, string question, IReadOnlyList<QuickAction> actions, CancellationToken ct)` — sets `ExpiresAtUtc = DateTime.UtcNow.AddMinutes(30)`
  - `Task<PendingClarification?> GetById(Guid operationId, Guid userId, CancellationToken ct)` — returns null if user mismatch or expired
  - `Task Resolve(Guid operationId, Guid userId, CancellationToken ct)` — sets `ResolvedAtUtc`, throws if already resolved
- **Mirror**: `src/Orbit.Infrastructure/Services/PendingAgentOperationStore.cs`
- **Validate**: `dotnet build`

#### Task 8: Refactor `CreateHabitTool` to emit `ClarificationRequest`
- **Repo**: api
- **File**: `src/Orbit.Application/Chat/Tools/Implementations/CreateHabitTool.cs`
- **Action**: UPDATE
- **Implement**:
  - Inject `IPendingClarificationStore` + `IUserDateService` (already injected) + AI prompt builder for question text? Actually no — generate question + quick actions inline.
  - At top of `ExecuteAsync`: parse `title` and `frequency_unit`.
  - If `frequency_unit == null` AND title (lowercased) contains any of `"habit"`, `"rotina"`, `"hábito"`:
    - Build `ClarificationRequest` with localized question (use title in question), 4 quick actions: Daily / Weekly / 3× per week / One-time task.
    - Return `ToolResult(success: true, Payload: clarificationRequest)`.
  - Otherwise proceed with existing creation logic unchanged.
- **Validate**: `dotnet build`

#### Task 9: Wire handler to recognize `ClarificationRequest` payload + stash to store
- **Repo**: api
- **File**: `src/Orbit.Application/Chat/Commands/ProcessUserChatCommand.cs`
- **Action**: UPDATE — in `ExecuteSingleToolCallAsync` (around lines 295-362), after the existing `suggest_breakdown` special case (line 413), add:
  ```csharp
  if (result.Payload is ClarificationRequest cr)
  {
      // OperationId is set by the store, not the tool
      var saved = await pendingClarificationStore.Create(userId, call.Name, ParseArgs(call.Args), cr.MissingArgumentKey, cr.Question, cr.QuickActions, ct);
      return new ActionResult(
          ToolNameToPascalCase(call.Name),
          ActionStatus.NeedsClarification,
          ClarificationRequest: cr with { OperationId = saved.Id });
  }
  ```
- **Inject** `IPendingClarificationStore` into the handler via the existing `ChatExecutionDependencies` record (line 73-79)
- **Validate**: `dotnet build`

#### Task 10: Create `ResolveClarificationCommand` + handler
- **Repo**: api
- **File**: `src/Orbit.Application/Chat/Commands/ResolveClarificationCommand.cs` (CREATE)
- **Implement**:
  - `record ResolveClarificationCommand(Guid OperationId, Guid UserId, string Value) : IRequest<Result<ClarificationResolveResponse>>;`
  - Handler:
    1. Load pending via `IPendingClarificationStore.GetById`. If null → `Result.Failure("clarification_expired_or_missing")`.
    2. Deserialize `PartialArgumentsJson` to `JsonElement`, merge `MissingArgumentKey: Value` (use `JsonObject` for write).
    3. Construct `AgentExecuteOperationRequest` for the original `ToolName`.
    4. Call `IAgentOperationExecutor.ExecuteAsync(...)`.
    5. Call `store.Resolve(...)`.
    6. Return `Result<ClarificationResolveResponse>` with status + entityId + entityName.
- **Validate**: `dotnet build`

#### Task 11: Add resolve endpoint to `AiController`
- **Repo**: api
- **File**: `src/Orbit.Api/Controllers/AiController.cs`
- **Action**: UPDATE — add new method:
  ```csharp
  [HttpPost("clarifications/{operationId:guid}/resolve")]
  public async Task<IActionResult> ResolveClarification(Guid operationId, [FromBody] ResolveClarificationRequest body, CancellationToken ct) { ... }
  ```
- **Mirror**: existing `Execute` endpoint at line 254-296
- **Validate**: `dotnet build`

#### Task 12: Add `ClarificationGuidanceSection` prompt section
- **Repo**: api
- **File**: `src/Orbit.Infrastructure/Services/Prompts/Sections/Static/ClarificationGuidanceSection.cs` (CREATE)
- **Implement**: `Order = 260`, always include. Body teaches model:
  - When the user is ambiguous about a discrete enum (frequency, scope), the tool may return `NeedsClarification`.
  - This is preferred over plain-text questions when the answer is one of a small set of choices.
  - Do not over-ask. If the user gave a clear answer, do not invoke clarification.
- **Update**: register in `SystemPromptBuilder` constructor
- **Validate**: `dotnet build`

#### Task 13: DI registration
- **Repo**: api
- **File**: `src/Orbit.Api/Extensions/ServiceCollectionExtensions.cs`
- **Action**: UPDATE `AddOrbitAiServices` — add `builder.Services.AddScoped<IPendingClarificationStore, PendingClarificationStore>();`
- **Validate**: `dotnet build`

#### Task 14: Unit tests — `CreateHabitTool` clarification triggers
- **Repo**: api
- **File**: `tests/Orbit.Application.Tests/Chat/Tools/CreateHabitToolClarificationTests.cs` (CREATE)
- **Mirror**: `tests/Orbit.Application.Tests/Chat/Tools/BulkLogHabitsToolTests.cs`
- **Cases**:
  - Title contains "habit" + no `frequency_unit` → returns payload of type `ClarificationRequest`
  - Title contains "hábito" + no `frequency_unit` → same
  - Title contains "rotina" + no `frequency_unit` → same
  - Title contains "habit" + `frequency_unit = "Day"` → creates habit (no clarification)
  - Title = "call the dentist" + no `frequency_unit` → creates one-time task (no clarification)
  - Title case sensitivity: "MY DAILY HABIT" + no `frequency_unit` → returns clarification
- **Validate**: `dotnet test tests/Orbit.Application.Tests --filter CreateHabitToolClarificationTests`

#### Task 15: Unit tests — `ResolveClarificationCommandHandler`
- **Repo**: api
- **File**: `tests/Orbit.Application.Tests/Chat/Commands/ResolveClarificationCommandTests.cs` (CREATE)
- **Cases**: happy path; expired returns failure; already-resolved returns failure; wrong-user returns failure; missing arg key handled
- **Validate**: `dotnet test`

#### Task 16: Integration test — full clarification flow
- **Repo**: api
- **File**: `tests/Orbit.IntegrationTests/Chat/ClarificationFlowTests.cs` (CREATE)
- **Mirror**: existing integration tests under `tests/Orbit.IntegrationTests/` (find Habits or Chat folder)
- **Flow**:
  1. POST `/api/chat` with body `{ message: "Create a meditation habit" }`
  2. Assert response contains `actions[0].status === "NeedsClarification"` + `clarificationRequest.operationId`
  3. POST `/api/ai/clarifications/{operationId}/resolve` with `{ value: "Day" }`
  4. Assert habit is created with `FrequencyUnit = Day, FrequencyQuantity = 1`
  5. Second resolve call returns 410 Gone
- **Validate**: `dotnet test tests/Orbit.IntegrationTests --filter ClarificationFlowTests`

#### Task 17: Manual smoke (backend only — optional)
- Start API locally, hit `/api/chat` with bearer token, confirm `NeedsClarification` is returned for "Create a meditation habit" but UI not yet wired.
- Skippable if Phase C is merged together.

### Phase C — Frontend structural fix (#99) — PARITY REQUIRED

#### Task 18: Extend shared Zod chat types
- **Repo**: ui-mobile
- **File**: `packages/shared/src/types/chat.ts`
- **Action**: UPDATE
  - `actionStatusSchema = z.enum(['Success', 'Failed', 'Suggestion', 'NeedsClarification'])`
  - Add `quickActionSchema = z.object({ label, value, description: z.string().optional() })`
  - Add `clarificationRequestSchema = z.object({ question, operationId: z.string().uuid(), missingArgumentKey, quickActions: z.array(quickActionSchema) })`
  - Add `clarificationRequest: clarificationRequestSchema.optional()` to `actionResultSchema`
- **Validate**: `npm run type-check`

#### Task 19: Add resolve endpoint constant
- **Repo**: ui-mobile
- **File**: `packages/shared/src/api/endpoints.ts`
- **Action**: UPDATE — add under `ai`:
  ```ts
  clarifications: {
    resolve: (operationId: string) => `/api/ai/clarifications/${operationId}/resolve` as const,
  }
  ```
- **Validate**: `npm run type-check`

#### Task 20: Add i18n keys
- **Repo**: ui-mobile
- **Files**: `packages/shared/src/i18n/en.json`, `packages/shared/src/i18n/pt-BR.json`
- **Action**: UPDATE — add `habits.clarification.*` namespace (see "i18n keys" above)
- **Validate**: `npm run type-check`

#### Task 21: Web — `resolveClarification` server action
- **Repo**: ui-mobile
- **File**: `apps/web/app/actions/chat.ts`
- **Action**: UPDATE — add async function `resolveClarification(operationId: string, value: string)` that POSTs to `${API_BASE}/api/ai/clarifications/${operationId}/resolve` with bearer cookie. Returns parsed `ClarificationResolveResponse`.
- **Mirror**: existing `sendChatMessage` at line ~37
- **Validate**: `npm run type-check`

#### Task 22: Web hook — `useResolveClarification`
- **Repo**: ui-mobile
- **File**: `apps/web/hooks/use-resolve-clarification.ts` (CREATE)
- **Action**: CREATE — `useMutation` calling the server action; on success: `queryClient.invalidateQueries({ queryKey: habitKeys.lists() })`
- **Mirror**: `apps/web/hooks/use-habits.ts` mutation patterns
- **Validate**: `npm run type-check`

#### Task 23: Web `<ClarificationCard>` component
- **Repo**: ui-mobile
- **File**: `apps/web/components/chat/clarification-card.tsx` (CREATE)
- **Implement**:
  - Props: `{ clarificationRequest, onResolved, onCancelled }`
  - Shows `clarificationRequest.question` + map quick actions to pill buttons
  - Tap → `useResolveClarification.mutateAsync({ operationId, value: button.value })`
  - States: idle, submitting (spinner on tapped button), success (green check + entity name), error (red text + retry)
  - Visual: `bg-surface-elevated/50 border border-border-muted rounded-[var(--radius-xl)] p-4 shadow-[var(--shadow-sm)]`
  - Quick action button: `bg-surface-elevated border border-border-muted rounded-full px-3 py-1.5 text-xs` (matching `suggestion-chips.tsx` styling)
- **Mirror**: `apps/web/components/chat/breakdown-suggestion.tsx`
- **Validate**: `npm run type-check && npm run lint`

#### Task 24: Web dispatch — `message-bubble.tsx`
- **Repo**: ui-mobile
- **File**: `apps/web/components/chat/message-bubble.tsx`
- **Action**: UPDATE
  - Add filter: `const clarificationActions = actions.filter(a => a.status === 'NeedsClarification' && a.clarificationRequest)`
  - Update `nonSuggestionActions` filter to also exclude `NeedsClarification`
  - Mount `<ClarificationCard>` for each `clarificationActions` entry (similar to existing `<BreakdownSuggestion>` mount)
- **Validate**: `npm run type-check && npm run lint`

#### Task 25: Mobile — hook + card + dispatch (parity with 21-24)
- **Repo**: ui-mobile
- **Files**:
  - `apps/mobile/hooks/use-resolve-clarification.ts` (CREATE) — uses `apiClient` instead of server action
  - `apps/mobile/components/chat/clarification-card.tsx` (CREATE) — React Native primitives, matches `apps/mobile/components/chat/breakdown-suggestion.tsx` styling tokens
  - `apps/mobile/components/message-bubble.tsx` (UPDATE) — parallel dispatch
- **Validate**: `npm run type-check && npm run lint`

#### Task 26: Web unit tests
- **Repo**: ui-mobile
- **File**: `apps/web/__tests__/components/chat/clarification-card.test.tsx` (CREATE)
- **Mirror**: `apps/web/__tests__/components/chat/breakdown-suggestion.test.tsx`
- **Cases**: renders question + buttons; tap submits; loading state; success state; expired-error state
- **Validate**: `npx vitest run apps/web/__tests__/components/chat/clarification-card.test.tsx`

#### Task 27: Mobile unit tests
- **Repo**: ui-mobile
- **File**: `apps/mobile/__tests__/components/chat/clarification-card.test.tsx` (CREATE)
- **Mirror**: any existing mobile chat tests (e.g. `apps/mobile/__tests__/components/chat/action-chips.test.tsx`)
- **Validate**: `npx vitest run apps/mobile/__tests__/components/chat/clarification-card.test.tsx`

---

## Validation commands

### orbit-api (from `C:\Users\thoma\Documents\Programming\Projects\orbit-api`)
```powershell
dotnet build
dotnet test tests/Orbit.Application.Tests
dotnet test tests/Orbit.IntegrationTests --filter Clarification
```

### orbit-ui-mobile (from `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile`)
```powershell
npm run lint
npm run type-check
npx vitest run
```

### End-to-end smoke
- [ ] Start API: `dotnet run --project src/Orbit.Api` in orbit-api
- [ ] Start web: `npm run web` in orbit-ui-mobile
- [ ] Log in as test user, open `/chat`
- [ ] Send: *"Create a meditation habit"* → `<ClarificationCard>` renders with Daily / Weekly / 3× per week / One-time buttons
- [ ] Tap "Daily" → card shows "Created 'meditation'" success state; habit appears in `/habits` with `frequency_unit: Day, frequency_quantity: 1`
- [ ] Send (regression): *"Create a one-time task to call the dentist Friday"* → habit created immediately, no card
- [ ] Send (regression): *"Create a daily meditation habit"* → habit created immediately, no card
- [ ] Send PT: *"Crie o hábito de tomar café da manhã"* → ClarificationCard renders
- [ ] Repeat all of the above on mobile via `npm run android`
- [ ] Open `/chat` again 31 minutes after clarification rendered — tap a button → see "expired" error (validates TTL)

---

## Risks

| Risk | Mitigation |
|------|------------|
| Model returns `NeedsClarification` for cases where the user already gave clear intent (over-asking) | New prompt section explicitly tells the model not to over-ask. Integration test covers the regression-safe cases. |
| Tool heuristic too narrow (verb-phrase habits like "Tomar café") | Two-layer defense: prompt rule from #98 catches it before the tool fires. Tool is the safety net for explicit habit-keyword cases. |
| `PendingClarification` table grows unbounded | TTL of 30 min via `ExpiresAtUtc`; add a hosted background sweep job in a follow-up (out of scope here — note in PR description). |
| Concurrent resolve attempts (double-tap) | `Resolve()` is one-shot — throws on second call. Frontend disables button after first tap; error state catches race. |
| EF migration on Render auto-deploy could fail mid-rollout if web ships first | Backend ships and migration runs before frontend can hit the new endpoint. Sequence: merge api PR first → wait for Render deploy → merge ui-mobile PR. |
| Shared types out of sync with backend record | Zod schemas in `packages/shared/src/types/chat.ts` are hand-mirrored from C# — manual diligence required. Add a snapshot test that asserts the shape doesn't drift (future). |

---

## Acceptance criteria

- [ ] All tasks (1-27) completed
- [ ] `dotnet build` + `dotnet test` pass on orbit-api
- [ ] `npm run lint` + `npm run type-check` + `npx vitest run` pass on orbit-ui-mobile
- [ ] Parity verified: web + mobile `<ClarificationCard>` behave identically (E2E checklist)
- [ ] EF migration applied locally + runs clean
- [ ] Manual smoke checklist passes including PT and EN cases, regression-safe paths, and TTL expiry
- [ ] No new `console.log`s in frontend
- [ ] Zero `any` types in new TS files
- [ ] All user-facing strings i18n'd (no hardcoded English in components)
- [ ] One branch per repo: `fix/chat-clarification` in both
- [ ] PR descriptions cross-link issues #98 and #99 and the sibling repo's PR
