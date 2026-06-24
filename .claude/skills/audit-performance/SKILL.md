---
name: audit-performance
description: Performance-risk audit across both Orbit repos. API — N+1 queries, missing indexes, synchronous slow work in request paths. Frontend — bundle bloat, render thrash, over-eager or stale caching. Each finding carries file:line evidence and a remediation, calibrated to Orbit's solo-dev scale. Use when the user asks to audit performance, find slowdowns, or check for scaling risks. Not for running benchmarks.
argument-hint: <path | repo | blank=both repos>
context: fork
---

# Audit Performance

**Input**: $ARGUMENTS

Find the performance risks that bite at scale — before they do — across both repos. The
API side is where Orbit's real risk lives (database round-trips per request); the frontend
side is render and cache hygiene. Output: one report, each finding pinned to a file:line
with the fix.

**Golden rule**: every finding is a concrete, located risk with a remediation, **sized to
Orbit's actual scale** (solo dev, modest data per user, Postgres on Supabase). Flag the
patterns that get *quadratically* worse with data (N+1, unindexed scans, render loops) —
not micro-optimizations that don't move the needle on a habit tracker. No premature tuning.

---

## Phase 0 — Provenance, scale & self-containment

The API patterns below come from EF Core + Postgres performance canon; the frontend
patterns from **react-patterns / performance skill bases on claudeskills.info**
(https://claudeskills.info) and the React/Next.js + TanStack Query render-and-cache canon,
specialized to Orbit's stack (Next.js 16 web, Expo SDK 55 mobile, TanStack Query, EF Core
10 / MediatR CQRS). That URL is the single WHY-with-URL the comment policy allows.

**Self-contained**: no network call, no profiler, no marketplace dependency at run time.
It **reads** code and runs `git` / `rg`; it does not execute a benchmark or a load test
(that's the separate load-test work, #230). Works unchanged in CI.

**Scale calibration**: Orbit is solo-dev, pre-full-scale, with bounded per-user data
(dozens of habits, not millions of rows). Rank by **how badly a pattern degrades as data
or traffic grows**, and explicitly *skip* tuning that only matters at enterprise volume —
say so rather than listing it.

---

## Phase 1 — Resolve scope & load context

Parse `$ARGUMENTS`: blank → **both repos**; `api`/`backend` → orbit-api; `frontend`/`web`/
`mobile` → orbit-ui-mobile; a path → just that path.

| Repo | Hot zones |
|---|---|
| `orbit-api` | CQRS query handlers (`src/Orbit.Application/**/Queries`), the generic repository + EF `DbContext` usage, controller request paths |
| `orbit-ui-mobile` | TanStack Query hooks (`apps/*/hooks`), list-rendering screens/pages, `next.config`/Metro bundle surface, heavy client components |

Load root + scoped `CLAUDE.md`, and `orbit-api/CLAUDE.md` (if backend in scope). Exclude
generated/vendored dirs (`node_modules`, `bin`, `obj`, `Migrations/` — but **do read**
migrations to confirm which **indexes exist**, since that's load-bearing for the index
checks). Source globs: `**/*.{ts,tsx}`, `**/*.cs`.

---

## Phase 2 — Fan out by side

Delegate to **`Explore` subagents, 3 concurrent**. Two API slices + two frontend slices,
non-overlapping. Each subagent prompt embeds:

> **Objective**: audit `<slice>` for the performance patterns in this skill's Phase-3 / 4
> checklist. For each risk emit a finding with an exact `file:line`, the **evidence** (the
> code that causes it), the **impact** (how it scales — "1 query per habit → 50 round-trips
> for a 50-habit user"), and the **fix**. Calibrate to solo-dev scale; skip enterprise-only
> tuning. Confirm index claims against the EF migrations. Findings only.

---

## Phase 3 — API performance checklist

> The flagship for Orbit: a habit tracker is read-heavy, and the killer is **round-trips
> per request**.

- [ ] **N+1 queries** — the #1 risk. A query that loads a list, then lazy-loads a relation
  per item (a `foreach` issuing a query, or navigation access without `.Include()`). In EF
  Core: missing `.Include()` / `.ThenInclude()`, or projecting after materializing.
  **Impact scales with the user's row count.** Fix: eager-load with `.Include`, or project
  to a DTO in one query with `.Select`.
- [ ] **Missing indexes** — a `Where` / `OrderBy` / join on a column with no index →
  sequential scan that worsens as the table grows. Check the EF migrations for an index on:
  every foreign key used in a filter (`UserId`, `HabitId`, `GoalId`), and any column in a
  hot `Where`/`OrderBy` (e.g. `DueDate`, `Date` on logs). A filtered/partial-unique index
  where the schema needs one (e.g. the `HabitLogs` Value>0 partial constraint — see memory).
  Fix: add the `HasIndex` in a migration.
- [ ] **Over-fetching** — `SELECT *` / full-entity loads where a projection would do;
  loading a graph to read one field; no pagination on a list that grows unbounded.
- [ ] **Synchronous slow work in the request path** — CPU-heavy loops, an external HTTP/AI
  call, email send, or push dispatch done *inline* in a handler instead of offloaded. The
  AI/chat call is inherently slow — confirm it isn't blocking unrelated work and is
  size/time-bounded. Fix: move fire-and-forget work to the background queue.
- [ ] **Blocking async** — `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` on a Task in
  a request path (thread-pool starvation). Async all the way down.
- [ ] **`IQueryable` materialized too early** — `.ToList()` then `.Where()` in memory
  instead of composing the predicate into the SQL.
- [ ] **Missing `AsNoTracking()`** on read-only queries — change-tracking overhead on hot
  read paths. (Tier-2: matters more as throughput grows.)

## Phase 4 — Frontend performance checklist

- [ ] **Bundle bloat** — a heavy library pulled into the client bundle for a small need;
  a non-tree-shakeable default import (`import _ from 'lodash'` vs `lodash/pick`); a large
  dep that could be dynamic-`import()`ed / server-only. Check `next.config` and the import
  graph of the heaviest routes. Mobile: the Metro bundle for the same smell.
- [ ] **Render thrash** — a new object/array/function literal passed as a prop every render
  defeating memoization; a `useEffect` with an unstable dependency looping; a missing
  `key`/stable key forcing list remounts; expensive work in render instead of `useMemo`.
  **Don't over-flag**: only call out memoization where the render is demonstrably hot (a
  large list, a frequently-updated subtree), not every component — premature `memo` is its
  own smell.
- [ ] **List virtualization** — a long, unbounded list rendered in full (mobile especially:
  `.map()` over a large array instead of a `FlatList`). Bounded-small lists are fine; flag
  only genuinely large ones.
- [ ] **Over-eager caching** — refetching on every mount/focus where the data is stable
  (TanStack `staleTime`/`gcTime` left at aggressive defaults for slow-changing data); a
  query firing on every keystroke without debounce.
- [ ] **Stale caching** — the opposite: a mutation that doesn't invalidate the query it
  changed (`queryClient.invalidateQueries` missing), so the UI shows stale data; a too-long
  `staleTime` on data that must feel live. Both directions are findings.
- [ ] **Waterfalls** — sequential awaits/queries that could run in parallel
  (`Promise.all`); a client fetch that should be server-rendered (web) to cut a round-trip.
- [ ] **Image / asset weight** — unoptimized large images shipped to a 412px phone shell.

---

## Phase 5 — Report

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/performance-{scope}.md`

```markdown
# Performance Audit: {SCOPE}

**Scope**: {both repos / repo / path}
**Calibration**: solo-dev scale — patterns that degrade with data/traffic; enterprise-only tuning skipped.
**Verdict**: {1 line — e.g. "One N+1 in the summary query; web bundle clean; 1 missing log index"}

## Findings

### High — degrades with scale (fix before it bites)
{N+1, missing index on a hot path, sync slow work in a request, unbounded list — or "None"}

### Medium — measurable but bounded
{over-fetching, aggressive cache, render thrash on a warm path — or "None"}

### Low / Info — micro, or only-at-enterprise-scale
{noted, deliberately not prioritized — or "None"}

## Hotspots

| Path | Side | Risk | Impact at scale |
|---|---|---|---|
| {handler/route or component} | API/FE | {pattern} | {how it grows} |

## What's efficient

{Patterns done right — eager-loads, proper invalidation, projections. Not filler.}
```

Each finding uses:

```
[SEVERITY] <one-line risk>
· side: API | Frontend
· location: <repo>/<path>:<line>
· evidence: <the code causing it>
· impact: <how it scales — concrete: "50-habit user → 50 queries">
· fix: <the concrete change — .Include / add index / invalidateQueries / dynamic import / FlatList>
```

---

## Guardrails — do NOT

- **Micro-optimize.** Flag patterns that get *quadratically/linearly* worse with data or
  traffic. A one-off `O(n)` loop over 20 items is not a finding on a solo-scale app.
- **Over-prescribe memoization / virtualization.** Only where the render is demonstrably
  hot. Premature `memo`/`useCallback` everywhere is itself a smell — don't recommend it.
- **List enterprise tuning as findings.** Connection-pool sizing, read-replicas, CDN
  strategy, sharding — note as "out of scope at current scale," don't itemize.
- **Claim an index is missing without checking the migrations.** Read them; cite the
  migration that does (or doesn't) add it.
- **Run a benchmark or load test.** This reads code; load testing is #230.
- **Optimize during the audit.** Findings first; change code only if the user asks after.

---

## Output

```markdown
## Audit Complete — Performance

**Scope**: {what was audited}
**Verdict**: {1-line}

| Severity | Count |
|---|---|
| High (scales badly) | {N} |
| Medium (bounded) | {N} |
| Low / Info | {N} |

**Report**: `.claude/audits/performance-{scope}.md`
**Top risk**: {the single pattern most worth fixing first, with its scaling impact}
```
