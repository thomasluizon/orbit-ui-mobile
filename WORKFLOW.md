# Workflow — Picking a Path

When you have a feature idea or bug fix, pick the lightest path that fits. The PIV loop scales down.

## Paths

### Tiny bug (1 file, you know the fix)

Just edit + `/validate`. No PRD, no plan, no issue.

### Real bug or small feature (one vertical slice, clear scope)

1. `/prime` — load context (add `<issue#>` if you opened one)
2. `/plan "short description"` — get a plan file
3. `/implement .claude/plans/<name>.plan.md` — code + tests + PR(s)
4. `/pr-review <PR#>` (optional) — second pass before merging

### Medium / large feature (multiple stories, spans repos)

1. `/prd-interactive` (cold start) **or** `/create-prd` (after you've already chatted through the idea) — pick one, not both
2. `/create-stories .claude/PRDs/<name>.prd.md` — writes the local stories file and creates labeled GitHub issues in `orbit-ui-mobile`
3. For each issue: `/prime <issue#>` → `/plan <issue#>` → `/implement <plan>`
4. `/pr-review` on the resulting PRs

### Multi-issue path (parallelize across 2+ issues at once)

Pass multiple issue numbers; the harness creates paired worktrees (mobile + orbit-api) and runs the loop concurrently per issue, up to 3 at a time.

1. `/prime <A> <B> <C>` — creates one worktree per issue under `.claude/worktrees/<branch>`, primes each in a background subagent
2. `/plan <A> <B> <C>` — writes one plan file per worktree in parallel
3. `/implement <A> <B> <C>` — implements + tests + opens PRs per worktree in parallel; failures are reported at the end without halting siblings

Cap: 3 concurrent subagents (avoid grinding `dotnet build` and `turbo` simultaneously). Excess issues queue. Two issues touching the same files → conflicts surface at PR time and are resolved manually.

## Two Recurring Details

- Stories get a `repo:frontend` / `repo:backend` / `repo:both` label. `/implement` reads it and creates branches + PRs in the right repo(s), cross-linked.
- Anything that touches a web hook/component needs the mobile counterpart unless the story explicitly says otherwise — `/implement`'s parity-check phase enforces this via the `parity-checker` subagent.

## Rule of Thumb

If it's clearly a single PR's worth of work, skip the PRD and go straight to `/prime` → `/plan`. PRDs and stories start to pay off once you have **3 or more** connected pieces of work.
