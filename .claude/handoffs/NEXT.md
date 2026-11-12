/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB; it was 40 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths; it takes about 10 minutes) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that holds the predecessor's first 8 characters with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read D1 to D13. Write scratchpad files with the Write tool, with literal paths. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a note that names only the open threads and one sweep of the finding's class; it returns its report as its final message. A UI review report needs a `## Manual steps` section. The coordinator runs the Chromium unit files a report lists before a push.

Workers run on the worker account through scratchpad `gl.sh <launch-worker arguments>` or `prep-launch.sh <issue> <worktree name>`; `compose-ui.sh <issue> <worktree> <branch> <note>` composes a UI order. A worker order says: no background task, every command in the foreground, one pull request for the whole ticket, never file a ticket.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2128`), the mascot rebrand (`#2118` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 27 open, 27 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `89f0335e0`; API `main` `1a70835b4`; landing `main` `381b253fa`. Production web `46af750f6`; API `1a70835b4`; landing `381b253fa`; Android Open 1.3.153 (214); TestFlight 1.3.153 (3).

| Item | Disposition |
| --- | --- |
| Android Open 1.3.154 (215) | Dispatched from `89f0335e0` with `android-run.sh`. Read its run. On success dispatch `ios-release.yml` at 1.3.154 from the same commit (`.claude/skills/ios-release/SKILL.md`). No UI merge lands before the iOS dispatch. After both uploads: close `#2099`, `#2100`, `#2102`, `#2103`, `#2104`, `#2105`, `#2108`, `#2115` and `#2110` (after its web release), then `teardown-worktree.mjs` on their worktrees (about 25 GiB). |
| Web staging `89f0335e0` | Dispatched with `web-staging-after-main.sh`. Read its run; the smoke can fail its first attempt on the `#2116` redirect (rerun the failed job once). Then `release-run.sh ui production 89f0335e062886ff772b3f4489397356256d3f78 https://orbit-web-3qmv.onrender.com`. |
| `ui#2439` (`#2116`) at `c46327515` | Approved, green, 0 threads. Merge after the iOS dispatch: `merge-gate.sh ui 2439` (`MSUBJ` with `fix:`, `MBODY` `Tracks thomasluizon/orbit-tickets#2116`), `record-merge.mjs`, then the web release and the three live checks in its order bullet. |
| `ui#2441` (`#2074`) at `66094d12a` | Round 1 answered; in CI. `chain-read.sh ui 2441`, arm `chain-review.sh ui 2441` when no waiter runs, merge at the bar outside the Android to iOS window. |
| `api#1108` (`#2118`) at `fc1982f3f` | Round 1 answered; in CI. Chain, review, merge (`merge-gate.sh api 1108`). Never delete its branch before the `#2127` pull request is retargeted. |
| `#2127` worker | Launched in `orbit-api/ticket-2127-answered-choice-guard` (branch `fix/ticket-2127-answered-choice-guard`, base branch `feature/ticket-2118-api-speaks-orbit`, 150 minute ceiling, launch 1 of 2). Read its result and its diff, check the body (`Tracks`, test evidence red and green). After `api#1108` merges: retarget its pull request to `main`, merge `main`, chain, review, merge. Then the API release with a fresh Render export first, and the staging run its order bullet names. |
| `#2128` | Blocked by `#2127`. Launch (repo:ui) when a UI slot and disk allow. |
| `#1561` | Open a TestFlight group that outside testers can join, with the 1.3.154 build, after reading the current beta groups (`asc-api.mjs`). Write the link on the ticket. |
| `#2119` to `#2126` | Batch M. Launch `#2119` when free disk is over 50 GiB. |
| `#2096` | One pull request for the press gap list in its comments. |
| Claude usage | Main account 9% weekly, one reset available; read `https://claude.ai/settings/usage` at each hourly Sentry tick. |
| Intake | Mailbox and store reviews empty; Sentry holds only Q and R (`#1561`); board all placed. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2441`, `#2439`, `#2388`; api `#1108`, plus the `#2127` worker's when it opens. Unpushed commits on a branch: none. Dirty worktrees: none after this commit. Stashes: none. Running workers: the `#2127` worker. Detached worktrees with commits on no remote branch: `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing` (leave them). Waiters to arm: one `chain-review.sh` per pull request in CI or review, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language (he writes pt-BR), before any other work and before a relay step.
2. `#2127` to production: it is the owner's live defect and outranks the queue.
3. The iOS 1.3.154 dispatch, the ticket closes, the teardown, the production web release, then `ui#2439` and its release.
4. The merges at the bar (`api#1108`, `ui#2441`), then Batch M in its order and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; the `ui#2424` merge; `#2117` and `#2097` closed; the warm start diagnosis (`ui#2441`); one intake cycle.
- Changed: the owner reported the assistant defect (`#2127`, first in the queue) and set the release stage rule (spec `### Platforms and releases`); the 1.3.154 release started before `ui#2439` merged.
- Carried: `ui#2439` and its web release; `api#1108` and the API release; the 1.3.154 iOS half and the closes; `#2096`; `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
