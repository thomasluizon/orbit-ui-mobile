---
description: Prime agent with Orbit project context (both repos + optional GitHub issue)
argument-hint: [issue-number] [--quick]
---

# Prime: Load Orbit Context

**Input**: $ARGUMENTS

## Objective

Build a working mental model of both Orbit repos so subsequent commands (`/plan`, `/implement`) have warm context.

## Process

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

- `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile\AGENTS.md`
- `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile\CLAUDE.md`
- `C:\Users\thoma\Documents\Programming\Projects\orbit-api\AGENTS.md`
- `C:\Users\thoma\Documents\Programming\Projects\orbit-api\CLAUDE.md` (if present)

### Step 3: Tour the codebases (skip if `--quick`)

**orbit-ui-mobile** (focus areas based on issue labels):

| Issue scope | Read |
|-------------|------|
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

## Output

Scannable summary:

- **Issue** (if loaded): #N — title — repos label — parity flag
- **Acceptance criteria**: bulleted list from issue body
- **Project purpose**: Orbit habit tracker, dual-repo, Turborepo + .NET
- **Frontend stack**: Next.js 15 (web) + Expo SDK 53 (mobile) + Zustand + TanStack Query + shared Zod schemas
- **Backend stack**: .NET 10, EF Core, MediatR CQRS, FluentValidation, JWT, PostgreSQL
- **Recent commits**: 3-5 from each repo
- **Current branches**: ui-mobile vs api
- **Open question / risk**: anything that looks underspecified

Keep it concise. Bullets, not paragraphs.

---

## Suggested Next Step

```
/plan {issue-number}
```
