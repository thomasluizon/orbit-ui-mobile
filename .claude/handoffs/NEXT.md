/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This session is the nominated successor of a context relay: adopt the run with `adoptRelayRun` as the sleep skill says, and do not replan the queue.


## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: the open pull requests and the half-built worker

1. `ui#1500` (`#1126`, relay threshold after tool calls) at `57202c39`: Pullfrog requested changes. Read the threads with `node tools/list-bot-threads.mjs --pr 1500 --repo ui --wait-seconds 0 --no-request`, fix them as a review fix, run both harness suites, merge on the bar. Until it lands, measure the transcript before long work in a turn.
2. `ui#1501` (`#1125`, Calendário fetch bar) at `a0be373f`: APPROVED, one check failed. Read `gh run list --commit a0be373f`, fix a real red or rerun an infra one, merge on the bar.
3. `ui#1502` (`#1124`, proactive line today only) at `5c342ef8`: APPROVED; merge on the bar once its checks settle green.
4. `orbit-api#691` (`#1121`, achievement streak window, on `main`) at `caa4438c`: read CI with `gh run list --commit caa4438c` (a body edit re-ran Guards, so cancelled twins may show beside passing runs) and the Pullfrog review, drive it to the bar, merge to `main`, release the production API, measure queryid 2057064764435677686 again (before: 2,542.6 rows per call over 435 calls; the before read is in the spec), record both on the pull request, then carry it through `#746` and close `#1121`.
5. `#1123` (every pill at the drawn size, every pill group one action row): the worker was still running at handoff in `ticket-1123-action-rows` with three commits (`0343f0ad`, `b5b3f08c`, `2a01093a`) and no pull request, and it dies with this session. Read the worktree and the worker log, then relaunch it from its tree with a continuation order that names those commits (`--allow-subagents --hard-ceiling-minutes 75`, `--relaunch-reason` if needed). Prove its layout spec red on the unfixed base, check the diff against `DESIGN.md` and the canvas, approve its new copy with `/second-opinion`, merge on the bar.
6. `#961`: the owner's license-tester purchase on Orbit Staging succeeded. Confirm the staging API verified and acknowledged it, then close the ticket.
7. Close each ticket with `node tools/complete-ticket.mjs --issue "#N"` after its merge into `redesign/main`.
8. Harness: `parseHandoffRequest` in `tools/lib/handoff-prompt.mjs` returns null for an owner prompt that puts a word before the command ("RUN /wrap-up --sleep"), so that owner handoff was recorded as a context relay and `node tools/relay-session.mjs --close-chain` refused to close the chain. File it, fix the parser to find the command anywhere in the owner's prompt, prove it with a hook case red first, run both harness suites, then close the open chain with the next owner handoff.

## Then: the owner's review, the sweep, the gate

1. File the Orbit Staging "Ver na Google Play" defect (owner instruction 11; `repo:ui`, Bug, `needs:no-conversation`), place it in Batch R, and launch it.
2. `#1127` (Perfil top inset in the compact shell): run `npm ci` in its prepared worktree `ticket-1127-perfil-top-inset`, recompose its order after the fast-forward (`--layout-guard`), launch with `--allow-subagents --hard-ceiling-minutes 75`, prove its layout case red, merge on the bar.
3. Release `redesign/main` web to staging after each batch of merges and ship an Orbit Staging internal build (the next is 1.3.60 (119)).
4. Finish the rendered sweep of staging: the foldable widths (840, 1100) for the Perfil sub-screens, Avisos, Busca, Sobre, Orbit Pro, habit create and habit detail, plus the rest of the spec's Sweep coverage list, filing and fixing until a full pass finds nothing. Recheck the production content rating certificate code once Google's review finishes.
5. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
6. Then the spec's order: Batch 0c, Batch E, Batch 0b. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`; an order carrying the UI review sweep may launch with 75 from the start. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. An `orbit-api` or `orbit-landing-page` pull request whose ticket still has work after the merge links it with `Refs`, not `Closes`. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code), or merge at the approved head under D115 when the base's newer commits share none of its files; for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. Do visible-window Chrome work whether or not the owner is using the Mac: sleep mode lasts until he turns it off.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden, whether or not the owner is at the Mac), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

The context relay is live: when the Stop hook reports the threshold, launch nothing, drain the workers, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`, exactly as its message says. Until `#1126` lands, measure the transcript before a width sweep or other long work.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided); a visible Pro entry in Perfil is not a prompt. Habit detail keeps the Astra composer (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The owner's latest review comes first (shipped defects before redesign items), then the rest of the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. The owner's Orbit Staging license-tester purchase (`#961`) succeeded; verify it on the staging API and close `#961`. His production and staging Google sign-ins work (`#1010` closed). Resend is deleted (Batch M done).
8. Fix everything in the owner's latest review in this session.
9. Do visible-window Chrome work (sweeps, Play Console, Google account steps) whether or not the owner is at the Mac or talking to the session; sleep mode lasts until he turns it off.
10. The owner keeps finding buttons of different sizes in improvised alignments: `#1123` fixes the rule, the component default, every caller and the guards.
11. On Orbit Staging's subscription screen, "Ver na Google Play" opens Play's page for the production app's subscription ("Não foi possível encontrar a assinatura de Orbit: AI Habit Tracker (Orbit Pro)"): the manage link must use the running app's package. File it and fix it in this run. The rest of the purchase flow works.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the four open pull requests and `#1123` merged, `#961` closed, `#1127` and the Play manage-link defect delivered and merged, a staging release and internal build, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 135 open tickets, all 135 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket); the Play manage-link defect is not filed yet.

## In flight

| item | disposition |
|---|---|
| `ui#1500` (`#1126`) at `57202c39` | CHANGES_REQUESTED; clear the review, merge on the bar |
| `ui#1501` (`#1125`) at `a0be373f` | APPROVED, one failed check; read the run, fix or rerun, merge |
| `ui#1502` (`#1124`) at `5c342ef8` | APPROVED, checks settling; merge on the bar |
| `orbit-api#691` (`#1121`) at `caa4438c` | on `main`, body links `Refs`; read CI and review, merge, release, measure, carry |
| `#1123` worker | running at handoff in `ticket-1123-action-rows`, 3 commits, no pull request; dies with this session: read the tree, relaunch with a continuation order |
| `#1127` | filed and placed; worktree `ticket-1127-perfil-top-inset` at `a24d3cea` prepared, not launched |
| Play manage-link defect | owner report, not filed yet |
| Merged this session | `ui#1495` (`182efc34`), `ui#1498` (`496954c8`), `ui#1499` (`a24d3cea`) |
| Closed this session | `#1118`, `#1119`, `#1122` |
| Production | API `140d9f93`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; content rating change sent to Google for review |
| Staging | web `2ffd2b9c`, API `b36bf45d`; Orbit Staging 1.3.59 (118) internal |
| Waiters | the CI waiter on `ui#1500` to `ui#1502` dies with this session |
| Open pull requests in `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the main checkouts (the spec and this prompt are committed with this handoff); `ticket-1123-action-rows` may hold worker edits |
| Unpushed commits | the three `#1123` commits on `fix/ticket-1123-action-rows` (no pull request yet) |
| Branches with no pull request | `fix/ticket-1123-action-rows`, `fix/ticket-1127-perfil-top-inset` |
| Detached HEADs | scratch merge-check worktrees under the session scratchpads (merge commits only); `git worktree prune` clears them |
| Chrome | the automation tab sits in the owner's window 57, restored to 1352 by 849 |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the session decision log stayed in the scratchpad; every durable rule and fact is in the spec |
| Session chain | still open: the owner's wrap-up prompt was not parsed as an owner handoff (First 8), so this chain closes at the next owner handoff |
| Owner questions | none open |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization, relay paragraph and owner instructions 1 to 6 and 8 to 10: carried. Owner instruction 7 updated: the `#961` purchase is done. Owner instruction 11 added from the owner's report.
- First 1 (`#1126`): done as `ui#1500`; its review is carried as First 1.
- First 2 (`ui#1498`): done, merged as `496954c8` after the combined merge check with both harness suites.
- First 3 (`ui#1495`): done, merged as `182efc34`.
- First 4 (`ui#1499`): done, merged as `a24d3cea`.
- First 5 (close tickets): done for `#1118`, `#1119`, `#1122`; carried as First 7.
- Then 1 (`#1123`): launched; carried as First 5.
- Then 2 (`#1125`, `#1124`): delivered as `ui#1501` and `ui#1502`; carried as First 2 and 3.
- Then 3 (staging release and internal build): carried as Then 3.
- Then 4 (sweep and content rating): sweep partly done (phone width complete, foldable partly), the content rating change sent for review; carried as Then 4.
- Then 5 (gate) and Then 6 (Batch 0c, E, 0b): carried. `#1121` from Batch E was taken into a free slot and is First 4.

Every identifier here came from a previous session: treat each as a lead to verify.
