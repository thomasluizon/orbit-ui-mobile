---
description: Prime agent with Orbit project context (both repos + optional GitHub issue)
argument-hint: [issue-number ...] [--quick]
---

# Prime: Load Orbit Context

**Input**: $ARGUMENTS

## Objective

Build a working mental model of both Orbit repos so subsequent commands (`/plan`, `/implement`) have warm context.

## Mode detection (do this first)

Parse `$ARGUMENTS`. Count numeric tokens (`123`, `#123`) — split on whitespace OR commas (`100,101,102` is two arguments).

| Numeric arg count | Mode |
|---|---|
| 0 or 1 | **Single-issue / context-only** — continue with the steps below. |
| ≥ 2 | **Multi-issue** — jump to the "Multi-issue mode" section. Do NOT run the single-issue steps in the main session. |

---

## Single-issue mode

### Step 0: Parse args

- If first arg is numeric (or `#N`), treat as a GitHub issue in `thomasluizon/orbit-ui-mobile`.
- `--quick` skips the deep codebase tour and only reads conventions + recent commits.

### Step 1: Load GitHub issue (if provided)

```bash
gh issue view {N} --repo thomasluizon/orbit-ui-mobile --json number,title,body,labels,milestone,assignees,state
```

Extract:
- Title and body
- Labels — note `repo:frontend` / `repo:backend` / `repo:both` and `parity-required`
- Acceptance criteria from the body
- Any "Depends on" / "Blocks" references

### Step 2: Read conventions

In parallel:

- `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile\CLAUDE.md` (root + scoped per workspace)
- `C:\Users\thoma\Documents\Programming\Projects\orbit-api\CLAUDE.md` (root + scoped per project)
- `WORKFLOW.md` (repo root)

### Step 3: Tour the codebases (skip if `--quick`)

**orbit-ui-mobile** (focus areas based on issue labels):

| Issue scope | Read |
|---|---|
| Always | `packages/shared/src/types/`, `packages/shared/src/api/endpoints.ts`, `packages/shared/src/query/keys.ts` |
| Frontend | A representative feature in `apps/web/app/(app)/` and `apps/mobile/app/` + matching hook |
| Backend | A representative CQRS feature in `orbit-api/src/Orbit.Application/` |

**orbit-api** (if backend or both):

- `src/Orbit.Application/Habits/` as the canonical CQRS example
- `src/Orbit.Domain/Entities/Habit.cs` for entity patterns
- `tests/Orbit.IntegrationTests/Habits/` for test patterns

### Step 4: Recent state

```bash
git -C "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile" log --oneline -10
git -C "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile" branch --show-current
git -C "C:\Users\thoma\Documents\Programming\Projects\orbit-api" log --oneline -10
git -C "C:\Users\thoma\Documents\Programming\Projects\orbit-api" branch --show-current
```

---

## Multi-issue mode

User passed 2+ issue numbers. Create one paired worktree per issue, prime each one in a background subagent, and report all paths when done.

### Step 1: Validate

- Read each issue with `gh issue view <N>` to confirm it exists.
- If any issue is closed/locked, list it and ask the user whether to continue with the remainder.

### Step 2: Create paired worktrees

For each issue `N`, invoke the `worktree-work` skill to create matched branches in BOTH repos:

- Branch name: `issue-<N>` (mirroring the issue number)
- Worktree paths:
  - `C:/Users/thoma/Documents/Programming/Projects/orbit-ui-mobile/.claude/worktrees/issue-<N>`
  - `C:/Users/thoma/Documents/Programming/Projects/orbit-api/.claude/worktrees/issue-<N>` (if the issue's `Repos` label is `backend` or `both`)

### Step 3: Spawn priming subagents

Use the Agent tool to spawn ONE subagent per issue, **in parallel** (multiple Agent tool calls in a single message). Each subagent:

- Has `cwd` set to the orbit-ui-mobile worktree path.
- Runs `/prime <N>` inside its worktree (single-issue mode).
- Reports back: issue title, repos label, parity flag, 3-bullet summary of the acceptance criteria.

**Concurrency cap: 3 subagents at a time.** Queue the rest. (Pass excess as a follow-up batch when the first batch completes.)

### Step 4: Aggregate

When all subagents return, print a single table:

```
Issue   Title                            Repos       Parity   Worktree
#100    Add streak freeze                both        yes      .claude/worktrees/issue-100
#101    Fix timezone bug                 frontend    yes      .claude/worktrees/issue-101
#102    Migrate to new validator         backend     no       .claude/worktrees/issue-102
```

Then list any failures (subagent error, worktree creation failure) with the underlying message.

---

## Output

### Single-issue mode

Scannable summary:

- **Issue** (if loaded): #N — title — repos label — parity flag
- **Acceptance criteria**: bulleted list from issue body
- **Project purpose**: Orbit habit tracker, dual-repo, Turborepo + .NET
- **Frontend stack**: Next.js 15 (web) + Expo SDK 55 (mobile) + Zustand + TanStack Query + shared Zod schemas
- **Backend stack**: .NET 10, EF Core, MediatR CQRS, FluentValidation, JWT, PostgreSQL
- **Recent commits**: 3-5 from each repo
- **Current branches**: ui-mobile vs api
- **Open question / risk**: anything that looks underspecified

Keep it concise. Bullets, not paragraphs.

### Multi-issue mode

The aggregated table + suggested next step:

```
/plan <A> <B> <C>      # same N issues, parallel plans
```

---

## Suggested next step

**Single-issue:** `/plan {issue-number}`
**Multi-issue:** `/plan <N1> <N2> <N3>` (continues the parallel flow)
