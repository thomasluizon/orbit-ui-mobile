---
name: add-api-endpoint
description: Scaffolds a new HTTP endpoint end-to-end across orbit-ui-mobile + orbit-api. Use when the user asks to add, create, expose, or wire a new API endpoint, route, or operation. Writes the endpoint constant in packages/shared, Server Action in apps/web, apiClient call in apps/mobile, query key, and Controller + CQRS handler + validator + test in orbit-api.
---

# Add an API endpoint (cross-repo)

Scaffolds a new HTTP endpoint across BOTH repos in one pass. The mobile and web consumers and the .NET API land together — never frontend-only, never backend-only.

## Inputs

- **HTTP method + path** (e.g. `POST /api/habits/{id}/freeze`).
- **Request body shape** (if any) — for `add-shared-type` integration.
- **Response shape** — same.
- **Auth** — `[Authorize]` is the default; `[AllowAnonymous]` only when truly public.
- **PayGate** — does this endpoint require subscription gating?

## Steps

### 1. orbit-api (backend) — `C:\Users\thoma\Documents\Programming\Projects\orbit-api`

Write in this order:

1. **Domain** — if a new entity or value object is needed, add to `src/Orbit.Domain/`. Use factory methods + private setters per `src/Orbit.Domain/CLAUDE.md`.
2. **Application**:
   - `src/Orbit.Application/<Feature>/Commands/` or `Queries/` — define the Command/Query type + Handler.
   - `src/Orbit.Application/<Feature>/Validators/` — FluentValidation rules. Reuse shared rules where possible.
   - Use `Result<T>` for return; never throw for expected failures.
   - Wire PayGate if applicable (`PayGateService.PropagateError`).
3. **Controller** — `src/Orbit.Api/Controllers/<Feature>Controller.cs`. Inject `ISender`, dispatch, return `result.ToPayGateAwareResult(v => Ok(v))`. Default to `[Authorize]`.
4. **MCP tool** (optional) — if the new endpoint mutates user data, expose as an MCP tool in `src/Orbit.Api/Mcp/Tools/<Feature>Tools.cs` so Astra can invoke it.
5. **Test** — integration test in `tests/Orbit.IntegrationTests/<Feature>/`.

Validate: `cd orbit-api && dotnet build && dotnet test tests/Orbit.IntegrationTests`.

### 2. packages/shared

1. **Endpoint constant** in `packages/shared/src/api/endpoints.ts`. Match the existing tree shape (`API.habits.freeze = (id) => ...`).
2. **Type schemas** in `packages/shared/src/types/<domain>.ts` (request + response). Run the `add-shared-type` skill for the schemas if they're new.
3. **Query key** in `packages/shared/src/query/keys.ts` if the new endpoint is a read.

### 3. apps/web

1. **Server Action** in `apps/web/app/actions/<feature>.ts`. Use `authedFetch`. After mutation: `revalidateTag` / `revalidatePath`.
2. **Hook** in `apps/web/hooks/use-<resource>.ts` (TanStack Query). Use the new query key.

### 4. apps/mobile

1. **API call** via `apiClient<ResponseType>(API.feature.endpoint, ...)` in a new or existing hook at `apps/mobile/hooks/use-<resource>.ts`. Use `performQueuedApiMutation` for offline-safe mutations.

### 5. Verify

- `npm run type-check` in each touched workspace.
- `dotnet build` in orbit-api.
- Run the matching tests.

### 6. Invoke contract-aligner

After all writes, invoke the `contract-aligner` subagent to verify the shapes match between Zod schemas (shared) and C# DTOs (orbit-api).

## Skip

- DO NOT auto-create an MCP tool unless the user asked or the endpoint clearly mutates user-visible state.
- DO NOT scaffold without a confirmed shape. If fields are ambiguous, ask first.

## Output

| Repo | Files created/modified |
|---|---|
| orbit-api | Domain (if any), Application command/query + validator + handler, Controller endpoint, integration test |
| packages/shared | endpoints.ts, types/<domain>.ts, query/keys.ts |
| apps/web | Server Action, TanStack hook |
| apps/mobile | apiClient hook (offline-safe if mutation) |

Plus the contract-aligner subagent's pass/fail summary.
