/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This session is the nominated successor of a context relay: adopt the run with `adoptRelayRun` as the sleep skill says, and do not replan the queue.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: drive the open pull requests (all on `redesign/main`, all behind it)

1. `ui#1495` (`#1119`, relay closes the finished Orca terminal): Pullfrog CHANGES_REQUESTED. The computer-use fallback must recheck that the predecessor tab is still unshared at the moment it closes it. Fix it as a review fix (resolve the thread, then push), rerun both harness suites, merge on the bar.
2. `ui#1498` (`#1118`, `/progress` reports every chain entry): read CI and Pullfrog, fix, merge on the bar. Run both harness suites in the combined merge check.
3. `ui#1494` (`#1115`): Pullfrog APPROVED at `4d04d7aa`, its layout case already proven red on the unfixed base. Read CI; merge at the approved head when the base's newer commits share none of its files (D115) after `npx turbo run type-check --force` on the combined merge, or merge `redesign/main` forward first.
4. `ui#1496` (`#1116`): read CI and Pullfrog; prove `habit-form-labels.spec.ts` and the edited `checklist-templates-row.spec.ts` red on an unfixed build (scratch spec names, `${SHA}:path` in zsh), then merge on the bar.
5. `ui#1497` (`#1117`): read CI and Pullfrog, merge on the bar.
6. Close each ticket with `node tools/complete-ticket.mjs --issue "#N"` after its merge.

## Then: the rest of Batch R, the sweep, the gate

1. `#1120` (calendar connect loop, fixed on `orbit-api` `main` as `140d9f93`): run the `#746` carry into `orbit-api` `redesign/main`, release the staging API from `redesign/main`, recheck the Calendário import sheet in a visible window (it must open on the event list after connecting), then release the production API through `/release` and close `#1120`.
2. `#1122` (chat component test waiting for the revised preview state): launch it.
3. Release `redesign/main` web to staging and ship an Orbit Staging internal build after each batch of merges (the last is 1.3.59 (118)).
4. The production content rating questionnaire from a visible window: its draft holds the contact email and the category; mirror Orbit Staging's answers as the spec's Current state lists them.
5. A full rendered sweep of staging at desktop (1352), phone (600) and foldable (840, 1100) widths covering the spec's Sweep coverage list, filing and fixing until a full pass finds nothing. Visible-window steps wait until the owner has stepped away from the Mac (spec constraint on `HIDIdleTime`).
6. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
7. Then the spec's order: Batch 0c, Batch E (`#1121` first), Batch 0b. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`; an order carrying the UI review sweep may launch with 75 from the start. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. An `orbit-api` or `orbit-landing-page` pull request whose ticket still has work after the merge links it with `Refs`, not `Closes`. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code), or merge at the approved head under D115 when the base's newer commits share none of its files; for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. When the owner is using the Mac, do hidden-window work only and never pull Chrome to the front over him.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden and nobody is using the Mac), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

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

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the five open pull requests above merged, `#1120` carried, released and rechecked, a staging release and internal build, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 137 open tickets, all 137 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1494` (`#1115`) at `4d04d7aa` | APPROVED, red proof done, CI was settling; merge on the bar |
| `ui#1495` (`#1119`) at `f5360895` | CHANGES_REQUESTED; review fix, then merge |
| `ui#1496` (`#1116`) at `fe912b95` | review not read; two layout specs to prove red |
| `ui#1497` (`#1117`) at `7c14deab` | review not read |
| `ui#1498` (`#1118`) at `40af9ed0` | review not read |
| Merged this session | `ui#1493` (`adfaebe5`, `#1114` closed); `orbit-api#689` (`140d9f93` on `main`, `#1120` open for carry, release and recheck) |
| Closed this session without code | `#1040` (Play test notification proven), `#763` (measurement recorded) |
| Filed this session | `#1118`, `#1119`, `#1120`, `#1121`, `#1122` (worker-filed), all placed in the spec |
| Production | API `6c4e92dc`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; `orbit-api` `main` `140d9f93` unreleased |
| Staging | web `ce420d0d`, API `891176b7`, landing current; Orbit Staging 1.3.59 (118) internal |
| Running workers | none (all five delivered) |
| Waiters | the CI waiter on `ui#1494` is stopped by the relay tool |
| Local checks | none running |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts or the ticket worktrees |
| Unpushed commits | none on any ticket branch |
| Branches with no pull request | none from this session |
| Detached HEADs | scratch merge-check and red-proof worktrees under old session scratchpads (merge commits only); `git worktree prune` clears them once the scratchpads are gone |
| Production Postgres | `pg_stat_statements` enabled; both allow lists hold the Mac's current address |
| Play Console | license testing selects "Bonis"; production content rating has an unfinished draft |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the session decision log stayed in the scratchpad; every durable rule and fact is in the spec |
| Owner questions | none open |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization, relay paragraph and owner instructions 1 to 6 and 8: carried (instruction 7 updated: license testing fixed).
- The opening line saying this is a fresh run: superseded; this prompt continues a context relay.
- First 1 (keep-awake `-dims`): done; the user-scope hook holds `caffeinate -dims`, `PreventUserIdleDisplaySleep` read 1.
- First 2 (`/progress` chain coverage): delivered as `ui#1498` (`#1118`); carried as First 2.
- First 3 (relay closes the Orca terminal): delivered as `ui#1495` (`#1119`); carried as First 1.
- First 4 (harness suites and pull requests): carried inside First 1 and 2.
- Then 1 (`ui#1493`): done, merged as `adfaebe5` after a red proof and the combined check.
- Then 2 (`#1115` to `#1117`): delivered as `ui#1494`, `ui#1496`, `ui#1497`; carried as First 3 to 5.
- Then 3 (calendar connect loop): root-caused and fixed on `orbit-api` `main` (`#1120`, `140d9f93`); carry, release and recheck carried as Then 1.
- Then 4 (license testing answer): done; the owner was not a license tester, now "Bonis" is selected.
- Then 5 (staging release and internal build): carried as Then 3.
- Then 6 (content rating and `#1040`): `#1040` done and closed; content rating carried as Then 4.
- Then 7 (full sweep): carried as Then 5 (blocked this session by the owner using the Mac).
- Then 8 (gate): carried as Then 6.
- Then 9 (Batch 0c, E, 0b): carried as Then 7; `#763` done and closed, the achievement read filed as `#1121`.

Every identifier here came from a previous session: treat each as a lead to verify.
