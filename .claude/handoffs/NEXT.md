/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This prompt continues a context relay: the run state, the readiness ledger and the session chain in `.git/orbit-session-chain.json` carry forward; adopt them, do not plan the queue again.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: finish the owner's latest review

The owner-review pull requests `ui#1481` (`#1104`) and `ui#1484` (`#1105`) are merged and released to staging web (`630148c0`) and Orbit Staging 1.3.58 (117); Android 1.3.57 (116) carries `#1112` on the open track; `ui#1489` (`#1089`) and `ui#1490` (the `#556` carry) are merged. What remains, in this order:

1. Drive `ui#1491` (`#1109`, Orbit Pro row, head `0f0e3a0f`, Pullfrog APPROVED) and `ui#1492` (`#1108`, one notifications switch and first-use permission, head `6d635202`, no review yet) to merge on the bar. Read each worker report for `## Assumptions` and its copy keys, approve the new copy in both locales with `/second-opinion` framed as a claimed copy defect and post the verdict on each pull request, clear every Pullfrog review, and run one combined merge check with both heads (they share Perfil and the i18n files; if they conflict with each other, merge the one whose ticket owns the shared control first and send the other a base-merge order).
2. Release `redesign/main` web to staging after both merge and ship a new Orbit Staging internal build (the last is 1.3.58 (117)).
3. Answer the owner plainly whether a Pro purchase on Orbit Staging charges real money: read the Play Console license-tester list and the purchase dialog's test-card wording from a visible window (`ioreg -n Root -d1 -a` shows `CGSSessionScreenIsLocked` false), and put the answer in the report.

## Then: the rest of Batch R, the sweep, the gate

1. The rest of the spec's `### Batch R`; the production content rating questionnaire mirroring Orbit Staging's answers; the Play Console test notification for `#1040` (both need a visible window).
2. A full rendered sweep of staging at desktop, phone and foldable widths, covering what the spec's Sweep coverage lists as not yet swept, filing and fixing until a full pass finds nothing; then an Orbit Staging internal build after the last redesign merge.
3. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
4. Then the rest of the spec's order: Batch M (only the owner's Resend account delete click remains), Batch 0c, Batch E (first move the operator entry of both Postgres allow lists to the Mac's current public address, then measure `#763` through `/opt/homebrew/opt/libpq/bin/psql`) and Batch 0b, as the spec orders them. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.


## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. A new worktree runs Orca's setup `npm install` on creation: wait until no `npm install` or `npm ci` process has its working directory in that worktree, then run `npm ci` there and check its exit code (retry once if it races the setup install; orbit-api worktrees have no Node lockfile and skip it). Pass `tools/create-worktree.mjs` an absolute `--repo path:`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); request a fresh Pullfrog review with a plain `@pullfrog review` comment and read it later with `--wait-seconds 0 --no-request`. A waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it; a SonarCloud quality-gate failure on new-code coverage is a real red to fix. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`. A branch that used its two launches needs `--relaunch-reason`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. A worker that answers NEEDS_DECISION gets a decision from the orchestrator, checked against the shipped build and the tree, written to the ticket with `comment-ticket.mjs`, never accepted on the worker's code reading alone. On `main`, `tools/test-tools.mjs` takes no arguments (`--only` exists only on `redesign/main`). Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it, and rebuild a worker report without machine paths before merging it into a body. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`; a ticket GitHub closed from a `main` merge needs `--repair-status`. Before merging any pull request behind its base, run the combined merge check (scratch worktree at the base with every head merged: `npm ci`, `npx turbo run type-check --force`, i18n usage, surface manifest, Sonar paths, the three Vitest suites, both harness suites when tools or `.claude` change, the web build and the hermetic layout project, all by exit code); for `orbit-api`, `dotnet build` and `dotnet test` with `LANG` unset and with `LC_ALL=en_US.UTF-8`. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Every headless `claude` call on untrusted text runs with `CLAUDE_CODE_DISABLE_ATTACHMENTS=1`. Configure every external service from its current documentation, never from memory, and never pick a legacy option. A locked screen hides Chrome (no resize, wizards stall); if the screen locks again, do hidden-window work only and log the rest as owed.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Google Cloud Pub/Sub, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console and the Pullfrog console through `claude-in-chrome` (run `list_connected_browsers`, `select_browser` the macOS one, and bring the window in front with `orca computer get-app-state --app com.google.Chrome --restore-window --no-screenshot --json` whenever a page reports `visibilityState` hidden), mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs and capture store screenshots on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.


The context relay is live: when the Stop hook reports the threshold, launch nothing, drain the workers, run `/handoff --relay --sleep`, then `node tools/relay-session.mjs`, exactly as its message says.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work continues.
2. No recurring Orbit Pro prompt for free accounts (decided); a visible Pro entry in Perfil is not a prompt.
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon.
4. The owner's latest review comes first (shipped defects before redesign items), then the token-cost tail, then the rest of the redesign.
5. Onboarding follows the ADR named above.
6. The second Claude Max account (`#1090`) is bought only when the Codex credits run out; until then the move off OpenAI waits and Codex stays the worker engine.
7. The owner has not yet done the license-tester purchase (`#961`) or the production Google sign-in (`#1010`); keep both on his manual list in the report.
8. Fix everything in the owner's latest review in this session.


## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are merging `ui#1491` and `ui#1492` with a staging release and internal build after them, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 133 open tickets, all 133 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket).


## In flight

| item | disposition |
|---|---|
| `ui#1491` (`#1109`) at `0f0e3a0f` | delivered, Pullfrog APPROVED, checks not yet read; copy approval, combined merge check with `ui#1492`, merge |
| `ui#1492` (`#1108`) at `6d635202` | delivered, no review yet; read the worker report, wait for CI and Pullfrog, copy approval, combined merge check, merge |
| Merged this session | `ui#1489` (`68b1abb4`), `ui#1481` (`3eb98f40`), `ui#1490` (`4974bd85`), `ui#1484` (`630148c0`); tickets `#1089`, `#1104`, `#1105` closed |
| Production | API `6c4e92dc`, web `b84bdc9e`, landing `ebbebb2a`, Android 1.3.57 (116) open; release plan empty |
| Staging | web `630148c0` (verified `/api/health`), API `891176b7`, landing current; Orbit Staging 1.3.58 (117) internal |
| Batch M | only the owner's Resend account delete click remains |
| Running workers | none |
| Waiters | none; start a `wait-ci` waiter on `ui#1491` and `ui#1492` first (use `--require-check pullfrog-approval` once checks are green and only the review is pending) |
| Local checks | none running |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts or the live ticket worktrees (`ticket-1108-notifications-switch`, `ticket-1109-perfil-pro-row`) |
| Unpushed commits | none on any ticket branch |
| Branches with no pull request | none among live ticket worktrees |
| Detached HEADs | scratch merge-check and red-proof worktrees under session scratchpads (merge commits only) and `repro-prod`, `repro-stg` (instrumentation only, dirty by design); `questions-manual-steps` is a local merge of an old pull request, clean; all go with `git worktree prune` once their scratchpads are gone |
| Main checkouts | `orbit-landing-page` main checkout is one commit behind `origin/main`; fast-forward it before any landing work |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the session decision log stayed in the scratchpad and in the session chain; every durable rule and fact is in the spec |
| Owner questions | one, non-blocking: whether habit detail keeps the Astra composer (spec `## Open questions`) |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization, relay paragraph and owner instructions 1 to 8: carried, unchanged.
- First 1 (Android 1.3.57 (116) open track): done, run `36973973787` success; release plan empty.
- First 2 (drive `ui#1481` and `ui#1484`): done. Both needed base merges (README, then a mutual conflict on `CLAUDE.md` and the Perfil drawing); `ui#1481`'s rewritten case proven red; `ui#1484`'s red proof read (68 failing rows for the defect); `ui#1484` also needed the five profile mirror pairs in `sonar.cpd.exclusions`; merged as `3eb98f40` and `630148c0` after combined merge checks.
- First 3 (launch `#1108` and `#1109`): done, delivered as `ui#1492` and `ui#1491`; carried as First 1 for merge. `#1108`'s question about the sixth-device limit was decided on the ticket (client check, no API change).
- First 4 (staging web release and a new Orbit Staging build): done, `630148c0` and 1.3.58 (117); carried again for after `ui#1491` and `ui#1492`.
- First 5 (Orbit Staging real-money answer): carried, the screen stayed locked.
- Then 1 (`ui#1489`): done, `68b1abb4` after a combined check with both harness suites.
- Then 2 (`ui#1490`): done, `4974bd85`, after a review fix to the redesign sheet menu's replacement focus.
- Then 3 to 6: carried, with the Batch E allow-list step added (the Mac's public address changed).

Every identifier here came from a previous session: treat each as a lead to verify.
