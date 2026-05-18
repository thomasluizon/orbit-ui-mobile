---
description: Execute a plan across orbit-ui-mobile + orbit-api with validation loops
argument-hint: <path/to/plan.md>
---

# Implement Plan (Cross-Repo)

**Plan**: $ARGUMENTS

## Mission

Execute the plan end-to-end across the affected repos with rigorous self-validation.

**Core Philosophy**: Validation loops catch mistakes early. Run checks after every change. Fix issues before moving on.

**Golden Rule**: If validation fails, fix it before moving on. Never accumulate broken state.

---

## Paths

| Repo | Root |
|------|------|
| `orbit-ui-mobile` (hub) | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

---

## Phase 1: LOAD

Read the plan file and extract:

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
|-------|--------|
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

Per Orbit's mandatory cross-platform parity rule (`AGENTS.md`):

- [ ] Every changed `apps/web/hooks/use-*.ts` has a matching `apps/mobile/hooks/use-*.ts`
- [ ] Every changed `apps/web/components/...` has a parallel mobile component (or an intentional, called-out exception)
- [ ] Every new i18n key exists in both `packages/shared/src/i18n/en.json` AND `pt-BR.json`
- [ ] Same query keys (`packages/shared/src/query/keys.ts`) used by both apps
- [ ] Same validation logic (Zod in `packages/shared/`) used by both apps

If anything is missing: fix it before Phase 5.

---

## Phase 5: VALIDATE (full)

Run the full validation suite per affected repo.

### orbit-ui-mobile

```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile"
npm run lint
npm run type-check
npm test
```

If `--quick` was not requested and any tests changed, also run E2E:

```bash
npm run test:e2e
```

### orbit-api

```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-api"
dotnet build
dotnet test tests/Orbit.IntegrationTests
```

### Write Tests

You MUST write tests for new code:

- **Frontend**: Vitest unit tests for every new function/hook, RTL tests for components, parity test if shared logic
- **Backend**: unit tests for command/query handlers and validators, integration tests for new endpoints
- Test across boundaries — endpoints return correct shapes, hooks integrate with their consumers

### REQUIRED: End-to-End Verification

> Do NOT proceed to Phase 6 (Report) until E2E passes.

Execute every E2E step in the plan as a checklist. For frontend changes, this means launching the dev server and exercising the feature in a browser (per `CLAUDE.md`). For `parity-required: yes`, repeat on mobile.

If the plan has no E2E section, perform a smoke test: start the relevant app(s), exercise the new path, verify behavior.

**Hard gate**: Static checks + unit tests alone are not enough.

---

## Phase 6: REPORT

**Output path**: `.agents/reports/{plan-name}-report.md`

```bash
mkdir -p .agents/reports
```

```markdown
# Implementation Report

**Plan**: `{plan-path}`
**Issue**: #{N} (or "N/A")
**Status**: COMPLETE

## Branches

| Repo | Branch |
|------|--------|
| orbit-ui-mobile | `feature/{name}` (or "N/A") |
| orbit-api | `feature/{name}` (or "N/A") |

## Summary

{Brief description of what was implemented}

## Tasks Completed

| # | Repo | Task | File | Status |
|---|------|------|------|--------|
| 1 | ui-mobile | {desc} | `path` | PASS |
| 2 | api | {desc} | `path` | PASS |

## Validation Results

### orbit-ui-mobile

| Check | Result |
|-------|--------|
| Lint | PASS / FAIL |
| Type check | PASS / FAIL |
| Unit tests | PASS ({N}) / FAIL |
| E2E | PASS / SKIPPED |

### orbit-api

| Check | Result |
|-------|--------|
| Build | PASS / FAIL |
| Tests | PASS ({N}) / FAIL |

## Parity Check (if applicable)

- [ ] Web ↔ mobile hooks match
- [ ] i18n keys in both locales
- [ ] Shared validation used

## Files Changed

| Repo | File | Action | Lines |
|------|------|--------|-------|
| ui-mobile | `src/x.ts` | CREATE | +{N} |
| api | `src/Orbit.Application/...` | UPDATE | +{N}/-{M} |

## Deviations from Plan

{list with rationale, or "None"}

## Tests Written

| Repo | Test File | Cases |
|------|-----------|-------|
| ... | ... | ... |
```

### Archive Plan

```bash
mkdir -p .agents/plans/completed
mv $ARGUMENTS .agents/plans/completed/
```

---

## Phase 7: COMMIT + PUSH + CREATE PR(s)

**Ask the user to confirm before pushing.** Show the diff summary and proposed commit message first.

### 7.1 Commit per repo

Use a Conventional Commit message. Format:

```
feat({scope}): {summary}

{body — what changed, why}

Refs #{N}
```

Where `{scope}` is `web`, `mobile`, `shared`, `api`, or a feature name like `habits`. For `repo:both`, two separate commits (one per repo).

### 7.2 Push

```bash
git -C "<repo-root>" push -u origin feature/{name}
```

### 7.3 Create PR(s)

For each repo with changes, create a PR. For `repo:both`, create both PRs and cross-link them in the descriptions.

**orbit-ui-mobile PR:**

```bash
gh pr create \
  --repo thomasluizon/orbit-ui-mobile \
  --base main \
  --head feature/{name} \
  --title "{Conventional commit-style title}" \
  --body-file {tmp-body-path}
```

**orbit-api PR (if applicable):**

```bash
gh pr create \
  --repo thomasluizon/orbit-api \
  --base main \
  --head feature/{name} \
  --title "{Conventional commit-style title}" \
  --body-file {tmp-body-path}
```

PR body template:

```markdown
## Summary

{1-3 bullets describing the change}

## Linked Issue

Closes #{N}  <!-- only on the orbit-ui-mobile PR; orbit-api PR uses "Refs" -->

## Paired PR (if repo:both)

- orbit-ui-mobile: {link}
- orbit-api: {link}

## Test Plan

- [ ] {check 1}
- [ ] {check 2}
- [ ] Verified on web and mobile (if parity required)

## Validation

- Lint: PASS
- Type check: PASS
- Tests: PASS ({N})
- E2E: PASS
```

**Important for `repo:both`**: Only the `orbit-ui-mobile` PR uses `Closes #N` since that's where the issue lives. The `orbit-api` PR uses `Refs thomasluizon/orbit-ui-mobile#N`.

Capture each PR's URL.

---

## Phase 8: UPDATE GITHUB ISSUE

If `GitHub Issue` in plan metadata is "N/A", skip.

### 8.1 Comment with implementation summary

```bash
gh issue comment {N} --repo thomasluizon/orbit-ui-mobile --body-file {tmp-comment-path}
```

Comment template:

```markdown
## Implementation Complete

**Branch(es)**: `feature/{name}`
- ui-mobile: {pr-link} (or "N/A")
- api: {pr-link} (or "N/A")

**Files**: {N} created, {M} updated
**Tests**: {K} new tests
**Deviations**: {summary or "None"}
**Report**: `.agents/reports/{name}-report.md`
```

### 8.2 Issue closure

Don't manually close — the `Closes #N` in the `orbit-ui-mobile` PR description closes it on merge. For backend-only stories, add the `Closes #N` to the `orbit-api` PR description instead (`Closes thomasluizon/orbit-ui-mobile#N` cross-repo close keyword works).

---

## Phase 9: OUTPUT

```markdown
## Implementation Complete

**Plan**: `{plan-path}`
**Issue**: #{N}
**Status**: PASS

### Branches & PRs

| Repo | Branch | PR |
|------|--------|----|
| orbit-ui-mobile | `feature/{name}` | {url} |
| orbit-api | `feature/{name}` | {url} |

### Validation

- ui-mobile lint / type-check / tests / E2E: PASS
- api build / tests: PASS

### Files Changed

- {N} files created
- {M} files updated
- {K} tests written
- Parity: PASS / N/A

### Deviations

{summary or "Implementation matched the plan."}

### Artifacts

- Report: `.agents/reports/{name}-report.md`
- Plan archived: `.agents/plans/completed/`

### Next Steps

1. Request review on each PR
2. After both PRs are approved, squash-merge `orbit-api` first, then `orbit-ui-mobile` (so the API contract is live before the consumer)
3. Verify on production deploy
```

---

## Handling Failures

| Failure | Action |
|---------|--------|
| `npm run type-check` fails | Read error, fix, re-run |
| `dotnet build` fails | Read error, fix, re-run |
| Tests fail | Bug in implementation or test — fix the actual issue, re-run |
| Lint fails | Try auto-fix (`npm run lint -- --fix`), then manual |
| Migration error | Check `dotnet ef migrations add` ran correctly; never edit applied migrations |
| Parity check fails | Add the missing file/hook/i18n key before proceeding |
| Push blocked | Branch protection on main — never push directly; create a feature branch |

Never use `--no-verify` to skip hooks. Investigate and fix the underlying issue.
