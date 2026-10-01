/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules). Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once (fold pull requests into one waiter with several `--pr` flags). A merge commit a worker brings in, or a body edit, re-runs checks: read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows up in the rollup beside its passing twin. A new ticket worker is refused while open pull requests plus live workers exceed ten, so drive open pull requests to merge first. Never chain a base merge and a push in one command: a failed merge must stop before the push. Until `#1019` merges, append to every worker order a note that generated `architecture.*` files stay uncommitted (they are gitignored), or a worker stops on the contradiction.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after the proof; the recipe is in the spec's Constraints). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report. That is THE REDESIGN GATE; stop there.
2. Onboarding ends with the free Pro trial step, or the Orbit Pro paywall for an account not on a trial; an account that already has paid Pro sees neither and onboarding finishes normally. It is `#1007`, now `ui#1393`.
3. No recurring Orbit Pro prompt for free accounts (decided). Light-mode opaque hover is decided and shipped (`#970`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`), then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 172 open tickets, all 172 placed in the spec's `## The order` (0 unplaced, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1389` (`#841`) at `f2fc0ccf` | Pullfrog APPROVED, checks settled green: merge-result check on the current base (layout project), merge |
| `ui#1390` (`#982`) at `efcabcaa` | Pullfrog APPROVED, checks settled green: merge-result check, merge |
| `ui#1391` (`#1024`) at `c5714614` | Pullfrog APPROVED; its waiter listed most checks as failing, the cancelled-duplicate pattern: read `gh run list --commit c5714614`, read the Layout Guard log if it is red, then merge on the bar |
| `ui#1392` (`#965`) at `6c6d535b` | waiting on CI and first review |
| `ui#1393` (`#1007`) at `59eb15f3` | waiting on CI and first review; approve its copy with `/second-opinion` and post the verdict before merge; local layout run |
| `orbit-api#675` (`#1020`) at `9a9f52d6` | Pullfrog CHANGES_REQUESTED, thread `PRRT_kwDORKgXhc6nxLuT` (Stripe idempotency keys). Review batch 1 committed `824a4336` in worktree `ticket-1020-stripe-success-url`, NOT pushed (report in the orbit-workers log for `#1020`, a reboot erases it): merge the report into the body, resolve the thread as fixed in `824a4336`, push once. After merge, plan and apply only the two API environment groups, then redeploy both API services at their current commits so they read the new URLs |
| Worker `#1021` | worktree `ticket-1021-focus-ring-clipping`, branch `fix/ticket-1021-focus-ring-clipping`, log `orbit-workers/#1021-1790817425377.log`; sent to build the ticket; outcome unknown, read the worktree first |
| Worker `#1022` | worktree `ticket-1022-habit-detail-screen`, branch `fix/ticket-1022-habit-detail-screen`, log `orbit-workers/#1022-1790817612845.log`; outcome unknown, read the worktree first |
| Worker `#1023` | worktree `ticket-1023-astra-preview-block`, branch `fix/ticket-1023-astra-preview-block`, log `orbit-workers/#1023-1790817160066.log`; outcome unknown, read the worktree first |
| Staging | web `e06cd06b`, one merge behind `redesign/main` `8743c137` (the `#1017` carry): release staging web; API `d2f0934f`; landing unchanged |
| Production | web `e3de6780`; API `2b1fecfc`; landing `ebbebb2a`; Android 1.3.48 (107) on the open track (no build owed: the newer `main` commit changed only a mobile test) |
| Orbit Staging | 1.3.49 (108) on internal testing; store listing icon draft not yet saved; ship a new internal build after this batch of merges |
| `#961` staging billing | config applied, staging Pub/Sub topic and push subscription created, Monetization setup names the topic, `orbit_pro` exists without base plans: try the base plans and the service account access once in a visible window (Constraints); if it still fails, it stays the owner's click; then the test notification and the purchase proof; then `#1040` |
| `#1009` staging pinger | merged; apply blocked on the Cloudflare token's Workers Scripts Edit (owner); keep `staging-keepalive.yml` until the probe proof passes |
| Owner sign-in check | watch production logs for the owner's first Google sign-in on 1.3.46 or later and record it on `#1010` |
| Open pull requests elsewhere | `orbit-api#675` only; none in `orbit-landing-page` |
| Stashes | none in any repository |
| Uncommitted work | none in the main checkouts; the three running workers' worktrees are dirty by design |
| Unpushed commits | `fix/ticket-1020-stripe-success-url` (1 commit, `824a4336`) |
| Detached HEADs | only the scratch merge-check worktree under a session scratchpad, holding local merges; `git worktree prune` after the folder is gone |
| Branches without a pull request | the three running workers' branches; older ticket worktrees as the spec's Current state describes |
| Ignored files | the session decision log stayed in its scratchpad |

Workers launched by this session die when it ends: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

1. The in-flight rows above, top to bottom: merge the approved pull requests on the bar (one combined local merge-result check for those behind the base), push the `orbit-api#675` batch, read the three worker worktrees and deliver or relaunch with a continuation order. Release `redesign/main` web (and API when it changed) to staging after each merged batch, and ship an Orbit Staging internal build after the batch.
2. The spec's `### Batch R` filed tickets in their order (the open pull request list first, then `#1021`, `#1023` with `#1041`, `#1022`, `#958` after `ui#1389`, `#961`'s remaining work, `#851` and the sheet footer tickets after `ui#1392`, and the rest as listed), checking file overlap before each launch.
3. A full rendered sweep of staging at desktop, phone and foldable widths after the batch reaches staging, covering what the last sweep could not reach (spec, Sweep coverage), filing and fixing until a full pass finds nothing.
4. When the redesign is done, tell the owner (instruction 1) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
5. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c (including `#1020` and `#1040`), the rest of Batch E and Batch 0b (`#556`, `#746`, `#926`, `#1019`, `#1018`), as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried; one line added for the architecture-file note until `#1019` merges.
- Owner instruction 1: carried (now requires an internal build after the last redesign merge, since the first build shipped).
- Owner instruction 2: carried; `#1007` is built and open as `ui#1393`.
- Owner instruction 3: carried.
- In flight: `ui#1359` done (merged `490c436a`, `#889` closed on Sobre and its Suporte half filed as `#1030`, staging web released, first Orbit Staging build uploaded, `#961` started). `orbit-api#672` done (merged `d2f0934f`, staging API released). `ui#1382` done (merged `26b959c4`, production web released, Android 1.3.48 shipped, carried as `ui#1388`, merged `8743c137`). `ui#1381` done (merged `a8700ca2`). `ui#1374` done (merged `5a14b0c0` after a base merge). `ui#1370` done (merged `e06cd06b` after a worker merge-forward). `ui#1379` done (merged `15e72b3c`). `ui#1380` done (merged `a8c4ab77`). `ui#1383` done (merged `58aa9802`). Staging, production, owner sign-in, open pull request, stash, uncommitted, unpushed, detached, branch and ignored rows superseded by the rows above.
- Then, in order, steps 1 to 5: carried as steps 1 to 5, with the new tickets this run filed placed in the spec's order.

Every identifier here came from a previous session: treat each as a lead to verify.
