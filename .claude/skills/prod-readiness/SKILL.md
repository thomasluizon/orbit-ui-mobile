---
name: prod-readiness
description: Pre-launch orchestrator — runs the four repo-wide audits (security, tests, performance, code-quality) in parallel via the audit workflow and adds an ops-layer audit (observability, multi-instance readiness, background durability, backups, staging), then consolidates everything into ONE tier-tagged, verification-protocol-backed report with an honest launch verdict. Use before a release to know what's safe to ship. Orchestrates + consolidates; it does not re-derive the child audits' findings.
argument-hint: <both (default) | ui | api | path>
---

# Prod-Readiness

**Input**: $ARGUMENTS

Run a pre-launch readiness sweep across **both** Orbit repos and return ONE consolidated,
tier-tagged report with an honest launch verdict. This skill is an **orchestrator**: the
**`prod-readiness` dynamic workflow** (`.claude/workflows/prod-readiness.mjs`) runs the four
audit workflows in parallel (**Haiku fan-out**), adds the ops-layer audit none of them
cover, verifies its own ops findings, and returns everything; **you (Opus) consolidate** the
return into a single decision-ready document. Cheap discovery, expensive judgment only here.

**Golden rule — orchestrate, don't re-derive.** Each audit workflow owns its own analysis,
its own adversarial Verify, and its own loop; this skill's workflow **invokes** them and
**inherits** their verification — it never re-runs their finding logic. The ops layer is the
only analysis this skill adds. Three things are non-negotiable: no audit is silently skipped
(every one runs-and-reports or lands in the Deferred ledger with a reason), no ops finding
ships without surviving a challenge, and the report states what it did **not** do.

---

## Phase 0 — Provenance + binding coverage contract

The ops-layer checklist and this orchestration shape were adapted at authoring time from the
**`scaling-past-vibe` workflow base** in the `vibe-coding-workflow-skills` collection on
claudeskills.info (https://claudeskills.info), then specialized to Orbit's real operational
surface (Sentry across the three runtimes, Hangfire + `IHostedService` background work, the
`BackgroundServiceHealthCheck`, and the promote/smoke deploy workflows). That URL is the
single WHY-with-URL the comment policy allows.

**Self-contained / CI-safe**: no network call, no live scanner, no marketplace dependency.
The workflow's agents run `git` / `rg` against the project's own checkout and read repo
config. **CI / headless fallback**: if the `Workflow` tool is unavailable, run the four
`/audit-*` skills' own fallbacks inline + the ops fan-out, then consolidate — the report
still exists, the contract still holds.

Read **`.claude/skills/_shared/verification-protocol.md`** — the shared reliability contract.
The workflow runs its own coverage contract over the ops inventory + the §2 challenge over
its ops findings, and **inherits** each child audit's verify and loop; you merge every child
ledger into the consolidated report.

**The binding inventory (§1) — nine items:**

| # | Inventory item | Kind | Owner of the analysis |
|---|---|---|---|
| 1 | security audit | child audit | the child (inherited verify) |
| 2 | tests audit | child audit | the child (inherited verify) |
| 3 | performance audit | child audit | the child (inherited verify) |
| 4 | code-quality audit | child audit | the child (inherited verify) |
| 5 | Observability | ops check | the workflow (own §2 challenge) |
| 6 | Multi-instance readiness | ops check | the workflow (own §2 challenge) |
| 7 | Background durability | ops check | the workflow (own §2 challenge) |
| 8 | Backups | ops check | the workflow (returns as Deferred — un-verifiable from a repo read) |
| 9 | Staging | ops check | the workflow (own §2 challenge) |

This list is **binding**: by the end every item is either **(a) covered with a verdict** or
**(b) in the Deferred ledger with a one-line reason**. There is no silently-skipped bucket.

---

## Phase 1 — Resolve scope

Parse `$ARGUMENTS` into one `{scope}` token, forwarded to every child audit:

| Input | `{scope}` |
|---|---|
| Blank | `both` |
| `ui` / `web` / `mobile` / `frontend` | `ui` |
| `api` / `backend` | `api` |
| A path | the path itself |

| Repo | Root |
|---|---|
| `orbit-ui-mobile` | `C:\Users\thoma\Documents\Programming\Projects\orbit-ui-mobile` |
| `orbit-api` | `C:\Users\thoma\Documents\Programming\Projects\orbit-api` |

---

## Phase 2 — Run the prod-readiness workflow

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/prod-readiness.mjs', args: { scope: '<resolved {scope}>' } })
```

(`scriptPath` is canonical — named workflow resolution is not available in this Claude Code build.)

It runs the four `audit` workflows in parallel (each self-caps its own fan-out + verify +
loop), then fans out the **ops-layer** checks — observability · multi-instance · background
durability · staging — as Haiku finders, runs a Haiku skeptic per Blocker/High ops finding
(default-refuted), and returns:

```
{ scope,
  audits: [ { kind, findings, counts, coverage, deferred, rounds }, … ×4 ],
  opsFindings: [ { severity, check, title, location, risk, evidence, fix } ],
  opsChecksRun, opsDeferred, failedAudits }
```

`opsDeferred` always includes **backups** ("verify in the DB console — PITR + a tested
restore path"). `failedAudits` names any audit workflow that errored — each forces **≤
CONDITIONAL** and is named as a blocker.

---

## Phase 3 — Consolidate & write reports (Opus)

```bash
mkdir -p .claude/audits
```

First write each child report from its returned audit result — `.claude/audits/{kind}-{scope}.md`
(same skeleton each `/audit-*` skill defines) — so the per-child paths the coverage table
references exist. Then write the consolidated report.

**Output path**: `.claude/audits/prod-readiness-{scope}.md`

### Unified ladder (normalization)

Normalize each source's native label onto one spine, tagging each finding with its **source
audit + native label** so nothing is silently relabeled:

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
| 1 | security audit | yes/no/deferred | {tier counts / "did not run — blocker"} |
| 2 | tests audit | … | … |
| 3 | performance audit | … | … |
| 4 | code-quality audit | … | … |
| 5 | Observability | … | … |
| 6 | Multi-instance readiness | … | … |
| 7 | Background durability | … | … |
| 8 | Backups | deferred | verify in the DB console |
| 9 | Staging | … | … |

## Deferred ledger (verification-protocol §4)

{Merge every child's returned `deferred` (attributed, e.g. "from security: verify-cap
overflow"), PLUS `opsDeferred` (backups) PLUS any `failedAudits` (named as a blocker) PLUS
enterprise-only ops. Every one of the 9 inventory items appears here or in findings/coverage
above — silence reads as coverage.}

## What's solid

{Genuine production strengths across the children + ops — controls done right. Not filler.}
```

### Launch verdict (§5 honesty) — computed, never hardcoded

- **GO** only if **zero Blockers** AND all **9** inventory items produced a verdict (every
  audit ran; every ops check resolved or is a legitimately Deferred un-verifiable like backups).
- **CONDITIONAL** if no Blockers but some items are Deferred in a way that gates launch (e.g.
  backups unverified, staging gate absent) — name the conditions.
- **NO-GO** if any Blocker stands.
- **A `failedAudit` forces at most CONDITIONAL and names itself as the blocker** — a partial
  sweep can never read green. The coverage table makes any non-running audit visible.

---

## Phase 4 — Output

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

**Inventory (9)**: security {ran/deferred} · tests {…} · performance {…} · code-quality {…} · observability {…} · multi-instance {…} · background durability {…} · backups {deferred} · staging {…}
**Report**: `.claude/audits/prod-readiness-{scope}.md`
**Top blocker**: {the single highest-priority thing standing between here and launch, or "none"}
```

---

## Guardrails — do NOT

- **Re-derive child findings.** The workflow runs each audit, inherits its verify (§2/§3) and
  its ledger. Re-running a child's analysis doubles cost and risks a divergent verdict.
- **Silently drop an audit that failed to run.** A `failedAudit` is a Deferred-ledger entry
  **and** a verdict downgrade (≤ CONDITIONAL), named as a blocker — never an unstated gap.
- **Invent ops findings to look thorough.** A clean ops check earns a plain "ready," not a
  manufactured nit. An ops finding with no concrete anchor + risk is not a finding.
- **Hardcode a verdict, the QA-env state, or the backup state.** The workflow discovers
  staging + background topology at runtime per repo; the workflow set and the QA env drift (#211).
- **Assert backups or staging you cannot verify from a repo read.** Backups defaults to the
  Deferred ledger ("verify in console"), never "clean."
- **Paste enterprise checklists.** SOC2 / SIEM / multi-region / DR drills get one acknowledging
  Deferred line, not a finding each — right-size to a solo, pre-scale app.
- **Fork a child's tier ladder or finding template.** The only new vocabulary here is the
  unified-ladder *mapping*, which is this skill's own job.
- **Emit a report without a Verify pass + a Deferred ledger.** The workflow runs the Verify;
  you must emit the merged Deferred ledger — otherwise you are only *saying* the protocol ran.
```
