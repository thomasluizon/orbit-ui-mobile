# Orbit Testing

> **At a glance** - how to write a test in orbit-ui-mobile and the catalog of every suite.
> - Unit-only policy (Vitest); the only sanctioned E2E is the post-deploy web smoke suite.
> - Assert behavior and data-attributes, never class names or implementation details.
> - Six suites: web / mobile / shared unit, web Playwright e2e (which IS the post-deploy smoke), Stryker mutation.
> - orbit-api has its own xUnit suite, documented in that repo.
> - Read the whole doc before adding a suite, a CI test job, or an e2e spec.

Every feature ships behavior tests. A test that cannot fail when the behavior breaks is worse than no test. This doc is the canonical suite catalog; `/audit-tests` and `/pr-review` judge tests against the rubric it points to.

## How to write a test here

- **Behavior, not implementation.** Assert what the user or caller observes: rendered text, a `data-*` attribute, a returned value, a thrown error. Never assert class names, call order, or private state. Those pass while the behavior is broken and block honest refactors.
- **Three axes.** A real test covers the happy path **and** an edge case **and** a failure case. Invalid input must be *rejected*, not just valid input accepted.
- **Factories over literals.** Build fixtures with `packages/shared/src/__tests__/factories.ts` so a schema change updates every test in one place.
- **Mock at the boundary.** Mobile: mock at the hook level (query by role or `testID`). Web: mock `next/navigation` and server actions, query by role or `data-*`. Shared: no mocks, pin the pure logic directly.
- **Parity.** A behavior that lands on both platforms gets a test on both platforms in the same change (the cross-platform parity rule).
- **Property tests** for pure shared logic (`@fast-check/vitest`) when a value range matters more than a single example.

## What to avoid (the anti-patterns `/audit-tests` encodes)

Happy-path-only; rubber-stamp / assertion-free; "asserts a mock was called" tautologies; over-mocked tests that exercise the mock instead of the code; implementation-coupled tests (call-order or private state); snapshot-as-crutch. The full rubric with severities is `.claude/skills/audit-tests/rubric.md`.

## Suite catalog

| Suite | Where | Command | What it proves |
|---|---|---|---|
| Web unit | `apps/web` | `npm test -w @orbit/web` (`vitest run`) | web component / hook / server-action behavior via data-attributes, not classes |
| Mobile unit | `apps/mobile` | `npm test -w @orbit/mobile` (`vitest run`) | mobile component / hook behavior (`@testing-library/react-native`, query by role / testID) |
| Shared unit | `packages/shared` | `npm test -w @orbit/shared` (`vitest run`, + `@fast-check/vitest` property tests) | the Zod contract, utils, validation, query keys, and theme data |
| All unit | root | `npm test` (`turbo run test`) | the three unit suites above; CI adds coverage thresholds |
| Web Playwright e2e / post-deploy smoke | `apps/web/e2e` | `npm --workspace @orbit/web run test:smoke` (`playwright test`, needs `SMOKE_BASE_URL`) | the real core flows (auth, create habit, log habit, Astra create-habit, paywall) against the live deployment |
| Stryker mutation | `packages/shared` | `npm run mutation -w @orbit/shared` (`stryker run`) | that the shared unit tests actually kill mutants (effectiveness, not coverage percent) |

**The e2e suite and the post-deploy smoke suite are one and the same.** There is no second, PR-time Playwright suite. Playwright specs live in `apps/web/e2e/`, run under the `smoke` project, require `SMOKE_BASE_URL`, and execute against the live production deployment, never localhost. This is the only sanctioned E2E.

## CI mapping

- **`.github/workflows/test.yml`** - build, unit tests with coverage thresholds (`turbo run test -- --coverage`), type-check, lint, dependency-audit, design-guard, and contract-drift, on PRs to `main`.
- **`.github/workflows/mutation.yml`** - PR-incremental Stryker run on `packages/shared`, report-only.
- **`.github/workflows/nightly.yml`** - full-scope Stryker mutation run.
- **`.github/workflows/smoke-prod.yml`** - the Playwright smoke suite, post-deploy against the live production deployment.

## orbit-api

The backend (`orbit-api`, a sibling repo) has its own xUnit + FluentAssertions unit suite under its `tests/` folder, with test accounts wired via the `TEST_ACCOUNTS` env var. It is unit-only too (the integration suite was removed). See that repo's `CLAUDE.md` and `tests/CLAUDE.md` for its conventions; it is out of scope for this catalog.
