---
name: audit-tests
description: Test-suite QUALITY audit across both Orbit repos, opening one Linear ticket per verified gap after a human approval gate (D10), not a coverage percentage. Finds critical-path coverage holes (auth, billing, AI tools), happy-path-only / rubber-stamp tests, and missing edge/failure cases against an "intelligent test" rubric (behavior + edge + failure), each ticket carrying the concrete test to add. Test QUALITY is judgement no gate checks (D11). Use when the user asks to audit tests, check test quality, or find untested critical paths. Not for running tests (use /validate).
argument-hint: <path | repo | blank=both repos>
---

# Audit Tests

**Input**: $ARGUMENTS

Audit the **quality** of the test suites across both repos — whether the tests that exist
actually pin behavior on the paths that matter, not how green the coverage bar is. A repo
can be 90% covered and still untested where it counts. Output: one Linear ticket per verified
gap (D10), each carrying the concrete test to add, behind one approval gate, never a report
that rots. Test QUALITY (would this test fail on a real break?) is judgement no gate can
check (D11): CI runs the suite green or red, but nothing gates whether green means anything.

The fan-out, the adversarial verify, and the loop-until-dry run as the **`audit` dynamic
workflow** (`.claude/workflows/audit.mjs`) — **Haiku finders + Haiku skeptics**,
deterministic orchestration — so Opus spends tokens only on **this synthesis**.

**Golden rule**: judge tests by what they'd *catch*, never by how many there are. A test
that can't fail when the behavior breaks is worse than no test — it's a false sense of
safety. Every finding names the file, what it fails to catch, and the specific test to add.

---

## Phase 0 — Provenance & self-containment

The "intelligent test" rubric in `rubric.md` was assembled at authoring time from
**testing-skill bases on claudeskills.info** (https://claudeskills.info — the
test-quality / reviewing-tests bases) and the testing-pyramid + behavior-over-
implementation canon, then specialized to Orbit's reality: **unit-tests-only** (the
integration/E2E suites were removed in both repos — see memory), Vitest on the frontend,
xUnit + FluentAssertions on the backend, and the critical paths that actually carry risk
here (auth, billing, AI tools). That URL is the single WHY-with-URL the comment policy
allows.

**Self-contained**: the workflow's finder/skeptic agents *read* local test + source files
and run `git` / `rg`; they do **not** run the suite (that's `/validate`). **CI / headless
fallback**: if the `Workflow` tool is unavailable, run the fan-out inline per Phase 3's
fallback (the #213 requirement).

---

## Phase 1 — Resolve scope & load context

Parse `$ARGUMENTS` into a `{scope}` token: blank → `both`; `api`/`backend` → `api`;
`frontend`/`web`/`mobile` → `ui`; a path → the path itself.

| Repo | Test layout |
|---|---|
| `orbit-ui-mobile` | Vitest. `apps/web/**/*.{test,spec}.{ts,tsx}`, `apps/mobile/**`, `packages/shared/**/__tests__/`. Factories: `packages/shared/src/__tests__/factories.ts`. Configs: `*/vitest.config.ts`. |
| `orbit-api` | xUnit + FluentAssertions in `tests/`. Test accounts via `TEST_ACCOUNTS` env. |

`TESTING.md` (repo root) is the canonical suite catalog: where each suite lives, its exact command, and what it proves.

Load `rubric.md` (the workflow's finders read it, it defines what "intelligent" means),
**`.claude/skills/_shared/verification-protocol.md`** (the reliability contract), and
**`.claude/skills/_shared/audit-to-tickets.md`** (the D10 ticket-emission pipeline Phase 4
runs). **Unit only:** if the return flags an integration/E2E/real-DB harness, treat it as
out-of-policy (it was deliberately removed), don't reward it.

**D11 scope** (see `.claude/skills/_shared/gate-owned-exclusions.md`): test QUALITY is
inherently judgement, since no gate scores whether a test would catch a break. The one line
to hold: CI's pass/fail and any coverage bar are the mechanical layer; this audit owns whether
the green is real. Never file a finding that only says "coverage is below X%".

---

## Phase 2 — Map the critical paths first

Before reading the workflow's return, hold the map of where a silent break hurts most —
the workflow's finders score each test against it (**is there a test, and would it actually
fail if the behavior broke?**):

| Critical path | Where | What a real test must pin |
|---|---|---|
| **Auth** | `orbit-api` auth handlers; web/mobile auth flow | login success + wrong-password rejection + expired/invalid token + unauthorized access to a protected route is denied |
| **Billing / subscription** | Stripe (web) + Play (mobile) verify + webhook handlers; pay-gating | a valid purchase grants entitlement; a forged/unsigned webhook is rejected; gated features deny free users; entitlement state transitions |
| **AI / MCP tools** | orbit-api agent-operation + tool handlers | a tool acts only on the caller's data; ownership is enforced; bulk/destructive ops behave; malformed args are rejected |
| **Data-isolation** | every user-scoped query/command handler | a user cannot read/mutate another user's rows (the test passes the wrong userId and asserts denial/empty) |
| **Date/timezone** | anything routing through `IUserDateService` | overdue / due-today logic across timezone edges (a frequent Orbit bug class — see memory) |
| **Validation** | FluentValidators + domain guards | invalid input is *rejected*, not just valid input accepted |

A critical path with **no test**, or only a happy-path test, is the top-priority finding —
the workflow tags it **Critical**.

---

## Phase 3 — Run the audit workflow (Haiku fan-out + adversarial verify)

Invoke the `Workflow` tool (this skill's instructions are the opt-in):

```
Workflow({ scriptPath: '.claude/workflows/audit.mjs', args: { kind: 'tests', scope: '<resolved {scope}>' } })
```

(`scriptPath` is canonical — named workflow resolution is not available in this Claude Code build.)

It fans out **one Haiku finder per suite area** — `web` · `mobile` · `shared` ·
`api-application` · `api-domain` — each scoring tests against `rubric.md` (Behavior / Edge /
Failure) and flagging happy-path-only, rubber-stamp (assert-nothing / asserts a mock was
called / tautological), over-mocked, and implementation-coupled tests, and writing the
**concrete missing test** (name · arrange/act/assert · the real factory). It runs a **Haiku
skeptic** per **Critical** gap and a capped pass over **High** gaps (the remainder rolled to
Deferred — this bounds a systemically-weak suite), then loops until dry. It returns:

```
{ findings: [{ severity, title, category, location, evidence, rationale, fix, reference }],
  counts, coverage, deferred, rounds, converged, convergenceReason, criticErrors, scopeLabel }
```

**Completeness is a computed field, not an assumption.** `converged === true` only after the
critic ran and returned empty. If `converged !== true` (e.g. `criticErrors ≥ 2` from a
rate-limit), the sweep did NOT prove completeness — report it as "coverage UNKNOWN —
${convergenceReason}", never as a clean/complete audit. A dead verifier is not a clean pass.

`fix` carries the concrete test to add; `rationale` carries what a break it would NOT catch.

**Fallback (no `Workflow` tool):** run the fan-out inline — `Explore` finders (Haiku, 3
concurrent) over the five suite areas against `rubric.md`, Haiku skeptics (each Critical;
High batched one-per-~5 or capped at top 15), a completeness pass — same findings shape.

---

## Phase 4: Emit tickets (D10), not a report

Run the shared pipeline in **`.claude/skills/_shared/audit-to-tickets.md`**: one Linear
ticket per verified gap, drafted to the 6.2 template, validated by
`node tools/check-ticket.mjs --file`, presented behind ONE approval gate, then created via
`orca linear create` and re-validated with `--issue`.

Tests-specific mapping into the 6.2 body, where the deliverable of each ticket IS a test:

- **Problem / why it matters** carries the critical path at risk and, from `rationale`, the
  real break the current suite would NOT catch. A Critical (untested critical path) and a
  High (rubber-stamp on a critical path) are separate tickets.
- **Test scenarios** carries the concrete test from `fix`: name · arrange/act/assert · the
  real factory from `packages/shared/src/__tests__/factories.ts`. This section is the point
  of the ticket.
- **Acceptance criteria** state that the new test exists AND fails against the pre-fix
  behavior (a test that cannot go red is the exact failure this audit exists to catch).
- A "delete or rewrite this false-safety test" finding is its own ticket: Scope = remove or
  rewrite the named file:line; Acceptance criteria = the observable assertion that makes it
  real, or its removal. Unit-only: never draft an integration/E2E ticket.
- `repo:*` from `location` (`orbit-api` -> `repo:api`, `apps/*` / `packages/*` -> `repo:ui`).
  A ui test ticket carries `parity:yes|no`. A test ticket rarely changes pixels, so it rarely
  needs `visible-effect`; if a body names a user-visible surface, check-ticket will require
  the D7 line and you add it.

At the approval gate, present **suite health** (files scored, % happy-path-only, % smell-
carrying, % pinning all three axes) and the **critical-path coverage** table (auth, billing,
AI/MCP, data-isolation, timezone, validation) as the provenance, plus the **Deferred ledger**
(High gaps past the verify cap, non-critical paths not scored, policy-excluded E2E) and the
convergence state, so Thomas approves knowing the scale of the rot. None of it is written to
disk.

---

## Guardrails — do NOT

- **Score by count or coverage %.** A green bar over rubber-stamp tests is the exact
  failure this audit exists to catch. Judge by what a test would *fail on*.
- **Reward implementation-coupled tests.** A test asserting call-order / private state is a
  liability (it blocks refactors); flag it even if it "passes."
- **Suggest integration or E2E tests.** Both repos are **unit-only** by policy. Suggest unit
  tests; the only sanctioned E2E is the separate ~5-test web smoke suite (#227), out of scope.
- **Run the suite.** This reads tests; `/validate` runs them.
- **Re-run the workflow's analysis.** It owns the scoring, the skeptic pass, and the loop;
  you turn its return into tickets. Only re-invoke for a coverage gap.
- **Pad with vague advice.** Every ticket ships the concrete test to add (name, location,
  assertions) in Test scenarios, or it isn't a ticket.
- **File a coverage-percentage finding.** The green bar is the mechanical layer (D11); this
  audit owns whether the green is real.
- **Write a report file, or create tickets unattended.** The output is Linear tickets behind
  the one approval gate; nothing is persisted to `.claude/audits/`.
- **Write the tests during the audit.** Tickets + concrete specs first; implement only if the
  user asks after.

---

## Output

```markdown
## Audit Complete — Test Quality

**Scope**: {what was audited}
**Verdict**: {1-line}
**Suite health**: {X}% happy-path-only · {Y}% smell-carrying · {Z}% pin all three axes (of {N} files scored)

| Severity | Findings | Tickets |
|---|---|---|
| Critical (untested critical path) | {N} | {created / pending approval} |
| High (rubber-stamp / happy-only on critical path) | {N} | {…} |
| Medium (missing edge/failure) | {N} | {…} |

**Tickets**: {the final ORB-N table, identifier · title · repo · blockedBy, or "clean: critical paths pin behavior; no judgement-level gaps"}
**Fix first**: {the single most important ticket to pick up first}
```
