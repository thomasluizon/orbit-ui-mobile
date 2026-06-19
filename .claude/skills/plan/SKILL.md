---
name: plan
description: Create implementation plan with cross-repo codebase analysis
argument-hint: <issue-number | feature description | path/to/prd.md> [issue-number ...]
---

# Implementation Plan Generator

**Input**: $ARGUMENTS

## Objective

Transform input into a context-rich, battle-tested implementation plan.

**Core Principle**: PLAN ONLY — no code written.
**Order**: CODEBASE FIRST. Solutions must fit existing patterns in both `orbit-ui-mobile` and `orbit-api`.

## Mode detection (do this first)

Parse `$ARGUMENTS`. Count numeric tokens (`123`, `#123`) — split on whitespace OR commas.

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
- Integration tests: `tests\Orbit.IntegrationTests\`

### Document Patterns

| Category | Repo | File:Lines | Pattern |
|---|---|---|---|
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

(rest of plan body — see Phase 4 template details below.)
```

The full plan template (Patterns / Files to Change / Tasks / Validation Commands / E2E / Acceptance Criteria) is unchanged from the earlier version of this skill — preserve its structure.

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
