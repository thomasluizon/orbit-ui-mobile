/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: the five token-cost tickets (owner priority)

The owner moved these ahead of everything else in this prompt. They take the next free worker slots, before any other launch or relaunch (`#1081`, `#1086` and `#1087` included):

1. `#1092` One deterministic status call answers every orchestrator wakeup.
2. `#1093` The ticket classifier on Claude headless, recalibrated.
3. `#1094` `/second-opinion` on Claude headless.
4. `#1091` Relay an unattended run to a fresh session at 400K context, with the whole session chain kept for the next wrap-up. Launch it only after `#1092` merges: both rewrite the orchestrate wakeup text.
5. `#1089` Worker sub-agents only for the redesign close gate. Launch it only after `#1091` merges: both change `.claude/orchestrator.json`, the launcher and the orchestrate skill.

Eight pull requests are open, so the ten cap admits two workers now: launch `#1092` and `#1093` first, and `#1094` when a slot frees. `#1093` and `#1094` need no second Claude account, and both must merge before the owner's ChatGPT plan ends. Keep driving the in-flight pull requests to merge meanwhile, because that needs no worker slot. A merged harness change to the hooks or skills takes effect in the next session, not in this one.

## Second: the throwaway-AVD session (Play screenshots, `#1086`, `#1087`)

One throwaway AVD session serves three needs; run it as a background agent so merges continue meanwhile. Follow the spec's device repro recipe and its `#1086` and `#1087` bullets in Batch R: an instrumented release rebuild of `3709832e` (Orbit Staging 1.3.51) on a separate AVD (never `Orbit_Pixel_9_API_35`, no personal account, deleted after), signed in against a local mock API on the host that answers the Google code exchange with success and serves schema-valid reads.

1. `#1086`: reproduce the stuck sign-in spinner with `[DEBUG-g7r2]` logs at each step and name the stalled step with file:line; then launch the `#1086` worker with that evidence.
2. `#1087`: with zero goals and at least one habit, scroll Progresso to its end and measure the goals empty state's last element against the composer top, the composer height with and without its chips, and the file:line that computes the shell clearance; then relaunch the `#1087` worker with that evidence (its first run found nothing from code alone, and `#1325` is already in 1.3.51).
3. Play listing: with the AVD in English and a seeded realistic English account (six habits with history, one goal, a Pro trial), capture Hoje, a habit's detail, Calendário, Progresso and the Astra conversation at native resolution with a clean demo-mode status bar.

Then finish Orbit Staging's Play review in the Mac Chrome (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden): upload the five screenshots, the icon and the feature graphic to the en-US listing, make en-US the default language, remove the pt-BR listing, confirm the pre-review check shows no problem, and send the pending changes for review from Visão geral da publicação. Do each save and send click yourself.

Then finish `#1009`: one full observation hour inside the window (seven probes ten minutes apart, `infra/README.md` "Staging pinger"), with the Worker's five-minute invocations read from the dashboard's Observability tab; record both on the ticket, then open the `orbit-api` pull request that deletes `.github/workflows/staging-keepalive.yml`.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree may come without `node_modules`: run `npm ci` there before launching and check its exit code. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters and `list-bot-threads.mjs --re-review` waits included (fold pull requests into one waiter with several `--pr` flags); a waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build, never accepted on the worker's code reading alone. Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it. Until `#1019` merges, append to every worker order that generated `architecture.*` files stay uncommitted. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`. Before merging any pull request behind its base, also run `npx turbo run type-check --force` on the combined merge. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Configure every external service from its current documentation, never from memory, and never pick a legacy option.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console (including the store listing, closed testing for Orbit Staging and sending it for review) and the Pullfrog console through `claude-in-chrome`, mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work (step 7 below) continues.
2. No recurring Orbit Pro prompt for free accounts (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon (the Play review in the first step finishes the name and icon).
4. The five token-cost tickets come first, then the owner's reported bugs, then the redesign.
5. Onboarding follows the ADR named above.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the five token-cost tickets, then Orbit Staging's Play review and the owner's four bugs, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 157 open tickets, all 157 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket); the new ones are `#1063` (now leading its own Batch R bullet) and the eleven `#1089` to `#1099` (Batch 0b: five token-cost tickets first, then the move off OpenAI in its own ordered list).

## In flight

| item | disposition |
|---|---|
| `ui#1446` (`#1011`) at `63ee0295`, `ui#1456` (`#1077`) at `5d57131c`, `ui#1458` (`#1063`) at `3fdb6d5e` | APPROVED before a base merge that picked up the `#1083` fix; waiting on CI and a fresh Pullfrog review of the merge heads; merge on the bar |
| `ui#1454` (`#1078`) at `2fb6827d` | review fix pushed, thread resolved, body merged, then base-merged; waiting on CI and a fresh review; merge on the bar |
| `ui#1461` (`#1085`) at `f0051805` | PluralRules polyfill, base-merged over `#1460`'s test rewrite; waiting on CI and its first review; merge on the bar |
| `ui#1457` (`#1080`, into `main`) at `d1bd4e4a` | approved, every check green after `parity:exempt`; fresh review requested after the body edit; merge to `main` |
| `ui#1459` (`#1043`, into `main`) at `866fea29` | review batch pushed, both threads resolved; waiting on CI and a fresh review; merge to `main`, then ship Android to the open track |
| `ui#1462` (`#1084`) at `a38bcc12` | the worker finished after the handoff and opened this non-draft pull request into `redesign/main` (five commits); wait on CI and its first review, check its files against `#1082` and `ui#1459`'s `_layout.tsx` change, then merge on the bar |
| `#1081` worker | outcome unknown: one commit `4d003f7c` plus four modified files in `ticket-1081-radiorow-press-scale` (branch `fix/ticket-1081-radiorow-press-scale`), its pre-launch `npm ci` exited 190; run `npm ci`, read the tree, relaunch with a continuation order |
| `#1087` | worker found no defect from code; `ticket-1087-shell-bottom-clearance` holds no commits; relaunch after the AVD measurement (first step) |
| `#1086` | no worker yet; launch after the AVD repro (first step) |
| AVD repro agent | stopped; its emulator, the `orbit_repro_1086` AVD and the `repro-1086` worktree are deleted. It reproduced `#1086` before stopping: the trace is a comment on `#1086` (the exchange and session write succeed, then auth-callback's `router.replace("/")` returns without a route change, so the stall is that navigation); confirm the file:line cause from that trace, and rebuild the AVD session only for the `#1087` measurement and the screenshots |
| Orbit Staging Play | closed track: testers "Bonis", release 1.3.51 (110) saved, ad ID "Não", en-US translation saved; screenshots, default language and the review send owed (first step) |
| `#1009` pinger | applied and firing; two of seven probes taken (200 in 0.51 s and 0.23 s) before the session ended, so the observation hour restarts; then the keepalive deletion pull request |
| Staging | web `2f2f0a95` (four merges behind `redesign/main` at `25f00d77`: release staging web after the next merges); API `52c8db97`; landing current; Orbit Staging 1.3.51 (110) internal |
| Production | web `e3de6780` (behind `main` by `#987`); API `3d1a71aa`; landing `ebbebb2a`; Android 1.3.48 (107) open |
| Open pull requests elsewhere | none in `orbit-api` or `orbit-landing-page` |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts; `ticket-1081-radiorow-press-scale` has four modified files (above) |
| Unpushed commits | none |
| Detached HEADs | `questions-manual-steps` worktree: a local merge-check commit only, disposable; the scratch merge-check worktree `mc-trio` lived in the session scratchpad and goes with `git worktree prune` |
| Branches without a pull request | `fix/ticket-1081-radiorow-press-scale`, `fix/ticket-1087-shell-bottom-clearance` (above), plus older ticket worktrees as the spec's Current state describes |
| Merged this run, worktrees to tear down | `#1441`, `#1453`, `#1455`, `#1460` (tickets `#1057`, `#991`, `#1079`, `#1083` closed) |
| Ignored files | the session decision log stayed in its scratchpad; every durable rule and fact is in the spec |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Then, in order

1. The five token-cost tickets (the first section above), in their order.
2. The second step (the throwaway-AVD session, the Play review, the `#1009` proof).
3. The in-flight rows above, top to bottom; release `redesign/main` web to staging after each merged batch and ship a new Orbit Staging internal build after each batch of redesign merges.
4. The owner's four bugs (`#1084` to `#1087`).
5. The spec's `### Batch R` list in its order (including `#1081`, `#1082`, `#1038`, `#976`, `#995`), checking file overlap with open pull requests and running workers before each launch. Correct production's content rating with a new questionnaire mirroring Orbit Staging's honest answers.
6. A full rendered sweep of staging at desktop, phone and foldable widths, covering what the last sweep could not reach (spec, Sweep coverage), filing and fixing until a full pass finds nothing; then an Orbit Staging internal build after the last redesign merge.
7. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
8. The rest of `### Batch M` (`#943` with the SES switch, then the retired-project list for the owner), Batch 0c (`#1043` via `ui#1459`, `#1040`, the rest), Batch E and Batch 0b (`#556` with the `#987` and `#1080` carry, `#746`, `#926`, `#1019`, `#1018`, the `#1070` backport, `#1072`, then the move off OpenAI from `#1095` once the owner finishes `#1090`), as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and owner instructions 1 to 5: carried; added the window-restore command, the `npm ci` check for a new worktree, the decision rule for a worker's NEEDS_DECISION, `--re-review` waits counted as waiters, and the store listing and screenshot capture to the authorization.
- First step, Orbit Staging's Play review: partly done (testers "Bonis", release from 1.3.51 (110) saved, ad ID declared, en-US translation added); the send is carried, now behind real screenshots and the en-US default because Play's pre-review check flagged a listing that shows only the Entrar screen.
- First step, Cloudflare pinger: apply done (workers.dev subdomain `useorbit` created through the API, Worker and both cron schedules live, first scheduled run succeeded); the observation hour and the keepalive deletion are carried.
- In flight: `ui#1441` done (`6b7da44c`), `ui#1453` done (`1972feb3`), `ui#1455` done (`fc725352`), `#1083` done (`ui#1460`, `25f00d77`); `ui#1446`, `ui#1456`, `ui#1458` carried (base-merged, in CI); `ui#1454` carried (review fix pushed, base-merged); `ui#1457` carried (parity fixed, re-review); `ui#1459` carried (review batch pushed).
- The owner's four bugs: `#1085` has `ui#1461`; `#1084` has `ui#1462`; `#1086` and `#1087` carried behind the AVD session.
- Then, in order: steps 1 to 7 carried as steps 2 to 8; the eleven new tickets placed in the order.
- Owner change after the handoff: the five token-cost tickets (`#1092`, `#1093`, `#1094`, `#1091`, `#1089`) moved from the end of step 8 to a new first section and step 1, and owner instruction 4 now puts them first. `#1093` and `#1094` left the move-off-OpenAI list's account wait, because they need no second account.

Every identifier here came from a previous session: treat each as a lead to verify.
