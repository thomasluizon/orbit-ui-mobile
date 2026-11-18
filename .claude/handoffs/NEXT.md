/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D614 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` holds each worktree, head and exact next command, and wins over this prompt.

Models (owner order): the coordinator and Pullfrog run Opus 5.5; every worker tier runs `claude-sonnet-5-5`. Confirm all four tiers in `.claude/orchestrator.json`; never change a model and never ask about one unless the owner orders it in chat. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders (in the spec): run tooling (Batch T and Batch 0b) is the priority; under crank never hold ready work; `/progress` reports only merged and built-not-merged work in product terms, no numbers. A post the owner shares is a reference: adapt the part he names.

Speed rules: a review order names the new commits only and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). A regression of the pull request or a failed acceptance probe starts a fix round. The coordinator corrects a false body statement before the push (`node S/fix-text.mjs <spec.json>`). Workers run focused tests only. A body stays under 60,000 characters.

Tool facts: the approval-prompt hook (live since ui#2464) refuses a Bash command with `${=x}`, a variable command word or a `for` over a variable: write literal commands. A redirect target with a variable is refused. A raw `gh api` ticket write, and a script that calls `gh` on a ticket, are refused: use the ticket tools. A worker cannot start a browser, a dev server or an emulator. A failed `@pullfrog review` request counts as the head's request.

Standing: reviews and proofs run as workers. The loop: `launch-review-round.sh`, `round-result.mjs`, `review-after-round.sh` (a first pass uses `whole - -`), `review-verdict.mjs <task> <key>`, `merge-main.mjs`, `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; `pr-bar.mjs`; `make-frog-note.mjs <pr> <round> <head> <key>` for Pullfrog threads; merge at once at the bar. Stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 40, placed 40, unplaced 0, placed twice 0.

## In flight

UI `main` `82dda31a2`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. No worker runs (the drain finished). The relay checkout holds `origin/main`.

| Item | Disposition |
| --- | --- |
| Pullfrog FAILED, one round each (S task-map has each command and note): api#1124 r3 (first), api#1126 r3 (merges the api#1124 head first), api#1129 r2, ui#2476 r8 (a `gh auth status -t` token leak), ui#2475 r11, ui#2486, ui#2485, ui#2492, ui#2488 (also conflicting), ui#2491, ui#2489 | `make-frog-note.mjs` where no note exists, then launch each at once. |
| Pushed with Pullfrog asked: ui#2483 `70dd9bcd7`, ui#2496 `517765127`, ui#2490 `da84c9dd8`, ui#2493 `89bacc19a`, ui#2480 `7e96cde3a`, ui#2451 `87c13524`, ui#2495 `687558309`, ui#2497 | One `wait-ci.mjs --require-check pullfrog-approval` per repository; merge each at the bar. |
| Committed, not reviewed: ui#2498 r2 `58cebcbd0` | Delta review (task-map command), push. |
| New, no review: ui#2500 (`#2167`), ui#2501 (`#2168`) | Whole review, CI, Pullfrog. |
| ui#2499 (`#2175`, owner report) | Round 2 first (note-2499-r2.md), then whole review. |
| ui#2453 (`#2122`) | base3 worker done: `round-result.mjs`, read merge-2122-base3-result.md, critic pass 2, copy approval, push. |
| ui#2494 (`#2165`, stacked on ui#2491) | Base merge round (conflict in `evals/astra/trace-policy.mjs`). |
| api#1120, api#1121, api#1125, api#1127, api#1128 | Green and approved; each waits on the core set eval gate (`#2135`) or its stack parent. |
| `#2146` | Web check through `claude-in-chrome` after the web release; Android proof through the ui#2476 `--proof` mode once it merges. |
| Releases | Web production plus the Android Open and TestFlight pair once ui#2485 and ui#2496 merge (they carry `#2146`, `#2156` and the ORBIT-MOBILE-Y fix). |
| landing#137 | Red on `npm audit` until a patched `picomatch` exists (4.0.7 today). |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then rounds and reviews, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; every review the Fable limit stopped, relaunched on Sonnet; ui#2486, ui#2485, ui#2483, ui#2490, ui#2492, api#1126, ui#2489, ui#2495, ui#2493, ui#2480, ui#2451, ui#2476, ui#2475, ui#2491, api#1121, api#1124 pushed; ui#2464 merged; `#2137`, `#2139`, `#2174` closed; the `#2172`, `#2173`, `#2167`, `#2168` builds; ui#2494 notes filed.
- Superseded: "the device proof worker" for `#2146` (a worker cannot start a browser or an emulator).
- Carried: every other In flight row and every standing order above.

Treat every identifier here as a lead to verify.
