---
name: add-migration
description: Generates an EF Core migration in orbit-api. Use when the user asks to add, alter, or remove a database column, table, index, or constraint. Confirm the migration plan with the user before running — schema changes have high blast radius.
---

# Add an EF Core migration (orbit-api)

Schema changes have high blast radius — they hit production DB on the next deploy. **Confirm the plan with the user before running `dotnet ef migrations add`.**

Repo: `C:\Users\thoma\Documents\Programming\Projects\orbit-api`.

## Inputs

- **What's changing** — new column, new table, new index, constraint change, etc.
- **Entity affected**.
- **Default values** for new non-nullable columns (required to backfill existing rows).
- **Index purpose** for new indexes (which query?).

## Steps

1. **Confirm the plan with the user.** Output the proposed entity changes + migration name + backfill strategy. WAIT for approval before proceeding.
2. **Update the entity** in `src/Orbit.Domain/Entities/<Entity>.cs`. Use factory methods + private setters per Domain CLAUDE.md.
3. **Update the FluentConfig** in `src/Orbit.Infrastructure/Persistence/Configurations/<Entity>Configuration.cs`. NEVER use data annotations on domain entities.
4. **Generate the migration**:
   ```bash
   cd C:/Users/thoma/Documents/Programming/Projects/orbit-api
   dotnet ef migrations add <Name> --project src/Orbit.Infrastructure --startup-project src/Orbit.Api
   ```
5. **Inspect the generated `<Timestamp>_<Name>.cs`.** Verify:
   - Non-nullable columns have `defaultValue:` for backfill.
   - Drops are intentional (no field renames as drop+add).
   - Indexes have meaningful names.
6. **Update DbContext** — if a new `DbSet<T>` is needed, add to `OrbitDbContext.cs`. The `csharp-fluentconfig` hook will flag a missing FluentConfig.
7. **Update tests** that depend on the changed shape.
8. **Verify**:
   ```bash
   dotnet build
   dotnet test tests/Orbit.IntegrationTests
   ```

## Skip

- DO NOT edit a migration that has been applied to any environment (including local dev DB if shared). Generate a NEW migration to amend.
- DO NOT manually edit the `.Designer.cs` file — it's generated.

## Output

| File | Action |
|---|---|
| `src/Orbit.Domain/Entities/<Entity>.cs` | UPDATE |
| `src/Orbit.Infrastructure/Persistence/Configurations/<Entity>Configuration.cs` | UPDATE |
| `src/Orbit.Infrastructure/Migrations/<Timestamp>_<Name>.cs` | CREATE (via CLI) |
| `src/Orbit.Infrastructure/Migrations/<Timestamp>_<Name>.Designer.cs` | CREATE (generated) |
| `src/Orbit.Infrastructure/Persistence/OrbitDbContext.cs` | UPDATE (if new DbSet) |
