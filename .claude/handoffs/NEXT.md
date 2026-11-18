/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D626 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. The first block of S `task-map.md` holds each worktree, head and exact next command, and wins over this prompt. Task outputs of the predecessor do not carry: read S `review-<key>-local.md` for a verdict and `git log` in the worktree for a round result.

Models (owner order): the coordinator and Pullfrog run Opus 5.5; every worker tier runs `claude-sonnet-5-5`. Confirm all four tiers in `.claude/orchestrator.json`; never change a model and never ask about one unless the owner orders it in chat. A worker that stops at a usage limit is reported to the owner at once. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders (in the spec): run tooling (Batch T and Batch 0b) is the priority; under crank never hold ready work; `/progress` reports only merged and built-not-merged work in product terms, no numbers. A post the owner shares is a reference: adapt the part he names.

Speed rules: a review order names the new commits only and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). A regression of the pull request or a failed acceptance probe starts a fix round. The coordinator corrects a false body statement before the push (`node S/fix-text.mjs <spec.json>`). Workers run focused tests only. A body stays under 60,000 characters.

Tool facts: the approval-prompt hook refuses a Bash command with `${=x}`, a variable command word, a `for` over a variable, a `[` beside a `$(`, or `ui#N` and `-` arguments on a bash line: write literal commands, and use S `rv.sh <key> <repo:pr> <ticket> <wt> <head> <commits|whole> <earlier|none> <note|none>` for reviews. A redirect target with a variable is refused. A script that calls `gh` on a ticket is refused: save one `gh issue list --json ...` to a literal path and process it with node. `grep` here is ugrep: search with node. A worker cannot start a browser, a dev server or an emulator.

Standing: reviews and proofs run as workers. The loop: `launch-review-round.sh`, `round-result.mjs`, `rv.sh`, `review-verdict.mjs <task> <key>`, `merge-main.mjs`, `push-round.mjs <key> <pr> <absolute worktree> <body | ->`, then `tools/wait-ci.mjs --require-check pullfrog-approval` in the background; `pr-bar.mjs`; `make-frog-note.mjs <pr> <round> <head> <key>` for Pullfrog threads; merge at once at the bar (green, fresh Pullfrog approval at the head, 0 threads, behind 0). Stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 40, placed 40, unplaced 0, placed twice 0.

## In flight

UI `main` `077a7ef26`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. The relay checkout holds `origin/main`.

| Item | Disposition |
| --- | --- |
| Pushed with Pullfrog asked: ui#2486, ui#2489, ui#2497, ui#2491, ui#2480, ui#2494, ui#2493, ui#2476, ui#2475, ui#2495, ui#2488 (heads in S task-map) | One `wait-ci.mjs --require-check pullfrog-approval` per repository; merge each at the bar; a failed Pullfrog gets one round. |
| Committed, not reviewed: ui#2500 r2 `14a1a856e`, ui#2483 r10 `df810749c`, ui#2453 critic2 `1a6c5c423` | Delta review (ui#2453: the whole review and the copy approval of each new string), then push. |
| ui#2499 (`#2175`, owner report) | Review 2499-r2 BLOCKING 1: the saved sidebar preference of an existing user resets (old localStorage key `orbit-shell-store` no longer read). Fix round r3, then the delta review, push. |
| ui#2485 (`#2156`) | Pullfrog FAILED, 1 thread at `ea4bfd9e8`: `make-frog-note.mjs 2485 r6`, round. |
| ui#2502 (`#2074`, the Windows runner Clang break) | Whole review, CI. |
| Running at the drain, outcome unknown: ui#2451 r29, ui#2501 r2, ui#2498 r3; reviews 2492-r3, 2490-r3, 1129-r3, 1126-r3 | Read each worktree's `git log` and each `review-<key>-local.md` first, then continue the loop. |
| ui#2498 (`#2173`) | Merge condition: the live relay proof A and B of S `body-2498-main1.md` lines 35 to 55, run by the coordinator. |
| api#1120, api#1121, api#1124, api#1125, api#1127, api#1128 | Green and approved; each waits on the core set eval gate (`#2135`) or its stack parent. |
| `#2146` | Web check through `claude-in-chrome` after the web release; Android proof through the ui#2476 `--proof` mode once it merges. |
| Releases | Web production plus the Android Open and TestFlight pair once ui#2485 merges (ui#2496 is merged; they carry `#2146`, `#2156` and the ORBIT-MOBILE-Y fix). |
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

- Done: the adoption; ui#2496 merged; every listed Pullfrog round run (ui#2486, ui#2485, ui#2492, ui#2488, ui#2491, ui#2489, ui#2476, ui#2475, api#1124, api#1126, api#1129) and pushed or committed; ui#2498 r2 pushed; ui#2500 and ui#2501 whole reviews; ui#2499 round 2; ui#2494 base merge pushed; ui#2453 critic pass 2 and its fix round.
- Carried: every other In flight row and every standing order above.

Treat every identifier here as a lead to verify.
