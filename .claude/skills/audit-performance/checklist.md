# Orbit Performance Checklist

The pattern list `/audit-performance` walks, measured production hot paths first, then API
and frontend code. It names the pattern, how to confirm it, and the Orbit-correct fix. A
code-only run is allowed only when production measurement is unavailable, and its verdict
must say `CODE_ONLY` with the named reason.

> **Machine-read.** `.claude/workflows/audit.mjs` passes this file's path to every
> performance finder as "the contract for what counts and how findings are shaped"
> (`KIND.performance.checklist`). Editing this file edits the finder prompt. Keep it to the
> patterns a finder applies; the skill's own pipeline, guardrails, and output shape belong
> in `SKILL.md`, which the finders never read.

Every finding cites a file:line, the **impact**, and a concrete fix. A measured finding also
names calls, rows per call, bytes per row, calls per 30.4375-day month, and resulting monthly
egress. Rank findings by byte-weighted monthly egress before severity ties. Use the measured
maximum account size, not an imagined typical account. Flag what degrades quadratically or
linearly with data or traffic; a bounded one-off `O(n)` loop is not a finding.

The D11 boundary in `.claude/skills/_shared/gate-owned-exclusions.md` applies, plus these
performance-specific gate-owned exclusions, which are **never** findings: the web
LCP / TBT / script-bundle-size budgets on the authed-Today surface (`perf.yml` owns those),
an N+1 regression on the three query shapes already under
`tests/Orbit.Infrastructure.Tests/Persistence/QueryRoundTripCountTests.cs`, and the
render-thrash patterns react-doctor's perf rules already fail on.

---

## 0. Production measurement, before code reading

- [ ] Read `extensions.pg_stat_statements` and `extensions.pg_stat_statements_info` only
  after confirming their complete live column/type shape. Rank the `postgres` role by rows
  and calls. Keep the normalized query text and query ID so each statement can be mapped to
  its LINQ or EF source.
- [ ] Read `pg_stat_user_tables` for `seq_scan`, `seq_tup_read`, and live-row counts. A hot
  statement returning at least **25% of its live root table per call** is a finding unless
  the consumer genuinely needs that bounded set.
- [ ] Measure `avg(pg_column_size(t.*))` for each hot root table. Compute:
  `rows_per_call = rows / calls`, `calls_per_month = calls / window_days * 30.4375`, and
  `monthly_egress = rows / window_days * 30.4375 * bytes_per_row`.
- [ ] Record account skew, including the maximum live habit count for one account and the
  average for accounts with habits. The maximum is the scale input for user-scoped paths.
- [ ] For a query mapped to a scheduler or background worker, derive the observed interval
  from calls and the statistics window. A confirmed sweep whose interval multiplied by
  rows and bytes exceeds **50 MiB per month** is a finding and names the interval. Never
  infer a sweep from the absence of a literal `UserId` predicate.
- [ ] If any required production view is unavailable, continue the code sweep but return
  `CODE_ONLY` with the exact reason. Never call that result a pass or a full performance
  verdict.

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
- [ ] **Unbounded request-path list**, a request query with no `.Take`, page size, cursor,
  or SQL bound, including requests scoped indirectly through an owned foreign key. User
  scoping is isolation, not a size bound. Name the measured maximum account and rows per
  call. Fix with database-side pagination before materialization. Background sweeps are
  governed by their measured budget, not this request-only row-limit rule.
- [ ] **Full-entity projection**, a full row load where the consumer reads only a handful of
  fields. Name every field the consumer reads and the projected columns it does not need.
  Fix with a database-side `.Select` projection.
- [ ] **Large table fraction**, a query returning at least 25% of its live root table per
  call. Name the numerator, denominator, and fraction. Fix with the missing date, tenant,
  state, or ID bound.
- [ ] **Background sweep budget**, a query mapped to a scheduler or background worker whose
  measured interval times payload exceeds 50 MiB per month. Name the interval and budget.
  Fix with a bounded predicate, projection, batching, or a less frequent schedule as the
  behavior permits.
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
