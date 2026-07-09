---
name: audit-tests
description: Test-suite QUALITY audit across both Orbit repos — not coverage percentage. Reports critical-path coverage (auth, billing, AI tools), happy-path-only / rubber-stamp detection, and missing edge/failure cases against an "intelligent test" rubric (behavior + edge + failure), then suggests concrete missing tests. Use when the user asks to audit tests, check test quality, or find untested critical paths. Not for running tests (use /validate).
argument-hint: <path | repo | blank=both repos>
---

# Audit Tests

**Input**: $ARGUMENTS

Audit the **quality** of the test suites across both repos — whether the tests that exist
actually pin behavior on the paths that matter, not how green the coverage bar is. A repo
can be 90% covered and still untested where it counts. Output: where the critical paths
are thin, which tests rubber-stamp the happy path, and the concrete tests to add.

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

Load `rubric.md` (the workflow's finders read it — it defines what "intelligent" means) and
**`.claude/skills/_shared/verification-protocol.md`**. **Unit only** — if the return flags
an integration/E2E/real-DB harness, treat it as out-of-policy (it was deliberately
removed), don't reward it.

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
  counts, coverage, deferred, rounds, scopeLabel }
```

`fix` carries the concrete test to add; `rationale` carries what a break it would NOT catch.

**Fallback (no `Workflow` tool):** run the fan-out inline — `Explore` finders (Haiku, 3
concurrent) over the five suite areas against `rubric.md`, Haiku skeptics (each Critical;
High batched one-per-~5 or capped at top 15), a completeness pass — same findings shape.

---

## Phase 4 — Synthesize the report (Opus)

```bash
mkdir -p .claude/audits
```

**Output path**: `.claude/audits/tests-{scope}.md`

Quantify suite health from the finder scores in the return, bucket findings by severity,
and split the actionable "add" vs "delete" lists:

```markdown
# Test-Quality Audit: {SCOPE}

**Scope**: {scopeLabel}
**Rubric**: `.claude/skills/audit-tests/rubric.md` (behavior + edge + failure)
**Verdict**: {1 line — e.g. "Critical paths covered except Play webhook rejection; 3 happy-path-only suites"}

## Suite health — the scale of the rot

> Quantify it so pervasive weakness reads as a number, not something buried in a list.

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

{The 10 highest-leverage tests to write or rewrite FIRST, ranked. Each: one line · severity ·
the path it protects. Fewer than 10 only if the suite is healthy.}

## Concrete tests to add

{A numbered, ready-to-write list. Each: name · file it goes in · arrange/act/assert ·
the factory to use. This is the actionable core.}

## Tests to delete or rewrite — false safety

{Existing tests to REMOVE or rewrite because they give false safety (rubber-stamp /
assertion-free / tautological / snapshot-as-crutch). Each: file:line · which smell ·
delete vs rewrite · if rewrite, the observable assertion that would make it real.}

## Deferred — in scope but not verdicted

{From the workflow's `deferred` (High gaps past the verify cap, loop bound) + non-critical
paths not scored + policy-excluded integration/E2E — each with a one-line reason. "Nothing
deferred — full coverage" if empty.}

## What's well-tested

{Suites that genuinely pin behavior — name them so they're not "improved" into noise.}
```

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
  you synthesize its return. Only re-invoke for a coverage gap.
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
