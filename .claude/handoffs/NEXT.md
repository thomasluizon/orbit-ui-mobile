/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This session is the nominated successor of a context relay: adopt the run with `adoptRelayRun` as the sleep skill says, and do not replan the queue.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: the harness fix, then the open pull requests (all on `redesign/main`)

1. `#1126` (relay threshold checked after tool calls, not only at `Stop`): launch it first, on `redesign/main`, and run both harness suites before it merges. Until it lands, measure the transcript before long work in a turn (spec constraint) and end the turn once past the threshold.
2. `ui#1498` (`#1118`, `/progress` reports every chain entry): APPROVED at `40af9ed0` with every check green. A combined merge check with both harness suites was running at handoff and died with this session: rerun it on the current base (`npm ci`, forced type-check, i18n, surface manifest, Sonar paths, three Vitest suites, `node tools/test-tools.mjs`, `node .claude/hooks/test-hooks.mjs`, web build, layout project), then merge at the approved head.
3. `ui#1495` (`#1119`, relay closes the predecessor's Orca terminal): the review fix is pushed at `0f8c380d` with the thread resolved and both harness suites green on that head. Read CI and the fresh Pullfrog review, fix anything new as a review fix, merge on the bar.
4. `ui#1499` (`#1122`, chat preview test wait): read CI and Pullfrog, merge on the bar.
5. Close each ticket with `node tools/complete-ticket.mjs --issue "#N"` after its merge.

## Then: the owner's review, the sweep, the gate

1. `#1123` (every pill at the drawn size, every group of pills as one action row, with an ESLint rule and a layout spec): the owner's highest-priority design defect. Launch it from its prepared worktree with `--allow-subagents --hard-ceiling-minutes 75`, prove its layout spec red on the unfixed base, check the diff against `DESIGN.md` and the canvas, approve its new copy with `/second-opinion`, and merge on the bar.
2. `#1125` (delete the Calendário accent fetch bar) and `#1124` (the Hoje proactive line shows only today's check-in): run `npm ci` in their prepared worktrees, launch, merge on the bar.
3. Release `redesign/main` web to staging after each batch of merges and ship an Orbit Staging internal build (the next is 1.3.60 (119); the last, 1.3.59 (118), predates `#1114` to `#1117`).
4. A full rendered sweep of staging at desktop (1352), phone (600) and foldable (840, 1100) widths covering the spec's Sweep coverage list, filing and fixing until a full pass finds nothing; confirm the production content rating certificate and ratings in Play Console.
5. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
6. Then the spec's order: Batch 0c, Batch E (`#1121` first), Batch 0b. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`; an order carrying the UI review sweep may launch with 75 from the start. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. An `orbit-api` or `orbit-landing-page` pull request whose ticket still has work after the merge links it with `Refs`, not `Closes`. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code), or merge at the approved head under D115 when the base's newer commits share none of its files; for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. Do visible-window Chrome work whether or not the owner is using the Mac: sleep mode lasts until he turns it off.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden, whether or not the owner is at the Mac), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

The context relay is live: when the Stop hook reports the threshold, launch nothing, drain the workers, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`, exactly as its message says.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided); a visible Pro entry in Perfil is not a prompt. Habit detail keeps the Astra composer (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The owner's latest review comes first (shipped defects before redesign items), then the rest of the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. The owner has not done the Orbit Staging license-tester purchase (`#961`); license testing is now fixed (the "Bonis" list, his Gmail only), so his dialog should list the test card. Keep the purchase on his manual list. His production and staging Google sign-ins work (`#1010` closed). Resend is deleted (Batch M done).
8. Fix everything in the owner's latest review in this session.
9. Do visible-window Chrome work (sweeps, Play Console, Google account steps) whether or not the owner is at the Mac or talking to the session; sleep mode lasts until he turns it off.
10. The owner keeps finding buttons of different sizes in improvised alignments: `#1123` fixes the rule, the component default, every caller and the guards.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the harness fix `#1126`, the three open pull requests merged, `#1123` to `#1125` delivered and merged, a staging release and internal build, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 137 open tickets, all 137 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1495` (`#1119`) at `0f8c380d` | review fix pushed, thread resolved, harness suites green; read CI and the fresh review, merge on the bar |
| `ui#1498` (`#1118`) at `40af9ed0` | APPROVED, checks green; rerun the combined merge check with both harness suites, then merge |
| `ui#1499` (`#1122`) at `af83f9b0` | delivered, review not read; drive to the bar |
| Merged this session | `ui#1494` (`a900ba82`, `#1115` closed), `ui#1496` (`5656e89c`, `#1116` closed), `ui#1497` (`2ffd2b9c`, `#1117` closed), `orbit-api#690` (`b36bf45d`, the `#746` carry of `#1120`) |
| Closed this session | `#1115`, `#1116`, `#1117`, `#1120` (production API `140d9f93` healthy, staging import sheet rechecked after a real reconnect) |
| Filed this session | `#1123` (pill size and action rows), `#1124` (stale proactive line), `#1125` (Calendário fetch bar), `#1126` (relay threshold mid-turn), all placed in the spec |
| Production | API `140d9f93`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; nothing left to release |
| Staging | web `2ffd2b9c`, API `b36bf45d`, landing current; Orbit Staging 1.3.59 (118) internal (predates `#1114` to `#1117`) |
| Play Console | production content rating questionnaire submitted (ClassInd 14 in its summary), sent for review with managed publishing off; confirm the certificate |
| Running workers | none: the `#1123` worker was stopped within three minutes for the relay drain (no commits, tree clean) |
| Prepared worktrees, not launched | `ticket-1123-action-rows` (`npm ci` done), `ticket-1124-proactive-today` and `ticket-1125-calendar-fetch-bar` (need `npm ci`), all on `fix/` branches at `2ffd2b9c`; orders are composed fresh after the fast-forward |
| Waiters | the CI waiter on `ui#1495` is stopped by the relay tool |
| Local checks | the combined merge check for `ui#1498` dies with this session; rerun it |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts or the ticket worktrees (the spec and this prompt are committed with this handoff) |
| Unpushed commits | none on any ticket branch |
| Branches with no pull request | `fix/ticket-1123-action-rows`, `fix/ticket-1124-proactive-today`, `fix/ticket-1125-calendar-fetch-bar` (local only, no commits beyond `2ffd2b9c`) |
| Detached HEADs | scratch merge-check and red-proof worktrees under this session's scratchpad (merge commits only); `git worktree prune` clears them once the scratchpad is gone |
| Chrome | the automation tab sits in the owner's Chrome window 57 at 606 wide; restore that window to 1352 by 849 when the sweep ends |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the session decision log stayed in the scratchpad; every durable rule and fact is in the spec |
| Owner questions | none open |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization, relay paragraph and owner instructions 1 to 8: carried, with one change: visible Chrome work no longer waits for the owner to step away (owner instruction 9).
- First 1 (`ui#1495` review fix): done in this session (fix `327e0374`, base merge `0f8c380d`, thread resolved); merge carried as First 3.
- First 2 (`ui#1498`): approved and green; merge carried as First 2.
- First 3 (`ui#1494`): done, merged as `a900ba82`.
- First 4 (`ui#1496` with two layout specs proven red): done, red proof 8 of 9 cases, merged as `5656e89c`.
- First 5 (`ui#1497`): done, merged as `2ffd2b9c`.
- First 6 (close tickets): done for `#1115` to `#1117` and `#1120`; carried as First 5 for the rest.
- Then 1 (`#1120` carry, release, recheck, production): done.
- Then 2 (`#1122`): delivered as `ui#1499`; carried as First 4.
- Then 3 (staging release and internal build): staging web and API released; the internal build is carried as Then 3.
- Then 4 (production content rating): done, submitted; the certificate check is carried in Then 4.
- Then 5 (full sweep): partly done (Hoje and Calendário at 606); carried as Then 4.
- Then 6 (gate) and Then 7 (Batch 0c, E, 0b): carried as Then 5 and Then 6.

Every identifier here came from a previous session: treat each as a lead to verify.
