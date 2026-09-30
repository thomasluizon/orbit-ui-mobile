/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules). Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once (fold pull requests into one waiter with several `--pr` flags). A merge commit a worker brings in, or a body edit, re-runs checks: read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows up in the rollup beside its passing twin. A new ticket worker is refused while open pull requests plus live workers exceed ten, so drive open pull requests to merge first. Never chain a base merge and a push in one command: a failed merge must stop before the push.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after the proof; the recipe is in the spec's Constraints). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, the Orbit Staging internal build uploaded, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report. That is THE REDESIGN GATE; stop there.
2. Onboarding ends with the free Pro trial step, or the Orbit Pro paywall for an account not on a trial; an account that already has paid Pro sees neither and onboarding finishes normally. It is `#1007`, filed with its design decisions; build it once `ui#1359` merges.
3. No recurring Orbit Pro prompt for free accounts (decided). Light-mode opaque hover is decided and shipped on `redesign/main` (`#970`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`), then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 159 open tickets, all 159 placed in the spec's `## The order` (0 unplaced, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1359` (`#556` carry) at `dfbe756e` | Pullfrog APPROVED, all green, 0 threads, behind `redesign/main`: run the combined local merge-result check, merge, close `#889`, release staging web, ship the first Orbit Staging internal build, then `#961` |
| `orbit-api#672` (`#746` carry of `#984`) at `436a33df` | Pullfrog APPROVED, all green, CLEAN: merge, then release the staging API from `redesign/main` |
| `ui#1382` (`#1017`, into `main`) at `2a8ef338` | Pullfrog APPROVED, one check was running: merge on the bar, release production web, carry through `#556` |
| `ui#1381` (`#1000`) at `936e2ac1` | Pullfrog APPROVED, checks were running: merge on the bar (merge-result check if its files overlap the base) |
| `ui#1374` (`#989`) at `35d41767` | a base merge over the approved `d237fa01`; Pullfrog never reviewed the merge head: `--re-review`, then merge |
| `ui#1370` (`#974`) at `62fbdb66` | APPROVED at that head but DIRTY again after `#1373`, and its Layout Guard was red there; all three review-fix attempts spent. Merge the base in (not a review fix), run the local layout project, read the Layout Guard log, then merge on the bar or record the blocker |
| `ui#1379` (`#952`) at `f34a08a8` | review batch 1 committed `b48dc38d` on local base merge `05e613ce` in worktree `ticket-952-composer-width`, NOT pushed (report in the latest orbit-workers log for `#952`): run the local layout project, merge the report into the body, resolve `PRRT_kwDOR5Siws6nvHBh` with the fix, push once |
| `ui#1380` (`#993`) at `f61ed14a` | Pullfrog APPROVED; Layout Guard red: read the log, one review batch |
| `ui#1383` (`#1005`) at `3cfdc8fd` | waiting on CI and first review |
| Staging | web release run `36789097807` deploying `redesign/main` `2e69a17a` (verify `https://app-staging.useorbit.org/api/health`); API `7e3a2e19` |
| Production | web `4da31c84`; API `2b1fecfc`; landing `ebbebb2a`; Android 1.3.47 (106) newest on the open track |
| Owner sign-in check | watch production logs for the owner's first Google sign-in on 1.3.46 or later and record it on `#1010` |
| Running workers | none |
| Open pull requests elsewhere | `orbit-api#672` only; none in `orbit-landing-page` |
| Stashes | none in `orbit-ui-mobile` or `orbit-api` |
| Uncommitted work | none in the main checkouts |
| Unpushed commits | `fix/ticket-952-composer-width` (4 commits: the base merge and batch 1, held until the local layout project passes) |
| Detached HEADs | only scratch merge-check worktrees in session scratchpads outside the repository; they hold local merges only and can be removed with `git worktree prune` after deleting their folders |
| Branches without a pull request | older ticket worktrees as the spec's Current state describes |
| Ignored files | the session decision log stayed in its scratchpad |

Workers launched by this session died when it ended: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

1. The in-flight rows above, top to bottom: the carries first (they unblock the Orbit Staging build and `#985`), then the approved pull requests, then the red ones. Merge each on the bar; release `redesign/main` web (and API when it changed) to staging after each merged batch.
2. After `ui#1359` merges: the first Orbit Staging internal build from `redesign/main` through `/android-release`, then `#961` (staging billing).
3. The spec's `### Batch R` filed tickets in their order (`#1007` once `ui#1359` merges; `#841`, `#958` after `ui#1379`; `#851` after `ui#1374`), then a full rendered sweep of staging at desktop, phone and foldable widths, filing and fixing until a full pass finds nothing.
4. When the redesign is done, tell the owner (instruction 1) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
5. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c, the rest of Batch E and Batch 0b, as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (one line added: never chain a base merge and a push).
- Owner instruction 1 (tell the owner at the redesign gate): carried.
- Owner instruction 2 (`#1007` after `ui#1359`): carried.
- Owner instruction 3 (no recurring Pro prompt; light hover): carried; the hover half is done (`ui#1373` merged, `#970` closed).
- In flight: Android 1.3.46 upload done (release run `36780032912`, Play upload step green) and 1.3.47 (106) shipped for `#1016`; the owner's sign-in check carried. `ui#1377` done (merged, production is on 1.3.47; the throwaway-AVD check is recorded on `#1016` and the AVD deleted). `ui#1375` done (merged, production web released). `ui#1359` carried with its threads answered and approved. `ui#1370` carried (batches 1 to 3 pushed; conflict and red layout remain). `ui#1371` done (merged, `#847` closed). `ui#1373` done (merged). `ui#1374` carried (login centering fixed, merge head unreviewed). `ui#1376` done (merged, `#1015` closed). `#1008` worker done (`ui#1378` merged, closed). `#952` worker done (`ui#1379`, batch 1 unpushed). Staging, production, stash, uncommitted, unpushed, detached, branch and ignored rows superseded by the rows above.
- Then, in order, steps 1 to 5: carried as steps 1 to 5.

Every identifier here came from a previous session: treat each as a lead to verify.
