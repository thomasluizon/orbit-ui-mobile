/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails). Read `DESIGN.md` (`## Motion`, `## Bans`, `## Habit list`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths; it takes about 10 minutes) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that still holds the predecessor id, full or first 8 characters, with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its last ten entries. Never list `prev-sleep-decisions-*` (300 files). Write scratchpad files with the Write tool or a heredoc to a literal absolute path (the guardrail refuses a redirect to a path that holds a shell variable). Start every waiter as a Bash background task with `run_in_background`. After a chain exit, read `chain-read.sh <key> <pr>`; a `resolve-bot-thread.mjs` id must come from such a read in the same session. Read the review body and the threads before every delivery. Filter every large tool output before it prints, never read the spec in full twice, and send every review fix and diagnosis to a background subagent with `review-fix-brief.md` and an `rb-note.sh` note (`opus`), with one sweep of the finding's class in the brief: the previous session reached the relay threshold in about 110 minutes. A finished subagent keeps its context: send a next round to it with `SendMessage`. Take every decision log time from `date -u`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `05117e18d`; API `main` `1a70835b4`; landing `main` `aa0eaed9c`. Production and staging API `1a70835b4`; staging and production web `3db3e8c40`; landing `599bdfb69`; Android Open 1.3.152 (213); TestFlight production 1.3.152 (2). Merged in the previous session: `ui#2433` (`#2112`, closed). Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `ui#2436` (`#2114`, the owner report, first priority) | Round 3 fix pushed at `cfc7fbe8d` (thread resolved, body corrected, 951 Chromium tests green). Arm `chain-review.sh ui 2436`, read its result, merge at the bar before every other pull request, release web staging and production and Android Open, run a signed-in check with `staging-web-session.cjs`, then tell the owner in his language and close. |
| `ui#2435` (`#1561`) | Round 2 fix pushed at `46c996bb3`. Chain, merge at the bar second, then rerun the failed `testflight-access` job of run `43111017034` and read its summary. |
| `ui#2423` (`#2106`) | Remote head `d4ddfcb3e`, 1 open thread. Worktree `ticket-2106-one-version-release` holds `dd796d122`, not pushed. Read the diff and `rb-2423-r3-report.md`, correct the body, deliver with `deliver-fix.sh`, chain. |
| `ui#2420` (`#2100`) | Remote head `011bd88f3`, 1 open thread. Worktree `ticket-2100-habit-form-motion` holds three commits, not pushed (`da0ef7027`, `b555f9e4c`, `82d5178bd`). Read the diffs and `rb-2420-r6-report.md`, run its Chromium files, fix the `Select` trigger and shell search gaps through a subagent, deliver, chain. |
| `landing#133` (`#2095`, with `#2090`) | Remote head `30ce0e308`, 3 open threads. Worktree `ticket-2095-landing-motion` holds round 6, not pushed (`6a712eb41`, with a sweep of every control). Read `rb-landing-133-r6-report.md` and the diff. It sets `--color-border-control` to `#6e6e72`, which draws a visible border on the composer, the e-mail field and the demo fields: check that against `DESIGN.md` and a rendered page before delivery. Deliver, chain, merge at the bar, then landing staging and production. |
| `ui#2419` (`#2101`) | Round 5 pushed at `d422cf1ca`. Its "iOS simulator compile" job hit the 60 minute limit and runs again (run `43141787102`): chain; a second timeout is a diagnosis for a subagent. |
| `ui#2430`, `ui#2425` | Each waits only on a rerun of the hung "Authed Today Lighthouse budget" job: chain each. |
| Approved, 1 behind `main` | `ui#2431` (`2686b52d8`), `ui#2422` (`74ec6e711`), `ui#2421` (`fd775a97d`), and `ui#2418`, `ui#2426`, `ui#2424`, `ui#2434`: each takes `main-merge-push.sh`, a chain and the merge in its turn, one at a time. |
| App Review (`#2097`) | `WAITING_FOR_REVIEW` at the last read: read `asc-api.mjs GET /v1/reviewSubmissions/a7a890f6-71dc-4595-a297-d4ed05608bb3`. |
| Intake | One cycle done: mailbox empty, store reviews empty, board 21 open and all placed. Sentry is unreadable: this account has no Sentry connector. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2436`, `#2435`, `#2434`, `#2431`, `#2430`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2388`; landing `#133`. Unpushed commits: the three worktrees named above. Dirty worktrees, stashes, running workers and detached checks: none besides those rows. Worker launches: `#2114` 1 of 2, `#1561` tool fix branch 1 of 2. Waiters to arm: one `chain-review.sh` per pull request in CI or review, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. `ui#2436` to merge and release, then `ui#2435`, the three deliveries, the chains and the merge order, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; `ui#2433` merged and `#2112` closed; `ui#2436` rounds 2 and 3, `ui#2419` round 5, `ui#2435` rounds 1 and 2, `ui#2423` round 2 and `landing#133` rounds 4 and 5 delivered; one intake cycle; the App Review read; one owner `/progress` answered.
- Superseded: the `ui#2419` dirty worktree (finished and delivered); `ui#2431` and `ui#2422` at the bar (now 1 behind `main`).
- Carried: every in-flight row; the merge order; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
