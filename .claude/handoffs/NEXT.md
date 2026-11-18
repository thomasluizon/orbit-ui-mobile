/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D661 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` holds each worktree, head and exact next command, and wins over this prompt. Task outputs of the predecessor do not carry: read S `review-<key>-local.md` for a verdict and `git log` in the worktree for a round result.

Models (owner order): the coordinator and Pullfrog run Opus 5.5; every worker tier runs `claude-sonnet-5-5`. Confirm all four tiers in `.claude/orchestrator.json`; never change or ask about a model unless the owner orders it in chat. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders (spec standing rules): run tooling (Batch T, Batch 0b) first; under crank never hold ready work; `/progress` reports merged and built work in product terms, no numbers.

Speed rules: a review order names the new commits only and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). A regression of the pull request or a failed acceptance probe starts a fix round. The coordinator corrects a false body statement before the push (`node S/fix-text.mjs <spec.json>`). Workers run focused tests only. A body stays under 60,000 characters. A Pullfrog review that fails with no thread names its blocker in the review body: put that item in the round note (S `pf-<pr>-last.md`).

Tool facts: the approval-prompt hook refuses a Bash command with `${=x}`, a variable command word, a `for` over a variable, a `[` beside a `$(`, backticks inside a `node -e` string, `sysctl`, `pgrep`, or `ui#N` and `-` arguments on a bash line: write literal commands or a `.mjs` file, and use S `rv.sh <key> <repo:pr> <ticket> <wt> <head> <commits|whole> <earlier|none> <note|none>` for reviews (`CEILING=<min>` raises the review limit). A redirect target with a variable is refused. A script that calls `gh` on a ticket is refused: save one `gh issue list --json ...` to a literal path and process it with node. `grep` here is ugrep and `ls` is not plain: search and list with node (S `newest.mjs`, S `notes-of.mjs`). A worker cannot start a browser, a dev server or an emulator.

Standing: reviews and proofs run as workers. The loop: `launch-review-round.sh`, `round-result.mjs`, `rv.sh`, `review-verdict.mjs <task> <key>`, `merge-main.mjs` (a stacked branch merges its base branch instead), `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; `pr-bar.mjs`; `make-frog-note.mjs <pr> <round> <head> <key>` for Pullfrog threads; merge at once at the bar (green, fresh Pullfrog approval at the head, 0 threads, behind 0). Stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 40, placed 40, unplaced 0, placed twice 0.

## In flight

UI `main` `2263a8b67` (ui#2485 merged); API `main` `70c66e7be` (api#1129 merged); landing `main` `20c1b0a90`. Owner question queue: empty. No stash. The relay checkout holds `origin/main`. Start the waiters at once.

| Item | Disposition |
| --- | --- |
| API release of `70c66e7be` | Staging run 44400226678 failed only at "Require green release CI" (the API Tests push run 44399860378 was still running). When it is green, dispatch staging again (S task-map has the command), `wait-release.mjs` with `--service-url https://api-staging.useorbit.org`, then production. No migration. Then close `#2172`. |
| Pushed, Pullfrog asked: ui#2489, ui#2502, ui#2490, ui#2486, ui#2488, ui#2493, ui#2499, ui#2453, ui#2492, ui#2451 (heads in S task-map) | One `wait-ci.mjs --require-check pullfrog-approval` per repository; merge each at the bar; a failed Pullfrog gets one round. |
| Pullfrog FAILED, no round yet: ui#2476, ui#2498 | `make-frog-note.mjs`, then a round each. |
| Rounds committed or running: ui#2480 r9 (it gates the assistant set), ui#2495 r6 (a regression of r5) | `round-result.mjs`, delta review, push. |
| Reviews finished or running: 2483-r12, 2500-r3, 2475-r13 | Read S `review-<key>-local.md`; on CLEAN or NOTES push with `body-<pr>-<round>.md`. ui#2500 merges its base branch first. |
| ui#2501 r4 CLEAN at `448eb93b6`, not pushed | Its base merge conflicts in `evals/astra/__tests__/corpus.test.mjs`: a base-merge round, its review, then push with `body-2501-r4.md`. |
| api#1126 green and approved | Stacked on api#1124; merge order `#2155`, `#2154`, `#2159`, then this. |
| ui#2498 (`#2173`) | Merge condition: the live relay proofs A and B of S `body-2498-main1.md` lines 35 to 55. |
| ui#2491, ui#2494; api#1120, api#1121, api#1124, api#1125, api#1127, api#1128 | Wait on api#1124 and on the `#2135` core set gate after ui#2480 merges. |
| `#2156`, `#2146` and the releases | The web release and the mobile pair once ui#2499 merges; then the `claude-in-chrome` web check and the ORBIT-WEB-1H watch. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then rounds and reviews, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2485 and api#1129 merged; the api#1129 and api#1126 probe and body items; rounds and pushes of every listed Pullfrog failure; ui#2500 base1 and ui#2501 r3 pushed.
- Carried: every other In flight row and every standing order above.

Treat every identifier here as a lead to verify.
