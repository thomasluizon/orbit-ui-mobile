/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Pro is Astra without the daily ceiling, and goals leave the paywall.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Price Orbit at 9.99 USD and gate depth never the core loop.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep, because most of this run is redesign repair.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Priority: the owner's reported bugs, then the redesign

The owner installed Orbit Staging and reported three defects on his phone. Fix them first, prove each, then return to the redesign:

1. Progresso shows "O pedido não terminou" on Android: Hermes has no `Intl.ListFormat` (Sentry `ORBIT-MOBILE-6`), and the habit form's weekday sentence hits the same call. `ui#1450` (`#1076`) loads the polyfill; drive it to merge.
2. Google sign-in on Orbit Staging fails ("O Google não abriu"): staging's `assetlinks.json` lacks `org.useorbit.app.staging`. `ui#1447` (`#1075`) adds it; drive it to merge, release staging web, confirm the statement through Google's Digital Asset Links API (spec, `#1075`).
3. The composer placeholder wrapped to three lines on 1.3.49, which predates the composer fix `#1379`: confirm on the current build in the sweep, and fix it if it still wraps.

After those merge, release staging web and ship an Orbit Staging internal build, then send the owner a push notification that the fixes are on staging, naming what to check on his phone.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch (spec standing rules); a small gate script in the scratchpad that holds a lock, waits, then execs `tools/launch-worker.mjs` does this. Run only one local hermetic Playwright run at a time; a worker allowed to run a layout spec waits until `pgrep -f "playwright test"` finds nothing. Before any launch, fast-forward the main checkout to `origin/redesign/main`, or the launcher refuses on the stale config check; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once (fold pull requests into one waiter with several `--pr` flags); a waiter started right after a push can end on `HEAD_MOVED` before GitHub registers the push, so restart it once. A merge commit a worker brings in, or a body edit, re-runs checks: read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows up in the rollup beside its passing twin. A SonarCloud job that runs past an hour and dies in the scan step is infra: rerun the failed job. A pull request GitHub reports as `CONFLICTING` starts no CI at all: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten, so drive open pull requests to merge first. A long ticket can hit the 45 minute hard ceiling inside its commit hooks: relaunch it from its tree with `--hard-ceiling-minutes 75` and an order that says to finish and commit what is there. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. Never chain a base merge and a push in one command: a failed merge must stop before the push. Check every pull request body for machine paths and em or en dashes before posting it, and stop on a failed check instead of posting. Until `#1019` merges, append to every worker order a note that generated `architecture.*` files stay uncommitted (they are gitignored), or a worker stops on the contradiction. Merges into `redesign/main` do not close tickets: close each merged ticket with `node tools/complete-ticket.mjs --issue "#N"`, a few seconds apart.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources (including GitHub environments, their branch rules and their secrets) through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml` and `/android-release`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (including Play declarations and questionnaires, mirroring production's facts honestly); create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after the proof; the recipe is in the spec's Constraints). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

Three more rules for this run. A worker cannot run Playwright, so when a pull request adds or edits a hermetic layout case, run that spec locally before merging it and prove a new case red on the unfixed base (spec, Current state). In this shell `ls` is aliased to eza; scripts use `command ls`. The orchestrator guardrail refuses a redirect whose target holds a variable or command substitution (process substitution included): redirect to a literal path or use a helper script in the scratchpad.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge and installable, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop there.
2. No recurring Orbit Pro prompt for free accounts (decided). Light-mode opaque hover is decided and shipped (`#970`).
3. Orbit Staging must be the most up to date build possible, installable, with the redesigned icon and the name "Orbit Staging". It installs now; the real name and icon need Play's review, which waits on the owner's reviewer login (spec, Batch R).
4. The owner's reported bugs come first (the Priority section above), then the redesign.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval; this run's first goal is the owner's three reported bugs fixed and on Orbit Staging, then the whole redesign done, on staging and on an internal Android build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 147 open tickets, all 147 placed in the spec's `## The order` (0 unplaced, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1450` (`#1076`) at `eff10ffb` | Intl.ListFormat polyfill; no review yet: drive to merge first |
| `ui#1447` (`#1075`) at `fa749f26` | staging App Links; no review yet: drive to merge, release staging web, verify the statement |
| `ui#1439` (`#1028`) | APPROVED at `b94e3233`; worktree `ticket-1028-controls-44` holds unpushed `4323b88e` (base merge) and `61693bd9` (hover fill fix) with its report in log `orbit-workers/#1028-1790871786599.log`: run `press-shape.spec.ts` locally (red on `b94e3233` at 1280, green on `61693bd9`), merge the report into the body, push, fresh review, merge |
| `ui#1441` (`#1057`) at `3e645902` | APPROVED; overlaps newer base files: merge-result check (layout included), then merge |
| `ui#1444` (`#1001`) at `166409c5` | approval predates the base merge: read the review of this head, `--re-review` if none, merge |
| `ui#1446` (`#1011`) at `cf20d698` | APPROVED: merge on the bar |
| `ui#1449` (`#1054`) at `00a77eb7` | no review yet; its worker filed `#1077` |
| `ui#1448` at `78ec7912` | `/questions` manual-step list; no review yet: merge on the bar |
| `#1029` worker | was running at handoff: worktree `ticket-1029-create-form-no-type-picker`, branch `fix/ticket-1029-create-form-no-type-picker`, local commit `d7cfa65f`, no remote branch, log `orbit-workers/#1029-1790872340089.log`; outcome unknown: read the worktree, push and open the pull request, or relaunch as a continuation |
| Orbit Staging (Play) | installs; 1.3.50 (109) from `e61ced56` on internal; listing, privacy, ads, content rating, government, finance and health saved; reviewer login is the owner's; target audience, data safety and store settings remain (spec, Batch R) |
| Staging | web `e61ced56` (one behind `redesign/main`, `#1442`); API `52c8db97`; landing current |
| Production | web `e3de6780` (behind `main` by `#987`); API `3d1a71aa`; landing `ebbebb2a`; Android 1.3.48 (107) on the open track |
| `#961`, `#1009` | owner's purchase; Cloudflare token permission (owner) |
| Open pull requests elsewhere | none in `orbit-api` or `orbit-landing-page` |
| Stashes | none in any repository |
| Uncommitted work | none in the main checkouts or the ticket worktrees above |
| Unpushed commits | `fix/ticket-1028-controls-44` (`4323b88e`, `61693bd9`); `fix/ticket-1029-create-form-no-type-picker` (`d7cfa65f`, no remote branch) |
| Detached HEADs | none |
| Branches without a pull request | `fix/ticket-1029-create-form-no-type-picker` (worker); older ticket worktrees as the spec's Current state describes |
| Merged this run, worktrees to tear down | `#1422`, `#1428`, `#1431`, `#1442`, `#1443`, `#1445` and the `questions-manual-steps` worktree after `ui#1448` merges |
| Ignored files | the session decision log stayed in its scratchpad; durable rules and decisions are in the spec (Batch R, Constraints, Current state) |

Workers launched by this session die when it ends: read each worktree before relaunching, because a finished worker leaves commits, a dirty tree, or nothing.

## Then, in order

1. The Priority section: `ui#1450` and `ui#1447` to merge, staging web release, Orbit Staging build, push notification to the owner.
2. The in-flight rows above, top to bottom: merge what is approved on the bar (merge-result checks where the base overlaps), deliver or relaunch the `#1029` worktree, answer each review. Release `redesign/main` web to staging after each merged batch, and ship a new Orbit Staging internal build after each batch of redesign merges.
3. Orbit Staging's remaining Play setup in a visible window (spec, Batch R); send it for review once the owner's reviewer login is in.
4. The spec's `### Batch R` list in its order, checking file overlap with open pull requests and running workers before each launch; the unverified findings there (Habit detail disclosure, not-found chips, Astra "Próximas perguntas") get reproduced in a visible window and filed. File the Sentry staging-environment ticket and correct production's content rating (spec, Batch R decisions).
5. A full rendered sweep of staging at desktop, phone and foldable widths after the batch reaches staging, covering what the last sweep could not reach (spec, Sweep coverage) and the composer placeholder check, filing and fixing until a full pass finds nothing. Then an Orbit Staging internal build after the last redesign merge.
6. When the redesign is done, tell the owner (instruction 1) and stop at THE REDESIGN GATE; do not merge `redesign/main` to `main`.
7. The rest of `### Batch M` (`#943`, then the retired-project list for the owner), then Batch 0c (including `#1040` and `#1043`), the rest of Batch E and Batch 0b (`#556` with the `#987` carry, `#746`, `#926`, `#1019`, `#1018`, the `#1070` backport, `#1072`), as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried; added the SonarCloud infra rerun, the capacity relaunch, the ticket-closing note, the gate script, and the credential and Play-declaration lines to the authorization.
- Priority one (Orbit Staging installs with the right name and icon): install done (the owner installed it; Play-side checks clean); name and icon carried as owner instruction 3 and the Play setup step, waiting on the owner's reviewer login.
- Owner instructions 1 and 2: carried. Instruction 3: carried with its current state. Instruction 4 is new from the owner's wrap-up.
- In flight: `ui#1422` done (merged `9f469225` after a combined merge-result check), `ui#1428` done (`517be205`), `ui#1431` done (`84705faa`), `ui#1442` done (`c6544b60`, extension salvaged and reviewed), `ui#1443` done (`4f415064`), `#1074` done (`ui#1445`, merged `e61ced56`); tickets `#892`, `#1069`, `#1053`, `#1013`, `#1067`, `#1074`, `#1071` closed. `ui#1439` carried (batch delivered locally, push owed). `ui#1441` carried (review fix `3e645902` approved, merge check owed). `ui#1444` carried (base merge pushed). Staging superseded (web released `e61ced56`). Production, `#961`, `#1009`, `#1070` backport: carried. Detached HEADs: done (`mc1`, `mc-1422` removed).
- Then, in order, steps 1 to 6: step 1 done as above; steps 2 to 6 carried as steps 2, 4, 5, 6 and 7, with the owner's bugs as step 1 and the Play setup as step 3; `#1029`, `#1011` and `#1054` moved from filed tickets to work in flight; `#1075`, `#1076` and `#1077` placed in Batch R.

Every identifier here came from a previous session: treat each as a lead to verify.
