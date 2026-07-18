---
name: audit-performance
description: Performance-risk audit across both Orbit repos. API — N+1 queries, missing indexes, synchronous slow work in request paths. Frontend — bundle bloat, render thrash, over-eager or stale caching. Each finding carries file:line evidence and a remediation, calibrated to Orbit's solo-dev scale. Use when the user asks to audit performance, find slowdowns, or check for scaling risks. Not for running benchmarks.
argument-hint: <path | repo | blank=both repos>
---

# Audit Performance

**Input**: $ARGUMENTS

Find the performance risks that bite at scale — before they do — across both repos. The
API side is where Orbit's real risk lives (database round-trips per request); the frontend
side is render and cache hygiene. Output: one report, each finding pinned to a file:line
with the fix.

The fan-out, the adversarial verify, and the loop-until-dry run as the **`audit` dynamic
workflow** (`.claude/workflows/audit.mjs`) — **Haiku finders + Haiku skeptics**,
deterministic orchestration — so Opus spends tokens only on **this synthesis**.

**Golden rule**: every finding is a concrete, located risk with a remediation, **sized to
Orbit's actual scale** (solo dev, modest data per user, Postgres on Supabase). Flag the
patterns that get *quadratically* worse with data (N+1, unindexed scans, render loops) —
not micro-optimizations that don't move the needle on a habit tracker. No premature tuning.

---

## Phase 0 — Provenance, scale & self-containment

The API patterns come from EF Core + Postgres performance canon; the frontend patterns from
**react-patterns / performance skill bases on claudeskills.info** (https://claudeskills.info)
and the React/Next.js + TanStack Query render-and-cache canon, specialized to Orbit's stack
(Next.js 16 web, Expo mobile, TanStack Query, EF Core 10 / MediatR CQRS). That URL is the
single WHY-with-URL the comment policy allows.

**Self-contained**: the workflow's finder/skeptic agents **read** code and run `git` / `rg`;
they do not execute a benchmark or load test (that's #230). **CI / headless fallback**: if
the `Workflow` tool is unavailable, run the fan-out inline per Phase 2's fallback.

**Scale calibration**: Orbit is solo-dev, pre-full-scale, with bounded per-user data (dozens
of habits, not millions of rows). Rank by **how badly a pattern degrades as data or traffic
grows**, and explicitly *skip* tuning that only matters at enterprise volume.

---

## Phase 1 — Resolve scope

Parse `$ARGUMENTS` into a `{scope}` token: blank → `both`; `api`/`backend` → `api`;
`frontend`/`web`/`mobile` → `ui`; a path → the path itself.

| Repo | Hot zones |
|---|---|
| `orbit-api` | CQRS query handlers (`src/Orbit.Application/**/Queries`), the generic repository + EF `DbContext` usage, controller request paths |
| `orbit-ui-mobile` | TanStack Query hooks (`apps/*/hooks`), list-rendering screens/pages, `next.config`/Metro bundle surface, heavy client components |

The workflow's finders **read the EF migrations** to confirm which indexes exist (load-bearing
for the index checks), and exclude other generated/vendored dirs. Load
**`.claude/skills/_shared/verification-protocol.md`** — the workflow executes §1/§2/§3; you
emit the Verify summary + Deferred ledger (§4/§5).

---

## Phase 2 — Run the audit workflow (Haiku fan-out + adversarial verify)

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/audit.mjs', args: { kind: 'performance', scope: '<resolved {scope}>' } })
```

(`scriptPath` is canonical — named workflow resolution is not available in this Claude Code build.)

It fans out **one Haiku finder per slice** — `api-queries` (N+1, index coverage vs the
migrations) · `api-requestpath` (sync slow work, blocking async, over-fetch, AsNoTracking) ·
`fe-web` (TanStack cache hygiene, render thrash, bundle) · `fe-mobile` (long lists, Metro
bundle, asset weight) — against the Phase-3/4 checklist below; runs a **Haiku skeptic** per
**High** finding (default-refuted — the impact is bounded at Orbit's scale, the index
actually exists, the query is already projected); loops until dry. It returns:

```
{ findings: [{ severity, title, category, location, evidence, rationale, fix, reference }],
  counts, coverage, deferred, rounds, converged, convergenceReason, criticErrors, scopeLabel }
```

**Completeness is a computed field, not an assumption.** `converged === true` only after the
critic ran and returned empty. If `converged !== true` (e.g. `criticErrors ≥ 2` from a
rate-limit), the sweep did NOT prove completeness — report it as "coverage UNKNOWN —
${convergenceReason}", never as a clean/complete audit. A dead verifier is not a clean pass.

`rationale` carries the scaling **impact** (concrete: "50-habit user → 50 round-trips").

**Fallback (no `Workflow` tool):** run the fan-out inline — `Explore` finders (Haiku, 3
concurrent) over the four slices against the checklist below, Haiku skeptics per High
finding, a completeness pass — same findings shape.

---

## Phase 3 — API performance checklist (the finders apply this)

> The flagship for Orbit: a habit tracker is read-heavy, and the killer is **round-trips
> per request**.

- **N+1 queries** — a query that loads a list then lazy-loads a relation per item; missing
  `.Include()`/`.ThenInclude()`, or projecting after materializing. Fix: eager-load or project
  with `.Select`.
- **Missing indexes** — a `Where`/`OrderBy`/join on an unindexed column → sequential scan.
  Check the EF migrations for an index on every filtered FK (`UserId`, `HabitId`, `GoalId`)
  and hot `Where`/`OrderBy` columns (`DueDate`, `Date`), plus filtered/partial-unique where
  the schema needs it (the `HabitLogs` Value>0 partial constraint). Fix: add the `HasIndex`.
- **Over-fetching** — full-entity loads where a projection would do; no pagination on an
  unbounded list.
- **Synchronous slow work in the request path** — CPU loops, an HTTP/AI call, email, or push
  done inline instead of offloaded to the background queue.
- **Blocking async** — `.Result`/`.Wait()`/`.GetAwaiter().GetResult()` in a request path.
- **`IQueryable` materialized too early** — `.ToList()` then `.Where()` in memory.
- **Missing `AsNoTracking()`** on read-only hot paths.

## Phase 4 — Frontend performance checklist (the finders apply this)

- **Bundle bloat** — a heavy or non-tree-shakeable import for a small need; a large dep that
  could be dynamic-`import()`ed / server-only. Check `next.config` and the Metro bundle.
- **Render thrash** — a new object/array/function literal as a prop every render defeating
  memoization; an unstable-dependency `useEffect`; a missing stable `key`. Only flag where the
  render is demonstrably hot — premature `memo` is its own smell.
- **List virtualization** — a long unbounded list rendered in full (mobile: `.map()` over a
  large array vs a `FlatList`). Bounded-small lists are fine.
- **Over-eager caching** — refetch on every mount/focus for stable data; a query per keystroke
  without debounce.
- **Stale caching** — a mutation that doesn't `invalidateQueries` the data it changed; a
  too-long `staleTime` on data that must feel live.
- **Waterfalls** — sequential awaits that could `Promise.all`; a client fetch that should be
  server-rendered.
- **Image / asset weight** — unoptimized large images to a 412px phone shell.

---

## Phase 5 — Synthesize the report (Opus)

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/performance-{scope}.md`

Bucket the workflow's `findings` by severity, build the Hotspots table from the highest-impact
findings, carry `deferred` verbatim:

```markdown
# Performance Audit: {SCOPE}

**Scope**: {scopeLabel}
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

## Deferred — in scope but not verdicted

{From the workflow's `deferred` + enterprise-only tuning + load-test territory (#230) + any
slice the run did not reach — each with a one-line reason. "Nothing deferred — full coverage"
if empty.}

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
  hot. Premature `memo`/`useCallback` everywhere is itself a smell.
- **List enterprise tuning as findings.** Connection-pool sizing, read-replicas, CDN
  strategy, sharding — note as "out of scope at current scale," don't itemize.
- **Claim an index is missing without checking the migrations.** The finders read them and
  cite the migration; drop any index finding that skipped that.
- **Run a benchmark or load test.** This reads code; load testing is #230.
- **Re-run the workflow's analysis.** It owns the fan-out, the skeptic pass, and the loop;
  you synthesize its return. Only re-invoke for a coverage gap.
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
