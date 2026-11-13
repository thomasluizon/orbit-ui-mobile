/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that holds the predecessor's first 8 characters with `perl -pi`, and run `mirror.sh` with `bash`, then `durable-dedupe.sh`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings (D1 to D17). Write scratchpad files with the Write tool and literal paths. The shell is zsh: run a multi-argument loop through a `bash` script. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note (pattern `fix-note-api-1110-r3.md`; `dump-review.sh <key> <pr> <file>` saves the review; `extract-agent-report.mjs <task output> <file>` saves its report). Read each subagent diff, run the Chromium files and layout specs its report lists (pattern `proof-2442-r3.sh`), correct a one-line test yourself, then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>`.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. Workers run through scratchpad `prep-launch.sh <issue> <worktree name>` after `compose-ui.sh <issue> <worktree> <branch> <note>`; `new-ticket-wt.sh <issue> <name> <prefix> main` makes the worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 18 open, 18 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `59f355525`; API `main` `2f49ed78f`; landing `main` `381b253fa`. Production web `10cb968e5`; production and staging API `2f49ed78f`; landing `381b253fa`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `api#1110` (`#2129`) at `6891a1b51` | Round 2 delivered. Review round 3 has one open P1 thread (`review-api-1110-r3.md`, note `fix-note-api-1110-r3.md`). Its subagent report is scratchpad `report-api-1110-r3.md`; its commit, if the report names one, is local and not pushed (`git log origin/fix/ticket-2129-short-request-job..HEAD` in the worktree). Read the diff and the `## Model instruction` section, write the reply, `deliver-fix.sh`, `chain-review.sh api 1110`, merge at the bar (`merge-gate.sh api 1110`, `MSUBJ` with `fix(chat):`, `MBODY` `Tracks thomasluizon/orbit-tickets#2129`), `record-merge.mjs`, API release to staging then production, then the 5 captures and the measurement of the order bullet. |
| `#2127` | Open. Close with the passing 5 capture table, then remove api worktree `ticket-2127-answered-choice-guard`. |
| `ui#2445` (`#2128`) at `5e9009097` | Rounds 2 and 3 delivered, work order on the ticket. One open thread (`review-ui-2445-r3.md`, note `fix-note-ui-2445-r4.md`). Its subagent report is scratchpad `report-ui-2445-r4.md`; its commit is local and not pushed. Read the diff, `deliver-fix.sh` with a delivery report that adds only the new test evidence, then the chain. |
| `ui#2444` (`#2119`) at `4fee79d86` | Rounds 1 and 2 delivered (nine threads resolved), copy verdict posted, ledger comments at this head. Start `chain-review.sh ui 2444`. |
| `ui#2442` (`#2096`) at `f6a1fc148` on GitHub | CI is red at that head. Local, not pushed: `f5f0e7547` and `ca8fbdbed`. Do not push yet: send the order bullet's next round to a subagent (revert the eight controls with no red proof, press at the exact edge, then the pill and the chip red first), run `proof-2442-r3.sh` again with the new file list, then push and start the chain. |
| `#1561` | Build 4 is `WAITING_FOR_BETA_REVIEW`: read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2120` to `#2126` | Batch M, in ticket order, each after the one before it; `#2120` after `ui#2444` merges. |
| Claude usage | Main account at 23% of the week. Read `https://claude.ai/settings/usage` at each hourly Sentry tick. |
| Intake | Mailbox and reviews empty; Sentry holds Q and R (`#1561`) and `ORBIT-WEB-1F` (`#2130`). |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2442`, `#2444`, `#2445`, `#2388`; api `#1110`; landing none. Unpushed commits: two in the `ui#2442` worktree, and a possible subagent commit in each of the `api#1110` and `ui#2445` worktrees (rows above). Dirty worktrees: none. Stashes: none. Running workers: none. Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request after its push, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. `api#1110` to merged, released and measured. The assistant is the owner's live defect and outranks the queue.
3. Start the `ui#2444` chain and deliver the `ui#2445` round. Then `ui#2445`, `ui#2444` and `ui#2442` to merged, one at a time (`behind_by=0`; a branch takes `main` with its next push), then one web release (never with an API release), then Batch M in its order and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2444` rounds 1 and 2, `api#1110` round 2 and `ui#2445` rounds 2 and 3 delivered; the `ui#2442` CI diagnosis.
- Changed: `ui#2442` is held before its push (eight controls with no red proof); `#2128` has a second work order, built into `ui#2445`.
- Carried: `api#1110`, `ui#2442`, `ui#2444`, `ui#2445` to merged; the releases; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
