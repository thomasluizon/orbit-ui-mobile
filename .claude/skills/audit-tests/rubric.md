# The Intelligent-Test Rubric

What `/audit-tests` scores every test against. The premise: **a test earns its place only
if it would fail when the behavior breaks.** Count and coverage % are not in this rubric —
on purpose. A green bar over tests that can't fail is the thing the audit exists to catch.

Orbit is **unit-tests-only** in both repos (the integration/E2E suites were removed
deliberately). Frontend: Vitest + React Testing Library. Backend: xUnit + FluentAssertions.
Suggested tests use the real builders in `packages/shared/src/__tests__/factories.ts`.

> **Machine-read.** `.claude/workflows/audit.mjs` passes this file's path to every tests
> finder as "the contract for what counts and how findings are shaped"
> (`KIND.tests.checklist`). Editing this file edits the finder prompt; the skill's pipeline,
> guardrails, and output shape belong in `SKILL.md`, which the finders never read.

---

## The three axes — score every test

A genuinely useful test scores on all three. Most weak tests have only the first.

### 1. Behavior — does it assert the observable outcome?

- Asserts what the code *does* (return value, state change, emitted effect, error thrown)
  from the **caller's** vantage — not how it does it.
- For a React component: asserts what the user sees / can do (RTL: query by role/text,
  assert rendered output), not internal state or which hook fired.
- For a handler: asserts the response shape / persisted change / `Result` outcome.
- **Fails the axis** when it asserts a private internal, a call happened, or re-checks a
  literal it just set up.

### 2. Edge — does it probe the boundaries?

- Empty / zero / null / single-item / first-and-last / max-length.
- **Timezone edges** for anything date-driven (Orbit's overdue / due-today logic is a
  recurring bug class — a test that only checks "today" in one timezone is thin).
- Numeric bounds and range limits where validators enforce them.
- **Fails the axis** when only the typical mid-range input is exercised.

### 3. Failure — does it test what goes wrong?

- The rejected input, the thrown exception, the `Result.Failure`, the 4xx.
- The unauthorized attempt (wrong/absent userId → denied), the forged webhook → rejected.
- The downstream-error path (dependency throws → the unit handles it as specified).
- **Fails the axis** when only the success path exists — the single most common gap.

A test hitting all three pins behavior on a real path. One axis (usually Behavior-only) =
a **happy-path-only** test → a finding on a critical path.

---

## Smell list — flag these explicitly

| Smell | Tell | Why it's a liability |
|---|---|---|
| **Happy-path-only** | success case only; no rejection, edge, or failure | the break that ships is almost always an untested edge/failure |
| **Rubber-stamp** | `expect(true).toBe(true)`; asserts a mock was *called*; re-asserts the arranged literal | can't fail when behavior breaks — pure false safety |
| **Over-mocked** | so much stubbed the unit under test never runs; the mock *is* the test | verifies the mock, not the code |
| **Implementation-coupled** | asserts private state, call order, or internal method names | breaks on safe refactors; blocks change instead of enabling it |
| **Tautological** | assertion mirrors the implementation line-for-line | passes by construction; proves nothing |
| **Assertion-free** | calls the code, asserts nothing (or only "did not throw") | a smoke check masquerading as a test |
| **Snapshot-as-crutch** | giant auto-snapshot standing in for real assertions | re-baselined on every change; nobody reads the diff |

A test carrying a smell on a **critical path** (auth, billing, AI tools, data-isolation)
is **High** or **Critical**; off a critical path it's **Medium**.

---

## Severity mapping

| Severity | Situation |
|---|---|
| **Critical** | A Phase-2 critical path (auth / billing / AI tools / data-isolation) has **no test**, or only a rubber-stamp. A break here ships silently. |
| **High** | A critical path is **happy-path-only** — success tested, but rejection/edge/failure absent. Or an implementation-coupled test on a critical path. |
| **Medium** | Missing edge/failure case off the critical path; a smell on non-critical code. |
| **Low / Info** | Minor: a clearer assertion, a redundant test, a naming nit. Listed in a deep audit, not blocking. |

---

## Aggregate read & delete-vs-rewrite

The per-test axis scores roll up into the skill's **Suite-health** metric — *what share of the
suite is Behavior-only vs pins all three axes* — so systemic rot reads as a number, not a pile
of individual findings.

A smelled test is not only something to add coverage *around* — it is a **delete-or-rewrite**
action in its own right:
- **Delete** when it can't fail and there's nothing real to assert (assertion-free, tautological,
  `expect(mock).toHaveBeenCalled()` with no outcome, a snapshot nobody reads). It is a liability;
  removing it removes false safety.
- **Rewrite** when the path *is* worth pinning but the assertion is wrong (asserts internals / call
  order → assert the observable outcome instead).

---

## Every finding ships the fix

A finding is not "this test is weak." It is the **concrete test to add or rewrite**:

```
[SEVERITY] <what's untested / what the weak test misses>
· path: <critical path or feature>
· location: <the test file, or the source file that needs a test>:<line>
· gap: <the specific case that would break undetected>
· test to add:
    name: <descriptive test name — reads as a behavior statement>
    arrange: <setup, using the real factory — e.g. makeHabit({ dueDate: yesterday })>
    act: <the call under test>
    assert: <the observable outcome that must hold>
· axis: <Behavior | Edge | Failure — which the suite is missing here>
```

The test must be **runnable as written**: real factory, real call, an assertion that
*fails* if the behavior regresses. A suggested test that could not fail when the code
breaks is not a finding.
