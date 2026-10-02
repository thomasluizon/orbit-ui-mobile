/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

The previous session chain closed with an owner handoff: this is a fresh unattended run, not a relay successor. Write the run state for this session with `sleep: true` first and carry the previous record's `pullRequests` and `readinessLedger` in that write.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: harness fixes the owner asked for

1. Change `~/.claude/hooks/keep-awake.mjs` to hold `caffeinate -dims` (it holds `-ims`; without `-d` the display sleeps and the screen locks at once because the lock delay is immediate, which hid Chrome all night). Restart the running assertion, confirm with `pmset -g assertions` that `PreventUserIdleDisplaySleep` is 1, and update its test if one exists.
2. Fix `/progress` so it never under-reports: in `.claude/skills/progress/SKILL.md` (and any helper it uses) the default report covers every entry of the open session chain with equal weight, read from live git, release runs and tickets for the chain's whole time window (merges in every repository, Android and web releases, decisions), not only the current session. Prove it with a harness case that fails when a chain entry's shipped work is omitted.
3. Make a context relay close the finishing session's Orca terminal once the successor is confirmed (`tools/relay-session.mjs` or its finishing path): through `orca-cli` first (read its real commands with `orca --help` and the `orca-cli` skill), computer use as the fallback, so an unattended night leaves one live terminal. Prove it with a test of the close call, and never close a terminal whose session has not been fenced.
4. These touch `.claude/**` and `tools/**` on `redesign/main`: run both harness suites, and route each through a worker or a pull request on the merge bar like any other change.

## Then: the owner's review, Batch R, the sweep, the gate

1. Drive `ui#1493` (`#1114`, Pullfrog APPROVED at `91693cba`): read CI, prove its layout case red on an unfixed build, copy approval if it adds copy, merge on the bar.
2. Launch `#1115`, `#1116`, `#1117` in their prepared worktrees (recompose each order after the fast-forward; `--layout-guard` on `#1115` and `#1116`; `--allow-subagents` when the order carries the UI review sweep).
3. File, reproduce in a visible window, root-cause and fix the staging Google Calendar connect loop (spec Batch R).
4. Read Play Console > Settings > License testing from a visible window and answer the owner plainly whether an Orbit Staging Pro purchase charges real money (spec Batch R); fix the tester list if his Gmail is missing.
5. Release `redesign/main` web to staging and ship an Orbit Staging internal build after each batch of merges (the last is 1.3.59 (118)).
6. The production content rating questionnaire mirroring Orbit Staging's answers, and the `#1040` Play Console test notification (visible window).
7. A full rendered sweep of staging at desktop, phone and foldable widths covering the spec's Sweep coverage list, filing and fixing until a full pass finds nothing.
8. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
9. Then the spec's order: Batch 0c, Batch E (record `#763` and close it; file and fix the achievement progress read first), Batch 0b. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code); for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. A locked screen hides Chrome (no resize, wizards stall); if the screen locks again, do hidden-window work only and log the rest as owed.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.


The context relay is live: when the Stop hook reports the threshold, launch nothing, drain the workers, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`, exactly as its message says.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided); a visible Pro entry in Perfil is not a prompt. Habit detail keeps the Astra composer (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The owner's latest review comes first (shipped defects before redesign items), then the rest of the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. The owner has not done the Orbit Staging license-tester purchase (`#961`): his dialog showed his real card and a real price; keep it on his manual list until the dialog lists the test card. His production and staging Google sign-ins work (`#1010` closed). Resend is deleted (Batch M done).
8. Fix everything in the owner's latest review in this session.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the three harness fixes above, then `ui#1493` and `#1115` to `#1117` merged with a staging release and internal build, the Google Calendar connect loop fixed, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 135 open tickets, all 135 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket). The Google Calendar loop is not filed yet: file it and place it in Batch R.

## In flight

| item | disposition |
|---|---|
| `ui#1493` (`#1114`) at `91693cba` | delivered by the worker, Pullfrog APPROVED, CI not read; prove the layout case red, merge on the bar |
| `#1115`, `#1116`, `#1117` | worktrees `ticket-1115-create-reason`, `ticket-1116-form-labels`, `ticket-1117-detail-inside` on their `fix/` branches at `ce420d0d`, `npm ci` done, no commits; launches were cancelled at the relay drain; recompose and launch |
| Merged this chain | `ui#1474`, `#1476`, `#1477`, `#1478`, `#1479`, `#1480`, `#1481`, `#1482`, `#1483`, `#1484`, `#1485`, `#1486`, `#1487`, `#1488`, `#1489`, `#1490`, `#1491` (`ce420d0d`), `#1492` (`e84a51ed`); `orbit-api#688` |
| Production | API `6c4e92dc`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; release plan empty |
| Staging | web `ce420d0d` (verified `/api/health`), API `891176b7` (healthy), landing current; Orbit Staging 1.3.59 (118) internal |
| Running workers | none (the `#1114` worker exited 0 and delivered) |
| Waiters | none |
| Local checks | none running |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts or the ticket worktrees (only ignored `.npm-ci.log` files) |
| Unpushed commits | none on any ticket branch |
| Branches with no pull request | `fix/ticket-1115-create-reason`, `fix/ticket-1116-form-labels`, `fix/ticket-1117-detail-inside` (no commits yet; workers not launched) |
| Detached HEADs | `questions-manual-steps` (a local merge of an old pull request, clean) and scratch merge-check and red-proof worktrees under session scratchpads (merge commits only); `git worktree prune` clears them once the scratchpads are gone |
| Production Postgres | `pg_stat_statements` enabled; both allow lists hold the Mac's current address |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the session decision log and sweep findings stayed in the scratchpad; every durable rule and fact is in the spec |
| Owner questions | none open |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and owner instructions 1 to 6 and 8: carried (instruction 2 adds the composer decision; instruction 4 drops the finished token-cost tail).
- Owner instruction 7: superseded by the owner's answers (`#1010` closed; `#961` still his, dialog shows a real charge).
- The opening line saying the prompt continues a context relay: superseded; the chain closed with an owner handoff. The relay-at-threshold paragraph inside Sleep: carried.
- First 1 (`ui#1491`, `ui#1492`): done, merged as `ce420d0d` and `e84a51ed` after a review fix, a Sonar coverage fix, copy approvals posted on both, and combined merge checks; `#1108` and `#1109` closed.
- First 2 (staging release and internal build): done, web `ce420d0d` and Orbit Staging 1.3.59 (118).
- First 3 (real-money answer): partly done; the owner's dialog shows a real charge, the tester list check is carried as Then 4.
- Then 1 (rest of Batch R, content rating, `#1040`): carried as Then 6; Batch R gained `#1114` to `#1117` and the calendar loop.
- Then 2 (full sweep): a desktop pass is done; phone and foldable widths carried as Then 7.
- Then 3 (gate): carried.
- Then 4 (Batch M, 0c, E with the allow-list move, 0b): Batch M done; the allow-list move is done and `pg_stat_statements` enabled; the rest carried as Then 9.

Every identifier here came from a previous session: treat each as a lead to verify.
