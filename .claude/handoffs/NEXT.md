/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D690 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` holds each worktree, head and exact next command, and wins over this prompt. Predecessor task outputs do not carry: read S `review-<key>-local.md` and `git log` in the worktree.

Models (owner order): the coordinator and Pullfrog run Opus 5.5; every worker tier runs `claude-sonnet-5-5`. Confirm all four tiers in `.claude/orchestrator.json`; never change or ask about a model unless the owner orders it in chat. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders (spec standing rules): run tooling (Batch T, Batch 0b) first; under crank never hold ready work; `/progress` reports merged and built work in product terms, no numbers.

Speed rules: a review order names the new commits only and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). A regression of the pull request or a failed acceptance probe starts a fix round. The coordinator corrects a false body statement before the push. Workers run focused tests only. A body stays under 60,000 characters. A Pullfrog review that fails with no thread names its blocker in the review body: `node S/save-frog.mjs <key> <pr>` saves it to S `pf-<pr>-last.md`; put that item in the round note.

Tool facts: the approval-prompt hook refuses a Bash command with a variable in a `cd` path or a redirect target, a `[` beside a `$(` or a backtick, `sysctl`, `pgrep`, or `ui#N` and `-` arguments on a bash line: write literal commands or a `.mjs` file. A `gh issue list` with a redirect runs alone on its line (the ticket hook refuses it beside other commands). `grep` is ugrep and `ls` is not plain: search with node (S `grep-body.mjs <file> <regex>`, S `notes-of.mjs`). A worker cannot start a browser, a dev server or an emulator. One `wait-ci.mjs` per pull request.

Standing loop: `launch-review-round.sh`, `round-result.mjs`, `rv.sh`, `review-verdict.mjs <task> <key>`, `merge-main.mjs` (a stacked branch merges its base branch instead), `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; `pr-bar.mjs`; `make-frog-note.mjs <pr> <round> <head> <key>`; merge at once at the bar (green, fresh Pullfrog approval at the head, 0 threads, behind 0). Stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 40, placed 40, unplaced 0, placed twice 0.

## In flight

UI `main` `9723bfcd3` (ui#2489 merged); API `main` and production `70c66e7be` (`#2172` closed); landing `main` `20c1b0a90`. Owner question queue: empty. No stash. The relay checkout holds `origin/main`. Start the waiters at once.

| Item | Disposition |
| --- | --- |
| FIRST (owner order in chat: the harness speed work is late) | Pullfrog FAILED at the relay: ui#2486 (1 thread, CI speed), ui#2502 (2 threads, Windows CI), ui#2498 (3 threads, relay without a drain). Launch their rounds before any other work, then merge each at the bar; ui#2498 runs proof A at the next relay. Tell the owner which merged. |
| Web release of `2263a8b67` | Staging run 44409596020 was still queued at the relay, and its watcher was stopped so the relay could start: start `node tools/wait-release.mjs --repo ui --run 44409596020 --sha 2263a8b67c938123082d6d22f528ae0bf59f9b0d --workflow-sha 9723bfcd38f98d64c1a808fc911943de95b1ba46 --service-url https://app-staging.useorbit.org` at once (S task-map has the production command). When staging is healthy and `web-staging-smoke` passed: production, `wait-release.mjs` on `https://app.useorbit.org`, then the ORBIT-WEB-1H watch (`#2156`). |
| Pushed, Pullfrog asked: ui#2490, ui#2480, ui#2495, ui#2502, ui#2486, ui#2499, ui#2498, ui#2476, ui#2453, ui#2501, ui#2500, ui#2488, ui#2475, landing#137 (heads in S task-map) | One waiter per pull request; merge each at the bar; a failed Pullfrog gets one round; approved but behind merges `main` first. |
| ui#2483 r13 committed `65b59f4e2` | Delta review (`rv.sh 2483-r13 ui:2483 2143 <wt> 65b59f4e2 65b59f4e2 review-2483-r12-local.md note-2483-r13.md`), merge main, push with `body-2483-r13.md`. |
| ui#2492 r5 running or done (W/ticket-2166-corpus-outcome-batch1) | Read `git log f3e9eb41c..HEAD`; delta review of the round and the ui#2480 base merge; push; then ui#2500 and ui#2501 merge their base again. |
| Review 2493-r6 (`6d5aa52ff`) | Read S `review-2493-r6-local.md`; on CLEAN or NOTES merge main, push with `body-2493-r6.md`. |
| ui#2451 | Windows red until ui#2502 merges; then merge main, push, merge at the bar. |
| ui#2498 (`#2173`) | Merge condition: the live relay proofs A and B of S `body-2498-main1.md` lines 35 to 55. |
| ui#2491, ui#2494; api#1120, api#1121, api#1124, api#1125, api#1126, api#1127, api#1128 | Wait on api#1124 and on the `#2135` core set gate after ui#2480 merges (then one baseline window). |
| `#2176` (owner order: apply the unslop-ui skill to the whole app) | Blocked by `#2122`; then one worker (spec Batch 2b bullet). The skill is installed at `~/.claude/skills/unslop-ui/` for the main account only. |
| `#2146` and the mobile pair | The web check through `claude-in-chrome` once connected; the Android Open plus TestFlight pair after ui#2499 merges. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then rounds and reviews, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the API release and `#2172` closed; ui#2489 merged; every listed round pushed; the picomatch gate (advisory withdrawn).
- Superseded: "release web once ui#2499 merges" by releasing `2263a8b67` now under crank (S D671).
- Carried: every other In flight row and every standing order above.

Treat every identifier here as a lead to verify.
