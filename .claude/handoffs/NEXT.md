/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules). Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once (fold pull requests into one waiter with several `--pr` flags). A merge commit a worker brings in, or a body edit, re-runs checks: read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows up in the rollup beside its passing twin. A new ticket worker is refused while open pull requests plus live workers exceed ten, so drive open pull requests to merge first.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after the proof; the recipe is in the spec's Constraints). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, the Orbit Staging internal build uploaded, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report. That is THE REDESIGN GATE; stop there.
2. Onboarding ends with the free Pro trial step, or the Orbit Pro paywall for an account not on a trial; an account that already has paid Pro sees neither and onboarding finishes normally. It is `#1007`, filed with its design decisions; build it once `ui#1359` merges.
3. No recurring Orbit Pro prompt for free accounts (decided). Light-mode opaque hover is decided and built in `ui#1373`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`), then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 165 open tickets, all 165 placed in the spec's `## The order` (0 unplaced, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| Android 1.3.46 (105) open track, release run `36780032912` from `main` `4795de40` | was uploading at handoff: read the run, verify its Play upload step. Then watch production logs for the owner's first Google sign-in (one `POST /api/auth/google/code` and `User logged in via Google`); record it on `#1010` |
| `ui#1377` (`#1016`, retried Google attempt on a mounted callback screen) into `main` at `23d17349` | waiting on CI and first review; prove it on the throwaway AVD, merge on the bar, release another Android open-track build |
| `ui#1375` (`#1012`, web push stale cleanup timeout) into `main` at `e640ba46` | waiting on CI and first review; merge on the bar, release production web |
| `ui#1359` (`#556` carry) at `62af2902` | Pullfrog CHANGES_REQUESTED with two P1 threads on carried `main` code (`PRRT_kwDOR5Siws6ntfKh`, `PRRT_kwDOR5Siws6ntfKl`). After `ui#1375` and `ui#1377` merge, cherry-pick `-x` the `main` commits since `#1363` (`#1372`, `#1375`, `#1377`) into the carry, answer both threads with those fixes, push once, merge on the bar, close `#889`, release staging, ship the first Orbit Staging internal build, then `#961` |
| `ui#1370` (`#974`) at `497075a9` | batch 1 (`6b60a004`, local) failed six local layout cases; batch 2 finished with commit `25f023b9` (clean tree, not pushed) in worktree `ticket-974-press-fill-hitbox`; its report is in the latest orbit-workers log for `#974`. Run the hermetic layout project on that head, then merge the batch reports into the body, push once, and wait for review. One review-fix attempt is left |
| `ui#1371` (`#847`) at `e4aafd45` | batch 1 pushed and its thread resolved; waiting on CI and Pullfrog re-review; merge on the bar |
| `ui#1373` (`#970`) at `03c4b248` | Pullfrog approved; SonarCloud check fails: read its `output.summary`, fix the cause as a review batch, then merge |
| `ui#1374` (`#989`) at `5eced497` | waiting on CI and first review |
| `ui#1376` (`#1015`) at `d982cc96` | harness fixture fix; both harness suites pass on it; waiting on CI and first review |
| `#1008` worker | running at handoff in worktree `ticket-1008-habit-strip-gap` (branch `fix/ticket-1008-habit-strip-gap`, no pull request), outcome unknown: read the worktree, then deliver or relaunch a continuation |
| `#952` worker | running at handoff in worktree `ticket-952-composer-width` (branch `fix/ticket-952-composer-width`, no pull request), outcome unknown: read the worktree, then deliver or relaunch a continuation |
| Staging | web `redesign/main` `69bb019c` (`#1365` at `f3cdb248` not yet released); API `7e3a2e19` |
| Production | web `80faf22d`; API `ce78ccb4`; Android 1.3.45 (104) live, 1.3.46 (105) uploading |
| Throwaway AVD `Orbit_Repro_1345` | kept for proving `#1016`; delete after with `avdmanager delete avd -n Orbit_Repro_1345` |
| Open pull requests elsewhere | none in `orbit-api` or `orbit-landing-page` |
| Stashes | none in `orbit-ui-mobile` or `orbit-api` |
| Uncommitted work | none in the main checkouts |
| Unpushed commits | `fix/ticket-974-press-fill-hitbox` (batch commits, held by design until the local layout project passes); `fix/ticket-1008-habit-strip-gap` and `fix/ticket-952-composer-width` have no upstream yet |
| Detached HEADs | none in this repository's own worktrees (scratch check worktrees live outside the repository and hold nothing to keep) |
| Branches without a pull request | the `#1008` and `#952` branches above; older ticket worktrees as the spec's Current state describes |
| Ignored files | the session decision log stayed in its scratchpad |

Workers launched by this session die when the session ends: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

1. The in-flight rows above, top to bottom: the `main` sign-in and push fixes first (production users), then the carry, then the redesign pull requests. Merge each on the bar; release `redesign/main` web (and API when it changed) to staging after each merged batch.
2. After `ui#1359` merges: the first Orbit Staging internal build from `redesign/main` through `/android-release`, then `#961` (staging billing).
3. The spec's `### Batch R` filed tickets in their order (`#1008` and `#952` first as above, `#1007` once `ui#1359` merges), then a full rendered sweep of staging at desktop, phone and foldable widths, filing and fixing until a full pass finds nothing.
4. When the redesign is done, tell the owner (instruction 1) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
5. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c, the rest of Batch E and Batch 0b, as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried (the admission-cap sentence and the throwaway AVD permission added; the owner approved the throwaway AVD).
- Owner instruction 1 (Android sign-in and onboarding on 1.3.45): done in its first half. Root cause proven on the shipped bundle and an instrumented rebuild (foreground teardown of a session that did not exist, and an anonymous config 401 redirecting to login); `#1010` filed and merged as `ui#1372`; Android 1.3.46 dispatched. Carried: the production sign-in confirmation and the carry into `redesign/main` (in flight rows).
- Owner instruction 2 (tell the owner at the redesign gate): carried as instruction 1.
- Owner instruction 3 (`#1007` after `ui#1359`): carried as instruction 2.
- Owner instruction 4 (no recurring Pro prompt; light hover value): carried as instruction 3; the hover half is built in `ui#1373`.
- In flight: `ui#1356`, `ui#1365`, `ui#1367`, `ui#1368`, `ui#1369` done (merged; `#951`, `#973`, `#979`, `#983`, `#977` closed; staging web released at `69bb019c`); `ui#1359` carried with its new findings; `ui#1370` and `ui#1371` carried with their review batches; `#989` done as a pull request (`ui#1374`); `#970` done as a pull request (`ui#1373`); staging, production, stash, uncommitted, unpushed, detached, branch and ignored rows superseded by the rows above.
- Then, in order, steps 1 to 6: step 1 done as above; steps 2 to 6 carried as steps 1 to 5.

Every identifier here came from a previous session: treat each as a lead to verify.
