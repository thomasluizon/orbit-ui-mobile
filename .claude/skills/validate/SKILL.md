---
name: validate
description: Run lint, type-check, tests across both repos (auto-detects which to run)
argument-hint: [frontend|backend|both]
effort: low
---

# Validate

Run all validation checks and report results.

**Input**: $ARGUMENTS (default: `both`)

---

## Detect Scope

If `$ARGUMENTS` is not provided, auto-detect: check `git status` in each repo. Run validation for any repo with uncommitted changes. If both are clean, default to `both`.

---

## Checks

### orbit-ui-mobile (frontend, run from repo root)

```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile"
npm run lint
npm run type-check
npm test
```

### orbit-api (backend, run from repo root)

```bash
cd "C:\Users\thoma\Documents\Programming\Projects\orbit-api"
dotnet build
dotnet test
```

---

## Process

1. Run each enabled check, capture output
2. Collect failures
3. Report results

---

## Output

```markdown
## Validation Results

### orbit-ui-mobile

| Check | Result | Details |
|-------|--------|---------|
| Lint | PASS / FAIL | {N errors or "passed"} |
| Type check | PASS / FAIL | {N errors or "passed"} |
| Tests | PASS / FAIL | {N passed, M failed} |

### orbit-api

| Check | Result | Details |
|-------|--------|---------|
| Build | PASS / FAIL | {warnings/errors} |
| Tests | PASS / FAIL | {N passed, M failed} |

### Summary

- **Status**: ALL PASSING / {N} FAILURES
- **Action needed**: {None / list}
```

---

## If Failures Found

For each failure, list:
1. Repo, file, line number
2. Error message
3. Suggested fix (if obvious)

Example:

```
### Failures

1. **ui-mobile / apps/web/hooks/use-habits.ts:42**
   - Error: `Type 'string' is not assignable to type 'number'`
   - Fix: Check the type annotation or value

2. **api / src/Orbit.Application/Habits/Commands/CreateHabit.cs:18**
   - Error: `CS0029: Cannot implicitly convert 'string' to 'int'`
   - Fix: Add explicit cast or change the type
```
