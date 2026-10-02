/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

This prompt continues a context relay: the run state, the readiness ledger and the session chain in `.git/orbit-session-chain.json` carry forward; adopt them, do not plan the queue again.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First: finish the owner's latest review

Shipped defects are done: production Android 1.3.56 (115) carries the Google sign-in fix (`#1110`), production web `b84bdc9e` carries the one-row-menu fix (`#1112`), and Orbit Staging's sign-in fix (`#1086`) is proven on device. Four owner-review pull requests are merged (`#1103`, `#1106`, `#1107`, and the `#556` carry `ui#1486`). What remains, in this order:

1. Ship the Android open track for `#1112`: 1.3.57 (116) from `main` through `android-release.yml` (the release plan shows Android needing release with 2 commits; API and landing need none).
2. Drive the remaining owner-review pull requests to merge on the bar: `ui#1481` (`#1104`, composer on Hoje only, head `255c8528`) and `ui#1484` (`#1105`, Perfil sub-menus, head `d2e318c8`). Read each exact head's checks, clear every Pullfrog review, prove the rewritten `content-edge-notices` case of `ui#1481` red on an unfixed build, read the `ui#1484` red-proof result (the previous session's scratchpad log `layout-red-1484.log`, or rerun it with the pull request's own messages swapped in), and run the combined merge check before merging either one, since both are behind.
3. When `ui#1484` merges, launch `#1108` (one notifications switch and the first-use permission) and `#1109` (the Orbit Pro row); both are filed and blocked only by `#1105`.
4. Release `redesign/main` web to staging after the merges and ship a new Orbit Staging internal build (the last is 1.3.55 (114)).
5. Answer the owner plainly whether a Pro purchase on Orbit Staging charges real money: read the Play Console license-tester list and the purchase dialog's test-card wording from a visible window (`ioreg -n Root -d1 -a` shows `CGSSessionScreenIsLocked` false), and put the answer in the report.

Also from the owner: the Mac is meant to be unlocked (Play Console wizards and phone-width sweeps need a visible window), the Supabase project is deleted, and the two Vercel Orbit projects are deleted.

## Then: the token-cost tail, the carry, the rest of Batch R

1. `ui#1489` (`#1089`, worker sub-agents only for the close gate): APPROVED and green at `a756c0d5`, behind `redesign/main`; run a combined merge check that includes `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs`, then merge. After it merges, a UI order that carries the review sweep launches with `--allow-subagents`.
2. `ui#1490` (`#556` carry of `a182bf4f` and `b84bdc9e`): wait for CI and its first Pullfrog review, clear it, merge on the bar.
3. The rest of the spec's `### Batch R`; the production content rating questionnaire mirroring Orbit Staging's answers; the Play Console test notification for `#1040` (both need a visible window).
4. A full rendered sweep of staging at desktop, phone and foldable widths, covering what the spec's Sweep coverage lists as not yet swept, filing and fixing until a full pass finds nothing; then an Orbit Staging internal build after the last redesign merge.
5. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
6. Then the rest of the spec's order: Batch M (only the owner's Resend account delete click remains), Batch 0c, Batch E (`#763` measurement through local `psql`; the Render MCP cannot reach either database, and `psql` is not installed on the PATH, so install libpq or call it by its full path first) and Batch 0b, as the spec orders them. Free worker slots may take independent tickets from later batches when every Batch R ticket is blocked on an open pull request.

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

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are the owner's latest review (the pull requests above, then `#1108` and `#1109`), then the token-cost tail (`#1089`), then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 136 open tickets, all 136 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| `ui#1481` (`#1104`) at `255c8528` | CI-fix pushed (not-found layout case); needs CI, a Pullfrog approval of this head, the rewritten case's red proof, a combined merge check; merge |
| `ui#1484` (`#1105`) at `d2e318c8` | review fix (routes inside `Stack.Protected`), manifest and step-up key fixes pushed; needs CI, a Pullfrog approval of this head, its red-proof result, a combined merge check; merge; then launch `#1108` and `#1109` |
| `ui#1489` (`#1089`) at `a756c0d5` | APPROVED, green, behind; combined merge check with both harness suites; merge |
| `ui#1490` (`#556` carry) at `fa50ada4` | delivered, no review yet; wait, review, merge |
| Android open track for `#1112` | owed: 1.3.57 (116) from `main` |
| Merged this session | `ui#1487` (`#1112`, `main`, `a182bf4f`), `ui#1488` (`#1111`, `main`, `b84bdc9e`), `ui#1486` (`073fdd4a`), `ui#1485` (`916c3460`), `ui#1483` (`0a443e7c`), `ui#1482` (`f9ddaca7`); tickets `#1103`, `#1106`, `#1107`, `#1111`, `#1112` closed |
| Production | API `6c4e92dc`, web `b84bdc9e` (released and verified), landing `ebbebb2a`, Android 1.3.56 (115) open |
| Staging | web `d84ded19`, API `891176b7`, landing current; Orbit Staging 1.3.55 (114) internal |
| Batch M | Resend cleanup done (env group keys, SSM parameters, six DNS records); only the owner's Resend account delete click remains |
| Running workers | none |
| Waiters | the session's CI waiter on `ui#1481` and `ui#1484` is stopped by the relay tool; start fresh ones |
| Local checks | a red-proof run of `ui#1484`'s layout specs may still be finishing in the previous session's scratchpad (`layout-red-1484.log`); read it or rerun |
| Open pull requests in `orbit-api` and `orbit-landing-page` | none |
| Stashes | none in any repository |
| Uncommitted work | none in the three main checkouts or the live ticket worktrees |
| Unpushed commits | none on any ticket branch |
| Detached HEADs | scratch merge-check and red-proof worktrees under session scratchpads (merge commits only) and `repro-prod`, `repro-stg` (instrumentation only); `questions-manual-steps` at `aa2bddbd` is a local merge of an old pull request for review, clean; all go with `git worktree prune` once their scratchpads are gone |
| Throwaway AVD | `Orbit_Repro_Throwaway` still exists; delete it once no repro needs it |
| Ignored files | the session decision log stayed in the scratchpad and in the session chain; every durable rule and fact is in the spec |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Previous prompt, disposition

- Opening, entry point, sleep contract, authorization, relay paragraph and owner instructions 1 to 8: carried, unchanged, in the sections above and below.
- First 1 (drive the six owner-review pull requests): `ui#1482`, `ui#1483`, `ui#1485`, `ui#1486` done (merged after one combined merge check, layout cases proven red for `ui#1482` and `ui#1483`); `ui#1481` and `ui#1484` carried with new heads.
- First 2 (launch `#1108` and `#1109` when `ui#1484` merges): carried.
- First 3 (staging web release and a new Orbit Staging build): carried, after the remaining merges.
- First 4 (Orbit Staging real-money answer): carried (the screen stayed locked).
- Then 1 (`ui#1487`): done, merged as `a182bf4f` and released to production web `b84bdc9e`; the Android open track carried.
- Then 2 (launch `#1089` and `#1111`): done, delivered as `ui#1489` (carried for merge) and `ui#1488` (merged as `b84bdc9e`).
- Then 3 to 6: carried; Batch M's Resend cleanup done (observed SES sends per environment through the mailbox simulator), leaving the owner's Resend account click.

Every identifier here came from a previous session: treat each as a lead to verify.
