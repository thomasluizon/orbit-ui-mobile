---
name: audit-performance
description: >-
  Performance-risk audit across both Orbit repos, opening one Linear ticket per verified risk after a human approval gate (D10). API side: N+1 queries, missing indexes, synchronous slow work in request paths. Frontend side: render thrash, over-eager or stale caching, waterfalls. EXCLUDES what the gates own (D11): the perf.yml web LCP/TBT/bundle budgets, the N+1 guard test's three query shapes, and react-doctor's perf rules. Each finding carries file:line evidence and a remediation, calibrated to Orbit's solo-dev scale. Use when the user asks to audit performance, find slowdowns, or check for scaling risks. Not for running benchmarks.
argument-hint: <path | repo | blank=both repos>
---

# Audit Performance

**Input**: $ARGUMENTS

Find the performance risks that bite at scale, before they do, across both repos. The
API side is where Orbit's real risk lives (database round-trips per request); the frontend
side is render and cache hygiene. Output: one Linear ticket per verified risk (D10), each
pinned to a file:line with the fix, behind one approval gate, never a report that rots.

The fan-out, the adversarial verify, and the loop-until-dry run as the **`audit` dynamic
workflow** (`.claude/workflows/audit.mjs`), **Haiku finders + Haiku skeptics**,
deterministic orchestration, so Opus spends tokens only on **this synthesis**.

**Golden rule**: every finding is a concrete, located risk with a remediation, **sized to
Orbit's actual scale** (solo dev, dozens of habits per user rather than millions of rows,
Postgres on Supabase). Flag the patterns that get *quadratically* worse with data (N+1,
unindexed scans, render loops), not micro-optimizations that don't move the needle on a
habit tracker.

---

## Phase 0: Provenance & self-containment

The API patterns come from EF Core + Postgres performance canon; the frontend patterns from
**react-patterns / performance skill bases on claudeskills.info** (https://claudeskills.info)
and the React/Next.js + TanStack Query render-and-cache canon, specialized to Orbit's stack
(Next.js 16 web, Expo mobile, TanStack Query, EF Core 10 / MediatR CQRS). That URL is the
single WHY-with-URL the comment policy allows.

**Self-contained**: the workflow's finder/skeptic agents **read** code and run `git` / `rg`.

---

## Phase 1: Resolve scope

Parse `$ARGUMENTS` into a `{scope}` token: blank → `both`; `api`/`backend` → `api`;
`frontend`/`web`/`mobile` → `ui`; a path → the path itself.

| Repo | Hot zones |
|---|---|
| `orbit-api` | CQRS query handlers (`src/Orbit.Application/**/Queries`), the generic repository + EF `DbContext` usage, controller request paths |
| `orbit-ui-mobile` | TanStack Query hooks (`apps/*/hooks`), list-rendering screens/pages, `next.config`/Metro bundle surface, heavy client components |

The workflow's finders **read the EF migrations** to confirm which indexes exist (load-bearing
for the index checks), and exclude other generated/vendored dirs. Load
**`.claude/skills/_shared/verification-protocol.md`** (the workflow executes §1/§2/§3; you
carry the Verify summary + Deferred ledger §4/§5 into the approval gate) and
**`.claude/skills/_shared/audit-to-tickets.md`** (the D10 ticket-emission pipeline Phase 4
runs).

### D11 scope: judgement only, never what a gate checks

Read **`.claude/skills/_shared/gate-owned-exclusions.md`**. This audit does NOT re-flag: the
web LCP / TBT / script-bundle-size budgets on the authed-Today surface (`perf.yml` owns
those), an N+1 regression on the three query shapes already under the round-trip guard test
(`tests/Orbit.Infrastructure.Tests/Persistence/QueryRoundTripCountTests.cs`), or render-thrash
patterns react-doctor's perf rules already fail on. It DOES own the judgement layer no gate
sees: N+1 on any OTHER query, a missing index on a hot `Where`/`OrderBy`/FK, sync slow work in
a request path, over-fetching, stale/over-eager cache invalidation, and waterfalls.

---

## Phase 2: Run the audit workflow (Haiku fan-out + adversarial verify)

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/audit.mjs', args: { kind: 'performance', scope: '<resolved {scope}>' } })
```

(`scriptPath` is canonical, named workflow resolution is not available in this Claude Code build.)

It fans out **one Haiku finder per slice**, `api-queries` (N+1, index coverage vs the
migrations) · `api-requestpath` (sync slow work, blocking async, over-fetch, AsNoTracking) ·
`fe-web` (TanStack cache hygiene, render thrash, bundle) · `fe-mobile` (long lists, Metro
bundle, asset weight), each reading `checklist.md`; runs a **Haiku skeptic** per
**High** finding (default-refuted, the impact is bounded at Orbit's scale, the index
actually exists, the query is already projected); loops until dry. It returns:

```
{ findings: [{ severity, title, category, location, evidence, rationale, fix, reference }],
  counts, coverage, deferred, rounds, converged, convergenceReason, loopBound, criticErrors, scopeLabel }
```

**Completeness is a computed field, not an assumption.** `converged === true` only after the
critic ran and returned empty. Anything else (e.g. `criticErrors ≥ 2` from a rate-limit)
reports as "coverage UNKNOWN, ${convergenceReason}": a dead verifier is not a clean pass.

**Fallback (no `Workflow` tool):** run the fan-out inline, `audit-readonly` finders (Haiku,
3 concurrent) over the four slices against `checklist.md`, Haiku skeptics per High finding,
a completeness pass, same findings shape. The fallback keeps the primary path's agent type
on purpose: an audit reads, so its workers carry no write, edit, or shell tools either way.

---

## Phase 3: The checklist the finders apply

`checklist.md`, next to this file, is the pattern list: section **A** the API side (N+1,
missing indexes, over-fetching, sync slow work in a request path, blocking async, early
materialization, missing `AsNoTracking`), section **B** the frontend side (bundle bloat,
render thrash, list virtualization, over-eager and stale caching, waterfalls, asset weight),
section **C** the enterprise tuning that is noted once and never itemized.

It is a separate file because `.claude/workflows/audit.mjs` hands its path to every finder
as their contract, so its prose is a machine input: an edit there changes the finder prompt,
and anything added here does not reach them. Confirm the returned `coverage` addresses both
sections, and re-invoke with a narrowed scope for any slice it missed.

---

## Phase 4: Emit tickets (D10), not a report

Run the shared pipeline in **`.claude/skills/_shared/audit-to-tickets.md`**: one Linear
ticket per verified risk, drafted to the 6.2 template, validated by
`node tools/check-ticket.mjs --file`, presented behind ONE approval gate, then created via
`orca linear create` and re-validated with `--issue`.

Performance-specific mapping into the 6.2 body:

- **Problem / why it matters** carries the severity and, from `rationale`, the concrete
  scaling **impact** ("50-habit user -> 50 round-trips").
- **Technical details** carries the `evidence` (the code causing it) and the concrete `fix`
  (.Include / add the `HasIndex` / invalidateQueries / dynamic import / FlatList). A
  missing-index ticket cites the EF migration that lacks it.
- **Acceptance criteria** name the observable change (the round-trip count drops, the index
  exists, the request no longer blocks).
- A frontend fix that depends on a new API index or endpoint is a ui ticket blockedBy the api
  ticket (deploy-API-first). `repo:*` from `location`; ui tickets carry `parity:yes|no`; add
  `visible-effect` only if the fix changes what the user sees.

At the approval gate, present the Hotspots (the highest-impact risks, side + pattern + how it
grows) as provenance, plus the **Deferred ledger** (the workflow's `deferred`, enterprise-only
tuning, load-test territory #230) and the convergence state, so Thomas approves with the
scaling picture in view.

---

## Guardrails: do NOT

- **Micro-optimize.** Flag patterns that get *quadratically/linearly* worse with data or
  traffic. A one-off `O(n)` loop over 20 items is not a finding on a solo-scale app.
- **Over-prescribe memoization / virtualization.** Only where the render is demonstrably
  hot. Premature `memo`/`useCallback` everywhere is itself a smell.
- **List enterprise tuning as findings.** Connection-pool sizing, read-replicas, CDN
  strategy, sharding, note as "out of scope at current scale," don't itemize.
- **Claim an index is missing without checking the migrations.** The finders read them and
  cite the migration; drop any index finding that skipped that.
- **Run a benchmark or load test.** This reads code; load testing is #230.
- **Re-run the workflow's analysis.** You turn its return into tickets; only re-invoke for a
  coverage gap.
- **Write a report file, or create tickets unattended.** The output is Linear tickets behind
  the one approval gate; nothing is persisted to `.claude/audits/`.
- **Optimize during the audit.** Tickets first; change code only if the user asks after.

---

## Output

```markdown
## Audit Complete: Performance

**Scope**: {what was audited}
**Verdict**: {1-line, e.g. "One N+1 in the summary query; 1 missing log index"}

| Severity | Findings | Tickets |
|---|---|---|
| High (scales badly) | {N} | {created / pending approval} |
| Medium (bounded) | {N} | {…} |
| Low / Info | {N} | {…} |

**Tickets**: {the final ORB-N table, identifier · title · repo · blockedBy, or "clean: no scaling risks the gates do not already own"}
**Top risk**: {the single ticket most worth picking up first, with its scaling impact}
```
