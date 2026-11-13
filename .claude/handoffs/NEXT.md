/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that holds the predecessor's first 8 characters with `perl -pi`, and run `mirror.sh` with `bash`, then `durable-dedupe.sh`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings (D1 to D17). Write scratchpad files with the Write tool and literal paths. The shell is zsh: run a multi-argument loop through a `bash` script. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note (pattern `fix-note-ui-2445-r6.md`; `dump-review.sh <key> <pr> <file>` saves the review; `extract-agent-report.mjs <task output> <file>` saves its report). Read each subagent diff and the review body, run the Chromium files and layout specs its report lists, then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>`.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. Workers run through scratchpad `prep-launch.sh <issue> <worktree name>` after `compose-ui.sh <issue> <worktree> <branch> <note>`; `new-ticket-wt.sh <issue> <name> <prefix> main` makes the worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 18 open, 18 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `59f355525`; API `main` `2f49ed78f`; landing `main` `381b253fa`. Production web `10cb968e5`; production and staging API `2f49ed78f`; landing `381b253fa`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `api#1110` (`#2129`) at `70424b97a` | Round 4 delivered, zero open threads, comments only. Start `chain-review.sh api 1110`. At the bar: `merge-gate.sh api 1110` (`MSUBJ` with `fix(chat):`, `MBODY` `Tracks thomasluizon/orbit-tickets#2129`), `record-merge.mjs`, release `main` to staging, 5 captures, production only after 5 of 5, then the measurement of the order bullet. |
| `#2127` | Open. Close with the passing capture table, then remove api worktree `ticket-2127-answered-choice-guard`. |
| `ui#2445` (`#2128`) at `aad203988` | Round 5 delivered, zero open threads, comments only. Start `chain-review.sh ui 2445`, merge at the bar. |
| `ui#2444` (`#2119`) at `2408256d5` | Round 3 delivered, zero open threads, ledger verified and its comments replaced at this head. `Layout shard 1` is red on the racy spec (four reds, two reruns at this head): no more reruns. After `ui#2442` merges, `main-merge-push.sh ticket-2119-file-ledger-hygiene`, then the ledger steps and `chain-review.sh ui 2444`. |
| `ui#2442` (`#2096`) at `f6a1fc148` on GitHub | CI red at that head. Local, not pushed: `f5f0e7547`, `ca8fbdbed`, `b5b47beb9`, `697ecc45a`. `proof-2442-r4.sh` ran in the predecessor: the whole Chromium project passed (198 files, 7823 tests), `probe-2442-layer.sh` gave 5 red without the hit layer and 20 of 20 with it; the layout part (42 specs, `spec-2442-r4.log`) was running with no failure. Read that log: if it is not complete, run only its `run-spec.sh` part again (the build exists). Then the delivery report, the push and the chain. It merges first: it holds the fix of the racy spec. |
| `ui#2446` | The automatic API contract snapshot, checks green, no review yet. Read its diff, request the review (`chain-review.sh ui 2446`), merge at the bar. |
| `#1561` | Build 4 is `WAITING_FOR_BETA_REVIEW`: read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2120` to `#2126` | Batch M, in ticket order, each after the one before it; `#2120` after `ui#2444` merges. |
| Claude usage | 25% of the week at 08:00Z. Read `https://claude.ai/settings/usage` at each hourly Sentry tick. |
| Intake | Nothing new: mailbox, reviews, Sentry (Q, R, `ORBIT-WEB-1F`), board. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2442`, `#2444`, `#2445`, `#2446`, `#2388`; api `#1110`; landing none. Unpushed commits: four in the `ui#2442` worktree. Dirty worktrees: none. Stashes: none. Running workers and subagents: none. Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. `api#1110` to merged, released to staging, captured, released to production and measured. The assistant is the owner's live defect and outranks the queue.
3. `ui#2442` to pushed and in review. Then `ui#2442`, `ui#2445`, `ui#2446` and `ui#2444` to merged, one at a time (`behind_by=0`; a branch takes `main` with its next push), then one web release (never with an API release), then Batch M in its order and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `api#1110` rounds 3 and 4, `ui#2445` rounds 4 and 5 and `ui#2444` round 3 delivered; the `ui#2442` round built.
- Changed: the answered-set rule of `api#1110` is deleted and the staging capture decides (the captures run between the staging release and the production release); the pill and the chip of `ui#2442` get a hit layer, not a restructure; `ui#2442` merges first.
- Carried: `api#1110`, `ui#2442`, `ui#2444`, `ui#2445` to merged; the releases; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
