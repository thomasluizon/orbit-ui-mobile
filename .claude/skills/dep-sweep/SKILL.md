---
name: dep-sweep
description: Monthly cross-repo non-security dependency freshness sweep. Bumps apps/web + packages/shared npm minor/patch (the only surfaces with no version automation), defers apps/mobile entirely to Expo's own tooling (never generic-bumps SDK-pinned packages), and reports orbit-api NuGet drift (Dependabot owns the bumps there). Runs the affected test suites and opens one PR. Use when the monthly "Dependency sweep" reminder issue fires, or when the user asks to refresh dependencies. NOT for security patches (Dependabot security updates auto-flow) and NOT for Expo SDK upgrades (use the upgrading-expo skill).
argument-hint: <blank = full sweep>
---

# Dependency Sweep

**Input**: $ARGUMENTS

A deliberate, human-invoked sweep of *non-security* version drift. Security CVEs are
already handled automatically by Dependabot security updates and are out of scope here.
The sweep is scoped **by workspace**, not by a hand-maintained package exclude-list —
that scoping is what makes it structurally unable to re-create the Expo whack-a-mole.

## Coverage map — what this skill touches, and what it must NOT

| Surface | Action |
|---|---|
| `apps/web` npm | **Bump** minor/patch. The Next.js surface has no version automation. |
| `packages/shared` npm | **Bump** minor/patch. No native/Expo constraint. |
| `apps/mobile` npm | **NEVER bump here.** Defer to `npx expo install --check`. These versions are SDK-owned; the only correct fix is an Expo SDK bump via the `upgrading-expo` skill. Report the `--check` verdict, change nothing. |
| `orbit-api` NuGet | **Report only.** Dependabot already auto-merges minor/patch and surfaces majors as PRs. List `dotnet list package --outdated` + any open major Dependabot PRs for the user to review. |
| GitHub Actions (both repos) | **Skip.** Dependabot auto-merges these. |

Majors anywhere are listed for manual review, never auto-applied.

## Procedure

### 1. Sync both repos to main
Fetch + fast-forward `origin/main` on BOTH `orbit-ui-mobile` and `orbit-api` before
inspecting anything (always investigate against updated main). If either working tree is
dirty, STOP and report — never sweep on top of uncommitted work.

### 2. Branch
`git checkout -b chore/dep-sweep-<YYYY-MM>` off the freshly-synced main in
`orbit-ui-mobile`. The session has no clock — take the month from the reminder issue
title, or from `git log -1 --format=%cd`.

### 3. Inventory the drift
- `npm outdated --json` at the repo root (covers all workspaces; the `dependent` /
  workspace path tells you which workspace each package belongs to).
- Partition into: apps/web + packages/shared (sweepable), apps/mobile (hands-off,
  report only), and majors anywhere (hold for review).
- In `apps/mobile`: `npx expo install --check` — capture its verdict, act on nothing.
- In `orbit-api`: `dotnet list package --outdated` via its absolute path.

### 4. Apply — web + shared, minor/patch only
Bump the sweepable packages to their latest minor/patch in the relevant `package.json`
files, then `npm install` to refresh the single root lockfile. Do not touch apps/mobile
entries. Do not apply majors.

### 5. Verify
`npm test` in `apps/web` and `packages/shared`. If a suite fails, bisect to the
offending bump, drop it from the sweep (record it as "held — broke tests"), and re-run.
Never open a PR with a red suite.

### 6. PR
Commit (`chore: monthly dependency sweep <YYYY-MM>`), push, open ONE PR against `main`.
Body: the bump table, the majors held for review, the apps/mobile `expo install --check`
verdict, and the orbit-api NuGet drift list. Close the reminder issue with a link to the
PR.

## Output

A single summary: what was bumped (PR link), what was held and why (majors,
test-breakers), the mobile SDK-spec status, and the API drift list. If a major bump or
the mobile `--check` surfaces something that matters, call it out as a follow-up — don't
bury it.

## Guardrails — do NOT
- Bump anything in `apps/mobile` (expo-*, react, react-native, native transitives) —
  that is the `upgrading-expo` skill's job, driven by the Expo SDK watcher.
- Apply major versions automatically.
- Open a PR with failing tests.
- Touch security patches — Dependabot security updates own those.
- Use `--no-verify` / force-push, or sweep on a dirty tree.
