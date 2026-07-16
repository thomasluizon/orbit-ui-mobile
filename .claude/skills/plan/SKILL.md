---
name: plan
description: Create implementation plan with cross-repo codebase analysis
argument-hint: <issue-number | feature description | path/to/prd.md> [issue-number ...] [--research | --no-research]
effort: xhigh
---

# Implementation Plan Generator

**Input**: $ARGUMENTS

## Objective

Transform input into a context-rich, battle-tested implementation plan.

**Core Principle**: PLAN ONLY — no code written.
**Order**: CODEBASE FIRST. Solutions must fit existing patterns in both `orbit-ui-mobile` and `orbit-api`.

## Mode detection (do this first)

First strip any `--research` / `--no-research` flag from `$ARGUMENTS` (it controls Phase 2.5 only); the remainder is the plan input. Then parse `$ARGUMENTS` and count numeric tokens (`123`, `#123`) — split on whitespace OR commas.

| Numeric arg count | Mode |
|---|---|
| 0 or 1 (or any non-numeric input) | **Single-plan** — continue with the phases below. |
| ≥ 2 | **Multi-plan** — jump to the "Multi-plan mode" section. |

---

## Single-plan mode

## Phase 1: PARSE

### Determine Input Type

| Input | Action |
|---|---|
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

Use the Explore subagent for breadth. Search areas based on `Repos`:

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
- Unit tests: `tests\Orbit.Application.Tests\` (+ `Orbit.Domain.Tests`, `Orbit.Infrastructure.Tests`) — unit tests only, no integration suite

### Document Patterns

| Category | Repo | File:Lines | Pattern |
|---|---|---|---|
| FRONTEND_NAMING | ui-mobile | `apps/web/...` | ... |
| FRONTEND_HOOK | ui-mobile | `apps/mobile/hooks/...` | ... |
| BACKEND_CQRS | api | `src/Orbit.Application/...` | ... |
| BACKEND_VALIDATOR | api | `src/Orbit.Application/.../Validators/...` | ... |
| TESTS | both | `apps/web/__tests__/...` + `tests/Orbit.Application.Tests/...` | ... |

---

## Phase 2.5: RESEARCH open decisions (conditional)

Most plans need NO web research — `/plan` fits work into existing Orbit patterns, and Phase 2 already surfaces the pattern to mirror. Reach for `/deep-research` only when the task has a genuine open decision the codebase doesn't answer.

**Trigger** deep-research when EITHER:
- `--research` was passed (force it), OR
- Phase 2 found **no in-repo precedent** for a load-bearing decision — one of: a new third-party dependency/SDK with no established equivalent here; an unfamiliar architecture/integration/protocol with no pattern to mirror; a performance/security/scaling/cost approach not already settled in the codebase or `CLAUDE.md`; or the issue itself asks an open "what's the best way to X."

**Skip** (the common case) when Phase 2 found a clear pattern to mirror, the task is routine CRUD/feature/bugfix/parity work, or `--no-research` was passed. State in one line that research was skipped and why.

**How:** invoke `/deep-research "<the specific open question>"` scoped to the **decision**, not the whole feature (e.g. "best way to do optimistic offline sync for habit logs in Expo + TanStack Query", not "plan the habits feature"). Fold its recommendation into Phase 3 as the chosen approach, and cite its sources in the plan's Patterns/Risks. In **multi-plan mode**, run the research inline (apply the deep-research method directly) rather than nesting a `/deep-research` skill call.

**Guardrail — Orbit conventions win.** deep-research surfaces *external* best practice; it does not override Orbit's deliberate choices. When a finding conflicts with `CLAUDE.md`, `DESIGN.md`, an established codebase pattern, or cross-platform parity, the Orbit convention wins — note the deviation and why. Never let a generic recommendation pull the plan off-anchor.

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
|---|---|---|
| `apps/web/hooks/use-foo.ts` | `apps/mobile/hooks/use-foo.ts` | yes/no |

### Identify Risks

| Risk | Mitigation |
|---|---|
| {issue} | {handling} |

---

## Phase 4: GENERATE

**Output path**: `.claude/plans/{kebab-case-name}.plan.md`

```bash
mkdir -p .claude/plans
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
|---|---|
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
// SOURCE: apps/web/__tests__/use-X.test.ts:lines (frontend unit) / orbit-api tests/.../CreateXHandlerTests.cs:lines (backend unit)
{actual snippet}
```

---

## Files to Change

| Repo | File | Action | Purpose |
|---|---|---|---|
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
dotnet test
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

**File**: `.claude/plans/{name}.plan.md`
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

**Next Step**: Review the plan, then `/implement .claude/plans/{name}.plan.md`
```

---

## Multi-plan mode

User passed 2+ issue numbers. Generate one plan per issue, in parallel via subagents in their paired worktrees.

### Step 1: Verify worktrees exist

For each issue `N`, check that the paired worktrees exist:

- `C:/Users/thoma/Documents/Programming/Projects/orbit-ui-mobile/.claude/worktrees/issue-<N>`
- `C:/Users/thoma/Documents/Programming/Projects/orbit-api/.claude/worktrees/issue-<N>` (if applicable)

If a worktree is missing, run `/prime <N1> <N2> ...` first (or surface the error and ask the user to do so).

### Step 2: Spawn planning subagents

Use the Agent tool to spawn ONE subagent per issue, in parallel. Each subagent:

- Has `cwd` set to the orbit-ui-mobile worktree for that issue.
- Runs the full single-plan flow (Phases 1–5) inside its worktree.
- Writes its plan to `.claude/plans/issue-<N>.plan.md` inside the worktree.
- Reports back: plan file path, scope summary, complexity rating.

**Concurrency cap: 3 subagents at a time.** Queue the rest.

### Step 3: Aggregate

Print one row per issue showing plan path + scope + complexity. Surface any subagent failures with the error message and the worktree path so the user can iterate manually.

```
Issue   Plan                                                  Files  Tasks  Complexity
#100    .claude/worktrees/issue-100/.claude/plans/...         12     8      MEDIUM
#101    .claude/worktrees/issue-101/.claude/plans/...         4      3      LOW
#102    .claude/worktrees/issue-102/.claude/plans/...         FAILED ...
```

Suggested next step: `/implement <N1> <N2> <N3>` (continues the parallel flow).
