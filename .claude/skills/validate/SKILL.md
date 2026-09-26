---
name: validate
description: Run lint, type-check, tests across both repos (auto-detects which to run)
argument-hint: [frontend|backend|both]
effort: low
---

# Validate

**Input**: $ARGUMENTS (default: `both`)

---

## Resolve repositories

Run this from either repository. Read the printed roots and use them for every status check and validation command. The current checkout takes priority; the sibling UI checkout is available when starting in the API repository.

```bash
node <<'NODE'
const { execFileSync } = require("node:child_process")
const { existsSync, readFileSync } = require("node:fs")
const { dirname, join, resolve } = require("node:path")

const commonDirectory = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim()
const currentRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const primaryRoot = dirname(commonDirectory)
const candidates = [process.env.CLAUDE_PROJECT_DIR, currentRoot, primaryRoot, resolve(primaryRoot, "../orbit-ui-mobile")]
const uiRoot = candidates.find((candidate) => candidate
  && existsSync(join(candidate, ".claude/orchestrator.json"))
  && existsSync(join(candidate, "apps/web"))
  && existsSync(join(candidate, "apps/mobile")))
if (!uiRoot) throw new Error("Could not locate orbit-ui-mobile from this checkout")

const config = JSON.parse(readFileSync(join(uiRoot, ".claude/orchestrator.json"), "utf8"))
if (typeof config.repos?.api !== "string") throw new Error("Missing repos.api in UI orchestrator config")
const apiRoot = resolve(uiRoot, config.repos.api)
console.log(JSON.stringify({ uiRoot: resolve(uiRoot), apiRoot }))
NODE
```

## Detect scope

If `$ARGUMENTS` is `frontend`, run only frontend checks. If it is `backend`, run only backend checks. If it is `both`, run both. Otherwise check `git status --short` in each printed root and validate each repository with uncommitted changes. If both are clean, validate both.

---

## Checks

### orbit-ui-mobile (frontend, run from printed `uiRoot`)

```bash
npm run lint
npm run type-check
npm test
```

### orbit-api (backend, run from printed `apiRoot`)

```bash
dotnet build
dotnet test
```

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
