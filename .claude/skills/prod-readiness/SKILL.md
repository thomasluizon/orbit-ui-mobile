---
name: prod-readiness
description: Pre-launch orchestrator — fans out the four repo-wide audits (security, tests, performance, code-quality) in parallel and adds an ops-layer audit (observability, multi-instance readiness, background durability, backups, staging), then consolidates everything into ONE tier-tagged, verification-protocol-backed report with an honest launch verdict. Use before a release to know what's safe to ship. Orchestrates + consolidates; it does not re-derive the child audits' findings.
argument-hint: <both (default) | ui | api | path>
context: fork
---

# Prod-Readiness

**Input**: $ARGUMENTS

Run a pre-launch readiness sweep across **both** Orbit repos and return ONE consolidated,
tier-tagged report with an honest launch verdict. This skill is an **orchestrator**: it fans
out the four already-built repo-wide audits, adds the ops-layer audit none of them cover,
then merges every result into a single decision-ready document.

**Golden rule — orchestrate, don't re-derive.** Each child audit owns its own analysis,
its own adversarial Verify, and its own loop; this skill **invokes** them, **reads** their
reports, and **inherits** their verification — it never re-runs their finding logic. Its own
analysis is the ops layer alone. Three things are non-negotiable: no audit is silently
skipped (every one runs-and-reports or lands in the Deferred ledger with a reason), no ops
finding ships without surviving a challenge, and the report states what it did **not** do.

---

## Phase 0 — Provenance + binding coverage contract

The ops-layer checklist and this orchestration shape were adapted at authoring time from the
**`scaling-past-vibe` workflow base** in the `vibe-coding-workflow-skills` collection on
claudeskills.info (https://claudeskills.info), then specialized to Orbit's real operational
surface (Sentry across the three runtimes, Hangfire + `IHostedService` background work, the
`BackgroundServiceHealthCheck`, and the promote/smoke deploy workflows). That URL is the
single WHY-with-URL the comment policy allows.

**Self-contained / CI-safe**: no network call, no live scanner, no marketplace dependency at
run time. It invokes the four sibling audit skills (which are themselves self-contained) and
**reads** their report files plus repo config; it runs `git` / `rg` against the project's own
checkout. Works unchanged in CI.

Read **`.claude/skills/_shared/verification-protocol.md`** — the shared reliability contract.
Its coverage contract (§1), adversarial verify (§2), Deferred ledger (§4), and honesty clause
(§5) govern this run; the calibration row at `:101` is this skill's authority for what it
**runs** versus **inherits** (it runs its own coverage contract over the inventory + the §2
challenge over its own ops findings; it inherits each child audit's verify and each child's
loop; it merges every child ledger).

**Build the binding inventory (§1)** — exactly **nine items**:

| # | Inventory item | Kind | Owner of the analysis |
|---|---|---|---|
| 1 | `/audit-security` | child audit | the child (inherited verify) |
| 2 | `/audit-tests` | child audit | the child (inherited verify) |
| 3 | `/audit-performance` | child audit | the child (inherited verify) |
| 4 | `/audit-code-quality` | child audit | the child (inherited verify) |
| 5 | Observability | ops check | this orchestrator (own §2 challenge) |
| 6 | Multi-instance readiness | ops check | this orchestrator (own §2 challenge) |
| 7 | Background durability | ops check | this orchestrator (own §2 challenge) |
| 8 | Backups | ops check | this orchestrator (own §2 challenge) |
| 9 | Staging | ops check | this orchestrator (own §2 challenge) |

This list is **binding**: by the end every item is either **(a) covered with a verdict** (in
the tier-tagged findings + the coverage table) or **(b) in the Deferred ledger with a
one-line reason**. There is no third "silently skipped" bucket — that bucket is the failure
this protocol exists to kill, and for a launch verdict it is the most dangerous one.

---

## Phase 1 — Resolve scope & load context

Parse `$ARGUMENTS` exactly as the child audits do, so one resolved scope flows to all of them:

| Input | Scope | `{scope}` token |
|---|---|---|
| Blank | **both repos** | `both` |
| `ui` / `web` / `mobile` / `frontend` | `orbit-ui-mobile` | `ui` |
| `api` / `backend` | `orbit-api` | `api` |
| A path | just that file or folder | a slug of the path |

| Repo | Root |
|---|---|
| `orbit-ui-mobile` | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

Compute **one** `{scope}` token and forward the **same** scope argument to every child so all
five report files share one suffix (`security-{scope}.md`, `tests-{scope}.md`, …). The
authoritative path for each child report is the one the child names in its returned **Output**
block — read that, don't guess at the token derivation. The children load their own context
(rubrics, `CLAUDE.md`, the protocol); the orchestrator only loads the protocol itself.

---

## Phase 2 — Fan out the four audits (parallel via subagents, cap 3)

Spawn **one subagent per child audit**, plus the ops-check subagent from Phase 3 — **five
subagents in one wave**, capped at **3 concurrent** (mirror `audit-code-quality/SKILL.md:84-86`);
queue the 4th audit and the ops check behind the first three. Each audit subagent:

- Invokes its canonical audit skill — `/audit-security`, `/audit-tests`, `/audit-performance`,
  `/audit-code-quality` — with the resolved `{scope}`.
- Lets the child run its **full** pipeline, including the child's own §2 adversarial pass and
  §3 loop-until-dry. The orchestrator does **not** re-run that analysis.
- Returns the child's final **Output** summary block verbatim (per-severity counts + the
  report path + the top item).

> **Objective** (embedded in each audit subagent's prompt): run `/audit-<kind>` against scope
> `{scope}`, let it complete its own Verify and loop, and return its Output block unmodified —
> including the `.claude/audits/<kind>-{scope}.md` path. Do not re-analyze or re-format its
> findings.

**Nesting is expected.** Each child is itself `context: fork` and internally fans out its own
3 `Explore` scouts + skeptics. The orchestrator caps **its own** wave at 3; the children
self-cap internally. A runner should expect nested subagent trees.

**Coverage-contract handling (§1).** An audit that completes → its report path + Output
summary feed Phase 5. An audit that **errors or cannot run** (e.g. the sibling repo is not
checked out in this CI job, or the Skill call is unavailable) → a **Deferred-ledger entry**
naming the audit and the reason **and** a verdict downgrade in Phase 5 (it is a surfaced
blocker, never a silent pass — §5). **Fallback:** if the scoped `/audit-<kind>` Skill call is
unavailable to a subagent, that subagent runs the audit's own phases inline against the same
`{scope}` and writes the same `.claude/audits/<kind>-{scope}.md` path — the report still
exists, the contract still holds (precedent: `/pr-review` orchestrates its review subagents
the same way, `verification-protocol.md:96`).

---

## Phase 3 — Ops-layer audit (the orchestrator's own audit — the part no child covers)

The four child audits cover code, tests, security, and performance; **none** covers whether
the running system survives production. This is the orchestrator's own analysis. Launch the
ops-check **as a subagent in the Phase-2 wave** so it runs in parallel; the orchestrator owns
its §2 refutation in Phase 4. Run **five concrete checks**, discovering each anchor at runtime
(the pointers below are where to look, **not** hardcoded verdicts), and emit each gap as a
finding in the shared finding template (below) tagged on the consolidated tier spine.

| # | Ops check | Where to look (discover at runtime) | "Ready" looks like | Gap = finding (tier) |
|---|---|---|---|---|
| 5 | **Observability** | Sentry: web `apps/web/sentry.server.config.ts` + `sentry.edge.config.ts` + `lib/sentry-scrub.ts`; mobile `apps/mobile/lib/sentry-init.ts` + `lib/sentry.ts`; api `Orbit.Infrastructure/Configuration/SentrySettings.cs` + `Orbit.Api/Middleware/UnhandledExceptionHandler.cs`. Health: `Orbit.Infrastructure/Services/BackgroundServiceHealthCheck.cs` + the `MapHealthChecks` registration. Alert routing: the Discord sink. | Error capture initialized + DSN wired on all three surfaces; an unhandled-exception handler; a `/health` endpoint; alerts routed to a sink someone watches | A surface with no error capture, no health endpoint, or no alert sink (**Blocker** if a whole runtime is dark; **High** for a single gap) |
| 6 | **Multi-instance readiness** | `IHostedService` schedulers (`Orbit.Infrastructure/Services/*SchedulerService.cs`, `Services/Hosting/ScheduledServiceBase.cs`) vs Hangfire (`Orbit.Infrastructure/BackgroundJobs/HangfireRecurringJobRegistrar.cs`, `IScheduledJob.cs`); any in-memory cache / rate-limit / counter assumed authoritative; session-affinity assumptions | Recurring work coordinated through Hangfire's durable store (one run cluster-wide); no single-instance in-memory authority | An `IHostedService` that double-fires on every replica; an in-memory rate-limit/cache that breaks when a second instance starts (**High**; **Blocker** if it corrupts user data on scale-out) |
| 7 | **Background durability** | Hangfire store config (`Orbit.Infrastructure/Configuration/BackgroundJobSettings.cs`, `Orbit.Api/Extensions/ServiceCollectionExtensions.BackgroundJobs.cs`); fire-and-forget paths (`RunBackgroundPostResponseWork`, push/email dispatch) | Jobs persisted to a durable store, survive a restart, are idempotent / retried | In-process fire-and-forget work lost on restart or crash; a non-idempotent recurring job that double-applies on retry (**High**) |
| 8 | **Backups** | DB provider config (Supabase / Render Postgres); any documented restore path in the repo | Automated backups / PITR enabled **and** a tested restore path | **Usually un-verifiable from a repo read in CI** → a **Deferred** entry ("verify in the DB console — backups + restore"), never asserted clean (§5) |
| 9 | **Staging** | Deploy/CI workflows in **both** repos (`orbit-ui-mobile/.github/workflows/promote-prod.yml`, `smoke-prod.yml`, `test.yml`; orbit-api `.github/workflows/`); any out-of-Actions deploy config | A pre-prod gate (smoke + promote) sits between merge and prod | No staging/QA env or no pre-prod gate. **Discover the real state per repo** — report what exists, never hardcode a snapshot (the QA env was aborted per #211, and the workflow set drifts) (**Medium**, calibrated) |

**Scale calibration.** Right-size to Orbit's solo-dev, pre-scale reality (mirror the audits'
Tier-3 / enterprise exclusions): do **not** itemize SOC2, SIEM, multi-region failover,
DR-region drills, or a 99.99% SLO. Acknowledge enterprise-only ops in **one** Deferred line,
not a finding each.

### Ops finding template (shared shape)

The same shape the children emit (`audit-security/SKILL.md:204-212`), with an ops `check`
category in place of a threat:

```
[TIER] <one-line ops gap>
· check: <observability | multi-instance | background durability | backups | staging>
· location: <repo>/<path>:<line>   (or "config/console — not in repo" for backups)
· risk: <what breaks in production and when — e.g. "scheduler double-fires on every replica">
· evidence: <the line/config that proves it, or "not found at runtime">
· fix: <the concrete change — distributed lock, durable queue, enable PITR, add a promote gate>
```

---

## Phase 4 — Verify (adversarial + consolidation)

Per `verification-protocol.md:101`, this orchestrator **runs** §2 over its own ops findings
and **inherits** each child's verify and loop.

1. **§2 adversarial — the orchestrator's OWN ops findings only.** For each **Blocker / High**
   ops finding, spawn an independent **skeptic subagent** (3 concurrent) whose only job is to
   *refute* it: read the cited `file:line` in full context and argue it is a false positive —
   Hangfire already coordinates that job, the unhandled-exception handler does exist, the env
   really has a promote gate, the cache is per-request not process-global. The skeptic
   **defaults to refuted when uncertain** (`verification-protocol.md:46-47`); the burden is on
   the finding. Drop or downgrade anything refuted, attaching the skeptic's note.
2. **Inherit, don't re-run, the children's verify.** Each child already ran its §2 adversarial
   pass and §3 loop internally. The orchestrator does **not** re-skeptic child findings and
   does **not** re-loop their scope — it presents them as already-verified. Re-deriving would
   double the cost and risk a divergent verdict.
3. **No orchestrator-level loop.** The ops checklist is **bounded** (the five items), so —
   like `/pr-review`'s bounded diff (`verification-protocol.md:96`, `:68-69`) — run **one
   completeness pass** over the five checks (did each resolve to a verdict or a Deferred
   entry?) and stop. The unbounded loop-until-dry belongs to the children; it is inherited,
   not re-run.

---

## Phase 5 — Consolidate & report (ONE tier-tagged report)

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/prod-readiness-{scope}.md`

### Unified ladder (normalization)

The four children do **not** share one severity enum — normalize them onto one spine and tag
each finding with its **source audit + native label** (so nothing is silently relabeled). The
protocol's cross-skill spine is "Critical / High ≡ Tier 1 / Tier 2 for security"
(`verification-protocol.md:42`):

| Consolidated tier | Maps from |
|---|---|
| **Blocker** | security Tier 1 · tests Critical · performance Critical · code-quality Critical · ops Blocker |
| **High** | security Tier 2 · tests High · performance High · code-quality High · ops High |
| **Medium** | tests Medium · performance Medium · code-quality Medium · ops Medium |
| **Low / Info** | performance Low/Info · code-quality Low/Info |
| **Out-of-scope / acknowledged** | security Tier 3 · enterprise-only ops |

### Report skeleton

```markdown
# Prod-Readiness: {SCOPE}

**Scope**: {both repos / repo / path}
**Calibration**: launch-blocking risk for a solo-dev, pre-scale app; enterprise controls acknowledged, not itemized.
**Verdict**: {GO | CONDITIONAL | NO-GO} — {one calibrated line: why, and the single thing standing in the way}

## Findings (consolidated, tier-tagged)

### Blocker
{each finding with [source audit · native label] prefix, in its own template, or "None"}

### High
{… or "None"}

### Medium
{… or "None"}

### Low / Info
{… or "None"}

## Out of scope (acknowledged)
{one line each: security Tier 3 + enterprise-only ops — deliberately deferred}

## Coverage (the binding 9-item inventory)

| # | Inventory item | Ran? | Result |
|---|---|---|---|
| 1 | /audit-security | yes/no/deferred | {tier counts / "did not run — blocker"} |
| 2 | /audit-tests | … | … |
| 3 | /audit-performance | … | … |
| 4 | /audit-code-quality | … | … |
| 5 | Observability | … | … |
| 6 | Multi-instance readiness | … | … |
| 7 | Background durability | … | … |
| 8 | Backups | … | … |
| 9 | Staging | … | … |

## Deferred ledger (verification-protocol §4)

{The merged ledger: every child report's own "Deferred" section, carried in verbatim and
attributed (e.g. "from security: Tier-3 WAF/SIEM"), PLUS the orchestrator's ops Deferred —
backups ("verify in the DB console"), any audit that failed to run (named as a blocker),
enterprise-only ops. "Silence reads as coverage" (`verification-protocol.md:75-76`) — every
one of the 9 inventory items appears here or in the findings/coverage above. Nothing absent.}

## What's solid

{Genuine production strengths across the children + ops — controls done right. Not filler.}
```

### Launch verdict (§5 honesty)

One calibrated line, computed — never hardcoded:

- **GO** only if **zero Blockers** **AND** all **9** inventory items produced a verdict (every
  audit ran, every ops check resolved or is a legitimately Deferred un-verifiable like backups).
- **CONDITIONAL** if no Blockers but some items are Deferred in a way that gates launch (e.g.
  backups unverified, staging gate absent) — name the conditions.
- **NO-GO** if any Blocker stands.
- **A child audit that failed to run forces at most CONDITIONAL and names itself as the
  blocker** — a partial sweep can never read green (`verification-protocol.md:84-88`). The
  coverage table makes any non-running audit visible.

Merge the child reports by **reading their files** at the paths their Output blocks name
(Phase 2), not by re-deriving their findings.

---

## Phase 6 — Output

```markdown
## Prod-Readiness Complete

**Scope**: {what was swept}
**Verdict**: {GO | CONDITIONAL | NO-GO} — {the single top blocker, or "clean — all 9 verdicted, zero blockers"}

| Consolidated tier | Count |
|---|---|
| Blocker | {N} |
| High | {N} |
| Medium | {N} |
| Low / Info | {N} |

**Inventory (9)**: security {ran/deferred} · tests {…} · performance {…} · code-quality {…} · observability {…} · multi-instance {…} · background durability {…} · backups {…} · staging {…}
**Report**: `.claude/audits/prod-readiness-{scope}.md`
**Top blocker**: {the single highest-priority thing standing between here and launch, or "none"}
```

---

## Guardrails — do NOT

- **Re-derive child findings.** Invoke the audit, read its report, inherit its verify (§2/§3)
  and its ledger. Re-running a child's analysis doubles cost and risks a divergent verdict.
- **Silently drop an audit that failed to run.** A missing audit is a Deferred-ledger entry
  **and** a verdict downgrade (≤ CONDITIONAL), named as a blocker — never an unstated gap.
- **Invent ops findings to look thorough.** A clean ops check earns a plain "ready," not a
  manufactured nit (§5). An ops finding with no concrete anchor + risk is not a finding.
- **Hardcode a verdict, the QA-env state, or the backup state.** Discover staging and
  background topology at runtime per repo; the workflow set and the QA env drift (#211).
- **Assert backups or staging you cannot verify from a repo read in CI.** Those default to the
  Deferred ledger with a "verify in console / discover the real env" reason, never "clean."
- **Paste enterprise checklists.** SOC2 / SIEM / multi-region / DR drills get one acknowledging
  Deferred line, not a finding each — right-size to a solo, pre-scale app.
- **Fork a child's tier ladder or finding template.** Point at the children's files; the only
  new vocabulary here is the unified-ladder *mapping*, which is the orchestrator's own job.
- **Emit a report without an explicit Verify pass + a Deferred ledger.** Per the protocol's
  self-application clause (`verification-protocol.md:106-110`), a skill that names the protocol
  must actually emit both — otherwise it is only *saying* it ran it, not running it.
