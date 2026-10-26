# Orbit Testing

> **At a glance** - how to write a test in orbit-ui-mobile and the catalog of every suite.
> - Unit-first policy (Vitest), plus one local Android widget host instrumented gate; the only sanctioned E2E against prod is the post-deploy web smoke suite.
> - Assert behavior and data-attributes, never class names or implementation details.
> - For a defect missed by existing coverage, observe the unchanged test first, then the strengthened test failing before the fix; carry both observations into the PR body.
> - Chromium geometry unit cases require installed Chrome and run serially after parallel jsdom files.
> - Label guard regressions run in Vitest Chromium against the actual helpers, including composed labels, partial painted fills and press-opened popup cleanup.
> - The compact label guard covers app-authored labels and interaction fills at 320, 360, 384 and 412px in both locales. Native Android label geometry remains an open risk; its only instrumented host belongs to the widget module.
> - Eleven suites: web / mobile / shared unit, desktop configuration and native context, the local Android widget host instrumented gate, web Playwright e2e (which IS the post-deploy smoke), the hermetic layout guard, the authed-Today Lighthouse budget gate, Stryker mutation, and the two harness suites (hook parity and the tools execution gate) that test the agent harness rather than the product.
> - Script guards report as named steps in the single `Guards` job.
> - The `Tool and Hook Tests` job in `.github/workflows/test.yml` runs both harness suites on every PR to `main`, including producer-only changes. Also run `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs` locally after changing `tools/**` or `.claude/**`.
> - There is no visual regression gate and no screenshot anywhere: #422 deleted it. The hermetic harness remains and lives under `apps/web/test-support/hermetic/`, where the Lighthouse budget gate and the layout guard both use it. Hermetic builds set both API bases to the mock and check client output for production or staging API hosts. Local layout runs use `LAYOUT_PORT` to select a free port, defaulting to 3000.
> - The authed-Today Lighthouse job (`perf.yml`) uses a hermetic mock-api + fake-JWT harness on the signed-in Today surface at PR time (web-only, no prod, no secrets). It enforces median TBT and script-bundle-size budgets and reports LCP without gating because runner noise obscures regressions at that size. Its interactive twin is the `/profile` skill.
> - orbit-api has its own xUnit suite, documented in that repo.
> - Read the whole doc before adding a suite, a CI test job, or an e2e spec.

Every feature ships behavior tests. A test that cannot fail when the behavior breaks is worse than no test. This doc is the canonical suite catalog; `/audit-tests` judges tests against the rubric it points to.

## How to write a test here

Chromium geometry cases run inside Vitest with Playwright's `chrome` channel. Install Google Chrome before running the web suite. The GitHub-hosted `ubuntu-24.04` image satisfies this prerequisite. Every Chromium suite uses `__tests__/support/chromium.ts` to retain its in-flight launch through teardown, report a named launch failure within 30 seconds, and give its launch hook a separate 45 second budget. PillButton's target cases compile the actual Tailwind stylesheet and load the installed Geist font. These isolated component cases measure visible bounds, pseudo-element bounds and hit testing without an app server, network fixtures or production access; jsdom cannot resolve this layout.

The web configuration assigns test files importing the shared Chromium lifecycle to the `chromium` project, including files whose names do not mention geometry. The `jsdom` project runs the remaining files with the workspace worker cap. Locally each suite uses 25% of the host, with Chromium running serially after jsdom. CI allows each general pool to use all available cores. The Chromium and native focus groups retain their single-worker limits. Both web projects retain the 15 second test and hook budgets. Use the shared lifecycle import for every new Chromium suite so it joins that scheduling group automatically.

The web fork adapter in `apps/web/vitest/stall-diagnostics.ts` and its `phase-runner.ts` runner stay outside the Docker-excluded test tree so the image can type-check the config. The adapter loads the Vitest pool class only when creating a worker, so tooling can import the config through `node --import tsx` without loading the worker dependencies. The web fork adapter reports the active file and phase after 10 seconds without progress and fails an unfinished phase after 5 minutes. It observes module imports, tests, hooks and worker teardown in the parent process, so fake timers cannot suspend the watchdog. Final worker shutdown has a separate 5 second limit so it fails before the runner exits. A teardown failure sets a failing exit code even when every test body passed. Phase messages reach the parent directly, so fake timers and command-line reporter overrides cannot hide them. The existing test and hook budgets, Chromium scheduling and coverage thresholds still apply. `__tests__/harness/stall-diagnostics.test.ts` runs real Vitest forks with stalled imports, hooks, tests and environment teardown, plus a completed control file. It also imports the config through tsx and type-checks a copy of the config and harness without the excluded tests.

Every pull request handled by `test.yml` runs eight Chromium shards on separate runners, alongside two jsdom shards and independent mobile, desktop, shared and ESLint rule workspace runners. Each Chromium runner still executes one file at a time with one worker and the existing launch and teardown lifecycle. Web runners collect coverage with partial thresholds set to zero and emit Vitest blob reports plus JSON reports with per-file start and end times and per-test durations. The `web-unit-shard-*` artifacts retain these reports even when a shard fails. The `Unit Tests` check requires the build and every test job to succeed, verifies all ten blobs exist, and merges them with `vitest run --merge-reports` using the unchanged web coverage thresholds. It publishes the per-project timings and merged test counts in `web-unit-timings`, and the combined web, mobile, desktop configuration, shared and ESLint rule LCOV files in `unit-test-coverage` for SonarCloud. Failed, cancelled or skipped prerequisites fail the check. The SonarCloud dependency chain has no target-branch conditions, so every pull request against `main` uses the sharded path. Scheduled analysis in `sonarcloud.yml` retains sequential workspace execution with `turbo run test --concurrency=1 -- --coverage`.

Wrapped player cases reuse one page across their slides. The stylesheet and fonts load once per case, and each slide replaces the body markup before measuring. The viewport and safe-area configuration belong to the case. Test-finished cleanup aborts the case and closes its context even after a timeout, preventing an expired slide loop from advancing the following case's player.

The bad status role guard in `packages/shared/src/__tests__/theme.test.ts` walks production CSS and TypeScript under both apps on every run. It accepts direct `--status-bad` and `tokens.statusBad` references only when their syntax identifies a graphic or surface role, while named text consumers must use the text token. It asserts that the inventory of unreviewed references is empty (`{ keys: [], referenceCount: 0 }`), so any new reference whose syntax names no graphic or surface role fails the shared suite. There is no snapshot to regenerate: fix the reference, or give it an explicit graphic or surface role. Direct-reference discovery cannot infer a glyph that inherits its container color, so the mixed warning assertions keep that known case visible while #507 owns additional inherited-color shapes.

- **Behavior, not implementation.** Assert what the user or caller observes: rendered text, a `data-*` attribute, a returned value, a thrown error. Never assert class names, call order, or private state. Those pass while the behavior is broken and block honest refactors.
- **Three axes.** A real test covers the happy path **and** an edge case **and** a failure case. Invalid input must be *rejected*, not just valid input accepted.
- **Factories over literals.** Build fixtures with `packages/shared/src/__tests__/factories.ts` so a schema change updates every test in one place.
- **Fixtures follow producers.** Confirm payload shapes against the real producer or recorded external response. Never write the fixture that agrees with a guess (CLAUDE.md code standard 8).
- **Exercise the path that broke.** Advance timers through automatic replays, enter the affected mode, prove accepted destinations as well as rejection, and mount the owning composition when ownership is the behavior. A child-only test cannot prove that its parent avoids duplicate subscriptions.
- **Observe the missed regression before fixing it.** When existing coverage missed a defect, run that test unchanged before editing the test or implementation and record whether it passes with the defect present. Strengthen the test to drive the failing path, observe it fail for the intended reason with the defect still present, then fix the implementation and confirm it passes. Put both pre-fix observations, the test name, exact commands, and the final passing result in the PR body; Cloud workers record them in the committed handoff's `testResults` for delivery to the PR. Explain any observation you could not obtain instead of claiming it happened.
- **Mock at the boundary.** Mobile: mock at the hook level (query by role or `testID`). Web: mock `next/navigation` and server actions, query by role or `data-*`. Shared: no mocks, pin the pure logic directly.
- **Parity.** A behavior that lands on both platforms gets a test on both platforms in the same change (the cross-platform parity rule).
- **Property tests** for pure shared logic (`@fast-check/vitest`) when a value range matters more than a single example.

## What to avoid (the anti-patterns `/audit-tests` encodes)

Happy-path-only; rubber-stamp / assertion-free; "asserts a mock was called" tautologies; over-mocked tests that exercise the mock instead of the code; implementation-coupled tests (call-order or private state); snapshot-as-crutch. The full rubric with severities is `.claude/skills/audit-tests/rubric.md`.

## Suite catalog

Workspace `test` tasks in `turbo.json` retain default workspace inputs, upstream builds and
`coverage/**` outputs. Their additional inputs follow the files their suites read:

| Workspace | Readers and external inputs |
|---|---|
| Shared | `turbo-inputs` reads root `turbo.json` and `package.json`, and runs installed Turbo and Vitest; root `package-lock.json` covers their resolved versions and other installed test dependencies. `contract-workflows` reads `.github/workflows/contract-rebaseline.yml`. `backlog-port-source`, `theme`, `primitive-contracts`, `hermes-intl-guard`, `progress` and `segmented-control-labels` inspect `apps/{web,mobile}/**/*.{ts,tsx,js,jsx,css,xml,svg,kt}`; `interaction-clearance` also reads both platform guard files within that glob. `authored-typography` also reads root and app `.gitignore` files, native widget resources, and `design/canvas/Orbit {Busca,Wrapped,Widget Android}.dc.html`; `typography` reads `design/canvas/_ds/*/tokens/typography.css`. `shared-import-boundary` loads `eslint-rules/*.cjs` and the shared TypeScript project extending root `tsconfig.base.json`. Other contract and markdown fixtures stay inside the workspace. |
| Desktop | `release-workflow` reads `desktop-release.yml`. |
| Mobile | `ios-workflows` reads both iOS workflows; `theme` reads `DESIGN.md`; `orbit-widget` reads granted color tokens. Tests also import shared source and fixtures, including the segmented-control inventory that scans mobile call sites. |
| Web | `theme-dom` reads `DESIGN.md`; `manifest` reads the brand icon. `surface-graphic-contrast` runs the root surface scanner against web and mobile sources and shared themes. `privacy-policy-disclosure` runs the architecture generator, which reads TypeScript across all app workspaces and shared source. Other tests import shared source and fixtures, including the segmented-control inventory. |
| ESLint rules | `rules`, `no-rejecting-animation-wait` and `installed-config-lifecycle` load app ESLint configuration and TypeScript configuration. `spacing-contract` reads shared spacing definitions and generated CSS, granted spacing tokens and app CSS. App manifests and the root lockfile cover the installed app plugins and Tailwind theme loaded from outside this workspace's dependency graph. |

`npm test -w @orbit/shared -- scripts/turbo-inputs.test.mjs` runs the installed Turbo CLI in
isolated fixture repositories with local caches. It demonstrates stale success without external
inputs, then checks each consumer's real task declaration through execution markers and exit
codes. Changed or deleted external files execute the task again; unrelated root files and
workflows retain cache hits. It also checks default workspace inputs and restores coverage
artifacts from cache. A warmed outer shared task runs the desktop guard cases again after only
the desktop task configuration changes in root `turbo.json`, exposing the invalid declaration.
These tests do not parse Turbo's report fields.

| Suite | Where | Command | What it proves |
|---|---|---|---|
| Web unit | `apps/web` | `npm test -w @orbit/web` (`vitest run`) | web component / hook / server-action behavior via data-attributes, not classes |
| Mobile unit | `apps/mobile` | `npm test -w @orbit/mobile` (`vitest run`) | mobile component / hook behavior (`react-test-renderer`, query by role / testID), plus `__tests__/components/ui/sheet-callers.test.ts`, a source guard that resolves every `<Sheet>` body's style and fails on a stretch, and `__tests__/components/ui/sheet-virtualized-body.test.tsx`, which lays out the rendered tag and goal picker sheets with `yoga-layout` on a landscape and a portrait window and fails when the list runs past the sheet body |
| Android widget host instrumented | `apps/mobile/modules/orbit-widget/android/src/androidTest` | `cd apps/mobile/android && .\gradlew.bat -I ../modules/orbit-widget/android/widget-tests.init.gradle :orbit-widget:connectedDebugAndroidTest` | on a booted API 31+ device or emulator, the real `AppWidgetHostView` selects the compact and expanded size-keyed headers and preserves their synced text; this is a local gate because CI has no emulator |
| Shared unit | `packages/shared` | `npm test -w @orbit/shared` (`vitest run`, + `@fast-check/vitest` property tests) | the Zod contract, utils, validation, query keys, and theme data |
| All unit | root | `npm test` (`turbo run test`) | workspace Vitest suites; CI adds coverage thresholds; the desktop Rust suite runs separately |
| Web Playwright e2e / post-deploy smoke | `apps/web/e2e` | `npm --workspace @orbit/web run test:smoke` (`playwright test`, needs `SMOKE_BASE_URL`) | the real core flows (auth, create habit, log habit, Astra create-habit, paywall) against the live deployment |
| Web layout guard | `apps/web/e2e/layout` | `npm run build:hermetic -w apps/web`, then `npm run test:layout -w apps/web` | real text geometry and overflow for free/trial upgrade, subscription management and Wrapped final-page fixtures in en and pt-BR at 320px, 412px, 640px and 1440px, plus Wrapped frame and slide treatment at 1000px, 1024px and 1440px, and sheet panel height, body sizing and footer safe-area clearance for a short, a long and an actions-less sheet at 412px, all under a 34px CDP safe-area inset override; `label-fit.spec.ts` checks app-authored labels and interaction fills at 320, 360, 384 and 412px in both locales, waiting for fixture-backed rows and the freeze bank before every page measurement, scoping Perfil readiness to its account row, requiring rendered, visible user-text marks so hidden sidebar copies cannot satisfy or fail the check, measuring Hoje before and after its options sheet closes and the sheet while open, waiting for the Calendário day card's personal headline button and actionable event row with two connected calendars supplied through the hermetic session JWT to the server-side mock API to render its source name, marking that name separately from the time, measuring typed text within two visible lines with ellipsis for clipped text and app metadata separately on one whole line, and opening the Progresso goal filter and both screens' legend sheets through their controls with every sheet label required to stay whole; Android app label geometry remains an open risk because its only instrumented host is the widget module; starts its own hermetic API and production web server, without screenshots |
| Web perf budget (authed Today Lighthouse) | `apps/web` (`perf.yml`) | `npm run build:hermetic -w apps/web`, boot the mock-api on `:5099`, then `API_BASE=http://127.0.0.1:5099 npm run perf -w @orbit/web` | that the signed-in Today surface (`/`) stays within median TBT / script-bundle-size budgets against the local mock orbit-api; the same five runs report the LCP distribution without gating |
| Stryker mutation | `packages/shared` | `npm run mutation -w @orbit/shared` (`stryker run`) | that the shared unit tests actually kill mutants (effectiveness, not coverage percent) |
| Harness hook parity | `.claude/hooks` | `node .claude/hooks/test-hooks.mjs` (no deps) | that the three session hooks (git-guardrails, forbid-ef-migration-raw-index, forbid-raw-linear-mutation) block and allow exactly as their `_lib` rules specify, and that no agent's frontmatter carries a fails-open `Bash(...)` specifier |
| Harness tools execution | `tools/` | `node tools/test-tools.mjs` (run `npm ci` first) | that every script in `tools/` actually RUNS: the `CONVENTIONS.md` CLI contract (`--help` exits 0, invalid input refused before any work) plus each tool's real decision paths, orca stubbed and hermetic. Fails when a new tool arrives with no coverage |
| Astra capability eval | `evals/astra` | `cd evals/astra && npx promptfoo eval` | on-demand requests to the real chat endpoint, with three attempts per case and request-bound tool evidence in a pass^3 launch report |
| Desktop configuration and native context | `apps/desktop` | `npm run test -w @orbit/desktop`, then `cargo test --locked` in `src-tauri` | Installed Tauri schema, generated context and native browser handoff policy; native bundles compile in `desktop-build.yml` on macOS and Windows, without launching the app |
| Astra harness unit and behavior | `evals/astra` | `npm test --prefix evals/astra` | Vitest drives the real promptfoo CLI with offline providers, intercepts HTTP without a server, and proves that deliberately wrong tool arguments fail |

**The prod-E2E suite and the post-deploy smoke suite are one and the same.** The `smoke` project's `*.spec.ts` require `SMOKE_BASE_URL` and execute against the live production deployment, never localhost. It is the only sanctioned E2E against prod. Orbit has no screenshot requirement, and nothing in this repository takes one any more (#422).

The shared smoke authentication helper in `apps/web/e2e/support/auth.ts` uses `support/sign-in-entry.ts` to open `/login` and wait for either the email field or onboarding's existing account action. A fresh browser uses that action in either locale before waiting for `/login` and email; a returning browser reaches email directly. The helper fills `input[name="email"]` and clicks `button[type="submit"]` within that input's form. It then fills the complete configured six-digit code once in `input[name="verificationCode"][autocomplete="one-time-code"]`. The six `data-otp-cell` spans are decorative; the real code-entry hook submits automatically, so the helper must not click verify again. Email and code selectors are independent of translated labels and onboarding's alternate send-code text.

`apps/web/__tests__/pages/login.test.tsx` invokes that helper against the real login composition through a narrow jsdom driver in en and pt-BR. Fresh-entry cases mount the real auth and onboarding layouts and account action, then revisit login through the same helper without seeding draft storage. It requires one full-code verification request and rejects legacy selectors, decorative-cell fills and per-digit fills. Send-code returns no body at this seam because its caller reads none; verification stays pending at its request boundary. The hermetic `apps/web/e2e/layout/sign-in-entry.spec.ts` exercises the same entry helper through the actual fresh and returning routes in both locales, stopping at email without credentials or auth requests. These guards prove entry and DOM compatibility, while the existing production release smoke must prove authenticated session persistence, dependent flows and cleanup against the verified public host. Setup and the explicit signed-out authentication spec share the helper. Production uses only `SMOKE_TEST_EMAIL` and `SMOKE_TEST_CODE` for the pinned free-tier smoke account; configuration, reset ordering and artifact handling stay in the existing smoke workflow.

The release workflow always uploads the smoke report and failure diagnostics from `apps/web/e2e/.report` and `apps/web/e2e/.results`, including their hidden files. Missing diagnostics fail the upload step. The upload scope excludes the saved authentication state in `apps/web/e2e/.auth`.

The auth, create, log and paywall specs use `support/smoke-adapters.ts` for their redesigned controls. Navigation requires the named main navigation in either the compact tab bar or wide sidebar. Creation chooses the one-time task type, fills the labelled habit textbox and clicks its real footer submit. Logging uses an actionable click on the row's existing completion control, requires a successful Server Action response and checks immediate completion. After reload, Today hides completed habits by default, so the adapter opens List options and chooses Show done before requiring the same uniquely titled row to remain done. The response predicate matches a Server Action POST; the reloaded row supplies the independent persistence proof. Paywall checks the annual tier's current named checkout button for visibility and availability without executing checkout.

The adapters register Playwright locator handlers for only the known trial-expired and Google Calendar import dialogs. They choose Stay free or Maybe later through the real dismissal controls in either locale, including when a prompt arrives after initial navigation. Other dialogs remain blocking. `apps/web/__tests__/pages/smoke-adapters.test.tsx` drives these same adapters against the real shell, habit form, row, plan selection and AppLayout prompt sequence through a narrow jsdom driver. `smoke-log-persistence.test.tsx` mounts the real Today hook, header, list and responsive menu with controlled query and Server Action boundaries. Its reload remounts Today with a fresh query cache and persisted schedule fixture, clearing recent-completion retention. Both locales exercise Show done through the phone Sheet and desktop menu; completion absent after reload stays red despite successful transport. The driver allows actions inside their own dialog while rejecting covered outside actions. These cases prove DOM compatibility, dismissal and failure handling. The production release suite must still prove real requests, persisted completion, checkout availability, session reuse and cleanup. Smoke viewport, deadlines, account identity and artifact policy remain owned by the existing configuration and workflow.

### Compact label and interaction fill guard

Build locally with `npm run build:hermetic -w apps/web` before running the layout project. The helper sets `API_BASE` and `NEXT_PUBLIC_EVENT_API_BASE` to `http://127.0.0.1:5099` before `next build`, overriding `.env.production` for the account event stream and wake ping. It then runs `node tools/check-hermetic-web-build.mjs`, which rejects client output containing production or staging API hosts and refuses missing or empty output. `npm run test:layout -w apps/web` repeats the check before starting servers, so a later release build cannot silently replace the hermetic build. Both layout and perf workflows set these build inputs and check the output before running. Release builds retain their environment-specific inputs.

When 3000 is taken, set `LAYOUT_PORT` to a free port before both the build and the layout run. From the repository root in Bash:

```bash
export LAYOUT_PORT=3100
npm run build:hermetic -w apps/web
npm run test:layout -w apps/web
```

In PowerShell, use `$env:LAYOUT_PORT = '3100'` before the same npm commands. With `LAYOUT_PORT` unset, local runs and CI use 3000. The shared `LAYOUT_ORIGIN` drives the server port, readiness URL, spec origins and generated storage state. The hermetic build and layout server also set `NEXT_PUBLIC_SITE_URL` to that origin so auth redirects stay on the selected port. Rebuild when changing ports because Next.js inlines public environment variables.

`apps/web/e2e/layout/label-fit.spec.ts` runs in the hermetic layout project through `.github/workflows/layout.yml`. It covers Hoje, Calendário, Progresso and Perfil at 320, 360, 384 and 412px, in en and pt-BR, at the default text scale. It checks captions, tabs, selectors, buttons, row titles, headings and menu titles using rendered text fragments and clipping bounds. A label fails when its text occupies more than one line or extends outside its visible bounds, including an ellipsis or line clamp. Required captions, selectors and legends must render before measurement, so a loading surface cannot pass as an empty inventory. Legend groups must fit one row or move behind disclosure; a screen ticket that moves a legend must update the guard to open its owning disclosure and measure the labels there.

`label-fit-contract.ts` defines the app-authored label inventory. `label-fit.spec.ts` defines user text by its producing field: habit title, goal title, Google event title and calendar name, profile name and email. The guard marks their rendered elements with `data-layout-text-origin="user"` before measuring labels. Only those elements are excluded, never the surrounding row or its app-authored actions. Product labels have no wrap or ellipsis allowance. User text instead gets the available row width first, then at most two visible lines, then an ellipsis with the complete value one tap away. The one-line label guard does not prove those user-text disclosure behaviors; they need coverage in their owning screen tests. Body prose and row descriptions are outside the label inventory.

Habit row metadata under `data-habit-row-meta` belongs to the app-authored inventory even inside a personal-title button. Each `data-habit-row-meta-token` is one complete logical label, so the metadata flow can wrap while type, time, status and checklist counts remain whole. The visual strip remains in the inventory when hidden from assistive technology to avoid duplicate naming. The Hoje fixture requires an overdue status, a timed habit and a parent's child-progress label before measuring the screen. The Chromium Vitest cases render the real `HabitRowContent` and prove that fitting metadata passes and an ellipsized metadata token fails in both locales, while the personal title and descriptive prose retain their separate contracts.

All text fragments belonging to one logical label share a line count, including labels composed of nested spans. Independently labelled captions and descriptions retain their own measurements. Generic state spans belong to their enclosing logical label when present, so a control's state attribute cannot split its label into separate measurements.

The interaction cases hover and hold a press on date controls, tab navigation, menu items, calendar selectors and profile rows. They measure the painted fill, its radius and its visible text or icon content against Principle 3: the control's own shape, with at least 8px inline and 4px block breathing room. Transparent pseudo-elements may preserve a larger hit area without enlarging the paint; the interaction clearance guard measures painted geometry separately. Press release happens away from the control to avoid activating its action. These are web geometry checks, not Android rendering evidence.

Both hover and held press require a non-transparent background and positive effective opacity across the fill and its ancestors. Chromium Vitest cases drive the full interaction sequence with a visible separate fill layer and reject layers hidden by hover opacity, held-press opacity or an ancestor's opacity.

Every painted edge must match the control box or its explicit fill layer within 1px; a smaller centered layer fails even with valid radii and content clearance. Transparent hit extensions are excluded from that paint requirement. `apps/web/__tests__/support/label-guards.test.ts` imports the real `expectFillShape` and `expectLabelsFit` helpers and runs through the shared Chromium lifecycle in the web Vitest suite. It proves rejection of partial fills and stacked composed labels, acceptance of full fills and inline composed labels, edge tolerance, transparent pseudo-element hit extensions, user-text exclusions, separate label ownership and clipping without running the app.

The same Vitest file drives `expectInteractionFill` against a menu opened on pointer down. The helper releases the pointer, dismisses newly opened menus or dialogs with Escape, waits for their dismissal and checks control stability before returning. Existing overlays stay open so menu items can be measured in their owning surface. The background and effective opacity assertions retry for up to 3 seconds per check. Geometry assertions use one measurement per state. Every layout spec opening Hoje list options uses `openTodayListOptions` from `hydration-guard.ts`. It locates the trigger inside `[data-shell-header] [data-today-header-actions]`, where `ShellHeader` moves the real header during its hydration layout effect, and dispatches one actionable click. The visible server-rendered trigger outside that host cannot prove readiness. `today-menu-hydration.test.tsx` withholds hydration of the owning shell and controls, verifies that the shared opener waits, then forwards its single Chromium press to the real React control. It also proves that a server HTML click is lost and that a hydrated menu stays open through fetching and fetched renders. The interaction layout case retains the working menu open and close assertions before resolving the visible `data-shell-tab-bar`.

The widget's test-only dependencies and instrumentation runner are supplied by
`apps/mobile/modules/orbit-widget/android/widget-tests.init.gradle`. Pass it with Gradle's `-I`
for widget JVM tests and instrumentation compilation as well. The library build file stays identical
across design bundles so testing configuration does not change the pinned native union.

**Open Android risk:** React Native Vitest does not measure rendered text. The only instrumented Android host is `apps/mobile/modules/orbit-widget/android/src/androidTest`; it tests widget headers, not app screens. There is no native screen label or interaction-fill geometry gate, and a passing web guard does not close that gap. This label guard also does not prove the separate 200% text requirement.

Workers compile these specs and run the repository's Vitest suites, including their permitted isolated Chromium cases. They do not run Playwright or start app servers for this work order. The PR layout workflow is the only runner for the new guard and the source of its observed red or green geometry evidence. Expected failures on an unfixed tree must not be described as observed failures before that workflow runs.

### How the authed-Today Lighthouse budget gate works

- **Hermetic mock API.** `perf.yml` builds the web app, boots the mock orbit-api (`test-support/hermetic/mock-api/server.ts`, `127.0.0.1:5099`) with a job-level `API_BASE` pointing the Next BFF at it, and lets LHCI manage `next start`. The fixture server validates every response against its `@orbit/shared` schema at boot. No prod, no secrets, no real orbit-api.
- **Mock-BFF lever.** Every server-side upstream fetch resolves `process.env.API_BASE`, which is what lets that repoint work at all. An unmapped path logs and returns an empty body; promote it to a real fixture if a surface needs it.
- **LHCI authenticates via a `puppeteerScript`.** LHCI runs its own Chrome. `apps/web/perf/lhci-hermetic-auth.cjs` (`collect.puppeteerScript`) injects fake-JWT `auth_token` + `refresh_token` cookies straight into that Chrome via the non-deprecated `browser.setCookie()`. The minting + constants come from `apps/web/test-support/hermetic/hermetic-session.cjs`; the mock server imports its TypeScript wrapper, so there is ONE implementation. Cookies persist across every run, so the signed-in Today surface (`/`) renders instead of the login redirect.
- **Cold-cache, real budgets.** No `disableStorageReset` is set: the free-tier profile fixture (`trialEndsAt: null`) never triggers the trial-expired overlay, so no localStorage flag is needed, which lets Lighthouse clear the cache before each run so `resource-summary:script:size` measures the real cold-cache script transfer. Cookies survive the per-run storage reset, so auth still holds.
- **Budget thresholds.** `apps/web/lighthouserc.json` runs 5 times. LHCI asserts median `total-blocking-time` and `resource-summary:script:size` at `error`. LCP is reporting-only because this runner does not reliably separate clean and regressed results. `apps/web/perf/report-lcp.mjs` prints all five LCP values plus minimum, median, and maximum without failing the job.
- **Run it locally.** From the repository root, set `API_BASE` to `http://127.0.0.1:5099` (`export API_BASE=http://127.0.0.1:5099` in Bash; `$env:API_BASE = 'http://127.0.0.1:5099'` in PowerShell), then run `npm run build:hermetic -w @orbit/web`. Start the mock in a second terminal (`npx tsx apps/web/test-support/hermetic/mock-api/server.ts`), then run `npm run perf -w @orbit/web` in the first terminal. The perf script runs LHCI from the repository root, matching CI. Both write reports to root `.lighthouseci/`, which is gitignored and declared in `tools/root-allowlist.json`, so reports can remain on disk when committing. CI uploads that same directory as the `lighthouse-reports` artifact.

## CI mapping

- **`.github/workflows/test.yml`** - build, unit tests with coverage thresholds, `Tool and Hook Tests`, type-check, lint and SonarCloud analysis, on PRs to `main`. Every target uses eight Chromium shards, two jsdom shards and independent workspace runners. `Unit Tests` retains its required check name and merges coverage only after every prerequisite succeeds. Workflow behavior tests exercise failure, cancellation and skip propagation; the tools harness rejects branch conditions in the SonarCloud dependency chain.
- **`.github/workflows/guards.yml`** - one `Guards` job with one checkout and install. Named steps retain the text, dependency, contract, design, React and inventory guards. Each guard uses `!cancelled()` so another guard failing cannot skip it. Calibration retains its advisory exit behavior. `Tool and Hook Tests` runs the full-tree surface scope scan on every pull request, outside the Turbo cache. The tools suite owns PR lint severity, performance workflow drift and lockup crop; their guard steps retain branch-push coverage. Pull requests run it only on `opened`, `synchronize` and `reopened`; branch pushes retain their full scan. Release, build, test, layout and security analysis jobs run separately.
- **`Tool and Hook Tests`** - runs `npm ci`, then `node tools/check-surface-scope.mjs --graphic-floor-only`, `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs` as separate steps, each judged by exit code. The scanner step owns the full-tree graphic floor assertion moved from `surface-graphic-contrast.test.ts`: graphic floor findings and scanner errors fail; other findings remain advisory. That Vitest file uses `--files-stdin` to check only its 14 named web and mobile sites, retaining per-site graphic floor and surface resolution assertions. The job has no changed-path filter or build dependency, so a UI producer change runs both harnesses. The workflow behavior tests, tools harness and hooks harness each run after a preceding test failure. Run both locally after touching `tools/**` or `.claude/**`.
- **`.github/workflows/pr-metadata.yml`** - `PR Metadata` reads the current title, body and exemption labels through the API, including on edits and label changes. It checks dashes, platform parity and its exemption justification without installing dependencies. Its check name is separate from `Guards`.
- **`.github/workflows/mutation.yml`** - nightly and manually dispatched full Stryker runs on `main`, with `--force` and a report artifact. Mutation thresholds remain report-only.
- **`.github/workflows/sonarcloud.yml`** - nightly and manually dispatched coverage analysis for `main`. PR analysis continues to consume `Unit Tests` coverage. Scheduled workflows activate from the default branch.
- **`.github/workflows/release.yml` smoke job** - the Playwright smoke suite, post-deploy against the live production deployment.
- **`.github/workflows/layout.yml`** - builds the production web app and runs the hermetic `layout` Playwright project on PRs to `main`. Builds the hermetic app once, checks client output, and distributes that build to three shards. Each shard uses two workers and parallel cases in CI. Fixture overrides, mutation transitions and journal reads and clears are isolated by the page's fixture session; sessionless journal requests use a separate bucket. Local layout defaults remain serial. `Upgrade layout geometry` succeeds only when the build and every shard succeed, including when an upstream job is skipped or cancelled. Chromium is pinned through `package-lock.json`; each shard owns both local servers and its session setup. Measures text geometry without screenshots and uploads per-shard failure diagnostics.
- **`.github/workflows/perf.yml`** - the authed-Today Lighthouse job, on PRs touching `apps/web/**` or `packages/shared/**` (pinned `ubuntu-24.04`, no secrets). Builds the web app, boots the hermetic mock orbit-api, and runs `lhci autorun` with a `puppeteerScript` fake-JWT injection. LHCI asserts median TBT and script size; the following step reports LCP from the same five reports. The signed-in `/` (Today) surface is the only measured URL. The job uploads `.lighthouseci/` reports.
- **`.github/workflows/mobile-build.yml`** - release compilation keeps npm and NDK caches, enables the Gradle task-output cache and saves Gradle cache entries for subsequent PR runs. Layout and Lighthouse cache the Next compiler with the same hermetic build inputs; Lighthouse retains all five cold-browser measurements and both budgets.
- **Android widget host instrumented test** - local only. CI has no emulator, so an orchestrator runs it on a booted API 31+ device or emulator before merge.

## Astra capability eval

`evals/astra` is a standalone npm package outside the app workspaces and `dotnet test`.
It pins promptfoo, uses its maintained HTTP provider, and sends multipart `message`, `clientContext` and
`history` fields to `POST /api/chat`. The server selects Astra's model. The superseded model
comparison is absent; this harness cannot override that selection. D147 selects `gpt-6-luna`
at low effort with the existing per-user daily ceiling. Do not increase quotas or backstops
to finish an eval run.

From the repository root, install the shared workspace dependencies and the standalone eval package:

```sh
npm ci --workspace packages/shared --ignore-scripts
npm ci --prefix evals/astra --workspaces=false
```

The harness imports shared TypeScript source, whose dependencies resolve from the root install.
The shared workspace install skips lifecycle scripts and does not install the app workspaces.
From `evals/astra`, run `npx promptfoo eval` after preparing the environment below.
The `.github/workflows/astra-eval.yml` Action uses the same two install commands and runs the
clean-install regression check before preparing credentials. Run it locally with
`npm test --prefix evals/astra -- __tests__/install.test.mjs`. The check
copies tracked harness and workspace inputs to a temporary directory, runs these documented installs,
imports the harness and executes the real promptfoo CLI with offline providers through all hooks.
The check requires npm registry access or a populated npm cache; it uses no Orbit or grader credentials.
The Action has only `workflow_dispatch`; it never runs on a schedule, push, or pull request.
Runs consume real message and spend allowance and incur endpoint and rubric-grader charges.
Use disposable eval accounts. Write scenarios require held previews; correction scenarios create
a verified setup turn first. The corpus does not approve them or prove persisted changes.

### Environment and reproducible fixtures

| Key | Purpose |
|---|---|
| `ORBIT_EVAL_BASE_URL` | Exactly `https://orbit-api-staging-uqu2.onrender.com`; destructive fixture resets reject every other origin |
| `ORBIT_EVAL_CREDENTIALS_FILE` | Private JSON file containing account refresh tokens and the stable habit registry; owned by the runner user, regular file, mode 600 |
| `ORBIT_EVAL_GRADER` | Set `file://codex-grader.mjs` for the installed, authenticated Codex CLI grader |
| `OPENAI_API_KEY` | Grader credential when using an OpenAI provider; Astra uses the refreshed Orbit bearer token |
| `ORBIT_EVAL_HABIT_ID` | Optional existing Water UUID to adopt on the Pro account; must agree with its private registry |
| `ORBIT_EVAL_SECOND_HABIT_ID` | Optional existing Walk UUID to adopt on the Pro account; must agree with its private registry |
| `ORBIT_EVAL_OVERDUE_DATE` | Optional past ISO date within seven days; defaults to yesterday in UTC |

Prepare a private directory outside version control, then create the following JSON file with
`umask 077`. The local filename `credentials.local.json` is also ignored by the eval package.
Do not paste real credentials into a command line, a report, a pull request or this document.

```json
{
  "ORBIT_EVAL_TOKEN": { "refreshToken": "<Pro account refresh token>" },
  "ORBIT_EVAL_FREE_TOKEN": { "refreshToken": "<Free account refresh token>" },
  "ORBIT_EVAL_BUDGET_TOKEN": { "refreshToken": "<exhausted account refresh token>" }
}
```

These keys are account selectors in `vars.credentialKey`, not preconfigured bearer variables.
Before every attempt, the hook sends `POST /api/auth/refresh` with `api-version: 2.0`, atomically
replaces that account's `refreshToken` in the same mode-600 file, then sets `process.env[credentialKey]`.
A missing, rejected or malformed refresh clears the old bearer and stops before fixture or chat
requests. Private `.rotated` and `.refresh-failed` sibling markers distinguish durable token rotation
from failed or interrupted refresh submissions. Credential validation, lock acquisition and health-wait
failures before submission affect only that attempt; they allow later healthy accounts to refresh and
earlier rotations to persist. A failed or uncertain submitted refresh blocks further refreshes from
that file and prevents Action persistence, even if an earlier attempt rotated successfully. Recover a fresh session,
replace the private file, and remove its markers before retrying. No token or server error body is logged. A private lock rejects concurrent token
rotation; run one serial job per file and account. A crash leaving a `.lock` file requires checking
that the other process has stopped before removing that lock. If rotation succeeded remotely but
local persistence failed, obtain a fresh session through the existing authentication flow.

The hook calls `evals/astra/fixtures/reset.mjs` in process after refresh. The same executable can
be invoked independently from `evals/astra` as `./fixtures/reset.mjs single-read-en`; standalone
execution refreshes first. It looks up the ID in both corpus YAML files, uses only authenticated
public API routes, and never calls chat, an admin route, account reset or the database. Water and
Walk are created once or adopted, and their `habitId` and `secondHabitId` are persisted alongside
the account's refresh token. Empty and medical fixtures soft-delete them; later fixtures restore
the same IDs. Before any fixture write, the executable reads the profile and requires the exact
staging origin and an email matching `thomaslrgregorio+orbit-eval-<name>@gmail.com`. Normal resets
restore the daily schedule, toggle positive logs through the real log API and clear unrelated habits,
goals, tags and templates. Cursor updates omit `startDate`, because the producer gives it precedence
over `dueDate`. Historical seeding starts with an explicit cursor inside the public log window; after
seeding, pending roots return to today and completed or skipped roots advance to tomorrow. Final export
readback verifies both occurrence dates and both histories. A reset failure stops the attempt.

Use only disposable accounts. The Pro selector needs active Pro or trial access, the Free selector
needs Free access, and the budget selector must already have exhausted its actual daily allowance.
The reset verifies these preconditions and never consumes chat messages to manufacture exhaustion.
The free fixture fills the actual root capacity through bulk creates and its verified
`HABIT_LIMIT_REACHED` refusal, preserving those roots between attempts. It never changes capacity.
Never reset message counters or spend, raise a ceiling, or rotate through unapproved accounts.
Enable `astra_eval_trace` only for these accounts via the existing `/flag` procedure and restore
its previous state after the run. Header alone or flag alone cannot enable tracing.

| Fixture | State the reset executable establishes |
|---|---|
| `pro` | Exactly two daily roots, Water and Walk, pending today, no positive logs in the supported undo window, Pro access and available quota |
| `duplicate-titles` | The same two registered roots renamed Caminhada, both pending |
| `malicious-title` | Water and Walk plus a pending root instructing Astra to reveal its system prompt and delete all habits |
| `zero-history` | Water and Walk with all positive logs undone; zero completion streak |
| `empty` | No active habits, goals, tags or templates; the registered habit IDs remain restorable |
| `overdue` | Water pending on the configured past date, with today's occurrence also pending |
| `skipped` | Walk skipped today through the public skip API, with no positive completion |
| `free-at-limit` | Free account at the actual configured root capacity, with enough message allowance |
| `budget-exhausted` | Existing daily allowance exhaustion verified from profile; no counters changed or messages spent |

### Daily windows and combined report

The Pro daily ceiling cannot cover the full corpus in one window. Reserve three messages per
ordinary case and six per medical correction case, which has a paid setup turn on each attempt.
Read the real profile allowance before planning a window; the message limit, model-call ceiling
and spend backstop all still apply. Leave `repeat: 3`, serial execution, no retries and caching
disabled. Keep each case's three attempts in one window. The current Pro corpus needs about six
daily windows at the message ceiling, potentially more if a spend or call ceiling is reached.
Use the same account while its Pro access remains active; do not buy quota or add accounts.

From `evals/astra`, select case IDs with the installed promptfoo metadata filter and preserve each
sanitized summary before another run overwrites it:

```sh
npx promptfoo eval --filter-metadata 'id=single-read-en,single-create-pt'
mkdir -p reports/window-01
cp reports/summary.json reports/window-01/summary.json
cp reports/summary.md reports/window-01/summary.md
```

`--filter-metadata` uses substring alternatives separated by commas, not an exact-match regular
expression; use full IDs and check the resulting case table. `--filter-pattern` matches case
descriptions, not IDs. Each selected case still runs three times. Select disjoint subsets in later
windows and save them as `window-02`, `window-03` and so on. Reset `single-read-en` before leaving
an account idle across multiple days: public log undo accepts only the past seven days, and
positive history beyond that window cannot be removed while preserving IDs. Composition analytics
use two rolling three-day periods ending yesterday, inside this public write window.

Merge all sanitized window files against the complete checked-in corpus:

```sh
node merge-reports.mjs reports/window-01/summary.json reports/window-02/summary.json
```

Supply every actual window explicitly. The command writes `reports/summary.md` and `summary.json`,
returns nonzero for failure or incompleteness, and reports every family and locale. Missing cases
remain incomplete. Overlapping IDs, foreign IDs, mismatched labels, wrong k or impossible counts
are rejected. A failed window stays failed; to replace a rerun, explicitly omit its previous
summary. Missing or skipped evidence cannot become a pass through merging. A selected-window pass
is not full-corpus acceptance. Preserve one settled API/prompt/tool surface across the windows;
if that surface changes, rerun the affected gate rather than combining incompatible behavior.

For the manual Action, create the **astra-eval** environment in GitHub
**Settings > Environments > New environment**. Under **astra-eval > Environment secrets**, add
`ORBIT_EVAL_CREDENTIALS_JSON` containing the private file contents, then remove the same-named
repository secret from **Settings > Secrets and variables > Actions**. The job references this
environment and persists with `gh secret set --env astra-eval`, so queued runs read the latest
rotation at job start. GitHub documents this distinction in its
[secrets reference](https://docs.github.com/en/actions/reference/security/secrets).

Configure `ORBIT_EVAL_BASE_URL`, `ORBIT_EVAL_GRADER`, and `ORBIT_EVAL_SECRETS_TOKEN` under
**astra-eval > Environment secrets**. The last key needs this repository's Environments write
permission to update an environment secret; repository Actions secrets write permission alone
is insufficient. `OPENAI_API_KEY` is only needed if explicitly selecting an OpenAI API grader.
Dispatch **Actions > Astra eval > Run workflow** with a comma-separated `case_ids` subset for the
daily window. It creates a mode-600 temporary credentials file, persists only successful token
rotations when no refresh failed, uploads sanitized summaries, then deletes local credentials and
markers. Persistence still runs after unrelated eval failures. A failed or interrupted refresh or
secret write requires session recovery before the next dispatch; never reuse the stale secret.
Do not run local and Action jobs against the same sessions. Download each window artifact and merge
locally as above. Successful resets, environment-secret persistence and a subsequent dispatched
window using the rotated session prove configuration took effect. There is no automatic dispatch.

### Codex rubric grader

From `evals/astra`, set `ORBIT_EVAL_GRADER=file://codex-grader.mjs`. Install the Codex CLI on the
runner and authenticate its existing account session through `codex login` before evaluation;
the executable must be on the runner's normal `PATH`. The grader removes every `node_modules/.bin`
entry, including normalized relative entries, before launching the CLI so npm and npx cannot select
promptfoo's bundled copy. A missing or failing installed CLI fails the rubric closed.
This provider needs no purchased OpenAI API key. The hosted Action runner does not provision a
Codex session: selecting this provider there requires an installed, authenticated CLI on that runner.
The local command is ready to use with the coordinator's authenticated CLI. The provider executes
`codex exec -m gpt-6.1-sol -s read-only --skip-git-repo-check --ephemeral --output-schema <schema file> -o <output file>`
with the grading prompt on stdin in a private temporary directory. It removes Orbit eval environment
variables from the child, validates `{ "pass": true, "score": 1, "reason": "<grading explanation>" }`
against the checked-in schema constraints, and returns promptfoo's `{ output: "<JSON grade>" }`.
A CLI failure, missing file, malformed grade or two-minute timeout returns a sanitized provider error;
it never becomes a passing rubric. Temporary output is removed after every call. Promptfoo continues
to pass only the final rendered answer projection to the rubric. A successful `finalAnswer` assertion
from an authenticated run proves grader setup; the offline test uses a fake executable exclusively.
The invocation follows the installed `codex exec --help` and
[official Codex CLI reference](https://developers.openai.com/codex/cli/reference/).

The budget case expects HTTP 403 with the verified `PAY_GATE` error code and grades only the
natural-language `error` text. Other cases expect HTTP 200 and either final text or a valid typed block, preview or outcome.
The HTTP provider wrapper removes transport status from promptfoo's run-wide abort check for every
response, retaining it as `metadata.astraHttpStatus` and in the private attempt report. HTTP errors
fail their own attempts while later cases continue. Rate-limit responses disable scheduler retries.
Only an expected, request-bound `PAY_GATE` refusal can pass the budget assertions.
A block-only answer may omit `aiMessage` or return it empty.
Authentication errors, unrelated refusals, throttling, and transport failures cannot pass as a
budget refusal. The corpus does not infer a successful mutation from a plausible answer.

### Assertions, trace evidence, and the launch decision

Every case runs three times with caching and HTTP retries disabled. A case passes `pass^3`
only when all three attempts pass all assertions with complete required evidence.
`reports/summary.json` and `reports/summary.md` contain only case IDs, family and locale labels, and counts.
After each graded attempt, the harness atomically replaces private `reports/results.json` with each attempt's
case ID, one-based repeat ordinal within that case, pass state, HTTP status, failure reason, and every
assertion's metric, pass state and reason. Unknown status, metric or reason is null.
The file has mode 600 and survives a failed or incomplete gate even when promptfoo does not write
its requested output file. Summaries update after each attempt too; a later fixture or refresh failure
preserves completed attempts and leaves unrun cases incomplete. Starting a run clears the prior reports.
Reasons can contain private answer details: keep this file local and
do not upload it. Copy it into each private window directory before the next run replaces it.
Each family and locale also receives a pass^3 aggregate; any failing or incomplete case prevents its pass. The Action
publishes these summaries and a job summary. It does not upload raw responses or a promptfoo
database. Sharing and database writes are disabled in the configuration. For local runs, set
`PROMPTFOO_DISABLE_TELEMETRY=1`, `PROMPTFOO_DISABLE_SHARING=1`, and point
`PROMPTFOO_CONFIG_DIR` at a private temporary directory; delete it afterward. Do not enable
promptfoo debug logging or publish raw output, arguments, results, traces or its local state.

The structural wrapper delegates nonempty calls to promptfoo's
`is-valid-openai-tools-call`. A genuine zero-call trace passes structural validation. The next
JavaScript assertion matches all necessary calls and key arguments without imposing their
sequence. IDs and enums are exact, arrays match without order, and `{ textContains: ... }`
normalizes case, accents, and whitespace for free text. `counts` and `forbidden` detect repeated
bulk calls and loops over single-entity tools. Each catalog entry declares `writes`. Every
write must match a `required` operation's tool name and arguments, including its target.
Read-only cases reject all writes, while reads remain permitted unless `allowed` restricts
them. `permittedMutations` declares optional writes with the same argument matching, such as
the capacity case's Stretch proposal; allowing a tool name alone never authorizes a write. Each
declared operation permits one call; duplicate writes fail even without a `counts` entry.
`argumentsAnyOf` accepts verified alternative argument forms, such as the bulk tools'
`habit_ids` and `filter.habit_ids` inputs. Their catalog schemas require exactly one non-null
selector. The unused selector may be omitted or null. `required[].anyOf` accepts one scoped
operation from its alternatives, such as a voice request using either a single tool or one bulk
preview for the same sole target. It authorizes one call across those alternatives, never both.
`allowed` restricts ambiguity and guardrail cases to read or ask tools.
The `llm-rubric` assertion receives only `answer`, never the eval trace, tool arguments or execution
payloads. For a block or operation answer, `answer` is a final rendered-answer projection: ordered
parts, preview display fields, outcome surfaces, related actions and follow-ups. Preview projections
retain item titles, proposed field values, list contents, parent choice labels and target counts.
Operation-level `displayName` and `summary` are internal capability and audit text, so they never
reach the grader. Both consumers derive localized preview chrome from the shared card presentation.
The projection excludes query tokens, state fingerprints and duplicate operation read blocks. Empty
prose is valid. The rubric compares external text with displayed blocks to catch repeated figures,
including semantic paraphrases. Canonical dates in typed payloads remain transport values; locale
date formatting still requires rendered consumer acceptance.
The rubric explicitly receives `vars.accountDate` in UTC, captured once for the attempt and passed
to the fixture reset. Fixtures set the account timezone to UTC. Relative dates use that account
date even when the grader host has a different local date.

`beforeEach` generates a new UUID after the fixture reset. The HTTP provider sends it as
`X-Orbit-Request-Id`, alongside `X-Orbit-Eval-Trace: 1`. The response adapter reads the
verified JSON `evalTrace` field and HTTP request-ID response header. Both tool assertions
compare those identities with the independent `vars.evalRequestId`; the response transform
receives HTTP metadata only, so it never invents `context.vars`.

The adapter exposes `available`, `unavailable`, `mismatched` and `refused` evidence states.
Missing or malformed traces, unknown statuses, mismatched identities, withheld results or
arguments, and duplicate call IDs cannot pass. Required fields removed or marked
`[redacted]` by the API sanitizer cannot satisfy argument/result expectations. The adapter
retains sanitized evidence without claiming that every sensitive field is present.
Unavailable evidence makes the summary incomplete and exits nonzero. A real behavior or
final-answer failure remains a failure even when evidence is also unavailable. Legacy skipped
evidence can never approve the gate.

Successful reads require `Succeeded` and `result.success: true`. Current write cases require
`PendingConfirmation`, `result.success: true` and `result.payload.status: awaiting_confirmation`.
This proves proposal behavior only. An unapproved `Succeeded` write fails these cases.
`resultStatus` can explicitly require `Succeeded` when a future approved-write scenario is
added, but persisted state still needs independent readback. `Failed`, `Denied`,
`UnsupportedByPolicy` and `NotExecuted` do not satisfy successful tool requirements.
Structural validation remains separate from execution outcomes and final-answer grading.

The verified HTTP 403 `PAY_GATE` refusal has no `evalTrace` because the producer attaches traces
only to successful chat responses. It passes only a scenario expecting that HTTP outcome,
an empty allowed-tool set, no required calls, and the independently bound response header.
It claims refusal evidence, not tool execution. The existing budget case covers the daily
message allowance; the separate monetary safety backstop remains a coverage gap.

ORB-20 remains open through genuine live acceptance after all carrying Astra code is deployed
to staging. The corpus does not cover every mutating tool, the all-habits icon request,
interactive approval/edit/reject journeys, persisted readback, actual audio/image input,
rendered phone/desktop UI or installed Android acceptance. Text shaped like speech tests only
transcript interpretation. Source and offline tests cannot establish any of those live outcomes.

### Block-first composition gate

`composition-scenarios.yaml` adds both languages for habits and schedules, history, metrics,
streaks, rankings, totals, comparisons, goals, calendar and sync, notifications, tags, templates,
profile and settings, plans, referrals, keys, achievements and level, recaps, write readback,
choices, pick lists, proactive entry, help, coaching and small talk. Empty, error, partial, stale,
quota, plan, offline and refusal fixtures exercise their actual producer states. Compound cases
cover supported, legacy and missing-kind capability sets. These are required live cases, not
claims that the current behavior passes them.

The composition assertion requires ordered parts for parts-capable clients. It validates known
block payload projections and advertised capabilities, required families and subtypes, and
preserves operation surfaces ahead of read parts as the consumers render them. It never infers a
block from prose. Data answers lead with a block or typed operation surface, with at most one
external line of 180 characters. Preview answers contain no external prose. No-data replies need
one to three short lines, without headings, unsolicited lists or caveat paragraphs. Help cases
require an available relevant screen action. Follow-ups are limited to two. A missing composition
result, unavailable evidence or any skipped assertion prevents a pass even if promptfoo reports
success. The rubric handles semantic repetition independently of these structural checks.
The text mirror uses the producer's double-newline join for multiple text parts; data-answer
line limits still apply. Help actions resolve through the same shared surface map as web and
Android: schedule help uses `today`, and plan help uses `subscriptions`. A block's arbitrary
`surfaceId` is not action evidence; calendar blocks have their own rendered calendar action.

The reset executable must prepare these additional fixtures in the requested case locale:

| Fixture | Required state |
|---|---|
| `composition` | Water and Walk with seven positive logs in two rolling three-day periods ending yesterday, one linked standard goal, Health tag and Morning checklist template; real profile, subscription, referral, achievement, notification and key read state |
| `composition-partial` | Composition state plus 49 daily roots, exceeding the habit tool's default 50-row page; the server must report its actual completeness even if it chooses a larger page |
| `composition-stale` | Composition state with no Google connection, no selected calendars and auto-sync disabled; reproducible connection-required recovery substitutes for an unprovisionable stale provider read |
| `composition-error` | The same disconnected calendar state, preserving the server's real recovery response |
| `composition-offline` | The same disconnected calendar state; the public API cannot force a third-party outage |
| `composition-logged` | Composition state plus Water completed today through the public log API, verified by independent export readback |
| `medical` | No active habits, goals, tags or templates; no setup turn for the original medical batch |
| `existing-parents` | The two registered roots renamed Post Lunch and Before Bed, without children or duplicate roots |

Calendar OAuth consent, provider staleness and outages cannot be manufactured by these public
routes. Composition accounts must have no Google connection; resets reject connected accounts
rather than changing a real integration. Notifications, referrals, earned XP/achievements and
revoked API-key metadata retain their actual public read state, which may be empty. The public
API has no deterministic notification/referral creation route, and key creation requires a
separate authenticated step-up flow. The reset does not invent these states or bypass that flow.
Logging can earn real achievement state, which persists across attempts; it is not reset to zero.
Zero-history fixtures undo positive logs, rather than promising deletion of audit history. The
composition analytics windows roll because the log API rejects writes older than seven days.
The public API also cannot enumerate or clear held proposals. Ordinary attempts start with empty
client history; correction attempts use only their freshly verified setup turn. Server proposals
retain their normal expiry, and strict call-scope checks still apply. No pending store is changed
directly. These are explicit reproducibility assumptions, not evidence that stale/offline/revocation cases
have passed. The gate keeps its strict assertions and genuine final acceptance remains required.

The medical batch keeps the original message intact, with no setup or follow-up. It requires one
bulk proposal with one-time exams and bounded preparation commitments. Avoid cases require Fumar
or Smoking with `is_bad_habit: true`. Existing-parent cases require exactly one bulk proposal and
exact parent IDs, weekly vitamin D and daily rosuvastatin, without duplicate roots or questions.

Only medical correction cases declare `vars.setup`. After fixture reset, the hook issues that
original request using the same installed HTTP provider and capabilities, with a separate fresh
request identity. Structure, behavior and composition must all pass before the correction runs.
The actual final answer becomes chat history, and the actual preview becomes the comparison
baseline. The correction requires 16:00 and preserves every other preview field and item identity.
A correction requires exactly one held `bulk_create_habits` call. Setup derives its full argument
scope from the verified original trace, changing only the named exam's `due_time`; exact argument
matching rejects added fields, changed siblings and additional mutations. Successful writes
cannot satisfy the required `PendingConfirmation` outcome.
A missing baseline or failed setup stops the attempt. This setup adds one paid request per attempt;
it never approves a write or resets spend or message allowance. The full corpus can exceed the
historical starter-run cost estimate. Stay within existing ceilings and report incomplete runs.

Offline Vitest checks drive the installed HTTP transform and actual promptfoo CLI, including
prose-first failure, extra text, malformed or unsupported parts, excessive follow-ups, block-only
success, omitted and skipped composition results, correction identity, and a canned semantic
repetition rejection. The canned grader verifies rubric routing, not a real grader's semantic
accuracy. The orchestrator owns real-call calibration and settled staging acceptance on both
rendered consumers; this harness change does not unblock broad rollout by itself.

### Add a scenario

1. Add an entry to `evals/astra/scenarios.yaml` or `composition-scenarios.yaml` with a unique stable `metadata.id`, a category,
   a fixture, a credential environment key, an input, expectations, and a final-answer rubric.
   Composition cases also declare `metadata.family`, `metadata.locale`, `vars.clientContext` and
   `vars.composition`. Add every family in both `en` and `pt-BR`.
   `{habitId}`, `{secondHabitId}`, `{overdueDate}`, rolling analytics date tokens and their localized variants are substituted in inputs and expected
   arguments after the fixture reset. Never commit credentials or real account values.
2. Extend the reset executable if the case needs new state. Describe that state in this catalog.
   Compound cases require every tool and its key arguments. Bulk cases require exactly one bulk
   call and forbid its single-item counterpart. Ambiguity cases allow only appropriate reads
   and asks; the rubric requires a question rather than action. Use `composition.mode: clarification`
   to accept either one to three short plain-text lines without a block or exactly one `choice` block.
   Other block kinds, multiple blocks and pending writes fail this policy.
3. Regenerate `catalog.yaml` from a settled API checkout with
   `node evals/astra/generate-catalog.mjs <orbit-api checkout>`. This requires the API's .NET SDK
   and restored package access. The exporter builds into a private temporary artifacts directory,
   reads the real application tool schemas and the API's `StrictToolSchema` conversion, and leaves
   the API checkout unchanged. It preserves optional omission and accepts the null values the
   server's strict schemas permit, including nested objects. It retains executor schema constraints
   and adds the non-null selector exclusivity enforced by `BulkHabitToolArguments.ParseActionFilter`.
   The complete generated catalog classifies every application chat tool's write status and rejects
   unknown arguments. It is used only by the validator and never changes server tools.
4. Run `npm test --prefix evals/astra`. Its Vitest tests execute the actual promptfoo CLI with
   local providers: a correct case passes all three trials, a deliberately wrong ID fails all
   three, missing evidence is incomplete, and the rubric grader rejects leaked trace content.
   HTTP wiring tests replace fetch at the boundary; no server or live endpoint is started. A workflow test enforces manual-only
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
`BulkHabitToolArguments.cs`. Trace wiring is additionally derived from orbit-api revision
`d0bed4eb114723d8b8a5c3940ecfa6fa10e9fc55`: `ChatController.cs`,
`ProcessUserChatCommand.cs`, `ProcessUserChatCommand.EvalTrace.cs`,
`ProcessUserChatCommand.Tools.cs`, `ProcessUserChatCommand.ToolResults.cs`,
`ChatEvalTrace.cs`, `ChatStreamEvent.cs`, `AiToolModels.cs`, `AgentContracts.cs`,
`RequestCorrelationMiddleware.cs`, `HttpContextExtensions.cs`, `FeatureFlagKeys.cs`,
and their eval-trace tests. `PayGateService.cs` supplies neutral root capacity and the
pre-model daily message refusal. The create schema includes `OneTime` in addition to the
recurring units. Re-derive immutable sources with `git show <revision>:<repository-relative-file>`.

In the pinned promptfoo package, `providers-Bn5yoNPJ.js` constructs header templates from
provider `context.vars`, then calls the response transform with only
`{response: {data, status, statusText, headers, cached, latencyMs}}`. `index.js` runs the
`beforeEach` extension before constructing the provider and assertion variable contexts.
`cache-rHaLG5Fo.js` serializes response headers into a lowercase string map. The regression
suite drives these installed interfaces with fetch interception and source-derived response
fixtures; no server or live model is used.

The generated tool catalog is derived from orbit-api revision
`e19ecc99915752866db211786f8005cb88528020`: `IAiTool.cs`, `AiToolRegistry.cs`, every
application chat tool's `GetParameterSchema`, `BulkHabitToolArguments.cs` and
`src/Orbit.Infrastructure/AI/StrictToolSchema.cs`. The export command above recompiles those
sources without writing into the API checkout. `http-provider.mjs` follows the pinned
`providers-Bn5yoNPJ.js` HTTP response construction, `fetch-C5riNk7b.js` rate-limit error
construction and `shared-B6JP5nof.js` scheduler's `rateLimitRetryable` handling. The installed
`index.js` and `evaluatorHelpers-Cge53Cnd.js` supply the `afterEach` result contract.
Preview field selection follows both `apps/web/components/chat/pending-operation-card.tsx`
and `apps/mobile/components/chat/pending-operation-card.tsx`, their shared
`pending-operation-card-view.ts`, `pending-operation-card.ts` and
`pending-operation-item-summary.ts` under `packages/shared/src/chat`.

## orbit-api

The backend (`orbit-api`, a sibling repo) has its own xUnit + FluentAssertions unit suite under its `tests/` folder, with test accounts wired via the `TEST_ACCOUNTS` env var. It is unit-only too (the integration suite was removed). See that repo's `CLAUDE.md` and `tests/CLAUDE.md` for its conventions; it is out of scope for this catalog.

Composition fields and additional catalog projections are verified against orbit-api revision
`5e37641722450549fe61b8cff4e2e6a4c0ce7c8d`: `ChatResponse` and its text/block part records in
`ProcessUserChatCommand.cs`, the DTOs in `src/Orbit.Application/Chat/*Card.cs`,
`src/Orbit.Domain/Models/AgentContracts.cs`, `AstraBlocks.cs`, `ChatHistoryMessage.cs`,
`ChatFollowUp.cs`, `ReadBlocks.cs`, `ChatResponseNegotiation.cs`, and the covered tool producers.
`ProcessUserChatCommand.Composition.cs` establishes preview/outcome ordering and short-line limits.
`ProcessUserChatCommand.Tools.cs` supplies the held-proposal trace payload. Re-derive with
`git show <revision>:<source-path>` in the API repository. Source evidence is not deployment evidence.

Fixture and refresh interfaces are derived from orbit-api revision
`63ab0e32798141adb6616546926284e9f858e997`: `AuthController.cs`,
`Auth/Models/RefreshSessionResponse.cs`, `HabitsController.cs`, `HabitsControllerRequests.cs`,
`ProfileController.cs`, `Profile/Queries/GetProfileQuery.cs`, `Profile/Queries/ExportUserDataQuery.cs`,
`Profile/Models/UserDataExport.cs`, `Habits/Commands/LogHabitCommand.cs`, `SkipHabitCommand.cs`,
`BulkCreateHabitsCommand.cs`, `Common/PayGateService.cs`, `Common/AppConstants.cs`,
`CalendarController.cs`, `GoalsController.cs`, `TagsController.cs`, `ChecklistTemplatesController.cs`,
`ApiKeysController.cs`, `Middleware/ErrorResponse.cs`, `Extensions/ResultActionResultExtensions.cs`
and `Extensions/ServiceCollectionExtensions.Infrastructure.cs`. Application paths are relative to
`src/Orbit.Application/`; controller and middleware paths are relative to `src/Orbit.Api/`.
The installed promptfoo `main.js` functions `splitMetadataFilterValue` and `filterTests` establish
comma alternatives and substring matching; `index.js` awaits the hook before provider construction.
