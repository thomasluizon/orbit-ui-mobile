# Orbit Testing

> **At a glance** - how to write a test in orbit-ui-mobile and the catalog of every suite.
> - Unit-only policy (Vitest); the only sanctioned E2E against prod is the post-deploy web smoke suite.
> - Assert behavior and data-attributes, never class names or implementation details.
> - Seven suites: web / mobile / shared unit, web Playwright e2e (which IS the post-deploy smoke), the hermetic web visual-regression PR gate, Stryker mutation.
> - The visual gate is web-only by locked decision (mobile Android visual regression is out of scope) and hermetic: it renders the PR's own build against a local mock orbit-api with a fake-JWT session, so it needs no prod and no secrets. Baselines are Linux-seeded in CI, never from a dev machine.
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
| Web visual regression (hermetic PR gate) | `apps/web/e2e/visual` | `VISUAL=1 SMOKE_BASE_URL=http://127.0.0.1:3000 npm run test:visual -w @orbit/web` | that four web surfaces (login, Today, habit-create, paywall) match their Linux pixel baselines — rendered from the PR build against a local mock orbit-api, no prod |
| Stryker mutation | `packages/shared` | `npm run mutation -w @orbit/shared` (`stryker run`) | that the shared unit tests actually kill mutants (effectiveness, not coverage percent) |

**The prod-E2E suite and the post-deploy smoke suite are one and the same.** The `smoke` project's `*.spec.ts` require `SMOKE_BASE_URL` and execute against the live production deployment, never localhost — the only sanctioned E2E against prod. The **one** other Playwright suite is the `visual` project (`*.visual.ts`), which is deliberately NOT a prod E2E: it is fully hermetic (localhost `next start` + a local mock orbit-api, fake-JWT session, no secrets) and exists only to catch pixel-level UI regressions at PR time. The two projects share `playwright.config.ts` but never overlap — `smoke` matches `*.spec.ts`, `visual` matches `*.visual.ts`, and the mock-backed `webServer` array only boots when `VISUAL=1`.

### How the hermetic visual gate works

- **Mock-BFF lever.** Every server-side upstream fetch resolves `process.env.API_BASE`, so the `webServer` array repoints `API_BASE` at a tiny local fixtures server (`e2e/visual/mock-api/server.ts`, `127.0.0.1:5099`). It serves one hand-authored fixture per endpoint the four surfaces touch, each typed `satisfies` its `@orbit/shared` type and `.parse()`-validated at boot — so a shared-schema change reds the job (contract stays honest). An unmapped path logs and returns an empty body; promote it to a real fixture if a surface needs it.
- **Fake-auth.** The BFF never verifies the JWT signature (only base64url-decodes `exp`), so `visual.setup.ts` mints an unsigned, far-future-`exp` JWT straight into a saved `storageState` — no OTP, no prod, no signing key, minted at runtime (no committed token). The login spec runs unauthenticated (empty `storageState`).
- **Determinism.** Fixed 412×915 viewport, `reducedMotion`, `timezoneId: 'UTC'`, `locale: 'en-US'`, a `screenshot.css` neutralizer (animations/caret/scroll), and a frozen browser clock (`page.clock.setFixedTime`) so every computed date is stable. Free-tier profile fixture suppresses every overlay/trial banner.
- **Baselines are Linux-only.** Never commit a baseline rendered on a dev machine — pixels differ across OSes. Baselines live under `apps/web/e2e/visual/__screenshots__/**` (git-lfs tracked) and are generated on the pinned `ubuntu-24.04` runner only.
- **Re-baseline flow.** When a UI change is intentional, add the `visual:update` label to the PR (or run the Visual Regression workflow with `update=true`); `visual.yml` regenerates the Linux baselines with `--update-snapshots` and commits them back to the branch, then goes green.
- **Automated design review.** On a red gate, a second `visual.yml` job runs the `design-reviewer` subagent over the uploaded `*-diff.png` and comments a per-surface verdict (intentional improvement → re-baseline, or regression → fix). Event-driven on failure only.

## CI mapping

- **`.github/workflows/test.yml`** - build, unit tests with coverage thresholds (`turbo run test -- --coverage`), type-check, lint, dependency-audit, design-guard, and contract-drift, on PRs to `main`.
- **`.github/workflows/mutation.yml`** - PR-incremental Stryker run on `packages/shared`, report-only.
- **`.github/workflows/nightly.yml`** - full-scope Stryker mutation run.
- **`.github/workflows/smoke-prod.yml`** - the Playwright smoke suite, post-deploy against the live production deployment.
- **`.github/workflows/visual.yml`** - the hermetic web visual-regression gate, on PRs touching `apps/web/**` or `packages/shared/**` (pinned `ubuntu-24.04`, no secrets). Compares four surfaces against the Linux baselines; seeds/updates them on the `visual:update` label or `workflow_dispatch` (`update=true`); on failure runs the `design-reviewer` job.

## orbit-api

The backend (`orbit-api`, a sibling repo) has its own xUnit + FluentAssertions unit suite under its `tests/` folder, with test accounts wired via the `TEST_ACCOUNTS` env var. It is unit-only too (the integration suite was removed). See that repo's `CLAUDE.md` and `tests/CLAUDE.md` for its conventions; it is out of scope for this catalog.
