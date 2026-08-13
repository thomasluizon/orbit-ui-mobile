---
name: prod-readiness
description: Pre-launch orchestrator that runs the four repo-wide audits (security, tests, performance, code-quality) in parallel via the audit workflow, adds an ops-layer audit (observability, multi-instance readiness, background durability, backups, staging), a static WCAG 2.2 AA accessibility sweep, and a dependency sweep that updates every package in both repos, then consolidates everything into ONE combined GitHub ticket set behind a single approval gate (D10), headlined by an honest launch verdict. It looks only at what no gate can check (D11); React correctness is owned by the react-doctor.yml gate, not this skill. Use before a release to know what's safe to ship. Orchestrates and consolidates; it does not re-derive the child audits' findings.
argument-hint: <both (default) | ui | api | path>
---

# Prod-Readiness

**Input**: $ARGUMENTS

Run a pre-launch readiness sweep across **both** Orbit repos and open ONE consolidated,
severity-ranked GitHub ticket set (D10) behind a single approval gate, headlined by an honest
launch verdict. This skill is an **orchestrator**: the **`prod-readiness` dynamic workflow**
(`.claude/workflows/prod-readiness.mjs`) runs the four audit workflows in parallel (**Haiku
fan-out**), adds the ops-layer audit and the static-a11y sweep none of them cover, verifies its
own findings, and returns everything; **you (Opus) consolidate** the return into one combined
ticket table and a launch verdict, and **you run the dependency sweep** (Phase 2b), the one
layer that edits code and therefore cannot run inside the read-only workflow.

**Golden rule: orchestrate, don't re-derive.** Each audit workflow owns its own analysis, its
own adversarial Verify, and its own loop; this skill's workflow **invokes** them and
**inherits** their verification, never re-running their finding logic. The ops layer, the
static-a11y layer, and the dependency sweep are the only analysis this skill adds. Three things
are non-negotiable: no audit is silently skipped (every one runs-and-reports or lands in the
Deferred ledger with a reason), no ops or a11y finding ships without surviving a challenge, and
the approval gate states what the sweep did **not** do. The output is tickets plus a verdict
plus at most two `chore(deps)` pull requests, never a persisted report (D10).

---

## Phase 0 — Provenance + binding coverage contract

The ops-layer checklist and this orchestration shape were adapted at authoring time from the
**`scaling-past-vibe` workflow base** in the `vibe-coding-workflow-skills` collection on
claudeskills.info (https://claudeskills.info), then specialized to Orbit's real operational
surface (Sentry across the three runtimes, Hangfire + `IHostedService` background work, the
`BackgroundServiceHealthCheck`, and the promote/smoke deploy workflows).

Five further upstream skills were mined at authoring time and their judgement folded into this
skill and into `.claude/skills/pr-review/rubric.md`, which is the **single consolidated
standards document** (the code-quality audit reads it as its contract, so the standards flow
into every sweep):

- `thermo-nuclear-code-quality-review` (cursor/plugins) — ambition about structural
  simplification, spaghetti-growth, canonical-layer reuse, orchestration/atomicity smells
  (rubric dimension 3).
- `prune-dead-code` (LukeberryPi/skills) — the four dead-code categories and the
  live-until-proven-dead verification rules (rubric dimension 2).
- `remove-dumb-comments` (LukeberryPi/skills) — the why-over-what comment test, kept only where
  no gate owns it: stale and lying comments (rubric dimension 2).
- `improve-codebase-architecture` (mattpocock/skills) — shallow-vs-deep modules, locality,
  seams, churn weighting (rubric dimension 3).
- `a11y-maxxing` (LukeberryPi/skills) — the WCAG 2.2 AA floor, ARIA-as-contract, claim limits,
  and the runtime matrix this skill defers (rubric dimension 10 + the workflow's A11y phase).

**Code-agent isolation**: the workflow's agents run against the project's own checkout and
read repo config. Before they start, the calling session performs the performance audit's
read-only Supabase measurement. The production connector is never exposed to a finder.
**CI / headless fallback**: if the `Workflow` tool is unavailable, run the four
`/audit-*` skills' own fallbacks inline plus the ops and a11y fan-outs, then consolidate; the
ticket set and the contract still hold.

Read **`.claude/skills/_shared/verification-protocol.md`** (the reliability contract: the
workflow runs its own coverage contract over the ops + a11y inventory plus the §2 challenge
over its own findings, and **inherits** each child audit's verify and loop; you merge every
child ledger into the approval-gate provenance) and
**`.claude/skills/_shared/audit-to-tickets.md`** (the D10 ticket-emission pipeline Phase 3
runs over the consolidated finding set).

### D11 scope

Read **`.claude/skills/_shared/gate-owned-exclusions.md`**. The ops and a11y layers this skill
adds are exactly the judgement no gate can check: whether the RUNNING system survives
production (observability, multi-instance safety, background durability, backups, a pre-prod
gate) and whether a user can complete the core journeys by keyboard or with assistive
technology. React correctness is NOT in this skill's inventory: `react-doctor.yml` is a
required CI gate and owns it, including its a11y lint rules (D11); the standing full-repo
react-doctor backlog is mechanical debt for the ORB-46 project, not a prod-readiness finding.
`Dependency Review` and `dependabot-auto-merge` gate NEW dependency regressions per PR; neither
sweeps the standing tree, so the Phase 2b sweep is not a re-flag.

**The binding inventory (§1), twelve items:**

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
| 10 | Paid-API cost caps + spend alerts | ops check | the workflow (returns as Deferred, un-verifiable from a repo read) |
| 11 | Accessibility (static WCAG 2.2 AA) | a11y check | the workflow (own §2 challenge; the runtime matrix returns as Deferred) |
| 12 | Dependency freshness | session sweep | you (Phase 2b — the only layer that edits code) |

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

Before invoking the workflow, execute `/audit-performance` Phase 1 exactly once and retain
its normalized `productionMeasurement`. Do not let each child finder query production. If
measurement cannot be read, retain the exact unavailable reason and continue; the
performance inventory item is `CODE_ONLY`, never a pass.

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/prod-readiness.mjs', args: {
  scope: '<resolved {scope}>', performanceMeasurement: productionMeasurement
} })
```

(`scriptPath` is canonical — named workflow resolution is not available in this Claude Code build.)

It runs the four `audit` workflows in parallel (each self-caps its own fan-out plus verify
plus loop), then fans out the **ops-layer** checks (observability · multi-instance ·
background durability · staging) and the **static-a11y** checks (web · mobile, WCAG 2.2 AA
floor, source-provable findings only) as Haiku finders, runs a Haiku skeptic per Blocker/High
ops or a11y finding (default-refuted), and returns:

```
{ scope,
  audits: [ { kind, findings, counts, coverage, deferred, rounds }, … ×4 ],
  opsFindings: [ { severity, check, title, location, risk, evidence, fix } ],
  a11yFindings: [ same shape, check "a11y-web" | "a11y-mobile" ],
  opsChecksRun, a11yChecksRun, opsDeferred, failedAudits, unconvergedAudits,
  performanceMeasurement }
```

`opsDeferred` always includes **backups** ("verify in the DB console: PITR plus a tested
restore path"), **paid-api-cost-caps** ("verify in each provider console: a hard monthly cap
plus a spend alert"), and **a11y-runtime-matrix** (the axe A/AA tag set, a keyboard pass, and
a screen-reader pass over the route x state x viewport x input-mode matrix need the running
app). None is repo-readable, so none may ever read as clean. `failedAudits` names any audit
workflow that errored; each forces **at most CONDITIONAL** and is named as a blocker.
`unconvergedAudits` names any child whose critic never ran dry (coverage UNKNOWN), which the
approval gate must surface.

---

## Phase 2b — Dependency sweep (session-run, edits code)

The one layer the read-only workflow cannot own: bring **every package in both in-scope repos**
current, prove it against the gates, and open at most one `chore(deps)` pull request per repo
(D4). Pull requests are **opened, never merged**, by this skill; Pullfrog reviews them like any
other PR. Run this while the Phase 2 workflow executes; neither depends on the other.

Per rule 8, confirm every CLI flag and output shape against the real invocation in this run
before scripting anything on top of it.

**orbit-ui-mobile (npm workspaces, npm 11):**

1. On a fresh branch, list the drift: `npm outdated --json` at the root (it covers the
   workspaces). Exit 1 with a populated object IS the drift signal, not a failure; the object is
   keyed by package name with `current` / `wanted` / `latest` / `dependent` (the workspace) /
   `location`.
2. Update everything it names, majors included. Two pin classes take a deliberate step instead
   of a blind bump:
   - **Expo-managed packages** (`apps/mobile`): align through the Expo CLI's own resolver.
     `npx expo install --check` exits 0 with `Dependencies are up to date` when aligned and
     exits 1 with `Found outdated dependencies` when not; `npx expo install --fix` applies the
     aligned versions, and packages under `expo.install.exclude` in `apps/mobile/package.json`
     are skipped by both. The Expo SDK version itself is OUT of this sweep: an SDK major is
     its own ticket (#715 is the precedent), and the `Expo SDK Pin` gate fails any drift.
   - **Root `overrides` pins** (react, react-dom, and the security pins): bump the override and
     every dependent range together so the override never points below the installed version.
3. `npm install`, then the full local proof: `npm run type-check && npm run lint && npm test
   && npm run build`.

**orbit-api (per-project PackageReference, no central management):**

1. On a fresh branch, list the drift and the known-vulnerable set:
   `dotnet list Orbit.slnx package --outdated --format json` and
   `dotnet list Orbit.slnx package --vulnerable --include-transitive --format json`. Always
   `--format json` (the human output localizes to the host language): the envelope is
   `{ version, parameters, sources, projects[] }`, each drifted project carries
   `frameworks[].topLevelPackages[]` with `id` / `requestedVersion` / `resolvedVersion` /
   `latestVersion`, and a project with nothing to report omits `frameworks`. Exit is 0 whether
   or not drift exists, so read the JSON, never the exit code.
2. Update every named package per project with `dotnet add <csproj> package <id>` (installs the
   latest and rewrites the `PackageReference`). The .NET SDK pin in `global.json` is OUT of
   this sweep, same reasoning as the Expo SDK.
3. `dotnet build Orbit.slnx` and `dotnet test Orbit.slnx`.

**Holdback rule — nothing is silently skipped.** A package that cannot land (breaking major,
peer conflict, red gate after the bump) is reverted to keep the PR green and recorded as a
**holdback**: name, current → latest, and the exact failure. Every holdback becomes a finding
in the Phase 3 consolidated set — **High** when the held-back version fixes a vulnerability the
`--vulnerable` / audit output names, **Medium** otherwise — so it is ticketed, never forgotten.

**Sweep verdict** for inventory item 12: `SWEPT` (everything current, gates green),
`SWEPT_WITH_HOLDBACKS` (green PR plus the named holdbacks), or `FAILED` (the sweep itself could
not complete — forces at most CONDITIONAL and names itself as a blocker). Push each branch and
open the `chore(deps)` PR before the Phase 3 gate; the PRs are provenance the gate cites, and
they wait on Pullfrog like everything else.

---

## Phase 3: Consolidate and emit tickets (Opus, D10)

### Unified ladder (severity normalization for ranking)

Consolidate the child + ops + a11y + dependency findings into one severity spine, tagging each
with its **source audit + native label** so nothing is silently relabeled. This ranking orders
the ticket table and drives the verdict; it is not a report:

| Consolidated tier | Maps from |
|---|---|
| **Blocker** | security Tier 1 · tests Critical · performance Critical · code-quality Critical · ops Blocker · a11y Blocker |
| **High** | security Tier 2 · tests High · performance High · code-quality High · ops High · a11y High · a vulnerable dependency holdback |
| **Medium** | tests Medium · performance Medium · code-quality Medium · ops Medium · a11y Medium · a non-vulnerable dependency holdback |
| **Low / Info** | performance Low/Info · code-quality Low/Info |
| **Out-of-scope / acknowledged** | security Tier 3 · enterprise-only ops |

### Emit the consolidated ticket set

Run the shared pipeline in **`.claude/skills/_shared/audit-to-tickets.md`** over the **whole
consolidated finding set** (all four children plus the ops, a11y, and dependency-holdback
findings), as ONE combined table behind ONE approval gate. Do not run each child skill's own
gate; prod-readiness invokes the audit workflows directly and owns the single consolidated
emission.

- Dedupe across sources (a finding that surfaced in two children is one ticket) and fold
  findings that share a fix and PR into one ticket (D4).
- Map each to its `repo:*` from `location`; an ops finding is almost always `repo:api`, an
  a11y finding always `repo:ui`. A ui fix that depends on an api change is the ui ticket
  blockedBy the api ticket.
- Draft each body to the 6.2 template and re-read it against that template before proposing it. An
  ops ticket's Problem carries the `risk` (what breaks in production and when); Technical
  details carry `evidence`; Acceptance criteria name the observable ready-state (the scheduler
  fires once cluster-wide, work survives a restart, the pre-prod gate exists). An a11y ticket's
  acceptance criteria name the completed task (the journey completes by keyboard, the dialog
  returns focus), never a score.

### HARD GATE, headlined by the launch verdict

Present ONE message and get ONE approval (mirror /ticket phase D). The headline is the
**launch verdict**; the body is the combined ticket table plus the full provenance:

- **Verdict**: {GO | CONDITIONAL | NO-GO}, one calibrated line (why, and the single thing in
  the way).
- **Ticket table**: title · repo · parity · consolidated tier · blockedBy, ordered by tier.
- **Coverage (the binding 12-item inventory)**: for each of the 12 items, ran / did-not-run /
  deferred and the result. Backups is always `deferred` (verify in the DB console). Any
  `failedAudit` or `unconvergedAudits` entry is named here as `coverage UNKNOWN`.
- **Measured performance**: show the top ten query shapes by rows with calls, rows per call,
  bytes per row, calls per month, and monthly egress. Headline the byte-weighted top finding.
  If the measurement is unavailable, show `CODE_ONLY` and the exact reason in this section.
- **Dependency sweep**: the verdict, the two `chore(deps)` PR links, and the holdback table
  (name, current → latest, failure, tier).
- **Deferred ledger**: merge every child's `deferred` (attributed, e.g. "from security:
  verify-cap overflow") plus `opsDeferred` (backups, paid-API cost caps, the a11y runtime
  matrix) plus enterprise-only ops.
- **What's solid**: the genuine production strengths, so the gate is decision-ready, not a
  fear list.

Nothing is created in the ticket tracker until Thomas approves, and none of the above is written to a
report file (D10). On approval, create via `gh issue create`, wire blockedBy, and
re-validate each with `--issue`.

### Launch verdict (§5 honesty), computed, never hardcoded

- **GO** only if **zero Blockers** AND all **12** inventory items produced a verdict (every
  audit ran and converged; every ops and a11y check resolved or is a legitimately Deferred
  un-verifiable like backups, the paid-API cost caps, and the a11y runtime matrix; the
  dependency sweep is `SWEPT` or `SWEPT_WITH_HOLDBACKS` with every holdback ticketed), and
  performance is `MEASURED`.
- **CONDITIONAL** if no Blockers but some items are Deferred in a way that gates launch (e.g.
  backups unverified, staging gate absent, a child audit did not converge, performance is
  `CODE_ONLY`, or the dependency sweep `FAILED`): name the conditions.
- **NO-GO** if any Blocker stands.
- **A `failedAudit` forces at most CONDITIONAL and names itself as the blocker**: a partial
  sweep can never read green. The coverage table makes any non-running or unconverged audit
  visible.

---

## Phase 4 — Output

```markdown
## Prod-Readiness Complete

**Scope**: {what was swept}
**Verdict**: {GO | CONDITIONAL | NO-GO}, {the single top blocker, or "clean: all 12 verdicted, zero blockers"}

| Consolidated tier | Findings | Tickets |
|---|---|---|
| Blocker | {N} | {created / pending approval} |
| High | {N} | {…} |
| Medium | {N} | {…} |
| Low / Info | {N} | {…} |

**Inventory (12)**: security {ran/deferred} · tests {…} · performance {…} · code-quality {…} · observability {…} · multi-instance {…} · background durability {…} · backups {deferred} · staging {…} · paid-API cost caps {deferred} · accessibility {static ran; runtime matrix deferred} · dependencies {SWEPT | SWEPT_WITH_HOLDBACKS | FAILED}
**Measured performance**: {MEASURED with top finding and top-ten table | CODE_ONLY with reason}
**Dependency sweep**: {the chore(deps) PR links + holdback count, or "FAILED: reason"}
**Tickets**: {the final ORB-N table, identifier · title · repo · tier · blockedBy, or "clean: nothing to ticket"}
**Top blocker**: {the single highest-priority ticket standing between here and launch, or "none"}
```

---

## Guardrails — do NOT

- **Write a report file, or create tickets unattended.** The output is a consolidated GitHub
  ticket set plus a verdict headline, behind the one approval gate; nothing is persisted to
  `.claude/audits/` and nothing is created before Thomas approves (D10).
- **Merge the `chore(deps)` PRs, or bump a platform SDK inside the sweep.** The sweep opens
  PRs; merging stays with the normal review flow. The Expo SDK and the `global.json` .NET SDK
  pins are their own tickets, never a sweep side effect. Never `--no-verify`, and never leave a
  red gate in the sweep branch: revert to a holdback instead.
- **Invent ops or a11y findings to look thorough.** A clean check earns a plain "ready," not a
  manufactured nit. A finding with no concrete anchor plus risk is not a finding, and a static
  a11y claim that needs the live DOM belongs to the deferred runtime matrix, not the findings.
- **Hardcode a verdict, the QA-env state, or the backup state.** The workflow discovers
  staging plus background topology at runtime per repo; the workflow set and the QA env drift
  (#211). What a repo read cannot verify goes to the Deferred ledger, never to "clean."
- **Paste enterprise checklists.** SOC2 / SIEM / multi-region / DR drills get one acknowledging
  Deferred line, not a finding each; right-size to a solo, pre-scale app.
