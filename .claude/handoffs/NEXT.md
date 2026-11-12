/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails). Read `DESIGN.md` (`## Motion`, `## Bans`, `## Habit list`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that still holds the predecessor id, full or first 8 characters, with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its last ten entries. Write scratchpad files with the Write tool, with literal absolute paths (the guardrail refuses a redirect to a path that holds a shell variable). Start every waiter as a Bash background task with `run_in_background`. After a chain exit, read `chain-read.sh <key> <pr>`; a `resolve-bot-thread.mjs` id must come from such a read in the same session. Read the review body and the threads before every delivery. Filter every large tool output before it prints, never read the spec in full twice, and send every review fix and diagnosis to a background subagent with `review-fix-brief.md` and an `rb-note.sh` note (`opus`): the previous session reached the relay threshold in about 100 minutes. Take every decision log time from `date -u`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `4fbdf12ba`; API `main` `1a70835b4`; landing `main` `aa0eaed9c`. Production and staging API `1a70835b4`; staging and production web `3db3e8c40`; landing `599bdfb69`; Android Open 1.3.152 (213); TestFlight production 1.3.152 (2). Nothing merged in the previous session. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `ui#2436` (`#2114`, the owner report on a logged parent habit, first priority) | Round 1 fix pushed at `d00fe37dc` (3 threads resolved, copy approved and posted, 843 Chromium tests green). Arm `chain-review.sh ui 2436`, read its result, merge at the bar before every other pull request, release web staging and production and Android Open, run a signed-in check with `staging-web-session.cjs`, then tell the owner in his language and close. |
| `ui#2419` (`#2101`) | Remote head `faa7b8c8b`, 1 open thread. Worktree `ticket-2101-astra-press-motion` holds the fix, not pushed: `0df16c045`, `faaec9233` and a third commit from a subagent (the mobile `PillButton` press ease). If the tree is dirty, the subagent did not finish: read `rb-2419-r5-report.md`, finish through a new subagent. Then read the diffs, run the listed Chromium files and the mobile suite result, deliver with `deliver-fix.sh`, chain. |
| `landing#133` (`#2095`, with `#2090`) | Head `f3ac8b491`, CI green, review round 4 left 2 threads (the FAQ card radius on close; `:hover` over `:active` on the back to top fill). Fix through a subagent, run `landing-133-r2-checks.sh` and a rendered check of both points, deliver, chain, merge at the bar, then landing staging and production. |
| Chains to arm and read | Each has a fix or a `main` merge pushed and waits for CI and one review: `ui#2431` (`2686b52d8`), `ui#2423` (`3be4f5d89`), `ui#2433` (`87cbf7bcc`), `ui#2421` (`fd775a97d`), `ui#2420` (`011bd88f3`), `ui#2422` (`74ec6e711`), `ui#2435` (`2b3e52821`), `ui#2430` (`6e88d0eec`), `ui#2425` (`d6001b393`). Start one `chain-review.sh` for each, then fix or queue from `chain-read.sh`. |
| Merge order | `ui#2436` first. Then one at a time, as each reaches the bar (`main` merge, chain, merge, `record-merge.mjs`): `ui#2435`, `ui#2422`, `ui#2418`, `ui#2426`, `ui#2424`, `ui#2434`, then the rest. After `ui#2435` merges, rerun the failed `testflight-access` job of run `43111017034` and read its summary. |
| App Review (`#2097`) | `WAITING_FOR_REVIEW` at the last read: read `asc-api.mjs GET /v1/reviewSubmissions/a7a890f6-71dc-4595-a297-d4ed05608bb3`. |
| Intake | One cycle done: 1 vendor message acknowledged, store reviews empty, board 22 open and all placed. Sentry and the Fable usage page are unreadable: this account has no Sentry connector, no Chrome browser is connected and `sentry-cli` has no token. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2436`, `#2435`, `#2434`, `#2433`, `#2431`, `#2430`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2388`; landing `#133`. Unpushed commits: worktree `ticket-2101-astra-press-motion` (above). Dirty worktrees, stashes, running workers and detached checks: none besides that row. Worker launches: `#2114` 1 of 2, `#1561` tool fix branch 1 of 2, `#2112` 1 of 2. Waiters to arm: one `chain-review.sh` per pull request in CI or review, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. `ui#2436` (the owner report) to merge and release, then the `ui#2419` delivery, the chains and the merge order, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; the `ui#2436` diff read, both copy approvals and its round 1 review fix; review fixes delivered on `ui#2423` (5 threads), `ui#2431`, `ui#2421`, `ui#2420`, `ui#2433` and `landing#133` (rounds 2 and 3); `main` merged into `ui#2419`, `ui#2420`, `ui#2421`, `ui#2433` and `ui#2422`; one intake cycle; the App Review read.
- Superseded: `ui#2431` first in the merge order (its review found the push disclosure gap; `ui#2436` is first); the dirty `ticket-2106-one-version-release` worktree (committed and delivered); the `ui#2433` Layout log read before its chain (a fresh run follows the new head).
- Carried: every other in-flight row; the merge order; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
