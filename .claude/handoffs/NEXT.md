/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run. Start every worker and waiter as a harness background task with no pipe and no trailing `&`. Launch no worker while the one-minute load average is above 20; wait for it with a background until-loop. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client and the Pullfrog console through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Codex allowance and the reviewer

The main checkout carries an uncommitted `"worker": "claude"` with both Claude tiers on `claude-opus-5-5` in `.claude/orchestrator.json` (the §5.4.1 switch; Codex was at 98 percent of its weekly cap and failing on capacity). Keep it and verify with `node tools/launch-worker.mjs --dry-run` on both tiers. Pullfrog still reviews on its OpenAI model; when it stops reviewing because the shared allowance is exhausted, switch its reviewer model to Claude Opus 5.5 in the Pullfrog console (server-side, through `claude-in-chrome`), confirm the next review names that model, and record both switches in the decision log. Revert both when Codex is available again. A Claude usage limit is an external stop: record it as a blocker on the open ledger rows and resume at the reset.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`) that installs beside production. The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 171 open tickets, all 171 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight

| item | disposition |
|---|---|
| `ui#1333` (`#949`) hover and pressed shapes | Pullfrog APPROVED at `22ba2dbc`; only `SonarCloud Code Analysis` red. Worktree `ticket-949-press-shape` holds two unpushed commits: `34ed4576` (merge of `redesign/main`) and `706996fc` (hover variant as a Tailwind plugin, new-code coverage 100%). Read the worker's report (log `#949-*.log`, newest, in the worker log directory), rerun `press-shape.spec.ts` locally with the plugin, carry the report into the body with `merge-review-batch-body.mjs --ui-scope`, push, merge when Sonar and a fresh review are green |
| `ui#1336` (`#556` carry) | at `4d130d0f`, P1 thread answered and resolved, body has the Review harness block; wait for CI and review, merge, then close `#968` (implemented there) |
| `ui#1345` (`#981`) tools harness fixture | at `a7d91e54` (orchestrator fix, thread resolved); CI and review settled once while the session wrapped up: read the result, merge |
| `ui#1341` (`#897`, base `main`) | at `54cba8ea`, three threads resolved; CI and review settled: read, merge |
| `ui#1342` (`#842`, base `main`) | at `1b293e0f`, two threads fixed; CI and review settled: read, merge; after the production web release, `curl https://app.useorbit.org/sw.js` must print 200 |
| `ui#1346` (`#845`, base `main`) | at `ea6e2a1d`, thread fixed; wait for CI and review, merge |
| `api#667` (`#932`, base `main`) | opened by its worker at `ecb9a832`; wait for CI and review, merge, release the production API |
| `#964` worker | bounded relaunch running (worktree `ticket-964-sheet-pinned-actions`, 15 commits ahead, not pushed, no PR; outcome unknown): read its report, verify delivery, drive its PR |
| `#969` worker | running (worktree `ticket-969-autofill-perimeter`, 1 commit, no PR; outcome unknown): verify delivery; after merge check a real Chrome autofill on staging |
| `#850` worker | running (worktree `ticket-850-rescue-card`, 1 commit and 12 changed files, no PR; outcome unknown): verify delivery; run the copy approval (`/second-opinion` framed as a claimed defect) before merge |
| Staging | web `redesign/main` `34c83a09`; API `ab2ed73c` |
| Production | web `3d1a4d79`; API `e596ee18`; Android 1.3.43 (102) open track (lacks `#940`); internal track 1.3.39 (98) |
| `main` merged, not released | `#1339` (`#889` web version on Sobre) and any later `main` merge: release production web, then an Android open-track build once `#897` and `#889` are on `main` |
| Stashes | none in any of the three repositories |
| Uncommitted work | main checkout: `.claude/orchestrator.json` (intentional); `ticket-850-rescue-card` (its running worker) |
| Unpushed commits | `ticket-949-press-shape` (two, above), `ticket-964-sheet-pinned-actions`, `ticket-969-autofill-perimeter`, `ticket-850-rescue-card` (their running workers) |
| Detached HEADs | the reusable scratch `integ` worktree under an earlier session's scratchpad (the merge-result checks use it) and `api-integ` under the latest session's scratchpad: removable with `git worktree remove` |
| Ignored files | `orbit-api/infra/local.tfvars` sets both email providers to `Ses`; the session decision log stayed in its scratchpad |

## Then, in order

1. The in-flight rows above, top to bottom; merge each on the bar and release `redesign/main` web (and API when it changed) to staging after each merged batch; release production web after each `main` merge batch.
2. The next `#556` sync carrying `#1327`, `#1335`, `#1338`, `#1339` and every later `main` merge into `redesign/main`, then an internal Android build from `redesign/main` through `/android-release` (the first Orbit Staging build), then `#961` (staging billing) once that upload exists.
3. The spec's `### Batch R` list in its order, then a full rendered sweep of staging at desktop, phone and foldable widths, filing and fixing until a full pass finds nothing.
4. The rest of `### Batch M`: `#943`, then the retired-project list for the owner.
5. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
6. Everything else in the spec's order: Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (the fast-forward before launches added).
- Codex allowance and the reviewer: carried; the Claude worker model set to Opus 5.5 on both tiers and verified by dry run; Pullfrog kept reviewing, so its model was not switched.
- In flight: `ui#1329` (`#950`) done (merged `e20062e4`); `ui#1334` (`#934`) done (copy approved, merged `4cb86228`); `ui#1333` (`#949`) carried (pushed, spec fixes, Sonar fix unpushed); `ui#1332` (`#955`) done (merged `e3104fab`); `ui#1336` carried; `api#666` (`#893`) done (merged `ab2ed73c`, staging released, follow-up `#980`); `ui#1335` done (merged `357465e5`); `#868` done (`ui#1337`, merged `3e1e0ffb`); `#869` done (`ui#1344`, merged `34c83a09`); `#957` done (closed); staging row superseded (web `34c83a09`, API `ab2ed73c`); production row superseded (web `3d1a4d79`); workers row done (all relaunched and resolved); unpushed commits on merged tickets done (worktrees `ticket-862`, `-867`, `-882`, `-888` torn down); detached `ticket-822` and one scratch `integ` removed.
- Step 1: carried (remaining in-flight rows above).
- Step 2 (`#1327` carry and the first internal build): carried.
- Step 3 (Batch R list and sweeps): carried; `#963`, `#940`, `#889` (on `main`), `#935` (closed as its duplicate), `#971` done; `#969`, `#850`, `#932`, `#964`, `#897`, `#842`, `#845`, `#981` in flight; an early check filed `#993`.
- Steps 4 to 6: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
