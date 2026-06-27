---
name: audit-tests
description: Test-suite QUALITY audit across both Orbit repos — not coverage percentage. Reports critical-path coverage (auth, billing, AI tools), happy-path-only / rubber-stamp detection, and missing edge/failure cases against an "intelligent test" rubric (behavior + edge + failure), then suggests concrete missing tests. Use when the user asks to audit tests, check test quality, or find untested critical paths. Not for running tests (use /validate).
argument-hint: <path | repo | blank=both repos>
context: fork
---

# Audit Tests

**Input**: $ARGUMENTS

Audit the **quality** of the test suites across both repos — whether the tests that exist
actually pin behavior on the paths that matter, not how green the coverage bar is. A repo
can be 90% covered and still untested where it counts. Output: where the critical paths
are thin, which tests rubber-stamp the happy path, and the concrete tests to add.

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

**Self-contained**: no network call at run time, no marketplace dependency. It reads local
test + source files and runs `git` / `rg`; it does **not** run the suite (that's
`/validate`) — it *reads* the tests. Works unchanged in CI (the #213 requirement).

---

## Phase 1 — Resolve scope & load context

Parse `$ARGUMENTS`: blank → **both repos**; `api`/`backend` → orbit-api; `frontend`/`web`/
`mobile` → orbit-ui-mobile; a path → just that path.

| Repo | Test layout |
|---|---|
| `orbit-ui-mobile` | Vitest. `apps/web/**/*.{test,spec}.{ts,tsx}`, `apps/mobile/**`, `packages/shared/**/__tests__/`. Factories: `packages/shared/src/__tests__/factories.ts`. Configs: `*/vitest.config.ts`. |
| `orbit-api` | xUnit + FluentAssertions in `tests/`. Test accounts via `TEST_ACCOUNTS` env. |

Load `rubric.md` (read first — it defines what "intelligent" means), root + scoped
`CLAUDE.md` testing sections, the factories file (so suggested tests use the real
builders), and **`.claude/skills/_shared/verification-protocol.md`** (the shared
reliability contract — its Verify phase and Deferred ledger run below). **Unit only** — if
you find an integration/E2E/real-DB harness, flag it as out-of-policy (it was deliberately
removed), don't reward it.

---

## Phase 2 — Map the critical paths first

Before judging individual tests, identify the paths where a silent break hurts most, and
ask of each: **is there a test, and would it actually fail if the behavior broke?**

| Critical path | Where | What a real test must pin |
|---|---|---|
| **Auth** | `orbit-api` auth handlers; web/mobile auth flow | login success + wrong-password rejection + expired/invalid token + unauthorized access to a protected route is denied |
| **Billing / subscription** | Stripe (web) + Play (mobile) verify + webhook handlers; pay-gating | a valid purchase grants entitlement; a forged/unsigned webhook is rejected; gated features deny free users; entitlement state transitions |
| **AI / MCP tools** | orbit-api agent-operation + tool handlers | a tool acts only on the caller's data; ownership is enforced; bulk/destructive ops behave; malformed args are rejected |
| **Data-isolation** | every user-scoped query/command handler | a user cannot read/mutate another user's rows (the test passes the wrong userId and asserts denial/empty) |
| **Date/timezone** | anything routing through `IUserDateService` | overdue / due-today logic across timezone edges (a frequent Orbit bug class — see memory) |
| **Validation** | FluentValidators + domain guards | invalid input is *rejected*, not just valid input accepted |

A critical path with **no test**, or only a happy-path test, is the audit's top-priority
finding — tag it **Critical**.

---

## Phase 3 — Fan out and apply the rubric per test

Delegate to **`Explore` subagents, 3 concurrent**, each owning a non-overlapping test
area, each scoring tests against `rubric.md`. Slice by suite location (web / mobile /
shared / api-application / api-domain). Each subagent prompt embeds:

> **Objective**: audit the tests in `<area>` against `.claude/skills/audit-tests/rubric.md`.
> **Read the rubric first.** For each test file: (1) does it cover a critical path from the
> skill's Phase-2 map? (2) score it Behavior / Edge / Failure per the rubric; (3) flag
> happy-path-only and rubber-stamp tests (assert-nothing, asserts a mock was called,
> tautological, over-mocked so the real code never runs). For each gap, write the **concrete
> missing test** — name it, state the arrange/act/assert, and use the real factories. Return
> findings only.

Apply the rubric's smell list (defined fully in `rubric.md`):

- **Happy-path-only** — only the success case; no rejection, no edge, no failure.
- **Rubber-stamp** — asserts a mock was called, or `expect(true).toBe(true)`, or re-asserts
  the literal it just set up; can't fail when the behavior breaks.
- **Over-mocked** — so much is stubbed that the unit under test never actually executes.
- **Implementation-coupled** — asserts private internals / call order instead of observable
  behavior; breaks on safe refactors, the rubric's explicit anti-pattern.
- **Missing edge** — no empty/zero/null/first-last/boundary/timezone-edge case.
- **Missing failure** — the error path, the thrown exception, the rejected input is untested.

---

## Phase 4 — Verify (adversarial + completeness)

Before writing the report, run `.claude/skills/_shared/verification-protocol.md` — a gap
ships only after it survives a challenge, and the sweep must prove it covered the paths
that matter.

1. **Adversarial pass (§2).** Refute before shipping — but **bound the fan-out** so the
   audit stays affordable on a systemically-weak suite (where Critical/High findings can
   run to dozens). **Every Critical finding gets its own skeptic; High findings are batched
   (one skeptic per ~5, grouped by area) or capped at the top 15 by leverage, the remainder
   rolled into Deferred.** Each skeptic (3 concurrent) reads the cited test + source in full
   context and argues the gap is a false positive (pinned by a test elsewhere, the test
   *would* fail on a real break, a duplicate, the severity inflated). Default to refuted
   when uncertain. Drop or downgrade anything the skeptic disproves; survivors ship with
   confidence.
2. **Completeness critic + loop-until-dry (§3).** Run a fresh critic asking *"what did this
   audit NOT examine — a critical path never mapped, a test area skipped, a suite only
   half-read?"* Spawn a focused finder round on each gap it names; repeat until a round
   surfaces nothing new (cap: 2 dry rounds — log it).
3. **Deferred ledger (§4).** Roll everything in scope but un-verdicted (non-critical paths
   not scored, policy-excluded integration/E2E, a suite left unread) into the report's
   **Deferred** section, one reason each — never implied as covered.

---

## Phase 5 — Report

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/tests-{scope}.md`

```markdown
# Test-Quality Audit: {SCOPE}

**Scope**: {both repos / repo / path}
**Rubric**: `.claude/skills/audit-tests/rubric.md` (behavior + edge + failure)
**Verdict**: {1 line — e.g. "Critical paths covered except Play webhook rejection; 3 happy-path-only suites"}

## Suite health — the scale of the rot

> Quantify it so pervasive weakness reads as a number, not something buried in a list of
> individual findings. This is the section that answers "are our tests systemically bad?"

- **Files scored**: {N} of {total}
- **Behavior-only (happy-path)**: {X} ({X/N %})
- **Carry a smell** (rubber-stamp / over-mocked / assertion-free / impl-coupled / snapshot-crutch): {Y} ({Y/N %})
- **Pin behavior on all three axes**: {Z} ({Z/N %})
- **One-line read**: {e.g. "~60% happy-path-only — the green bar is mostly theater" vs "largely healthy; gaps are localized"}

## Critical-path coverage

| Path | Tested? | Quality | Gap |
|---|---|---|---|
| Auth | yes/no | strong/happy-only/none | {what's missing} |
| Billing / subscription | … | … | … |
| AI / MCP tools | … | … | … |
| Data-isolation | … | … | … |
| Timezone / dates | … | … | … |
| Validation | … | … | … |

## Findings

### Critical — untested critical path
{path + the exact test to add, or "None"}

### High — happy-path-only / rubber-stamp on a critical path
{file + why it can't catch a break + the test to add, or "None"}

### Medium — missing edge/failure case off the critical path
{… or "None"}

## Fix first — top 10 by leverage

{The 10 highest-leverage tests to write or rewrite FIRST, ranked — so a systemically-weak
suite is actionable instead of paralyzing. Each: one line · severity · the path it protects.
Drawn from the Critical/High findings below. Fewer than 10 only if the suite is healthy.}

## Concrete tests to add

{A numbered, ready-to-write list. Each: name · file it goes in · arrange/act/assert ·
the factory to use. This is the actionable core — make it copy-pasteable-into-a-task.}

## Tests to delete or rewrite — false safety

{Existing tests to REMOVE or rewrite because they give false safety (rubber-stamp /
assertion-free / tautological / snapshot-as-crutch). Deleting a test that can't fail is a
real, valuable action — it's a liability, not coverage. Each: file:line · which smell ·
delete vs rewrite · if rewrite, the observable assertion that would make it real.}

## Deferred — in scope but not verdicted

{Per the verification protocol §4: paths or test areas the sweep did not score with a
verdict, suites left unread, policy-excluded integration/E2E — each with a one-line
reason. "Nothing deferred — full coverage" if the contract was met.}

## What's well-tested

{Suites that genuinely pin behavior — name them so they're not "improved" into noise.}
```

---

## Guardrails — do NOT

- **Score by count or coverage %.** A green bar over rubber-stamp tests is the exact
  failure this audit exists to catch. Judge by what a test would *fail on*.
- **Reward implementation-coupled tests.** A test asserting call-order / private state is a
  liability (it blocks refactors); flag it even if it "passes."
- **Suggest integration or E2E tests.** Both repos are **unit-only** by policy — the broad
  suites were removed deliberately. Suggest unit tests; the only sanctioned E2E is the
  separate ~5-test web smoke suite (#227), out of this audit's scope.
- **Run the suite.** This reads tests; `/validate` runs them.
- **Pad with vague advice.** Every finding ships the concrete test to add — name,
  location, assertions — or it isn't a finding.
- **Write the tests during the audit.** Findings + concrete specs first; implement only if
  the user asks after.

---

## Output

```markdown
## Audit Complete — Test Quality

**Scope**: {what was audited}
**Verdict**: {1-line}
**Suite health**: {X}% happy-path-only · {Y}% smell-carrying · {Z}% pin all three axes (of {N} files scored)

| Severity | Count |
|---|---|
| Critical (untested critical path) | {N} |
| High (rubber-stamp / happy-only on critical path) | {N} |
| Medium (missing edge/failure) | {N} |

**Report**: `.claude/audits/tests-{scope}.md`
**Fix first**: {the single most important test to write or delete first}
```
