---
name: implement
description: Execute a plan across orbit-ui-mobile + orbit-api with validation loops
argument-hint: <path/to/plan.md | issue-number> [issue-number ...]
---

# Implement Plan (Cross-Repo)

**Plan**: $ARGUMENTS

## Mission

Execute the plan end-to-end across the affected repos with rigorous self-validation.

**Core Philosophy**: Validation loops catch mistakes early. Run checks after every change. Fix issues before moving on.

**Golden Rule**: If validation fails, fix it before moving on. Never accumulate broken state.

## Mode detection (do this first)

Parse `$ARGUMENTS`. Count numeric tokens (`123`, `#123`).

| Numeric arg count | Mode |
|---|---|
| 0 | **Path-based** — argument is a plan file path. Continue with Phase 1 below. |
| 1 | **Single-issue** — argument is one issue number. Plan path = `.claude/plans/issue-<N>.plan.md`. Continue with Phase 1. |
| ≥ 2 | **Multi-issue** — jump to "Multi-issue mode". |

---

## Paths

| Repo | Root |
|---|---|
| `orbit-ui-mobile` (hub) | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

---

## Phase 1: LOAD

Read the plan file (resolve from arguments per the mode detection table). Extract:

- Summary, user story, metadata
- **Repos** (frontend / backend / both)
- **Parity Required** (yes/no)
- **GitHub Issue** (#N or N/A) — `/implement` will close this after success
- Patterns to mirror
- Files to change
- Tasks (ordered)
- Validation commands
- E2E checklist

**If plan not found:**

```
Error: Plan not found at $ARGUMENTS
Create one first: /plan <issue-number>
```

---

## Phase 2: PREPARE GIT STATE

For each affected repo, check state and create branch.

### Branch Name

Derive from plan filename: `feature/{kebab-name}` (use `fix/` if metadata says BUG_FIX, `chore/` if REFACTOR/tech).

### orbit-ui-mobile (if Repos = frontend or both)

```bash
git -C "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile" branch --show-current
git -C "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile" status
```

| State | Action |
|---|---|
| On main, clean | `git checkout -b feature/{name}` |
| On main, dirty | STOP: ask user to stash or commit |
| On the target feature branch | Use it |
| On a different feature branch | STOP: ask user |

### orbit-api (if Repos = backend or both)

Same check, same branch name (`feature/{name}`) so the two PRs are easy to pair.

---

## Phase 3: EXECUTE

For each task in the plan, in order:

### 3.1 Verify Assumptions

Before writing code:
- Read the target file in the correct repo
- Read adjacent files (imports + importers)
- Verify the plan's references exist as described
- If assumptions are wrong, adapt and document the deviation

### 3.2 Implement

- Read the MIRROR reference and follow that pattern
- Make the change
- Check integration: do imports resolve? Do callers/callees still work? Does data flow correctly across boundaries?

### 3.3 Validate Immediately

Run the validation command for the repo you just edited.

**orbit-ui-mobile:**
```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile"
npm run type-check
```

**orbit-api:**
```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-api"
dotnet build
```

If it fails: read the error, fix it, re-run. Do not proceed until passing.

### 3.4 Track Progress

```
Task 1: ui-mobile  CREATE  packages/shared/src/types/X.ts          PASS
Task 2: ui-mobile  UPDATE  packages/shared/src/api/endpoints.ts    PASS
Task 3: api        CREATE  src/Orbit.Application/X/Commands/...    PASS
```

If you deviate from the plan, log it for the report.

---

## Phase 4: PARITY CHECK (if Parity Required = yes)

Invoke the `parity-checker` subagent with the list of edited files. It returns PAIRED / PARTIAL / MISSING per pair. Fix anything not PAIRED.

Also invoke `i18n-syncer` if any user-facing strings were added/changed.

If the change touches both repos, invoke `contract-aligner` to verify shapes match across `packages/shared/src/types/*` and `orbit-api` DTOs.

---

## Phase 5: VALIDATE (full)

### orbit-ui-mobile

```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile"
npm run lint
npm run type-check
npm test
```

### orbit-api

```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-api"
dotnet build
dotnet test
```

### Write Tests

You MUST write tests for new code (unit tests only — no integration or E2E suites exist):

- **Frontend**: Vitest unit tests for every new function/hook, RTL tests for components, parity test if shared logic
- **Backend**: unit tests for command/query handlers, validators, and services
- Test across boundaries — endpoints return correct shapes, hooks integrate with their consumers

### REQUIRED: End-to-End Verification

> Do NOT proceed to Phase 6 (Report) until E2E passes.

Execute every E2E step in the plan as a checklist. For frontend changes, this means launching the dev server and exercising the feature in a browser (per root `CLAUDE.md`). For `parity-required: yes`, repeat on mobile.

If the plan has no E2E section, perform a smoke test: start the relevant app(s), exercise the new path, verify behavior.

**Hard gate**: Static checks + unit tests alone are not enough.

---

## Phase 6: REPORT

**Output path**: `.claude/reports/{plan-name}-report.md`

```bash
mkdir -p .claude/reports
```

(Report template — branches, tasks completed, validation results, parity check, files changed, deviations, tests written. Keep the structure unchanged from the prior version of this skill.)

### Archive Plan

```bash
mkdir -p .claude/plans/completed
mv $ARGUMENTS .claude/plans/completed/
```

---

## Phase 7: COMMIT + PUSH + CREATE PR(s)

**Ask the user to confirm before pushing.** Show the diff summary and proposed commit message first.

### 7.1 Commit per repo

Conventional Commit format. Scope: `web`, `mobile`, `shared`, `api`, or a feature name. For `repo:both`, two separate commits (one per repo).

### 7.2 Push

```bash
git -C "<repo-root>" push -u origin feature/{name}
```

### 7.3 Create PR(s)

For each repo with changes, create a PR with `gh pr create`. For `repo:both`, cross-link the descriptions.

**Important for `repo:both`**: Only the `orbit-ui-mobile` PR uses `Closes #N` (issue lives there). The `orbit-api` PR uses `Refs thomasluizon/orbit-ui-mobile#N`.

Capture each PR's URL.

---

## Phase 8: UPDATE GITHUB ISSUE

If `GitHub Issue` in plan metadata is "N/A", skip.

```bash
gh issue comment {N} --repo thomasluizon/orbit-ui-mobile --body-file {tmp-comment-path}
```

Don't manually close — the `Closes #N` in the orbit-ui-mobile PR description closes it on merge.

---

## Phase 9: OUTPUT

```markdown
## Implementation Complete

**Plan**: `{plan-path}`
**Issue**: #{N}
**Status**: PASS

### Branches & PRs

| Repo | Branch | PR |
|---|---|---|
| orbit-ui-mobile | `feature/{name}` | {url} |
| orbit-api | `feature/{name}` | {url} |

### Validation: PASS in all repos.

### Next Steps
1. Request review on each PR
2. Squash-merge `orbit-api` first, then `orbit-ui-mobile` (so the API contract is live before the consumer)
```

---

## Multi-issue mode

User passed 2+ issue numbers. Implement each in its paired worktree in parallel.

### Step 1: Verify plans exist

For each issue `N`, check:

- `C:/Users/thoma/Documents/Programming/Projects/orbit-ui-mobile/.claude/worktrees/issue-<N>/.claude/plans/issue-<N>.plan.md`

If a plan is missing, surface the issues that lack plans and ask whether to run `/plan <N1> <N2> ...` first (or to skip them).

### Step 2: Spawn implementation subagents

Use the Agent tool to spawn ONE subagent per issue with a plan, in parallel. Each subagent:

- Has `cwd` set to the orbit-ui-mobile worktree for that issue.
- Runs the full single-plan flow (Phases 1–9) inside its worktree.
- Opens its PR(s) with the orbit-api PR (if applicable) cross-linked.
- Reports back: PR URLs, validation status, deviations.

**Concurrency cap: 3 subagents at a time.** Queue the rest. (`dotnet build` thrashing is the main concern — don't raise this without good reason.)

### Step 3: Aggregate

Print one row per issue:

```
Issue   PR(s)                                              Validation   Deviations
#100    ui-mobile PR #N1 / api PR #N2                      PASS         None
#101    ui-mobile PR #N3                                   PASS         renamed Foo→Bar (plan said Baz)
#102    FAILED — dotnet build error in handler signature   FAILED       N/A
```

For FAILED rows: surface the underlying error and the worktree path so the user can investigate manually.

**Failure handling: keep going.** A failing subagent does NOT halt its siblings. The aggregate report lists all failures at the end.

---

## Handling failures

| Failure | Action |
|---|---|
| `npm run type-check` fails | Read error, fix, re-run |
| `dotnet build` fails | Read error, fix, re-run |
| Tests fail | Bug in implementation or test — fix the actual issue, re-run |
| Lint fails | Try auto-fix (`npm run lint -- --fix`), then manual |
| Migration error | Check `dotnet ef migrations add` ran correctly; never edit applied migrations |
| Parity check fails | Add the missing file/hook/i18n key before proceeding |
| Push blocked | Branch protection on main — never push directly; create a feature branch |

Never use `--no-verify` to skip hooks. Investigate and fix the underlying issue.
