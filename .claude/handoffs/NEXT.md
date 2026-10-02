/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This prompt continues a context relay: the run state, the readiness ledger and the session chain in `.git/orbit-session-chain.json` carry forward; adopt them, do not plan the queue again.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: finish the owner's latest review

Shipped defects are done: production Android 1.3.56 (115) carries the Google sign-in fix (`#1110`), and Orbit Staging's fix (`#1086`) is proven on device. What remains, in this order:

1. Drive the owner-review pull requests to merge on the bar (each listed in the spec's `### Batch R`): `ui#1481` (`#1104`, composer on Hoje only), `ui#1484` (`#1105`, Perfil sub-menus), `ui#1483` (`#1106`, API keys row), `ui#1482` (`#1107`, plan cards), then `ui#1485` (`#1103`) and `ui#1486` (`#556` carry). Read each exact head's checks, clear every Pullfrog review, run the combined merge check before merging any that is behind, and prove locally that each edited hermetic layout case fails on an unfixed build.
2. When `ui#1484` merges, launch `#1108` (one notifications switch and the first-use permission) and `#1109` (the Orbit Pro row); both are filed and blocked only by `#1105`.
3. Release `redesign/main` web to staging after the merges and ship a new Orbit Staging internal build (the last is 1.3.55 (114)).
4. Answer the owner plainly whether a Pro purchase on Orbit Staging charges real money: read the Play Console license-tester list and the purchase dialog's test-card wording from a visible window (`ioreg -n Root -d1 -a` shows `CGSSessionScreenIsLocked` false), and put the answer in the report.

Also from the owner: the Mac is meant to be unlocked (Play Console wizards and phone-width sweeps need a visible window), the Supabase project is deleted, and the two Vercel Orbit projects are deleted.

## Then: in flight, the token-cost tail, the rest of Batch R

1. `ui#1487` (`#1112`, `main`): CHANGES_REQUESTED with one thread; clear it with one review batch, merge on the bar, release production web and ship the Android open track.
2. Launch `#1089` and `#1111`: their worktrees and composed orders are ready (they were held at the load gate when the relay began).
3. `#1103` and the rest of the spec's `### Batch R`; the production content rating questionnaire mirroring Orbit Staging's answers; the Play Console test notification for `#1040` (both need a visible window).
4. A full rendered sweep of staging at desktop, phone and foldable widths, covering what the spec's Sweep coverage lists as not yet swept, filing and fixing until a full pass finds nothing; then an Orbit Staging internal build after the last redesign merge.
5. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
6. Then the rest of the spec's order: Batch M (the Resend cleanup after an observed SES send per environment, then the Resend account for his delete click), Batch 0c, Batch E (`#763` measurement through local `psql`, since the Render MCP cannot reach either database) and Batch 0b, as the spec orders them. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the owner's latest review (the pull requests above, then `#1108` and `#1109`), then the token-cost tail (`#1089`), then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 141 open tickets, all 141 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1481` (`#1104`) at `15d584df` | CI-fix pushed after a Layout Guard red; no Pullfrog review yet; wait, review, merge check, merge |
| `ui#1482` (`#1107`) at `62b28662` | CI-fix pushed; copy approved by `/second-opinion` (posted); needs a fresh review of this head; merge |
| `ui#1483` (`#1106`) at `710584b4` | APPROVED; confirm checks, merge check, merge |
| `ui#1484` (`#1105`) at `2dc2b62f` | base merge pushed (the `CLAUDE.md` registry row conflict); no review yet; wait, review, merge; then launch `#1108` and `#1109` |
| `ui#1485` (`#1103`) at `418a3ff9` | APPROVED; confirm checks, merge check, merge |
| `ui#1486` (`#556` carry) at `0dbc1755` | APPROVED; confirm checks, merge check, merge |
| `ui#1487` (`#1112`, `main`) at `bd1a2759` | CHANGES_REQUESTED, one thread; review batch, merge, release |
| `#1089`, `#1111` | worktrees `ticket-1089-subagents-close-gate` (redesign/main) and `ticket-1111-web-hook-settle` (main) at their bases, no commits; orders were composed in the old scratchpad, so recompose and launch |
| `#1110` | done: merged (`e027243a`), Android 1.3.56 (115) on the open track, proven on device, closed |
| `#1086` | proven on an instrumented Orbit Staging 1.3.54 rebuild; the owner's own phone sign-in stays on the gate checks |
| Staging | web `d84ded19`, API `891176b7`, landing current; Orbit Staging 1.3.55 (114) internal |
| Production | API `6c4e92dc`, web `a67cc942`, landing `ebbebb2a`, Android 1.3.56 (115) open |
| Running workers | none (every launch this session exited; two gated launches were stopped before they started) |
| Waiters | the session's CI waiters on `ui#1485`, `ui#1486` and `ui#1487` are stopped by the relay tool; start fresh ones |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts |
| Unpushed commits | none on any ticket branch this session used |
| Detached HEADs | scratch repro worktrees `repro-prod` (`a67cc942`) and `repro-stg` (`a75bf34b`) under the old scratchpad hold only instrumentation edits, never committed; they go with `git worktree prune` once that scratchpad is gone |
| Throwaway AVD | `Orbit_Repro_Throwaway` (port 5584) is still booted for repros; delete it once no repro needs it |
| Ignored files | the session decision log stayed in the scratchpad and in the session chain; every durable rule and fact is in the spec |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization and owner instructions 1 to 8: carried, unchanged, in the sections below and above; added the relay paragraph.
- Owner review items: 1 done (`#1110`, Android 1.3.56); 2 done (`#1086` proven on device); 3 to 8 filed as `#1104` to `#1109` (four are open pull requests, two wait on `#1105`); 9 carried (needs a visible window, the screen was locked).
- In flight: `ui#1474`, `ui#1476`, `ui#1477`, `ui#1478` done (merged after one combined merge check); `ui#1479` done (merged, the relay is live); `#1089` carried (worktree ready); staging web released at `d84ded19`; Orbit Staging 1.3.55 (114) shipped.
- Then: `#1103` carried as `ui#1485`; content rating and `#1040` test notification carried (locked screen); full sweep carried (locked screen); Batch M carried (SES sends not attributable per environment yet); `#746` done for `#903` and `#1102` (`orbit-api#688`, released to staging); `#556` carried as `ui#1486`; the two-menus defect filed and delivered as `#1112` `ui#1487`.

Every identifier here came from a previous session: treat each as a lead to verify.
