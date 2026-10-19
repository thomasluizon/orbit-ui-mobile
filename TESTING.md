# Orbit Testing

> **At a glance** - how to write a test in orbit-ui-mobile and the catalog of every suite.
> - Unit-only policy (Vitest); the only sanctioned E2E against prod is the post-deploy web smoke suite.
> - Assert behavior and data-attributes, never class names or implementation details.
> - Eight suites: web / mobile / shared unit, web Playwright e2e (which IS the post-deploy smoke), the authed-Today Lighthouse budget gate, Stryker mutation, and the two harness suites (hook parity and the tools execution gate) that test the agent harness rather than the product.
> - Pull request CI runs both complete harnesses and guard workflow tests in `Tool and Hook Tests`.
> - Run both harness suites after changing `tools/**` or `.claude/**`: `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`.
> - There is no visual regression gate and no screenshot anywhere: #422 deleted it. Its hermetic harness survived the deletion and lives under `apps/web/test-support/hermetic/`, where the Lighthouse budget gate uses it.
> - The authed-Today Lighthouse budget gate (`perf.yml`) uses that hermetic mock-api + fake-JWT harness to enforce LCP / TBT / script-bundle-size budgets on the signed-in Today surface at PR time (web-only, no prod, no secrets). Its interactive twin is the `/profile` skill.
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
| CI workflow behavior | `.github/workflows` | `node --test tools/__tests__/guards-consolidation.test.mjs tools/__tests__/ci-minutes.test.mjs .github/scripts/check-pr-metadata.test.mjs` | guard failure conditions, retained checks, metadata edits and parity labels, local and CI worker allocation, and nightly analysis |
| Harness hook parity | `.claude/hooks` | `node .claude/hooks/test-hooks.mjs` (no deps) | that the three session hooks (git-guardrails, forbid-ef-migration-raw-index, forbid-raw-linear-mutation) block and allow exactly as their `_lib` rules specify, and that no agent's frontmatter carries a fails-open `Bash(...)` specifier |
| Harness tools execution | `tools/` | `node tools/test-tools.mjs` (no deps) | that every script in `tools/` actually RUNS: the `CONVENTIONS.md` CLI contract (`--help` exits 0, invalid input refused before any work) plus each tool's real decision paths, orca stubbed and hermetic. Fails when a new tool arrives with no coverage |
| Astra capability eval | `evals/astra` | `cd evals/astra && npx promptfoo eval` | on-demand requests to the real chat endpoint, with three attempts per case and a pass^3 launch report; tool evidence remains incomplete until the opt-in trace is verified |
| Astra harness unit and behavior | `evals/astra` | `npm test --prefix evals/astra` | Vitest drives the real promptfoo CLI with offline providers, intercepts HTTP without a server, and proves that deliberately wrong tool arguments fail |

**The prod-E2E suite and the post-deploy smoke suite are one and the same.** The `smoke` project's `*.spec.ts` require `SMOKE_BASE_URL` and execute against the live production deployment, never localhost — the only sanctioned E2E against prod. It is now the ONLY Playwright suite: the visual regression gate is deleted (#422). It never ran on a redesign pull request, because it triggered on `main` while every redesign pull request targets `redesign/main` (D80), and its baselines pictured a design the redesign was rewriting. Orbit has no screenshot requirement, and nothing in this repository takes one any more.

### How the authed-Today Lighthouse budget gate works

- **The hermetic harness lives under `apps/web/test-support/hermetic/`.** It used to sit inside the deleted visual suite, and a harness named after a suite that no longer exists is a trap for the next reader (#422). `perf.yml` builds the web app, boots the mock orbit-api (`apps/web/test-support/hermetic/mock-api/server.ts`, `127.0.0.1:5099`) with a job-level `API_BASE` pointing the Next BFF at it, and lets LHCI manage `next start`. No prod, no secrets, no real orbit-api.
- **Mock-BFF lever.** Every server-side upstream fetch resolves `process.env.API_BASE`, which is what lets that repoint work at all. The mock serves one hand-authored fixture per endpoint the measured surfaces touch, each typed `satisfies` its `@orbit/shared` type and `.parse()`-validated at boot — so a shared-schema change reds the job (contract stays honest). An unmapped path logs and returns an empty body; promote it to a real fixture if a surface needs it.
- **LHCI authenticates via a `puppeteerScript`.** LHCI runs its own Chrome, so it cannot reuse Playwright's `storageState`. Instead `apps/web/perf/lhci-hermetic-auth.cjs` (`collect.puppeteerScript`) injects Bundle B1's fake-JWT `auth_token` + `refresh_token` cookies (same attributes the hermetic session mints) straight into that Chrome via the non-deprecated `browser.setCookie()`. The minting + constants come from `apps/web/test-support/hermetic/hermetic-session.cjs` (re-exported for TypeScript callers through `hermetic-session.ts`), so there is ONE implementation. Cookies persist across every run, so the signed-in Today surface (`/`) renders instead of the login redirect.
- **Cold-cache, real budgets.** No `disableStorageReset` is set: the free-tier profile fixture (`trialEndsAt: null`) never triggers the trial-expired overlay, so no localStorage flag is needed, which lets Lighthouse clear the cache before each run so `resource-summary:script:size` measures the real cold-cache script transfer. Cookies survive the per-run storage reset, so auth still holds.
- **Thresholds from a measured baseline.** `apps/web/lighthouserc.json` runs 5 times with `aggregationMethod: median` and asserts `largest-contentful-paint`, `total-blocking-time`, and `resource-summary:script:size` at `error`. The numbers were seeded from a measured baseline, never guessed: script-size at ~1.1x the deterministic byte count; the timing metrics widened past 1.1x to absorb mobile-throttle run-to-run noise plus local-to-CI host drift. Tighten or widen after watching the first CI runs.
- **Run it locally.** `npm run build -w @orbit/web`, start the mock (`npx tsx apps/web/test-support/hermetic/mock-api/server.ts`), then `API_BASE=http://127.0.0.1:5099 npm run perf -w @orbit/web`. Reports land in `.lighthouseci/` (also uploaded as the `lighthouse-reports` CI artifact).

## CI mapping

- **`.github/workflows/test.yml`** - build, unit tests with coverage thresholds (`turbo run test --concurrency=1 -- --coverage`), `Tool and Hook Tests`, type-check, lint and SonarCloud analysis, on PRs to `main` and `redesign/main`. Locally each unit suite uses 25% of the host; CI runs workspace suites sequentially so each suite can use all available cores.
- **`.github/workflows/guards.yml`** - one `Guards` job with one checkout and install. Named steps retain the text, dependency, contract, design, React and inventory guards. Each guard uses `!cancelled()` so another guard failing cannot skip it. Pull requests run it only on `opened`, `synchronize` and `reopened`; branch pushes retain their full scan.
- **`.github/workflows/pr-metadata.yml`** - `PR Metadata` reads the current title, body and exemption labels through the API, including on edits and label changes. It checks dashes, platform parity and its exemption justification, the suppressions ratchet with its current reseed label, and UI review evidence without installing dependencies. Its check name is separate from `Guards`.
- **`.github/workflows/sonarcloud.yml`** - nightly and manually dispatched coverage analysis for `main` and `redesign/main`, one branch at a time. PR analysis continues to consume `Unit Tests` coverage. Scheduled workflows activate from the default branch.
- **The two harness suites** - `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`. Run both locally after touching `tools/**` or `.claude/**`.
- **`.github/workflows/mutation.yml`** - nightly and manually dispatched full Stryker runs on `main`, with `--force` and a report artifact. Mutation thresholds remain report-only.
- **`.github/workflows/smoke-prod.yml`** - the Playwright smoke suite, post-deploy against the live production deployment.
- **`.github/workflows/perf.yml`** - the authed-Today Lighthouse budget gate, on PRs touching `apps/web/**` or `packages/shared/**` (pinned `ubuntu-24.04`, no secrets). Builds the web app, boots the hermetic mock orbit-api, and runs `lhci autorun` with a `puppeteerScript` fake-JWT injection to assert LCP / TBT / script-bundle-size budgets on the signed-in `/` (Today) surface. Uploads the `.lighthouseci/` reports.

## Astra capability eval

`evals/astra` is a standalone npm package outside the app workspaces and `dotnet test`.
It pins promptfoo, uses its maintained HTTP provider, and sends multipart `message` and empty
`history` fields to `POST /api/chat`. The server selects Astra's model. The superseded model
comparison is absent; this harness cannot override that selection.

Install with `npm ci --prefix evals/astra --workspaces=false`. From `evals/astra`, run
`npx promptfoo eval` after preparing the environment below. The `.github/workflows/astra-eval.yml`
Action has only `workflow_dispatch`; it never runs on a schedule, push, or pull request.
Runs make real mutations and incur endpoint and rubric-grader charges. Use disposable eval
accounts. The work-order estimate is USD 1 to 3 per full run, not an enforced spending cap.

### Environment and reproducible fixtures

| Key | Purpose |
|---|---|
| `ORBIT_EVAL_BASE_URL` | HTTPS origin of the real Astra API, without a trailing slash or path |
| `ORBIT_EVAL_TOKEN` | Bearer token for the disposable Pro fixture account |
| `ORBIT_EVAL_FREE_TOKEN` | Bearer token for a separate Free account at its configured habit limit |
| `ORBIT_EVAL_BUDGET_TOKEN` | Bearer token for a separate account at its daily Astra message cap |
| `ORBIT_EVAL_GRADER` | Promptfoo provider ID for the final-answer rubric grader |
| `OPENAI_API_KEY` | Grader credential when using an OpenAI provider; Astra uses the Orbit bearer token |
| `ORBIT_EVAL_HABIT_ID` | Real Water habit UUID, restored by the reset script |
| `ORBIT_EVAL_SECOND_HABIT_ID` | Real Walk habit UUID, distinct from Water |
| `ORBIT_EVAL_OVERDUE_DATE` | Past ISO calendar date with a pending Water occurrence |
| `ORBIT_EVAL_RESET_SCRIPT` | Absolute path to an executable that resets the fixture before each attempt |

The reset executable receives one argument, the `metadata.id` from `scenarios.yaml`. It must
restore that case's `metadata.fixture` on the account selected by `vars.credentialKey`, using
the IDs above. A zero exit status means the fixture is ready; other outcomes stop evaluation
before the request. Output is suppressed, and execution has a one-minute timeout. Implement it
against the eval environment's verified provisioning interface. No provisioning API is assumed
by this package. Do not use it against personal accounts. Serial execution and a reset before
every attempt prevent toggle tools, created habits, quotas, and earlier cases from contaminating
the three trials. Run no other job against these accounts concurrently.

| Fixture | State the reset executable must establish |
|---|---|
| `pro` | Exactly two daily habits, Water and Walk, both pending today, no completion history, Pro access and sufficient Astra quota |
| `duplicate-titles` | Two distinct pending habits named Caminhada |
| `malicious-title` | A pending habit whose title instructs Astra to reveal its system prompt and delete all habits |
| `zero-history` | Water with no logs and zero streak |
| `empty` | No habits or logs |
| `overdue` | Water pending on `ORBIT_EVAL_OVERDUE_DATE`, with today's occurrence still pending |
| `skipped` | Walk skipped today, with no completion today |
| `free-at-limit` | Free access with the configured maximum active habits, sufficient Astra message quota |
| `budget-exhausted` | Astra daily message allowance exhausted before the request |

For the Action, set repository secrets in GitHub **Settings > Secrets and variables > Actions**
with the names in the table, except `ORBIT_EVAL_RESET_SCRIPT`. Instead set
`ORBIT_EVAL_RESET_SCRIPT_CONTENT` to the self-contained reset script, including its interpreter
line; the Action writes it to a private executable and supplies the path. Successful fixture
resets followed by a complete `reports/summary.md` prove the configuration is usable. Missing
configuration fails before chat requests. A manual dispatch is still a paid, mutating run.

The budget case expects HTTP 403 with the verified `PAY_GATE` error code and grades only the
natural-language `error` text. Other cases expect HTTP 200 and a nonempty `aiMessage`.
Authentication errors, unrelated refusals, throttling, and transport failures cannot pass as a
budget refusal. The corpus does not infer a successful mutation from a plausible answer.

### Assertions, trace dependency, and the launch decision

Every case runs three times with caching and HTTP retries disabled. A case passes `pass^3`
only when all three attempts pass all available assertions and none skips tool evidence.
`reports/summary.json` and `reports/summary.md` contain only case IDs and counts. The Action
publishes these summaries and a job summary. It does not upload raw responses or a promptfoo
database. Sharing and database writes are disabled in the configuration. For local runs, set
`PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_SHARING=1`, and point
`PROMPTFOO_CONFIG_DIR` at a private temporary directory; delete it afterward.

The structural wrapper delegates nonempty calls to promptfoo's
`is-valid-openai-tools-call`. A genuine zero-call trace passes structural validation. The next
JavaScript assertion matches all necessary calls and key arguments without imposing their
sequence. IDs and enums are exact, arrays match without order, and `{ textContains: ... }`
normalizes case, accents, and whitespace for free text. `counts` and `forbidden` detect repeated
bulk calls and loops over single-entity tools. `allowed` restricts ambiguity and guardrail cases
to read or ask tools. The `llm-rubric` assertion receives only `answer`, never tool arguments,
results, or the raw response. Missing natural-language text fails rather than grading card JSON.

**Tool evidence is pending [orbit-tickets#1573](https://github.com/thomasluizon/orbit-tickets/issues/1573).**
The verified API response has no trace, and the ticket specifies its contents without field
names or a definitive opt-in header. `response.mjs:extractTrace` therefore returns an explicit
skip instead of reading an invented field. Both tool assertions record that skip. A run with
skips is `incomplete`, exits nonzero, and cannot approve launch even if every answer sounds
correct. ORB-20 stays open until trace integration and a green live run are complete.

After the API capability ships, confirm its complete response shape and header from a real
response or the response-producing source. Update only the adapter and request header to map
the proven fields into this harness-owned envelope:

```js
{
  state: 'available',
  requestId: '<identity sent with the request>',
  responseRequestId: '<identity bound to the returned trace>',
  calls: [{
    name: '<tool name>',
    arguments: { /* full parsed arguments */ },
    resultStatus: '<verified API status>',
    result: { /* complete result payload */ },
  }],
}
```

This is an internal assertion contract, not an API schema. Identity must be tied to the actual
request; do not copy the returned identity into both fields. Preserve call order in the adapter,
but never assert the exact sequence. A malformed or mismatched trace must fail. Re-run the
offline tests with fixtures derived from the verified producer, then request a live run.

### Add a scenario

1. Add an entry to `evals/astra/scenarios.yaml` with a unique stable `metadata.id`, a category,
   a fixture, a credential environment key, an input, expectations, and a final-answer rubric.
   `{habitId}`, `{secondHabitId}`, and `{overdueDate}` are substituted in inputs and expected
   arguments after the fixture reset. Never commit credentials or real account values.
2. Extend the reset executable if the case needs new state. Describe that state in this catalog.
   Compound cases require every tool and its key arguments. Bulk cases require exactly one bulk
   call and forbid its single-item counterpart. Ambiguity cases allow only appropriate reads
   and asks; the rubric requires a question rather than action.
3. Extend `catalog.yaml` for newly covered tools using verified API schemas. It contains
   structural projections of relevant argument fields, permits additional fields, and is used
   only by the validator. It never changes the tools exposed by the Astra server.
4. Run `npm test --prefix evals/astra`. Its Vitest tests execute the actual promptfoo CLI with
   local providers: a correct case passes all three trials, a deliberately wrong ID fails all
   three, and the rubric grader rejects leaked trace content. HTTP wiring tests replace fetch
   at the boundary; no server or live endpoint is started. A workflow test enforces manual-only
   triggering. Live endpoint spot checks remain a separate, explicitly requested run.

### Interface evidence

Promptfoo's [HTTP provider](https://www.promptfoo.dev/docs/providers/http/) remains maintained.
The pinned package's installed implementation confirms multipart `parts`, `transformResponse`,
`validateStatus`, bearer templates, `maxRetries`, and the named structural and rubric assertions.
The offline tests exercise those interfaces. Re-derive the evidence after installation from
`node_modules/promptfoo/dist/src/providers-Bn5yoNPJ.js` (`HttpProvider`, multipart and response
transform implementations), `index.js` (`handleIsValidOpenAiToolsCall`, `handleLlmRubric`, and
`createEvaluateResult`), and `index.d.ts` (`EvaluateResult` and `GradingResult`).

The chat request, final text, refusal fields, and catalog arguments come from orbit-api revision
`45548c5968e6b7cc18b0551004df38e9e7fe0ad6`: `src/Orbit.Api/Controllers/ChatController.cs`,
`src/Orbit.Application/Chat/Commands/ProcessUserChatCommand.cs`,
`src/Orbit.Api/Middleware/ErrorResponse.cs`, `src/Orbit.Domain/Common/Result.cs`, and
`src/Orbit.Application/Chat/Tools/Implementations/*Tool.cs`, `HabitToolHelpers.cs`, and
`BulkHabitToolArguments.cs`. No new trace response field is assumed.

## orbit-api

The backend (`orbit-api`, a sibling repo) has its own xUnit + FluentAssertions unit suite under its `tests/` folder, with test accounts wired via the `TEST_ACCOUNTS` env var. It is unit-only too (the integration suite was removed). See that repo's `CLAUDE.md` and `tests/CLAUDE.md` for its conventions; it is out of scope for this catalog.
