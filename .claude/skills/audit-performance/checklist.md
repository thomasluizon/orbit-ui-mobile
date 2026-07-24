# Orbit Performance Checklist

The pattern list `/audit-performance` walks, API side then frontend side. Self-contained:
it names the pattern, how to confirm it, and the Orbit-correct fix, so the audit needs no
profiler or load test.

> **Machine-read.** `.claude/workflows/audit.mjs` passes this file's path to every
> performance finder as "the contract for what counts and how findings are shaped"
> (`KIND.performance.checklist`). Editing this file edits the finder prompt. Keep it to the
> patterns a finder applies; the skill's own pipeline, guardrails, and output shape belong
> in `SKILL.md`, which the finders never read.

Every finding cites a file:line, the **impact** (how it grows: "50-habit user -> 50
round-trips"), and a concrete fix. Flag what degrades quadratically or linearly with data
or traffic; a one-off `O(n)` loop over 20 items is not a finding at Orbit's scale.

The D11 boundary in `.claude/skills/_shared/gate-owned-exclusions.md` applies, plus these
performance-specific gate-owned exclusions, which are **never** findings: the web
LCP / TBT / script-bundle-size budgets on the authed-Today surface (`perf.yml` owns those),
an N+1 regression on the three query shapes already under
`tests/Orbit.Infrastructure.Tests/Persistence/QueryRoundTripCountTests.cs`, and the
render-thrash patterns react-doctor's perf rules already fail on.

---

## A. API performance

> The flagship for Orbit: a habit tracker is read-heavy, and the killer is **round-trips
> per request**.

- [ ] **N+1 queries**, a query that loads a list then lazy-loads a relation per item;
  missing `.Include()`/`.ThenInclude()`, or projecting after materializing. Fix: eager-load
  or project with `.Select`.
- [ ] **Missing indexes**, a `Where`/`OrderBy`/join on an unindexed column, so a sequential
  scan. Check the EF migrations for an index on every filtered FK (`UserId`, `HabitId`,
  `GoalId`) and hot `Where`/`OrderBy` columns (`DueDate`, `Date`), plus filtered/partial-unique
  where the schema needs it (the `HabitLogs` Value>0 partial constraint). Fix: add the
  `HasIndex`. **Never claim an index is missing without reading the migrations and citing
  the one that lacks it.**
- [ ] **Over-fetching**, full-entity loads where a projection would do; no pagination on an
  unbounded list.
- [ ] **Synchronous slow work in the request path**, CPU loops, an HTTP/AI call, email, or
  push done inline instead of offloaded to the background queue.
- [ ] **Blocking async**, `.Result`/`.Wait()`/`.GetAwaiter().GetResult()` in a request path.
- [ ] **`IQueryable` materialized too early**, `.ToList()` then `.Where()` in memory.
- [ ] **Missing `AsNoTracking()`** on read-only hot paths.

## B. Frontend performance

- [ ] **Bundle bloat**, a heavy or non-tree-shakeable import for a small need; a large dep
  that could be dynamic-`import()`ed or server-only. Check `next.config` and the Metro
  bundle.
- [ ] **Render thrash**, a new object/array/function literal as a prop every render
  defeating memoization; an unstable-dependency `useEffect`; a missing stable `key`. Only
  flag where the render is demonstrably hot: premature `memo` is its own smell.
- [ ] **List virtualization**, a long unbounded list rendered in full (mobile: `.map()` over
  a large array instead of a `FlatList`). Bounded-small lists are fine.
- [ ] **Over-eager caching**, refetch on every mount/focus for stable data; a query per
  keystroke without debounce.
- [ ] **Stale caching**, a mutation that doesn't `invalidateQueries` the data it changed; a
  too-long `staleTime` on data that must feel live.
- [ ] **Waterfalls**, sequential awaits that could `Promise.all`; a client fetch that should
  be server-rendered.
- [ ] **Image / asset weight**, unoptimized large images served to a 412px phone shell.

## C. Out of scope, note once and move on

Connection-pool sizing, read-replicas, CDN strategy, sharding, and other enterprise tuning
are noted once as "out of scope at current scale," never itemized as findings. Load testing
is #230, not this audit.
