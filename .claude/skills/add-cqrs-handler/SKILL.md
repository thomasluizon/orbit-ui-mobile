---
name: add-cqrs-handler
description: API-only CQRS scaffold (no client work). Use when the user asks for an internal command or query in orbit-api that doesn't need a client-side API call. Writes Command/Query class + Handler + Validator + endpoint registration + unit test.
---

# Add a CQRS handler (orbit-api only)

For commands or queries that orbit-api needs INTERNALLY (e.g., invoked by background services, MCP tools, or webhook handlers) but do NOT need a client-side API call. If a client needs to call it, use `add-api-endpoint` instead.

Repo: `C:\Users\thoma\Documents\Programming\Projects\orbit-api`.

## Inputs

- **Type** — Command (write) or Query (read).
- **Name** — PascalCase verb + noun (`CreateHabit`, `GetHabitMetrics`).
- **Feature folder** — `Habits`, `Notifications`, etc.
- **Inputs / outputs** — fields + types.
- **Invoker** — who calls this? (background service, MCP tool, internal pipeline).

## Steps

1. **Command/Query** — `src/Orbit.Application/<Feature>/Commands/<Name>Command.cs` (or `Queries/`). Implements `IRequest<Result<TResponse>>`. Use factory methods if non-trivial construction.
2. **Validator** — `src/Orbit.Application/<Feature>/Validators/<Name>CommandValidator.cs`. FluentValidation. Reuse shared rules (`SharedHabitRules.AddTitleRules()`, etc.) where applicable.
3. **Handler** — `src/Orbit.Application/<Feature>/Commands/Handlers/<Name>Handler.cs`. Implements `IRequestHandler<TCommand, Result<TResponse>>`. Use `ErrorMessages`, `AppConstants`, and `CacheInvalidationHelper` from `Common/` — never inline strings or magic numbers.
4. **Wire the invoker** — depending on the invoker type:
   - Background service: inject `ISender`, call `Send(command)`.
   - MCP tool: add to `src/Orbit.Api/Mcp/Tools/<Feature>Tools.cs`.
   - Pipeline behavior: add to MediatR pipeline registration in `Program.cs`.
5. **Unit test** — `tests/Orbit.Application.Tests/<Feature>/<Name>Tests.cs`. xUnit + FluentAssertions, real Application + Domain layers, mock only Infrastructure ports.

## Skip

- DO NOT add a Controller endpoint — that's `add-api-endpoint`.
- DO NOT add MCP tool unless invoker is explicitly MCP.

## Verify

```bash
cd C:/Users/thoma/Documents/Programming/Projects/orbit-api
dotnet build
dotnet test tests/Orbit.Application.Tests
```

## Output

| File | Action |
|---|---|
| `src/Orbit.Application/<Feature>/Commands/<Name>Command.cs` | CREATE |
| `src/Orbit.Application/<Feature>/Validators/<Name>CommandValidator.cs` | CREATE |
| `src/Orbit.Application/<Feature>/Commands/Handlers/<Name>Handler.cs` | CREATE |
| `tests/Orbit.Application.Tests/<Feature>/<Name>Tests.cs` | CREATE |
| (varies) | Invoker wiring |
