/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: the token-cost tickets (owner priority)

They take the next free worker slots and the first review and merge attention, before anything else in this prompt:

1. `#1092` `ui#1465` (`tools/run-status.mjs`): `pullfrog-approval` failed on head `3ac0d64d`. Read its review with `node tools/list-bot-threads.mjs --pr 1465 --repo ui --wait-seconds 0 --no-request`, fix or file every finding as one batch, then merge on the bar.
2. `#1093` `ui#1464` (classifier on Claude Sonnet, 41 of 41) and `#1094` `ui#1463` (second opinion on Claude Opus): both green at `f47ab754` and `3ea7a002` after the attachment fix (`CLAUDE_CODE_DISABLE_ATTACHMENTS=1`); request a fresh review of each head with a plain `@pullfrog review` comment if none landed, then merge on the bar. Both must merge before the owner's ChatGPT plan ends.
3. `#1091` (relay to a fresh session at a context threshold): not built, so no automatic relay happens at 400K today. Launch it the moment `ui#1465` merges, because both rewrite the orchestrate wakeup text.
4. `#1089` (worker sub-agents only for the redesign close gate): launch after `#1091` merges.

## Then: the owner's reported bugs and Batch R

1. `ui#1462` (`#1084`, onboarding once per install): review batch pushed at `af193faa`, every check green; wait for a fresh Pullfrog review of that head, then merge on the bar.
2. `#1086` (Google sign-in spins): the cause is proven with file:line in the spec's Batch R bullet. Launch its worker the moment `ui#1462` merges, carrying that evidence and the "Google did not open" dismiss race in the same order.
3. `ui#1466` (`#976`): at its first review batch, also delete the dead `HabitTagChip` on web and Android (spec Batch R), prove its new layout case red locally on an unfixed build, then merge on the bar.
4. `#1081`: relaunch from `ticket-1081-radiorow-press-scale` (five unpushed commits, clean tree, no pull request) with `--hard-ceiling-minutes 75` and a continuation order.
5. After `ui#1462` merges: `#1082` and `#1038`; after `ui#1466` merges: `#995`. File and fix the Android `No route named "r"` warning (spec Batch R).
6. Release `redesign/main` web to staging after each merged batch (staging web is one merge behind, at `de3701a0`), and ship a new Orbit Staging internal build after each batch of redesign merges.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`, so no `--re-review` wait holds a slot. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. Until `#1019` (`ui#1467`) merges, append to every worker order that generated `architecture.*` files stay uncommitted. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, the web build and the hermetic layout project, all by exit code). A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The token-cost tickets come first, then the owner's reported bugs, then the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. The owner has not yet done the license-tester purchase (`#961`) or the production Google sign-in (`#1010`); keep both on his manual list in the report.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the token-cost tickets, then the owner's bugs, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 149 open tickets, all 149 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1465` (`#1092`) at `3ac0d64d` | CI green except `pullfrog-approval`: read and answer its review batch, then merge on the bar |
| `ui#1464` (`#1093`) at `f47ab754`, `ui#1463` (`#1094`) at `3ea7a002` | attachment fix pushed (thread on `#1463` resolved), CI green; need a fresh Pullfrog approval of these heads, then merge on the bar |
| `ui#1462` (`#1084`) at `af193faa` | review batch pushed, thread resolved, CI green; needs a fresh approval, then merge |
| `ui#1466` (`#976`) at `dca0d05a` | waiting on its first review; batch adds the `HabitTagChip` deletion; prove its layout case red locally before merge |
| `ui#1467` (`#1019`) at `a55b1ebd` | waiting on CI and its first review; merge on the bar |
| `orbit-api#682` (`#1009`), `#683` (`#1018`), `#684` (`#943`) | into `main`; waiting on CI and Pullfrog; merge on the bar; after `#684` release the API to production and staging, then list the retired projects and the Resend account for the owner's delete click |
| `#1081` | `ticket-1081-radiorow-press-scale`, branch `fix/ticket-1081-radiorow-press-scale`: five unpushed commits, clean, no pull request; the continuation hit the 45 minute ceiling; relaunch with 75 |
| `#926` | decided on the ticket (delete on `main`, keep the rebaseline job on `redesign/main`); `ticket-926-drop-drift-merge-job` holds no commits; relaunch with that decision |
| `#1086` | cause proven (spec Batch R); launch after `ui#1462` merges |
| `#1087` | closed as not reproduced after a device measurement; remove `ticket-1087-shell-bottom-clearance` (no commits) |
| Orbit Staging Play | sent to review with the en-US listing and real screenshots; check the result in Visão geral da publicação |
| Staging | web released from `redesign/main` at `de3701a0` (one merge behind `95c85f8c`); API `52c8db97`; landing current; Orbit Staging 1.3.51 (110) internal and closed |
| Production | web `e3de6780`; API `3d1a71aa`; landing `ebbebb2a`; Android 1.3.52 (111) open |
| Running workers | none (every worker launched this session exited) |
| Open pull requests in `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts |
| Unpushed commits | only `fix/ticket-1081-radiorow-press-scale` (above) |
| Detached HEADs | scratch merge-check worktrees `mc-trio`, `mc-quad`, `mc-m1454`, `mc-main1459` and `questions-manual-steps`: merge-check commits only, disposable; they go with `git worktree prune` once their scratchpad directories are gone |
| Branches without a pull request | `fix/ticket-1081-radiorow-press-scale`, `chore/ticket-926-drop-drift-merge-job`, `fix/ticket-1087-shell-bottom-clearance` (above), plus older ticket worktrees as the spec's Current state describes |
| Merged this run, worktrees to tear down | `#1011`, `#1077`, `#1063`, `#1085`, `#1078` (redesign/main), `#1080`, `#1043` (main), and the earlier ones the spec lists |
| Ignored files | the session decision log and the throwaway-AVD evidence stayed in the scratchpad; every durable rule and fact is in the spec |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Then, in order

1. The token-cost tickets (first section).
2. The owner's bugs and Batch R (second section), then the in-flight rows above.
3. The spec's `### Batch R` list in its order, checking file overlap with open pull requests and running workers before each launch. Correct production's content rating with a new questionnaire mirroring Orbit Staging's honest answers.
4. A full rendered sweep of staging at desktop, phone and foldable widths, covering what the last sweep could not reach (spec, Sweep coverage), filing and fixing until a full pass finds nothing; then an Orbit Staging internal build after the last redesign merge.
5. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
6. The rest of `### Batch M` (`#943` and the retired-project list), Batch 0c (`#1040`, the rest), Batch E and Batch 0b (`#556` with the `#987`, `#1080`, `#1043` carry and the `#926` adjustment, `#746` with the `orbit-api` `main` carry, `#1072`, the `#1070` backport), as the spec orders them. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and owner instructions 1 to 5: carried; added the Orca setup-install wait before `npm ci`, the absolute `--repo path:`, plain `@pullfrog review` requests instead of `--re-review` waits, the attachment switch for headless `claude`, and owner instructions 6 and 7.
- Five token-cost tickets: `#1092` opened `ui#1465` (review red), `#1093` opened `ui#1464`, `#1094` opened `ui#1463` (both carry the attachment fix); `#1091` and `#1089` carried behind them.
- Throwaway-AVD session: done; `#1086` cause proven (carried to its worker), `#1087` measured and closed as not reproduced, five Play screenshots captured; the AVD, emulator and scratch worktree are deleted.
- Orbit Staging Play review: done; en-US default listing with screenshots, icon and feature graphic, pt-BR removed, `orbit_pro` en-US name added, 14 changes sent to review.
- `#1009` observation hour: done (seven probes and 25 Worker invocations on the ticket); the keepalive deletion is `orbit-api#682`, carried.
- In flight: `ui#1446`, `#1456`, `#1458`, `#1461`, `#1454` merged into `redesign/main` (`c1b3fa6d`, `a447fd05`, `b7ac8048`, `de3701a0`, `95c85f8c`); `ui#1457` and `ui#1459` merged into `main` (`467bb0bd`, `a67cc942`) and shipped in Android 1.3.52 (111); `ui#1462` carried (review batch pushed); `#1081` carried (continuation hit the ceiling); `#1087` superseded by its closure; AVD agent done.
- Then, in order: steps carried; Batch 0b and M items `#943`, `#1018`, `#1019`, `#926` were started this run because every Batch R ticket was blocked on an open pull request.
- Owner change at the wrap-up: no second Claude Max account until the Codex credits end; the `#961` purchase and the `#1010` sign-in stay on his list.

Every identifier here came from a previous session: treat each as a lead to verify.
