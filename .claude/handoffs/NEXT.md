/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run. Start every worker and waiter as a harness background task with no pipe and no trailing `&`. Launch no worker while the one-minute load average is above 20; wait for it with a background until-loop. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Worker engine and reviewer

The owner moved both the worker and the Pullfrog reviewer to `gpt-6.1-sol`. The main checkout carries it uncommitted in `.claude/orchestrator.json` (worker `codex`, both Codex tiers `gpt-6.1-sol`, both Claude tiers `claude-opus-5-5`): keep it, verify with `node tools/launch-worker.mjs --dry-run` on both tiers, and let `#1003` commit it. The reviewer change is in `ui#1348`, `api#668` and `landing#97`. `gpt-6.1-sol` sometimes answers "Selected model is at capacity": relaunch a worker that dies on it with a recomposed order, and switch the engine to Claude (§5.4.1) only when capacity errors keep killing workers. A Claude usage limit is an external stop: record it as a blocker on the open ledger rows and resume at the reset.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`) that installs beside production. The owner is waiting for that first Orbit Staging build. The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 177 open tickets, all 177 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight

| item | disposition |
|---|---|
| `ui#1348`, `api#668`, `landing#97` Pullfrog on `gpt-6.1-sol` | all approved at their heads (`9c6504f2`, `9ad1ff5d`, `a9d309b9`), threads resolved; waiting on the required `GitGuardian Security Checks` (suites queued in the vendor backlog). `ui#1348` also showed `React Doctor` and `Unit Tests` red: read the runs first. Merge each on the bar, confirm the next review logs `model: openai/gpt-6.1-sol` and `agent: opencode`, then set each Pullfrog console model to "Custom (set in workflow)" |
| `ui#1333` (`#949`) | pushed at `1b53534a` with the worker report and a local 205/205 layout run; wait for CI (Sonar) and a fresh review, merge |
| `ui#1345` (`#981`) | at `50dd9a50` after a resolved merge-forward; wait for CI and review, merge, then close `#1002` as its duplicate (`redesign/main`'s tools gate fails until it merges) |
| `ui#1342` (`#842`) | approved at `5ff7f865`; waiting on GitGuardian; merge, then release production web and `curl https://app.useorbit.org/sw.js` must print 200 |
| `ui#1349` (`#969`) | opened by its worker at `132aece1`; wait for CI and review, merge, then check a real Chrome autofill on staging |
| `api#667` (`#932`) | at `a69c7ba8`, one open P1 thread (delete keyed only by row id). The second fix worker died on capacity errors and left an uncommitted change in worktree `ticket-932-stale-push-subscriptions`: read it, then relaunch the review-batch order for an owner-bound conditional delete plus an interleaving SQLite test; after merge release the production API |
| `#850` worker | continuation worker running at handoff (worktree `ticket-850-rescue-card`, one unpushed merge commit, dirty tree; outcome unknown): verify delivery, run the copy approval (`/second-opinion` framed as a claimed defect) before merge |
| `#964` worker | continuation worker running at handoff (worktree `ticket-964-sheet-pinned-actions`, 23 commits never pushed; outcome unknown): verify delivery; its footer pair must follow `#996` (drawn trailing pair) |
| Android 1.3.44 (103) open track | dispatched from `main` `4c4b8216` (run 36727753173), in progress at handoff: confirm success and the upload |
| Staging | web `redesign/main` `a98a752f` (verified `/api/health`); API `ab2ed73c` |
| Production | web `3d1a4d79`; API `e596ee18`; `main` holds unreleased `#1339`, `#1341`, `#1346`, `#1347` |
| Stashes | none in any of the three repositories |
| Uncommitted work | main checkout: `.claude/orchestrator.json` (intentional, `#1003`); `ticket-850-rescue-card` (running worker); `ticket-932-stale-push-subscriptions` (dead worker's edit) |
| Unpushed commits | `ticket-850-rescue-card` (one), `ticket-964-sheet-pinned-actions` (branch never pushed); both are running workers |
| Detached HEADs | scratch `integ-main` and `integ-rd` worktrees and the older `api-integ` under session scratchpads: removable with `git worktree remove` |
| Branches without a pull request | fourteen `orbit-ui-mobile` and two `orbit-api` ticket worktrees with no upstream and a clean tree: tear down the merged ones with `node tools/teardown-worktree.mjs` |
| Ignored files | `orbit-api/infra/local.tfvars`; the session decision log stayed in its scratchpad |

## Then, in order

1. The in-flight rows above, top to bottom; merge each on the bar; release `redesign/main` web (and API when it changed) to staging after each merged batch; release production web after the `ui#1342` merge and the production API after `api#667`.
2. `#1003` (commit the worker model switch), first among the filed tickets.
3. The next `#556` sync carrying every `main` merge since `ui#1336` (listed in the spec's Batch R), then the first Orbit Staging internal build from `redesign/main` through `/android-release`, then `#961` (staging billing) once that upload exists.
4. The spec's `### Batch R` filed tickets in their order, then a full rendered sweep of staging at desktop, phone and foldable widths, filing and fixing until a full pass finds nothing.
5. The rest of `### Batch M`: `#943`, then the retired-project list for the owner.
6. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
7. Everything else in the spec's order: Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (the Play Console added to the `claude-in-chrome` list, the three-waiter cap and the recompose-after-fast-forward rule added).
- Codex allowance and the reviewer: superseded by the owner's order to run both on `gpt-6.1-sol`; see Worker engine and reviewer.
- In flight: `ui#1333` carried (pushed with evidence); `ui#1336` done (merged `a98a752f`, `#968` closed); `ui#1345` carried (merge-forward pushed); `ui#1341` done (merged `2cc25f96`, `#897` closed); `ui#1342` carried (review fix `5ff7f865`, approved); `ui#1346` done (merged `4c4b8216`, `#845` closed); `api#667` carried (one round fixed, one open); `#964` carried (relaunched); `#969` done as a worker (delivered `ui#1349`, carried as a PR); `#850` carried (relaunched); staging row superseded (`a98a752f`); production row carried; `main` merged-not-released row carried (plus `#1341`, `#1346`, `#1347`); stashes, uncommitted, unpushed and detached rows superseded by the rows above; ignored files carried.
- Step 1: carried (remaining in-flight rows). Step 2: carried (the Android open-track build was dispatched; the internal Orbit Staging build still waits on the carry). Step 3: carried. Steps 4 to 6: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
