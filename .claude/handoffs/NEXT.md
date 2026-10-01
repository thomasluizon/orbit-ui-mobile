/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else, then, through the Obsidian MCP, the brain ADRs `2 Areas/20-29 Orbit Engineering/Decisions/Onboarding shows once per install and once per new account, never on sign-out.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Redesign review answers on phone search, Google Calendar import and the trial upgrade page.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Every Astra write shows a preview the person approves first.md`, `2 Areas/20-29 Orbit Engineering/Decisions/Free accounts meet Orbit Pro only at a real boundary, never on a timer.md` and `2 Areas/20-29 Orbit Engineering/Decisions/Reproduce a device bug on the exact shipped build before calling it fixed.md`. Then read `DESIGN.md` in full, `BRAND.md`, and `design/canvas/README.md` before the first sweep.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## First step: Orbit Staging's Play review

Finish Orbit Staging's closed-testing track in Play Console so Google reviews the app and its listing shows the real name and icon instead of "org.useorbit.app.staging (unreviewed)". Every setup task is already done (spec, Batch R). In "Teste fechado - Alpha" the countries are saved for every country and region. Still owed, in order: select the same tester list internal testing uses; create a release from the existing 1.3.51 (110) bundle in the app bundle library (same package and same staging API, so this is no cross-app promotion); review and confirm it; then send the release and the pending changes to Google for review from Visão geral da publicação. Do each save and publish click yourself; stop only at something reserved for the owner (a password, a credential he must type, a payment, a permission only his account grants). Before any browser step, run `list_connected_browsers` and `select_browser` the macOS Chrome, never the Windows one; Play renders its forms only when the automation window is in front.

Then verify the Cloudflare account token: the owner gave it Workers Admin (Cloudflare's current Workers roles: only Admin creates a new Worker). Run the targeted `#1009` pinger apply, then its one-hour probe proof, then delete `.github/workflows/staging-keepalive.yml`.

## Priority after that: the owner's four staging bugs

1. `#1084`: onboarding once per install and once per new account, never on sign-out (owner decision in the ADR above).
2. `#1085`: Android prints Progresso's repair card plural as raw ICU text; prove the Hermes cause first.
3. `#1086`: Google sign-in on Orbit Staging spins until a restart; reproduce on a throwaway AVD with the shipped build first.
4. `#1087`: Progresso's goals empty state ends under the composer; fix the clearance in the shell.

After they merge, release staging web, ship an Orbit Staging internal build, and send the owner a push notification naming what to check on his phone (if the tool reports the terminal active, put it first in the report instead).

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made (take the time from `date`, never estimate it). Write the run state for this session with `sleep: true` first (the previous record carries the remaining queue and the readiness ledger; pass its `pullRequests` and `readinessLedger` in that write, because a new session id does not union them forward), keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

Start every worker, waiter, release waiter and local check as a harness background task with no pipe, no trailing `&`, and the Bash `timeout` set to 7200000. Gate each worker launch inside the same background command that starts it, waiting until the one-minute load is under 20 and 90 seconds have passed since the previous launch: a small gate script in the scratchpad that holds a lock, waits, then runs `tools/launch-worker.mjs`. Run only one local hermetic Playwright run at a time. Before any launch, fast-forward the main checkout to `origin/redesign/main` (and the local `main` ref to `origin/main` before a `main` worktree), or the launcher refuses; recompose any order written before a fast-forward. Keep at most three GitHub-calling waiters alive at once, release waiters included (fold pull requests into one waiter with several `--pr` flags); a waiter ends on `HEAD_MOVED` or `PR_CLOSED`, so restart it. Read `gh run list --commit <sha>` before calling a check red, because a cancelled duplicate run shows beside its passing twin. A SonarCloud job that dies in the scan step after an hour is infra: rerun it. A `CONFLICTING` pull request starts no CI: run `git merge-tree --write-tree --name-only origin/redesign/main <head>` and send a base-merge order. A new ticket worker is refused while open pull requests plus live workers exceed ten. A long ticket that hits the 45 minute ceiling is relaunched from its tree with `--hard-ceiling-minutes 75`. A worker that dies in seconds on "Selected model is at capacity" is relaunched once on Codex. Never chain a base merge and a push in one command. Check every pull request body for machine paths and em or en dashes before posting it. Until `#1019` merges, append to every worker order that generated `architecture.*` files stay uncommitted. Merges into `redesign/main` do not close tickets: close each with `node tools/complete-ticket.mjs --issue "#N"`. Before merging any pull request behind its base, also run `npx turbo run type-check --force` on the combined merge, because a file-disjoint base merge broke a type this run. A pull request that adds or edits a hermetic layout case is run locally and proven red on an unfixed build before it merges; copy the spec under a scratch name, never over an existing tracked spec. The orchestrator guardrail refuses a redirect whose target holds a variable or a process substitution: use literal paths or a helper script. In this shell `ls` is eza: scripts use `command ls`. Configure every external service from its current documentation, never from memory, and never pick a legacy option.

The owner's written authorization overrides the sleep skill's generic hard stops on `main`, on releases and on infrastructure for this run: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); merge redesign fixes into `redesign/main` on the same bar with no screenshot gate, then release `redesign/main` to staging. The run may create and change Render, AWS, Cloudflare, Stripe test mode, Google Play Console, Firebase and GitHub resources through Terraform, CLIs, APIs and MCPs; deploy production and staging through the release workflows; upload builds to every Play track through `android-release.yml`; operate the Google OAuth client, the Play Console (including closed testing for Orbit Staging and sending it for review) and the Pullfrog console through `claude-in-chrome`, mirroring production's facts honestly; create, log and delete test habits and send Astra messages in the owner's staging account for sweeps (never in production); and reproduce device bugs on a separate throwaway AVD (never the owner's `Orbit_Pixel_9_API_35`, no personal account, deleted after the proof). Never create an account, enter a password or payment detail, read or type a credential, or permanently delete a project or its data. Never merge `redesign/main` to `main`. Never read a live secret into the transcript.

## Owner instructions for this run

1. When EVERYTHING the redesign needs is done (every redesign ticket merged and closed, every service released to staging from `redesign/main`, an Orbit Staging internal build uploaded after the last redesign merge, a full rendered sweep finding nothing), tell the owner plainly that the redesign is ready for his test: send a push notification with the `PushNotification` tool and make it the first line of the report, and list the owner checks for the gate review from the spec's Current state. That is THE REDESIGN GATE; stop the redesign there and never merge `redesign/main` to `main`; `main`-branch work (step 7 below) continues.
2. No recurring Orbit Pro prompt for free accounts (decided).
3. Orbit Staging must be the most up to date build possible, installable, named "Orbit Staging" with the redesigned icon (the first step above finishes the name and icon).
4. The owner's reported bugs come first, then the redesign.
5. Onboarding follows the ADR named above.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. This run's first goals are Orbit Staging's Play review and the owner's four bugs, then the whole redesign done on staging and on an internal build of Orbit Staging, then the owner told (instruction 1). The run ends only when the spec is done or for an external cause (allowance exhausted on both engines, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400` (when GraphQL is rate limited, `gh api --paginate "repos/thomasluizon/orbit-tickets/issues?state=open&per_page=100"`). At handoff the board had 150 open tickets, all 150 placed in the spec's `## The order` (0 unplaced, 0 closed tickets leading a bullet, 0 placed twice as a bullet's leading ticket).

## In flight

| item | disposition |
|---|---|
| Orbit Staging closed track | countries saved; testers, release from 1.3.51 (110), confirm and send for review owed (first step) |
| `ui#1441` (`#1057`) at `66977f9f` | APPROVED, green, combined type check passed, layout red proof posted: merge first among the pull requests |
| `ui#1453` (`#991`) at `f9a4eb59`, `ui#1455` (`#1079`) at `152cb052` | APPROVED, green: combined type check, then merge |
| `ui#1446` (`#1011`), `ui#1456` (`#1077`), `ui#1458` (`#1063`) | APPROVED; Unit Tests and SonarCloud red, likely `#1083` (two mobile Intl startup tests failing on the base): read the runs, fix `#1083` first, rerun; `ui#1458` and `ui#1441` share `shell-wide.tsx` |
| `ui#1454` (`#1078`) at `7782c123` | CHANGES_REQUESTED, one thread; fix `b78489a5` committed locally in `ticket-1078-detail-reminders-in-place`, unpushed, report in worker log `orbit-workers/#1078-1790879585943.log`: merge the report into the body, resolve the thread, push, fresh review |
| `ui#1457` (`#1080`, into `main`) at `d1bd4e4a` | APPROVED; Cross-Platform Parity red: read the job, add the label or `## Parity` line it needs, fresh review if the body or head changes, merge to `main` |
| `ui#1459` (`#1043`, into `main`) at `b5b67ace` | CHANGES_REQUESTED, two unresolved threads: review batch, then merge to `main` and ship Android to the open track |
| Staging | web `2f2f0a95`; API `52c8db97`; landing current; Orbit Staging 1.3.51 (110) from `3709832e` on internal |
| Production | web `e3de6780` (behind `main` by `#987`); API `3d1a71aa`; landing `ebbebb2a`; Android 1.3.48 (107) open |
| SES | production access GRANTED (case `179056896000159`): move both API environments to SES within `#943` |
| Open pull requests elsewhere | none in `orbit-api` or `orbit-landing-page` |
| Running workers | none |
| Stashes | none in any repository |
| Uncommitted work | none in the main checkouts or ticket worktrees |
| Unpushed commits | `fix/ticket-1078-detail-reminders-in-place` (`b78489a5`, no upstream set) |
| Detached HEADs | `questions-manual-steps` worktree: a local merge-check commit only, disposable; tear it down with `#1448` |
| Branches without a pull request | older ticket worktrees as the spec's Current state describes |
| Merged this run, worktrees to tear down | `#1447`, `#1444`, `#1450`, `#1449`, `#1451`, `#1448`, `#1439`, `#1452` |
| Ignored files | the session decision log stayed in its scratchpad; durable rules and decisions are in the spec and the brain ADR |

Workers launched by a session die when it ends: read each worktree before relaunching.

## Then, in order

1. The first step (Orbit Staging review, then the Cloudflare pinger proof).
2. The in-flight rows above, top to bottom; release `redesign/main` web to staging after each merged batch and ship a new Orbit Staging internal build after each batch of redesign merges.
3. The owner's four bugs (`#1084` to `#1087`).
4. The spec's `### Batch R` list in its order (including `#1081`, `#1082`, `#1038`, `#976`, `#995`), checking file overlap with open pull requests and running workers before each launch. Correct production's content rating with a new questionnaire mirroring Orbit Staging's honest answers.
5. A full rendered sweep of staging at desktop, phone and foldable widths, covering what the last sweep could not reach (spec, Sweep coverage), filing and fixing until a full pass finds nothing; then an Orbit Staging internal build after the last redesign merge.
6. When the redesign is done, tell the owner (instruction 1) and stop the redesign at THE REDESIGN GATE.
7. The rest of `### Batch M` (`#943` with the SES switch, then the retired-project list for the owner), Batch 0c (`#1043` via `ui#1459`, `#1040`, the rest), Batch E and Batch 0b (`#556` with the `#987` and `#1080` carry, `#746`, `#926`, `#1019`, `#1018`, the `#1070` backport, `#1072`), as the spec orders them.

## Previous prompt, disposition

- Opening, entry point, sleep contract and authorization: carried; added the combined type check before a behind-base merge, the scratch-name rule for layout red proofs, the macOS browser selection, documentation-first external configuration, and closed testing for Orbit Staging to the authorization.
- Priority 1 (`#1076` polyfill): done, `ui#1450` merged `9058eb1b`, shipped in 1.3.51 (110), ticket closed; the raw plural on the same card is new as `#1085`.
- Priority 2 (`#1075` staging App Links): done, `ui#1447` merged `5b656a5b`, staging web released, Google's Digital Asset Links API returns linked; the spinner after sign-in is new as `#1086`.
- Priority 3 (composer placeholder): done, `#1379` renders it with `numberOfLines={1}` and ships since 1.3.50; carried as an owner phone check.
- Staging web release, Orbit Staging build and push notification: done (1.3.51 (110) on internal; the push tool reported the terminal active, so the owner was told in session).
- Owner instructions 1 to 4: carried; instruction 5 is new (onboarding ADR).
- In flight: `ui#1439` done (`04b5d885`), `ui#1441` carried (approved, ready), `ui#1444` done (`33a23263`), `ui#1446` carried (base-merged and fixed, red on `#1083`), `ui#1449` done (`3709832e`, red proof posted after merge), `ui#1448` done (`63fa32db`), `#1029` done (`ui#1451`, `0d330f9c`). Orbit Staging Play setup: carried as the first step (every task done, closed track owed). Production and `#961`: carried. `#1009`: unblocked by the owner's token change, carried as the first step's second half.
- Then, in order: step 1 done; step 2 carried; step 3 carried as the first step; steps 4 to 7 carried as steps 4 to 7; filed this run and placed in the order: `#1078` to `#1080` and `#1084` to `#1087` (plus `#1081` to `#1083` filed by workers).

Every identifier here came from a previous session: treat each as a lead to verify.
