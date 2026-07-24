---
name: prod-readiness
description: Pre-launch orchestrator that runs the four repo-wide audits (security, tests, performance, code-quality) in parallel via the audit workflow and adds an ops-layer audit (observability, multi-instance readiness, background durability, backups, staging), then consolidates everything into ONE combined Linear ticket set behind a single approval gate (D10), headlined by an honest launch verdict. It looks only at what no gate can check (D11); React correctness is owned by the react-doctor.yml gate, not this skill. Use before a release to know what's safe to ship. Orchestrates and consolidates; it does not re-derive the child audits' findings.
argument-hint: <both (default) | ui | api | path>
---

# Prod-Readiness

**Input**: $ARGUMENTS

Run a pre-launch readiness sweep across **both** Orbit repos and open ONE consolidated,
severity-ranked Linear ticket set (D10) behind a single approval gate, headlined by an honest
launch verdict. This skill is an **orchestrator**: the **`prod-readiness` dynamic workflow**
(`.claude/workflows/prod-readiness.mjs`) runs the four audit workflows in parallel (**Haiku
fan-out**), adds the ops-layer audit none of them cover, verifies its own ops findings, and
returns everything; **you (Opus) consolidate** the return into one combined ticket table and
a launch verdict.

**Golden rule: orchestrate, don't re-derive.** Each audit workflow owns its own analysis, its
own adversarial Verify, and its own loop; this skill's workflow **invokes** them and
**inherits** their verification, never re-running their finding logic. The ops layer is the
only analysis this skill adds. Three things are non-negotiable: no audit is silently skipped
(every one runs-and-reports or lands in the Deferred ledger with a reason), no ops finding
ships without surviving a challenge, and the approval gate states what the sweep did **not**
do. The output is tickets plus a verdict, never a persisted report (D10).

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
`/audit-*` skills' own fallbacks inline plus the ops fan-out, then consolidate; the ticket
set and the contract still hold.

Read **`.claude/skills/_shared/verification-protocol.md`** (the reliability contract: the
workflow runs its own coverage contract over the ops inventory plus the §2 challenge over its
ops findings, and **inherits** each child audit's verify and loop; you merge every child
ledger into the approval-gate provenance) and
**`.claude/skills/_shared/audit-to-tickets.md`** (the D10 ticket-emission pipeline Phase 3
runs over the consolidated finding set).

### D11 scope

Read **`.claude/skills/_shared/gate-owned-exclusions.md`**. The ops layer this skill adds is
exactly the judgement no gate can check: whether the RUNNING system survives production
(observability, multi-instance safety, background durability, backups, a pre-prod gate). React
correctness is NOT in this skill's inventory: `react-doctor.yml` is a required CI gate and owns
it (D11); the standing full-repo react-doctor backlog is mechanical debt for the ORB-46
project, not a prod-readiness finding.

**The binding inventory (§1), nine items:**

| # | Inventory item | Kind | Owner of the analysis |
|---|---|---|---|
| 1 | security audit | child audit | the child (inherited verify) |
| 2 | tests audit | child audit | the child (inherited verify) |
| 3 | performance audit | child audit | the child (inherited verify) |
| 4 | code-quality audit | child audit | the child (inherited verify) |
| 5 | Observability | ops check | the workflow (own §2 challenge) |
| 6 | Multi-instance readiness | ops check | the workflow (own §2 challenge) |
| 7 | Background durability | ops check | the workflow (own §2 challenge) |
| 8 | Backups | ops check | the workflow (returns as Deferred, un-verifiable from a repo read) |
| 9 | Staging | ops check | the workflow (own §2 challenge) |

This list is **binding**: by the end every item is either **(a) covered with a verdict** or
**(b) in the Deferred ledger with a one-line reason**.

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

It runs the four `audit` workflows in parallel (each self-caps its own fan-out plus verify
plus loop), then fans out the **ops-layer** checks (observability · multi-instance ·
background durability · staging) as Haiku finders, runs a Haiku skeptic per Blocker/High ops
finding (default-refuted), and returns:

```
{ scope,
  audits: [ { kind, findings, counts, coverage, deferred, rounds }, … ×4 ],
  opsFindings: [ { severity, check, title, location, risk, evidence, fix } ],
  opsChecksRun, opsDeferred, failedAudits, unconvergedAudits }
```

`opsDeferred` always includes **backups** ("verify in the DB console: PITR plus a tested
restore path"). `failedAudits` names any audit workflow that errored; each forces **at most
CONDITIONAL** and is named as a blocker. `unconvergedAudits` names any child whose critic
never ran dry (coverage UNKNOWN), which the approval gate must surface.

---

## Phase 3: Consolidate and emit tickets (Opus, D10)

### Unified ladder (severity normalization for ranking)

Consolidate the child + ops findings into one severity spine, tagging each with its **source
audit + native label** so nothing is silently relabeled. This ranking orders the ticket table
and drives the verdict; it is not a report:

| Consolidated tier | Maps from |
|---|---|
| **Blocker** | security Tier 1 · tests Critical · performance Critical · code-quality Critical · ops Blocker |
| **High** | security Tier 2 · tests High · performance High · code-quality High · ops High |
| **Medium** | tests Medium · performance Medium · code-quality Medium · ops Medium |
| **Low / Info** | performance Low/Info · code-quality Low/Info |
| **Out-of-scope / acknowledged** | security Tier 3 · enterprise-only ops |

### Emit the consolidated ticket set

Run the shared pipeline in **`.claude/skills/_shared/audit-to-tickets.md`** over the **whole
consolidated finding set** (all four children plus the ops findings), as ONE combined table
behind ONE approval gate. Do not run each child skill's own gate; prod-readiness invokes the
audit workflows directly and owns the single consolidated emission.

- Dedupe across sources (a finding that surfaced in two children is one ticket) and fold
  findings that share a fix and PR into one ticket (D4).
- Map each to its `repo:*` from `location`; an ops finding is almost always `repo:api`. A ui
  fix that depends on an api change is the ui ticket blockedBy the api ticket.
- Draft each body to the 6.2 template, validate with `node tools/check-ticket.mjs --file`. An
  ops ticket's Problem carries the `risk` (what breaks in production and when); Technical
  details carry `evidence`; Acceptance criteria name the observable ready-state (the scheduler
  fires once cluster-wide, work survives a restart, the pre-prod gate exists).

### HARD GATE, headlined by the launch verdict

Present ONE message and get ONE approval (mirror /feature Phase C step 0). The headline is the
**launch verdict**; the body is the combined ticket table plus the full provenance:

- **Verdict**: {GO | CONDITIONAL | NO-GO}, one calibrated line (why, and the single thing in
  the way).
- **Ticket table**: title · repo · parity · consolidated tier · blockedBy, ordered by tier.
- **Coverage (the binding 9-item inventory)**: for each of the 9 items, ran / did-not-run /
  deferred and the result. Backups is always `deferred` (verify in the DB console). Any
  `failedAudit` or `unconvergedAudits` entry is named here as `coverage UNKNOWN`.
- **Deferred ledger**: merge every child's `deferred` (attributed, e.g. "from security:
  verify-cap overflow") plus `opsDeferred` (backups) plus enterprise-only ops.
- **What's solid**: the genuine production strengths, so the gate is decision-ready, not a
  fear list.

Nothing is created in Linear until Thomas approves, and none of the above is written to a
report file (D10). On approval, create via `orca linear create`, wire blockedBy, and
re-validate each with `--issue`.

### Launch verdict (§5 honesty), computed, never hardcoded

- **GO** only if **zero Blockers** AND all **9** inventory items produced a verdict (every
  audit ran and converged; every ops check resolved or is a legitimately Deferred
  un-verifiable like backups).
- **CONDITIONAL** if no Blockers but some items are Deferred in a way that gates launch (e.g.
  backups unverified, staging gate absent, a child audit did not converge): name the
  conditions.
- **NO-GO** if any Blocker stands.
- **A `failedAudit` forces at most CONDITIONAL and names itself as the blocker**: a partial
  sweep can never read green. The coverage table makes any non-running or unconverged audit
  visible.

---

## Phase 4 — Output

```markdown
## Prod-Readiness Complete

**Scope**: {what was swept}
**Verdict**: {GO | CONDITIONAL | NO-GO}, {the single top blocker, or "clean: all 9 verdicted, zero blockers"}

| Consolidated tier | Findings | Tickets |
|---|---|---|
| Blocker | {N} | {created / pending approval} |
| High | {N} | {…} |
| Medium | {N} | {…} |
| Low / Info | {N} | {…} |

**Inventory (9)**: security {ran/deferred} · tests {…} · performance {…} · code-quality {…} · observability {…} · multi-instance {…} · background durability {…} · backups {deferred} · staging {…}
**Tickets**: {the final ORB-N table, identifier · title · repo · tier · blockedBy, or "clean: nothing to ticket"}
**Top blocker**: {the single highest-priority ticket standing between here and launch, or "none"}
```

---

## Guardrails — do NOT

- **Write a report file, or create tickets unattended.** The output is a consolidated Linear
  ticket set plus a verdict headline, behind the one approval gate; nothing is persisted to
  `.claude/audits/` and nothing is created before Thomas approves (D10).
- **Invent ops findings to look thorough.** A clean ops check earns a plain "ready," not a
  manufactured nit. An ops finding with no concrete anchor plus risk is not a finding.
- **Hardcode a verdict, the QA-env state, or the backup state.** The workflow discovers
  staging plus background topology at runtime per repo; the workflow set and the QA env drift
  (#211). What a repo read cannot verify goes to the Deferred ledger, never to "clean."
- **Paste enterprise checklists.** SOC2 / SIEM / multi-region / DR drills get one acknowledging
  Deferred line, not a finding each; right-size to a solo, pre-scale app.
