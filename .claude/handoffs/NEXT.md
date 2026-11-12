/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`, `## Habit list`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths; about 10 minutes) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that still holds the predecessor's first 8 characters with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs`), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read the `## D` headings of its last ten entries. Write scratchpad files with the Write tool; the guardrail refuses any redirect to or from a path that holds a shell variable. After a chain exit, read `chain-read.sh <key> <pr>`; a `resolve-bot-thread.mjs` id must come from such a read in the same session. Filter every large tool output before it prints, read the spec once, and send every review fix and diagnosis to a background subagent (`opus`) with `review-fix-brief.md`, a note that names the one open thread, a report file path, and one sweep of the finding's class: the previous session reached the relay threshold in about 105 minutes. Send a next round to the same subagent with `SendMessage`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `e7e1ac7da`; API `main` `1a70835b4`; landing `main` `aa0eaed9c`. Production and staging API `1a70835b4`; staging and production web `3db3e8c40`; landing `599bdfb69`; Android Open 1.3.152 (213); TestFlight production 1.3.152 (2). Merged in the previous session: `ui#2423` (`#2106`). Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `ui#2436` (`#2114`, the owner report, first priority) | Round 4 pushed at `4f4e5e3be`. Arm `chain-review.sh ui 2436`, read its result, merge at the bar before every other pull request, release web staging and production, Android at `nextVersion` then iOS from the same commit, run a signed-in check with `staging-web-session.cjs`, then tell the owner in his language and close. |
| `ui#2435` (`#1561`) | Remote head `fcddf9ead`, 1 open thread. Worktree `ticket-1561-testflight-tester-create` holds `ec4e290e4`, not pushed, diff read. Right after `ui#2436` merges: `deliver-fix.sh` with `rb-2435-r4-report.md` and `rb-2435-r4-reply.md`, then `python3 -I body-2435-r4.py`, chain, merge second. Do not rerun run `43111017034`. |
| `landing#133` (`#2095`, with `#2090`) | Remote head `a1c0fb785`, 1 open thread. Worktree `ticket-2095-landing-motion` holds `409bf5a40`, not pushed, diff not read. Read it and `rb-landing-133-r8-report.md`, check a focused selected day rendered, run `npm run format:check`, deliver, add a round 8 line to the body, chain, merge at the bar, then landing staging and production. |
| `ui#2420` (`#2100`) | Remote head `011bd88f3`, 1 open thread. Worktree `ticket-2100-habit-form-motion` holds four commits, not pushed (head `22796d9e2`, source diff read). One Chromium case is red (`date-field-geometry.test.tsx:201`): fix through a subagent, run that file, deliver with `rb-2420-r7-report.md`, chain. |
| `ui#2419` (`#2101`) | Remote head `d422cf1ca`, 1 open thread. Worktree `ticket-2101-astra-press-motion` holds `f04c77379`, not pushed, file list read. `chromium-2419-r6.sh` ran at the handoff: read `chromium-2419-r6.log`, run it again if it has no result, then `deliver-fix.sh` with `rb-2419-r6-report.md` and `rb-2419-r6-reply.md`, `python3 -I body-2419-r6.py`, chain. |
| Approved, behind `main` | `ui#2425`, `ui#2422`, `ui#2431`, `ui#2421`, `ui#2418`, `ui#2426`, `ui#2424`, `ui#2434`; `ui#2430` (code clean, body corrected, no approval yet). Each takes `main-merge-push.sh`, a chain and the merge in its turn, one at a time, only the next one. |
| New live defect | The app day cell hides keyboard focus on the selected day (`apps/web/app/globals.css:2783`, `day-cell.tsx:128`; found by the `landing#133` review). Prove it on the real path, ticket it (`tools/create-ticket.mjs`), place it in Batch 0c and admit it. |
| `#2096` | The press gap list is a ticket comment: one pull request after the seven area merges. |
| App Review (`#2097`) | `WAITING_FOR_REVIEW` at the last read: read it again (the command is in the `#2097` bullet). |
| Intake | One cycle done: mailbox empty, store reviews empty, board 21 open and all placed. Sentry is unreadable: this account has no Sentry connector. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2436`, `#2435`, `#2434`, `#2431`, `#2430`, `#2426`, `#2425`, `#2424`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2388`; landing `#133`; api none. Unpushed commits: the four worktrees named above. Dirty worktrees, stashes, workers, subagents and detached checks: none. Worker launches: `#2114` 1 of 2, `#1561` tool fix branch 1 of 2. Waiters to arm: one `chain-review.sh` per pull request in CI or review, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. `ui#2436` to merge and release, then `ui#2435`, the three other deliveries, the day cell ticket, the chains and the merge order, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (scratchpad `merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY` set) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; `ui#2423` round 3 delivered and merged as `e7e1ac7da`; `ui#2436` round 4, `ui#2435` round 3 and `landing#133` rounds 6 and 7 delivered; the `ui#2430` body corrected; one intake cycle; the App Review read.
- Superseded: the rerun of the `testflight-access` job of run `43111017034` (a rerun runs the old tool); the `landing#133` border check (the `#6e6e72` ring is the `DESIGN.md` value and stays); the Lighthouse reruns of `ui#2430` and `ui#2425` (both passed).
- Carried: every in-flight row; the merge order; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
