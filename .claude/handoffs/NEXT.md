/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules). Run only one local hermetic Playwright run at a time; a worker allowed to run a layout spec waits until `pgrep -f "playwright test"` finds nothing. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once (fold pull requests into one waiter with several `--pr` flags); a waiter started right after a push can end on `HEAD_MOVED` before GitHub registers the push, so restart it once. A merge commit a worker brings in, or a body edit, re-runs checks: read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows up in the rollup beside its passing twin. A pull request GitHub reports as `CONFLICTING` starts no CI at all: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten, so drive open pull requests to merge first. A long ticket can hit the 45 minute hard ceiling inside its commit hooks: relaunch it from its tree with `--hard-ceiling-minutes 75` and an order that says to finish and commit what is there. Never chain a base merge and a push in one command: a failed merge must stop before the push. Check every pull request body for machine paths and em or en dashes before posting it, and stop on a failed check instead of posting. Until `#1019` merges, append to every worker order a note that generated `architecture.*` files stay uncommitted (they are gitignored), or a worker stops on the contradiction.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome`; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after the proof; the recipe is in the spec's Constraints). Never create an account, enter a password or payment detail, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report. That is THE REDESIGN GATE; stop there.
2. No recurring Orbit Pro prompt for free accounts (decided). Light-mode opaque hover is decided and shipped (`#970`).

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the whole redesign done, on staging and on an internal Android build of Orbit Staging (`org.useorbit.app.staging`), then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 161 open tickets, all 161 placed in the spec's `## The order` (0 unplaced, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1422` (`#892`) | Pullfrog APPROVED `be100ce7`; worktree `ticket-892-habit-create-pushed-screen` holds unpushed review commits (CodeQL linear parsing, 8 stale layout cases fixed) and a running batch 3 (log `orbit-workers/#892-1790853084784.log`) for the last three stale cases, `#1069`. Read the worktree; merge the reports into the body, push once, resolve the two CodeQL threads once CodeQL rescans clean, then merge on the bar |
| `ui#1417` (`#1026`) at `7636453f` | base merge pushed; waiting on CI and Pullfrog approval of that head |
| `ui#1425` (`#1060`) at `ca0b6efd` | Pullfrog APPROVED, thread resolved; checks were running: merge-result check, merge |
| `ui#1426` (`#1027`) at `1874c08b` | Pullfrog APPROVED; checks were running: merge-result check, merge |
| Worker `#1053` | worktree `ticket-1053-skip-undo-toast`, branch `fix/ticket-1053-skip-undo-toast` (no upstream yet; 3 commits including `e58ffa82` skip with undo), log `orbit-workers/#1053-1790852631805.log`; relaunched from its tree; outcome unknown, read the worktree first |
| Worker `#1013` | worktree `ticket-1013-neutral-press-feedback`, log `orbit-workers/#1013-1790852994063.log`; outcome unknown, read the worktree first |
| Worker `#1058` | worktree `ticket-1058-public-manifest`, log `orbit-workers/#1058-1790853176124.log`; outcome unknown, read the worktree first |
| Staging | web `8f788cd5`, behind `redesign/main` `3ba3bb3f`: release staging web; API `52c8db97` (skip undo); landing current |
| Production | web `e3de6780`; API `3d1a71aa`; landing `ebbebb2a`; Android 1.3.48 (107) on the open track (no build owed) |
| Orbit Staging | 1.3.49 (108) on internal testing; ship a new internal build after the open redesign pull requests merge |
| `#961` staging billing | base plans, offers, service account access and the test notification are done; the license-tester purchase is the owner's; then `#1040` |
| `#1009` staging pinger | apply blocked on the Cloudflare token's Workers Scripts Edit (owner); keep `staging-keepalive.yml` until the probe proof passes |
| Open pull requests elsewhere | none in `orbit-api` or `orbit-landing-page` |
| Stashes | none in any repository |
| Uncommitted work | none in the main checkouts; the running workers' worktrees are dirty by design |
| Unpushed commits | `fix/ticket-892-habit-create-pushed-screen` (review batches); `fix/ticket-1053-skip-undo-toast` (no remote branch yet) |
| Detached HEADs | only scratch merge-check worktrees under a session scratchpad; `git worktree prune` after the folder is gone |
| Branches without a pull request | the running workers' branches; older ticket worktrees as the spec's Current state describes |
| Ignored files | the session decision log stayed in its scratchpad; durable decisions are in the spec's Batch R decisions paragraph |

Workers launched by this session die when it ends: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

1. The in-flight rows above, top to bottom: push and merge the four open pull requests on the bar (one combined local merge-result check for those behind the base), read the three worker worktrees and deliver or relaunch with a continuation order. Release `redesign/main` web to staging after each merged batch.
2. The spec's `### Batch R` list in its order, checking file overlap with open pull requests and running workers before each launch.
3. A full rendered sweep of staging at desktop, phone and foldable widths after the batch reaches staging, covering what the last sweep could not reach (spec, Sweep coverage), filing and fixing until a full pass finds nothing. Then an Orbit Staging internal build after the last redesign merge.
4. When the redesign is done, tell the owner (instruction 1) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
5. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c (including `#1040` and `#1043`), the rest of Batch E and Batch 0b (`#556`, `#746`, `#926`, `#1019`, `#1018`, `#1070`), as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried; added the waiter `HEAD_MOVED` restart, the conflicting pull request check, the 75 minute ceiling relaunch, the Playwright wait for workers and the pull request body check.
- Owner instruction 1: carried.
- Owner instruction 2 (onboarding ends on the Pro trial step): done, `ui#1393` merged as `167cef88`.
- Owner instruction 3: carried as instruction 2.
- In flight: `ui#1389`, `ui#1390`, `ui#1391`, `ui#1392` done (merged as `cb05a17f`, `cca16a9d`, `593c6e50`, `a1bf1b43`). `ui#1393` done (`167cef88`). `orbit-api#675` done (merged to `main` as `6444752a`, carried by `#746`). Workers `#1021`, `#1022`, `#1023` done (`ui#1395` `376a27f9`, `ui#1394` `12443721`, `ui#1396` `f390065b`). Staging, production, Orbit Staging, `#961`, `#1009`, owner sign-in and inventory rows superseded by the rows above.
- Then, in order, steps 1 to 5: carried as steps 1 to 5, with this run's filed tickets placed in the spec's order.

Every identifier here came from a previous session: treat each as a lead to verify.
