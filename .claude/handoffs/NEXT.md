/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB; it was 54 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths, about 10 minutes) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Read-only helpers work during the carry. Then repoint every helper that holds the predecessor's first 8 characters with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings. Write scratchpad files with the Write tool and literal paths (a redirect to a path with a shell variable is refused). The shell is zsh: an unquoted variable does not split into words, so run a multi-file command through a `bash` script. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a note that names only the open threads and one sweep of the finding's class; it returns its report as its final message, and `extract-agent-report.mjs <task output> <file> [header]` saves that report without a second read. A UI report for `deliver-fix.sh` needs `## Test evidence`, `## Assumptions` and `## Manual steps`. The coordinator runs the Chromium unit files a report lists before a push (`chromium-manual.sh <pr> <worktree name>`).

Workers run on the worker account through scratchpad `prep-launch.sh <issue> <worktree name>` (75 minute limit) after `compose-ui.sh <issue> <worktree> <branch> <note>`. A worker order says: no background task, every command in the foreground, one pull request for the whole ticket, never file a ticket, commit early, and in `apps/web` only `npx vitest run --project jsdom <files>`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 17 open, 17 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `89d35525f`; API `main` `5fc345d20`; landing `main` `381b253fa`. Production web `10cb968e5`; API `5fc345d20`; landing `381b253fa`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `api#1109` (`#2127`) at `54f74ac00` | Base `main`, CI ran on this head. `chain-read.sh api 1109`; on green request the review (`chain-review.sh api 1109`), fix threads through a subagent, merge at the bar (`merge-gate.sh api 1109`, `MSUBJ` with `fix(chat):`, `MBODY` `Tracks thomasluizon/orbit-tickets#2127`), `record-merge.mjs`. Then the API release: staging, then production with origin `https://api.useorbit.org`; no migration, so no export. Never with a production web release. Then the staging transcript of its order bullet, then close. |
| `#2129` | The owner's newest report (the assistant is dumb in general). The work order is the ticket comment. Launch an API worker (repo:api, base `main`) as soon as `api#1109` merges; before that it would conflict. |
| `ui#2442` (`#2096`) at `9e6c0bb60` | `calendar-week-agenda-geometry.test.tsx` fails 8 cases (`press: fill has inline breathing room`); the other 11 listed Chromium files pass. A subagent fix was in flight at this handoff (note `fix-note-ui-2442-r0.md`): look for a new local commit in worktree `ticket-2096-press-transitions`; if none, send the note again. Read the diff, run `chromium-manual.sh 2442 ticket-2096-press-transitions`, push, chain, merge. Then the web release and the next Android and iOS pair (1.3.155, Android first). |
| `#2119` | Launch 1 of 2 ended in worktree `ticket-2119-file-ledger-hygiene` with a clean tree and local commits (head `193669ddd`), no push and no pull request. Read its report (the last `result` line of its log) and `git log origin/main..HEAD`, then relaunch (2 of 2) with a continuation note (pattern `note-order-2096-relaunch.md`): finish what the report names, push, one pull request. |
| `#2128` | Blocked by `#2127`. Launch (repo:ui) when it merges. |
| `#1561` | The outside tester group exists and build 4 waits for Beta App Review: read `externalBuildState` of the build with `asc-api.mjs` at each intake cycle. |
| `#2120` to `#2126` | Batch M, in ticket order, each after the one before it. |
| Claude usage | Read `https://claude.ai/settings/usage` at each hourly Sentry tick. |
| Intake | Mailbox and reviews empty; Sentry holds only Q and R (`#1561`). |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2442`, `#2388`; api `#1109`. Unpushed commits on a branch: at most the subagent commit on `fix/ticket-2096-press-transitions`. Dirty worktrees: none. Stashes: none. Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Waiters to arm: one `chain-review.sh` per pull request in CI or review, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. He wrote his last report in English.
2. `#2127` to production, then the `#2129` worker: the assistant is the owner's live defect and outranks the queue.
3. `ui#2442` to green and merged; the `#2119` pull request; then Batch M in its order and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: iOS 1.3.154 (4) and the outside tester group; `ui#2439` and `ui#2441` merged; production web `10cb968e5`; production API `5fc345d20`; 12 tickets closed (`#2099`, `#2100`, `#2102` to `#2105`, `#2108`, `#2110`, `#2115`, `#2116`, `#2118` and their worktrees).
- Changed: the owner widened the assistant defect to the class (`#2129`); `api#1109` got a pre-review fix commit and now targets `main`.
- Carried: `api#1109` and its release; `#2096`; `#2119`; `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
