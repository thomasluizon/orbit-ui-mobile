# Orbit Testing

> **At a glance** - how to write a test in orbit-ui-mobile and the catalog of every suite.
> - Unit-only policy (Vitest); the only sanctioned E2E against prod is the post-deploy web smoke suite.
> - Assert behavior and data-attributes, never class names or implementation details.
> - Eight suites: web / mobile / shared unit, web Playwright e2e (which IS the post-deploy smoke), the authed-Today Lighthouse budget gate, Stryker mutation, and the two harness suites (hook parity and the tools execution gate) that test the agent harness rather than the product.
> - The two harness suites are run BY HAND after any change to `tools/**` or `.claude/**`: `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`. The `Harness Execution` CI job was removed from branch protection on 2026-08-04, because a broken harness self-check froze every product merge.
> - The authed-Today Lighthouse budget gate (`perf.yml`) uses a hermetic mock-api + fake-JWT harness to enforce LCP / TBT / script-bundle-size budgets on the signed-in Today surface at PR time (web-only, no prod, no secrets). Its interactive twin is the `/profile` skill.
> - orbit-api has its own xUnit suite, documented in that repo.
> - Read the whole doc before adding a suite, a CI test job, or an e2e spec.

Every feature ships behavior tests. A test that cannot fail when the behavior breaks is worse than no test. This doc is the canonical suite catalog; `/audit-tests` judges tests against the rubric it points to.

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
| Web perf budget (authed Today Lighthouse) | `apps/web` (`perf.yml`) | build web, boot the mock-api on `:5099`, then `API_BASE=http://127.0.0.1:5099 npm run perf -w @orbit/web` (`lhci autorun`) | that the signed-in Today surface (`/`) stays within its LCP / TBT / script-bundle-size budgets, measured over 5 median runs against the local mock orbit-api |
| Stryker mutation | `packages/shared` | `npm run mutation -w @orbit/shared` (`stryker run`) | that the shared unit tests actually kill mutants (effectiveness, not coverage percent) |
| Harness hook parity | `.claude/hooks` | `node .claude/hooks/test-hooks.mjs` (no deps) | that the three session hooks (git-guardrails, forbid-ef-migration-raw-index, forbid-raw-linear-mutation) block and allow exactly as their `_lib` rules specify, and that no agent's frontmatter carries a fails-open `Bash(...)` specifier |
| Harness tools execution | `tools/` | `node tools/test-tools.mjs` (no deps) | that every script in `tools/` actually RUNS: the `CONVENTIONS.md` CLI contract (`--help` exits 0, invalid input refused before any work) plus each tool's real decision paths, orca stubbed and hermetic. Fails when a new tool arrives with no coverage |

**The prod-E2E suite and the post-deploy smoke suite are one and the same.** The `smoke` project's `*.spec.ts` require `SMOKE_BASE_URL` and execute against the live production deployment, never localhost. It is the only sanctioned E2E against prod.

### How the authed-Today Lighthouse budget gate works

- **Hermetic mock API.** `perf.yml` builds the web app, boots the mock orbit-api (`test-support/hermetic/mock-api/server.ts`, `127.0.0.1:5099`) with a job-level `API_BASE` pointing the Next BFF at it, and lets LHCI manage `next start`. The fixture server validates every response against its `@orbit/shared` schema at boot. No prod, no secrets, no real orbit-api.
- **LHCI authenticates via a `puppeteerScript`.** LHCI runs its own Chrome. `apps/web/perf/lhci-hermetic-auth.cjs` (`collect.puppeteerScript`) injects fake-JWT `auth_token` + `refresh_token` cookies straight into that Chrome via the non-deprecated `browser.setCookie()`. The minting + constants come from `apps/web/test-support/hermetic/hermetic-session.cjs`; the mock server imports its TypeScript wrapper, so there is ONE implementation. Cookies persist across every run, so the signed-in Today surface (`/`) renders instead of the login redirect.
- **Cold-cache, real budgets.** No `disableStorageReset` is set: the free-tier profile fixture (`trialEndsAt: null`) never triggers the trial-expired overlay, so no localStorage flag is needed, which lets Lighthouse clear the cache before each run so `resource-summary:script:size` measures the real cold-cache script transfer. Cookies survive the per-run storage reset, so auth still holds.
- **Thresholds from a measured baseline.** `apps/web/lighthouserc.json` runs 5 times with `aggregationMethod: median` and asserts `largest-contentful-paint`, `total-blocking-time`, and `resource-summary:script:size` at `error`. The numbers were seeded from a measured baseline, never guessed: script-size at ~1.1x the deterministic byte count; the timing metrics widened past 1.1x to absorb mobile-throttle run-to-run noise plus local-to-CI host drift. Tighten or widen after watching the first CI runs.
- **Run it locally.** `npm run build -w @orbit/web`, start the mock (`npx tsx apps/web/test-support/hermetic/mock-api/server.ts`), then `API_BASE=http://127.0.0.1:5099 npm run perf -w @orbit/web`. Reports land in `.lighthouseci/` (also uploaded as the `lighthouse-reports` CI artifact).

## CI mapping

- **`.github/workflows/test.yml`** - build, unit tests with coverage thresholds (`turbo run test -- --coverage`), type-check, lint, dependency-audit, design-guard, and contract-drift, on PRs to `main`.
- **The two harness suites** - `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`. RUN BOTH BY HAND after touching `tools/**` or `.claude/**`. They no longer run in CI: the `Harness Execution` job was removed from branch protection on 2026-08-04, because a red harness self-check blocked every product merge while the harness itself was being rebuilt. A harness that gates the product is the failure this repo just spent a week undoing.
- **`.github/workflows/mutation.yml`** - PR-incremental Stryker run on `packages/shared`, report-only.
- **`.github/workflows/smoke-prod.yml`** - the Playwright smoke suite, post-deploy against the live production deployment.
- **`.github/workflows/perf.yml`** - the authed-Today Lighthouse budget gate, on PRs touching `apps/web/**` or `packages/shared/**` (pinned `ubuntu-24.04`, no secrets). Builds the web app, boots the hermetic mock orbit-api, and runs `lhci autorun` with a `puppeteerScript` fake-JWT injection to assert LCP / TBT / script-bundle-size budgets on the signed-in `/` (Today) surface. Uploads the `.lighthouseci/` reports.

## orbit-api

The backend (`orbit-api`, a sibling repo) has its own xUnit + FluentAssertions unit suite under its `tests/` folder, with test accounts wired via the `TEST_ACCOUNTS` env var. It is unit-only too (the integration suite was removed). See that repo's `CLAUDE.md` and `tests/CLAUDE.md` for its conventions; it is out of scope for this catalog.
