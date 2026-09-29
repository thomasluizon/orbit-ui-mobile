/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Move Orbit to Render with Amazon SES, a free staging and manual release workflows.md` (including its Implementation log), `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run. Start every worker and waiter as a harness background task with no pipe and no trailing `&`. Launch no worker while the one-minute load average is above 20; wait for it with a background until-loop. Run only one local hermetic Playwright run at a time.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client and the Pullfrog console through `claude-in-chrome`; and create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Codex allowance and the reviewer

Codex usage was at 98 percent of the weekly cap when this prompt was written, and Codex workers already failed on "Selected model is at capacity". The main checkout carries an uncommitted `"worker": "claude"` in `.claude/orchestrator.json` (the §5.4.1 switch). Keep Claude as the worker engine and set the Claude worker model to Opus 5.5 (`claude-opus-5-5`) for both tiers in that same transient edit, verified by `node tools/launch-worker.mjs --dry-run` on both tiers. When Pullfrog stops reviewing because the shared OpenAI allowance is exhausted, switch the Pullfrog reviewer model to Claude Opus 5.5 in the Pullfrog console (server-side, through `claude-in-chrome`), confirm the next review names that model, and record both switches in the decision log. Revert both when Codex is available again.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`) that installs beside production. The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 160 open tickets, all 160 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first)

| item | disposition |
|---|---|
| `ui#1329` (`#950`) one focus ring per field | APPROVED at `ed392554`, green, merge-result check green on `61fd1af3` (198 layout cases): merge |
| `ui#1334` (`#934`) "Apagar" everywhere | APPROVED at `f50591ae`, CI settled: copy approval with `/second-opinion` framed as a claimed defect, verdict on the pull request, merge-result check, merge |
| `ui#1333` (`#949`) hover and pressed shapes | APPROVED at `0799ce61` but conflicting, so no CI ran. A Claude merge-forward worker was running (worktree `ticket-949-press-shape`, log `#949-1790706717625.log` in the harness worker log directory; outcome unknown): read its report, push the merge, let CI and a fresh review run, merge |
| `ui#1332` (`#955`) sheets | at `14fd2601`, one Pullfrog P1 thread and two guard defects; a Claude review-batch worker was running (worktree `ticket-955-sheet-height`, log `#955-1790706776684.log`; outcome unknown): read its report, merge it into the body, resolve `PRRT_kwDOR5Siws6nPFnz`, push, merge on the bar |
| `ui#1336` (`#556` carry) | salvaged at `8ca9436b` (all suites and harnesses green); a Claude worker was running the missing review sweep (worktree `ticket-556-carry-privacy-alldone-routes`; outcome unknown): put its `## Review harness` block in the body, clear the review, merge |
| `api#666` (`#893`) Astra writes held for approval | CHANGES_REQUESTED at `7ce79fb2`; `PRRT_kwDORKgXhc6nP0Vq` resolved; launch the composed review batch for `PRRT_kwDORKgXhc6nP0Vv` and `PRRT_kwDORKgXhc6nP0Vz` (the spec's Batch R names them), then clear the review and merge |
| `ui#1335` Dependabot github-actions bump (base `main`) | drive on the bar like any `main` pull request |
| `#868`, `#869` workers | Claude workers were running (worktrees `ticket-868-avisos-labels`, `ticket-869-astra-close-empty`; outcome unknown): verify delivery and drive their pull requests |
| `#957` | merged as `api#664` and released; the ticket is still open: close it with `complete-ticket.mjs` |
| Staging | web `redesign/main` `6b0fabc6` (confirm with `/api/health`; `#1324`, `#1330`, `#1331` not released yet); API `f039e1a6` |
| Production | web `057294c2`; API `e596ee18`; Android 1.3.43 (102) open track; internal track still 1.3.39 (98) |
| Workers and waiters | the five workers above may still be running; any waiter from the previous session ends on its own |
| Stashes | none in any of the three repositories |
| Uncommitted work | main checkout: `.claude/orchestrator.json` (`worker: claude`, intentional); the running workers' worktrees |
| Unpushed commits | `ticket-949-press-shape` (the merge-forward in progress); `ticket-862-onboarding-details`, `ticket-867-sobre-labels`, `ticket-882-drawn-toast`, `ticket-888-shell-not-found` hold local-only commits on merged tickets: confirm each ticket merged, then tear the worktree down |
| Detached HEADs | the scratch `integ` worktrees under both previous sessions' scratchpads and `ticket-822-web-health-retry`: removable with `git worktree remove` |
| Ignored files | `orbit-api/infra/local.tfvars` sets both email providers to `Ses`; the previous session's decision log stayed in its scratchpad |

## Then, in order

1. The in-flight rows above, top to bottom; merge each on the bar and release `redesign/main` web (and API when it changed) to staging after each merged batch.
2. The next `#556` sync carrying `#1327` (the staging application id) into `redesign/main`, then an internal Android build from `redesign/main` through `/android-release` (the first Orbit Staging build), then `#961` (staging billing) once that upload exists.
3. The spec's `### Batch R` list in its order (`#951`, `#952`, `#970`, `#963`, `#964`, `#965`, `#966`, `#969`, `#947`, `#958`, and on), then a full rendered sweep of staging at desktop, phone and foldable widths, filing and fixing until a full pass finds nothing.
4. The rest of `### Batch M`: `#943`, then the retired-project list for the owner.
5. THE REDESIGN GATE stays open for the owner; do not merge `redesign/main` to `main`.
6. Everything else in the spec's order: Batch 0c, the rest of Batch E, Batch 0b.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (Firebase and the Pullfrog console added).
- The owner's max-priority reports (hover shape, double focus, sign-in centring, clamped composer, empty band): filed as `#949`, `#950`, `#954`, `#952`; `#954` done (merged `6b0fabc6`); `#949` and `#950` carried as `ui#1333` and `ui#1329`; `#952` carried in Batch R. His later reports: `#955` (update sheet height and footer inset) carried as `ui#1332`; `#951` (send opens the chat) and `#953` (voice language, done: merged `1f8d7629` and released) filed; the square record button is part of `#949`.
- The staging application id: filed as `#956`, done on `main` (merged `65b2549a`); Play Console app, tester list, service account access and Firebase entry done; carried: the carry into `redesign/main` and the first internal build.
- Foldables (the owner's instruction): filed as `#958`, carried, and made a standing rule.
- Finish everything redesign and sweep until nothing is wrong: carried.
- In flight: `api#660` done (merged `1d806028`, Terraform applied, production released, Google page reached); `ui#1325` done (`b2d08cf6`); `ui#1324` done (`7a23a428`); `ui#1318` done (`b13a8cfe`); `ui#1321` done (`f8ee46c6`); the deprecated-route ticket filed as `#957` and done in code (`api#664`, `e596ee18`); `#946` done (`api#665`, `f039e1a6`); `#948` done (`ui#1326`, `d4a17891`); `#959` done (`ui#1330`); `#960` done (`ui#1331`); the Render auto-deploy finding done (both web services now off); the dead Vercel mocks finding done (`#960`).
- Step 5 (`#943` and the retired-project list): carried.
- Steps 6 and 7: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
