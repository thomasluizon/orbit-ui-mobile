/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB; it was 50 GiB: run scratchpad `teardown-closed.sh` first).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths, about 10 minutes) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Read-only helpers work during the carry. Then repoint every helper that holds the predecessor's first 8 characters with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings (D1 to D22). Write scratchpad files with the Write tool and literal paths. The shell is zsh: run a multi-file command through a `bash` script. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a note that names only the open threads and one sweep of the finding's class (pattern `fix-note-ui-2443-r2.md`); `extract-agent-report.mjs <task output> <file>` saves its report. Read each subagent diff, run the Chromium files and layout specs its report lists (pattern `proof-2442-r1.sh`), then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>`.

Workers run on the worker account through scratchpad `prep-launch.sh <issue> <worktree name>` (75 minute limit) after `compose-ui.sh <issue> <worktree> <branch> <note>`; `new-ticket-wt.sh <issue> <name> <prefix> main` makes the worktree. An API worker follows `launch-api-2129.sh`. A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 18 open, 18 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `89d35525f`; API `main` `2f49ed78f`; landing `main` `381b253fa`. Production web `10cb968e5`; production and staging API `2f49ed78f`; landing `381b253fa`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `#2127` | `api#1109` is live on staging and production at `2f49ed78f` (`/health` read on both). Run the staging transcript of its order bullet (`asc-pro.sh on`, the capture, `asc-pro.sh off`), post it on the ticket, close, and remove its worktree. The staging smoke timed out once and passed on a rerun: a second timeout gets a root diagnosis of `tools/release-smoke.mjs`. |
| `api#1110` (`#2129`) at `35ed0f5ca` | In CI, no review yet. `chain-read.sh api 1110`; review, fix threads, merge at the bar (`merge-gate.sh api 1110`, `MSUBJ` with `fix(chat):`, `MBODY` `Tracks thomasluizon/orbit-tickets#2129`), `record-merge.mjs`, API release, then the measurement of its order bullet. |
| `ui#2442` (`#2096`) at `c1769f770` | In CI, no review yet. Its next round also takes the two leads of its order bullet. Then the web release and the 1.3.155 pair, Android first. |
| `ui#2443` (`#2130`) at `07363bca3` | In CI; two review rounds are resolved. Review, merge (`fix(web):`), web release, then resolve `ORBIT-WEB-1F` when it shows no new event. |
| `ui#2444` (`#2119`) at `76e4353ad` | 55 checks green; `iOS simulator compile` cancelled twice at 60 minutes (run `43350040428`). No third run: send the diagnosis of the order bullet to a subagent, fix at the root, then request the review. The full tools gate and the hooks test passed at this head: say so in the body. |
| `ui#2445` (`#2128`) at `f61ec508e` | In CI, no review yet. Its first fix round adds the `#2129` cases of the ticket comment. |
| `#1561` | Build 4 is `WAITING_FOR_BETA_REVIEW`: read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2120` to `#2126` | Batch M, in ticket order, each after the one before it; `#2120` after `ui#2444` merges. |
| Claude usage | Read `https://claude.ai/settings/usage` at each hourly Sentry tick. |
| Intake | Mailbox and reviews empty; Sentry holds Q and R (`#1561`) and `ORBIT-WEB-1F` (`#2130`). |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2442`, `#2443`, `#2444`, `#2445`, `#2388`; api `#1110`; landing none. Unpushed commits: none. Dirty worktrees: none. Stashes: none. Running workers: none. Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Each open pull request has its worktree; remove api `ticket-2127-answered-choice-guard` when `#2127` closes. Waiters to arm: one `chain-review.sh <key> <pr>` per pull request above (except `ui#2444` and `ui#2388`), `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. He wrote his last report in English.
2. The `#2127` staging transcript; then `api#1110` to merged and released. The assistant is the owner's live defect and outranks the queue.
3. `ui#2443`, `ui#2442`, `ui#2445` and `ui#2444` to merged, one at a time (`behind_by=0`), then one web release (never with an API release), then Batch M in its order and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `api#1109` merged as `2f49ed78f` and released to staging and production; the `#2129` and `#2128` workers delivered `api#1110` and `ui#2445`; the `#2119` relaunch delivered `ui#2444`; the `ui#2442` subagent commit pushed with five more root fixes.
- Changed: intake filed `#2130` for Sentry `ORBIT-WEB-1F` (`ui#2443`).
- Carried: the `#2127` transcript; `#2096`; `#2119`; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
