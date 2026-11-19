/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D726 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first two blocks of S `task-map.md` hold each worktree, head and exact next command, and win over this prompt. Predecessor task outputs do not carry: read S `review-<key>-local.md` and `git log` in the worktree.

Models (owner order): the coordinator and Pullfrog run Opus 5.5; every worker tier runs `claude-sonnet-5-5`. Confirm all four tiers in `.claude/orchestrator.json`; never change or ask about a model unless the owner orders it in chat. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders (spec standing rules): run tooling (Batch T, Batch 0b) first; under crank never hold ready work; `/progress` reports merged and built work in product terms, no numbers. The owner asked why the harness speed work is late and ordered "go faster": ui#2486 merged (owner told); tell him at once when ui#2502 or ui#2498 merges.

Speed rules: a review order names the new commits only and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`), but fix a cheap code NOTE (format, an unused import, a stale sentence) in the coordinator before the push, because Pullfrog flags it and costs a round; a worker round fixes only BLOCKING findings (rule 14) and main caps rounds at 3 per branch. A regression of the pull request or a failed acceptance probe starts a fix round. The coordinator corrects a false body statement before the push. Workers run focused tests only. A body stays under 60,000 characters. A Pullfrog review that fails with no thread names its blocker in the review body: `node S/save-frog.mjs <key> <pr>` saves it to S `pf-<pr>-last.md`; put that item in the round note.

Tool facts: the approval-prompt hook refuses a Bash command with a variable in a `cd` path or a redirect target, a `[` beside a `$(` or a backtick, `sysctl`, `pgrep`, or `ui#N` and `-` arguments on a bash line: write literal commands, a here document or a `.mjs` file. A `gh issue list` with a redirect runs alone on its line. `grep` is ugrep and `ls` is not plain: search with node (S `grep-body.mjs <file> <regex>`, S `spec-bullets.mjs <n>`, S `job-fails.mjs <repo> <job>`). A worker cannot start a browser, a dev server or an emulator. One `wait-ci.mjs` per pull request; exit 3 is the ceiling (start it again), 4 a moved head.

Standing loop: `launch-review-round.sh`, `round-result.mjs`, `rv.sh`, `review-verdict.mjs <task> <key>`, `merge-main.mjs` (exits 2 on a conflict; `merge-main-reseed.mjs <wt>` resolves a calibration-only conflict; a stacked branch uses `merge-base.mjs <wt> <base>`), `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; `pr-bar.mjs`; `make-frog-note.mjs <pr> <round> <head> <key>` (check the round label is unused first); merge at once at the bar (green, fresh Pullfrog approval at the head, 0 threads, behind 0). A merge to `main` puts every approved pull request behind: merge `main` into each at once and ask Pullfrog again. Stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 39, placed 39, unplaced 0, placed twice 0.

## In flight

UI `main` `10968d893` (ui#2486 merged); API `main` and production `70c66e7be`; landing `main` `20c1b0a90`; web production `2263a8b67`. Owner question queue: empty. No stash. The relay checkout holds `origin/main`. Start a waiter for every pushed head at once (S task-map relay block).

| Item | Disposition |
| --- | --- |
| FIRST: ui#2502 (Windows CI) 3d806b98b | Pushed after the main merge, Pullfrog asked: merge at the bar, tell the owner, then merge main into ui#2451. |
| ui#2498 (relay without a drain) | Review 2498-m2 ran over 95baa7186 and merge 66195b15d: on CLEAN or NOTES push `body-2498-m2.md`. Merge also needs proofs A and B (S `body-2498-main1.md` lines 35 to 55) at a real relay with the branch code. |
| Pullfrog failed, one round each (make-frog-note, launch-review-round) | ui#2499 d79e863e8 (1 thread), landing#137 64a5822ca. |
| Reviews done | 2501-r7 (base is the ui#2492 branch), 2488-r8: read S `review-<key>-local.md`, push each on CLEAN or NOTES. |
| Round done | ui#2476 r13 with the main merge (W/ticket-2121-part4): review the new commits, push `body-2476-r13.md`. |
| Pushed, Pullfrog asked | ui#2500 f3a01cb91, ui#2480 36ef230ba, ui#2483 3cff7bdae, ui#2475 6d467dd70, ui#2453 63ae9c52c, ui#2495 b8bd8a505, ui#2493 630d1ed9f: waiter each, merge at the bar, a failed Pullfrog gets one round. |
| ui#2492 b5fa7bd9e approved | Base is the ui#2480 branch. After ui#2480 merges: merge main into it, push, re-ask; then ui#2500 and ui#2501 merge the new ui#2492 head and push once. |
| ui#2491, ui#2494; api#1120, api#1121, api#1124 to api#1128 | Wait on api#1124 and on the `#2135` core set gate after ui#2480 merges. |
| `#2156` ORBIT-WEB-1H | Resolve after the run state's `resolveAfter` of ORBIT-WEB-1H (`intake.sentry`) if no event is newer than its `lastEventAt`, then close `#2156`. |
| `#2176`, `#2146` | `#2176` after `#2122`; `#2146` web check through `claude-in-chrome` once connected, the mobile pair after ui#2499 merges. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then rounds and reviews, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2486 merged (10968d893); web production 2263a8b67 released (run 44421924037); rounds and reviews of ui#2499, ui#2476 r12, ui#2483, ui#2480, ui#2492, ui#2500, ui#2501, ui#2453, landing#137 pushed; ui#2488 retargeted to main by GitHub.
- Carried: ui#2502, ui#2498 proofs, ui#2451, the held api and ui rows, `#2176`, `#2146`, every standing order above.

Treat every identifier here as a lead to verify.
