---
description: Code review - PRs in either repo, files, folders, or unstaged changes
argument-hint: <pr-number|pr-url|file|folder|blank>
---

# Code Review

**Input**: $ARGUMENTS

## Mission

1. **Understand** what you're reviewing and its purpose
2. **Check** against project patterns (`CLAUDE.md` in each repo)
3. **Run** validation (lint, type-check, tests)
4. **Identify** issues by severity
5. **Report** findings — and post to GitHub if a PR

**Golden Rule**: Be constructive and actionable. Every issue gets a clear recommendation.

---

## Phase 1: DETERMINE SCOPE

### Parse Input

| Input | Repo | Example | Action |
|-------|------|---------|--------|
| Number `123` | ui-mobile (default) | `#123` | `gh pr view 123 --repo thomasluizon/orbit-ui-mobile` |
| `api#123` or `orbit-api#123` | api | `api#42` | `gh pr view 42 --repo thomasluizon/orbit-api` |
| Full PR URL | parsed | `https://github.com/thomasluizon/orbit-api/pull/9` | use the URL's repo |
| File path | local repo | `apps/web/hooks/use-x.ts` | review single file |
| Folder path | local repo | `apps/mobile/components/` | review all files |
| Blank | local | (none) | review unstaged changes in current repo |

### Get Review Target

**For PR:**

```bash
gh pr view {N} --repo {OWNER/REPO} --json number,title,body,author,baseRefName,headRefName,files,labels
gh pr diff {N} --repo {OWNER/REPO}
```

**For file/folder:**

```bash
# List source files
```

Use Glob with pattern like `**/*.{ts,tsx,cs}` scoped to the target path.

**For unstaged:**

```bash
git diff --name-only
git diff
```

---

## Phase 2: CONTEXT

### Read Project Rules

- `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile\CLAUDE.md` for frontend conventions
- `C:\Users\thoma\Documents\Programming\Projects\orbit-api\CLAUDE.md` for backend conventions
- Plan file in `.claude/plans/completed/` if the PR references one

### Understand Intent

- For PRs: read title, body, linked issue
- For files: understand purpose in the codebase
- For unstaged: what is in flight?

---

## Phase 3: REVIEW

### Per-File Checks

| Category | Check |
|----------|-------|
| **Correctness** | Does it work as intended? Cross-boundary behavior right? |
| **Type Safety** | Zero `any` in TS; no implicit conversions in C#. Use `unknown` with narrowing in TS. |
| **Patterns** | Matches existing patterns from CLAUDE.md? CQRS used for new endpoints? Server Action for new mutations? |
| **Parity** | If frontend hook/component touched, is the parallel one in the other app updated? |
| **i18n** | New user-facing strings added to both `en.json` and `pt-BR.json`? |
| **Shared types** | New API shapes live in `packages/shared/src/types/`, not duplicated? |
| **Validation** | Backend has FluentValidation + domain entity rules? Frontend has Zod? |
| **Error Handling** | Result<T> on backend, proper errors on frontend? |
| **Tests** | Unit + integration where appropriate? |
| **Security** | No console.log, no secrets, auth checks on protected endpoints? |
| **i18n locale parity** | `en.json` and `pt-BR.json` updated together? |

### Categorize Issues

| Severity | Criteria |
|----------|----------|
| **Critical** | Security holes, data loss, crashes, broken contracts |
| **High** | Type violations, missing error handling, missing parity, missing validation |
| **Medium** | Pattern inconsistencies, missing edge cases, missing tests |
| **Low** | Style suggestions, minor improvements |

---

## Phase 4: VALIDATE

Run the appropriate suite for the affected repo (skip the other repo if not touched):

```bash
# ui-mobile
npm run lint && npm run type-check && npm test
# api
dotnet build && dotnet test tests/Orbit.IntegrationTests
```

---

## Phase 5: REPORT

**Output path**: `.claude/reviews/{scope-name}-review.md`

```bash
mkdir -p .claude/reviews
```

```markdown
# Code Review: {SCOPE}

**Scope**: {PR #N in repo / file / folder / unstaged}
**Recommendation**: APPROVE / NEEDS WORK

## Summary

{2-3 sentences: what was reviewed and overall assessment}

## Issues Found

### Critical
{list or "None"}

### High
{list or "None"}

### Medium
{list or "None"}

### Suggestions
{list or "None"}

## Validation Results

| Check | Status |
|-------|--------|
| Lint | PASS / FAIL |
| Type check | PASS / FAIL |
| Tests | PASS / FAIL |
| Parity | PASS / N/A / FAIL |

## What's Good

{positive observations}

## Recommendation

{what needs to happen next}
```

### Post to GitHub (if PR)

```bash
gh pr review {N} --repo {OWNER/REPO} --comment --body-file .claude/reviews/{scope-name}-review.md
```

Or for inline comments on specific files/lines, use the GitHub REST API via `gh api` (the project's CI already supports inline comments per recent commits).

---

## Phase 6: OUTPUT

```markdown
## Review Complete

**Scope**: {what was reviewed}
**Recommendation**: APPROVE / NEEDS WORK

### Issues

| Severity | Count |
|----------|-------|
| Critical | {N} |
| High | {N} |
| Medium | {N} |
| Suggestions | {N} |

### Validation

| Check | Result |
|-------|--------|
| Lint | PASS / FAIL |
| Type check | PASS / FAIL |
| Tests | PASS / FAIL |

### Report

`.claude/reviews/{scope-name}-review.md`
```
