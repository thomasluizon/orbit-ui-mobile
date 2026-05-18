---
description: Create implementation plan with cross-repo codebase analysis
argument-hint: <issue-number | feature description | path/to/prd.md>
---

# Implementation Plan Generator

**Input**: $ARGUMENTS

## Objective

Transform input into a context-rich, battle-tested implementation plan.

**Core Principle**: PLAN ONLY — no code written.
**Order**: CODEBASE FIRST. Solutions must fit existing patterns in both `orbit-ui-mobile` and `orbit-api`.

---

## Phase 1: PARSE

### Determine Input Type

| Input | Action |
|-------|--------|
| Numeric (`123`) or `#123` | Fetch issue from `orbit-ui-mobile` via `gh issue view` |
| `.prd.md` file | Read PRD, extract next pending phase |
| Other `.md` file | Extract feature description |
| Free-form text | Use directly |
| Blank | Use conversation context |

### Fetch Issue Context (if numeric)

```bash
gh issue view {N} --repo thomasluizon/orbit-ui-mobile --json number,title,body,labels,milestone
```

Extract:
- Title and body
- `Repos` value from labels (`repo:frontend`, `repo:backend`, `repo:both`)
- `parity-required` label (if present, both web + mobile must be updated)
- Acceptance criteria from body

### Extract Feature Understanding

- **Problem**: What we're solving
- **User Story**: As a [user], I want to [action], so that [benefit]
- **Type**: NEW_CAPABILITY / ENHANCEMENT / REFACTOR / BUG_FIX
- **Complexity**: LOW / MEDIUM / HIGH
- **Repos Affected**: frontend / backend / both
- **GitHub Issue**: Capture issue number if known. `/implement` will close it after completion.

---

## Phase 2: EXPLORE

### Study the Codebase

Use the Explore agent. Search areas based on `Repos`:

**If frontend (or both):**
- Similar pages: `apps/web/app/(app)/` and `apps/mobile/app/`
- Similar components: `apps/web/components/` and `apps/mobile/components/`
- Hooks: `apps/web/hooks/` and `apps/mobile/hooks/`
- Server Actions: `apps/web/app/actions/`
- Shared types: `packages/shared/src/types/`
- Query keys: `packages/shared/src/query/keys.ts`
- Endpoint constants: `packages/shared/src/api/endpoints.ts`
- i18n: `packages/shared/src/i18n/en.json`, `pt-BR.json`

**If backend (or both):**
- Similar commands/queries: `C:\Users\thoma\Documents\Programming\Projects\orbit-api\src\Orbit.Application\`
- Domain entities: `C:\Users\thoma\Documents\Programming\Projects\orbit-api\src\Orbit.Domain\`
- Validators: `Orbit.Application\<Feature>\Validators\` and `Orbit.Application\Habits\Validators\SharedHabitRules.cs`
- Controllers: `Orbit.Api\Controllers\`
- Integration tests: `tests\Orbit.IntegrationTests\`

### Document Patterns

| Category | Repo | File:Lines | Pattern |
|----------|------|------------|---------|
| FRONTEND_NAMING | ui-mobile | `apps/web/...` | ... |
| FRONTEND_HOOK | ui-mobile | `apps/mobile/hooks/...` | ... |
| BACKEND_CQRS | api | `src/Orbit.Application/...` | ... |
| BACKEND_VALIDATOR | api | `src/Orbit.Application/.../Validators/...` | ... |
| TESTS | both | `apps/web/__tests__/...` + `tests/Orbit.IntegrationTests/...` | ... |

---

## Phase 3: DESIGN

### Map the Changes

- Files to CREATE (with full path)
- Files to UPDATE (with full path)
- Dependency order across repos: typically domain → application → API → shared types → web → mobile → tests
- For `repo:both`: define the implementation order so each step is independently runnable (backend stub deployable before frontend consumes it)

### Cross-Platform Parity Check (frontend stories)

If touching `apps/web`, you almost always also touch `apps/mobile`. List the parallel files:

| Web | Mobile | Same logic? |
|-----|--------|-------------|
| `apps/web/hooks/use-foo.ts` | `apps/mobile/hooks/use-foo.ts` | yes/no |

### Identify Risks

| Risk | Mitigation |
|------|------------|
| {issue} | {handling} |

---

## Phase 4: GENERATE

**Output path**: `.agents/plans/{kebab-case-name}.plan.md`

```bash
mkdir -p .agents/plans
```

```markdown
# Plan: {Feature Name}

## Summary

{One paragraph: what we're building and the approach}

## User Story

As a {user type}
I want to {action}
So that {benefit}

## Metadata

| Field | Value |
|-------|-------|
| Type | NEW_CAPABILITY / ENHANCEMENT / REFACTOR / BUG_FIX |
| Complexity | LOW / MEDIUM / HIGH |
| Repos | frontend / backend / both |
| Parity Required | yes / no |
| GitHub Issue | #{N} (or "N/A") |
| Web Affected | yes / no |
| Mobile Affected | yes / no |

---

## Patterns to Follow

### Frontend (skip if backend-only)

#### Naming
```
// SOURCE: apps/web/.../file.ts:lines
{actual snippet}
```

#### Hooks
```
// SOURCE: apps/mobile/hooks/use-X.ts:lines
{actual snippet}
```

#### Server Action / API call
```
// SOURCE: apps/web/app/actions/X.ts:lines
{actual snippet}
```

### Backend (skip if frontend-only)

#### Command / Query
```csharp
// SOURCE: orbit-api/src/Orbit.Application/Habits/Commands/CreateHabit.cs:lines
{actual snippet}
```

#### Validator
```csharp
// SOURCE: orbit-api/src/Orbit.Application/Habits/Validators/CreateHabitValidator.cs:lines
{actual snippet}
```

#### Controller
```csharp
// SOURCE: orbit-api/src/Orbit.Api/Controllers/HabitsController.cs:lines
{actual snippet}
```

### Tests

```
// SOURCE: tests/Orbit.IntegrationTests/.../X.cs:lines
{actual snippet}
```

---

## Files to Change

| Repo | File | Action | Purpose |
|------|------|--------|---------|
| ui-mobile | `packages/shared/src/types/X.ts` | CREATE | Zod type |
| ui-mobile | `packages/shared/src/api/endpoints.ts` | UPDATE | Add endpoint |
| ui-mobile | `apps/web/app/actions/X.ts` | CREATE | Server action |
| ui-mobile | `apps/web/hooks/use-X.ts` | CREATE | TanStack hook |
| ui-mobile | `apps/mobile/hooks/use-X.ts` | CREATE | Mobile hook (parity) |
| api | `src/Orbit.Application/X/Commands/CreateX.cs` | CREATE | CQRS command |
| api | `src/Orbit.Api/Controllers/XController.cs` | UPDATE | Add endpoint |
| api | `src/Orbit.Infrastructure/Migrations/AddX.cs` | CREATE | EF migration |

---

## Tasks

Execute in order. Each task is atomic and verifiable. Group by repo for clarity, but list cross-repo dependencies.

### Task 1: {Description}

- **Repo**: ui-mobile / api
- **File**: `path/to/file`
- **Action**: CREATE / UPDATE
- **Implement**: {what to do}
- **Mirror**: `path/to/example:lines` — follow this pattern
- **Validate**: `npm run type-check` (ui-mobile) / `dotnet build` (api)

### Task 2: {Description}

- ...

{Continue for each task.}

---

## Validation Commands

### orbit-ui-mobile (run from repo root)

```bash
npm run lint
npm run type-check
npm test
```

### orbit-api (run from repo root)

```bash
dotnet build
dotnet test tests/Orbit.IntegrationTests
```

### End-to-End Tests

List concrete E2E steps `/implement` must execute. Examples:

- [ ] Start API: `dotnet run --project src/Orbit.Api` in `orbit-api`
- [ ] Start web: `npm run web` in `orbit-ui-mobile`
- [ ] Log in as test user, navigate to {route}
- [ ] Trigger {action} — expect {observable result}
- [ ] Repeat on mobile if `parity-required: yes`

---

## Acceptance Criteria

- [ ] All tasks completed
- [ ] Validation passes in every affected repo
- [ ] Parity verified if `Parity Required: yes` (both web and mobile updated and behave the same)
- [ ] Tests written for new code
- [ ] E2E checklist passes
- [ ] Follows existing patterns
```

---

## Phase 5: OUTPUT

```markdown
## Plan Created

**File**: `.agents/plans/{name}.plan.md`
**Repos**: frontend / backend / both
**Issue**: #{N} (or "N/A")

**Summary**: {2-3 sentences}

**Scope**:
- {N} files to CREATE
- {M} files to UPDATE
- {K} total tasks
- Affects: orbit-ui-mobile / orbit-api / both

**Key Patterns**:
- {Pattern 1 with file:line}
- {Pattern 2 with file:line}

**Next Step**: Review the plan, then `/implement .agents/plans/{name}.plan.md`
```
