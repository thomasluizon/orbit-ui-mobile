/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D594 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time. S `task-map.md` TOP BLOCK ("RELAY ARMED at 11:45" and every line under it) holds each worktree, head and exact next command, and wins over this prompt.

Account: the session and the workers run on the worker account until the owner switches back. Every `claude` tier is `claude-fable-5-2`; crank stays on. Pullfrog WORKS on a worker account token. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one.

Owner orders of the last session (in the spec): run tooling (Batch T and Batch 0b) is the priority; under crank never hold ready work for an ordering preference (merge at the bar at once, launch at once); `/progress` reports only merged and built-not-merged work in product terms, no numbers, and `/progress --remaining` reports the open board the same way.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). Only a regression of the pull request or a failed acceptance probe starts a fix round. One fix round only, then push with no third review. The coordinator corrects a false statement in a body file before the push (`node S/fix-text.mjs <spec.json>`). Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused: use the Write and Edit tools or a helper script. zsh does not split a variable in a `for` loop or a `for x in "a b"` pair. `ls` prints nothing in a pipe: use `/bin/ls`. A raw `gh api` write on a ticket is refused: use the ticket tools. `create-worktree.mjs --issue` takes a number. Use `git -C`, never `cd`. A cancelled CI job with no error: `gh run rerun <run> --failed`. A failed `@pullfrog review` request counts as the head's request: post a new `@pullfrog review` comment by hand when no Pullfrog run starts. New helper: `node S/make-frog-note.mjs <pr> <round> <head> [ui|api|landing]` writes a Pullfrog fix round note.

Standing: reviews and proofs run as workers; a critic pass runs as read-only agents and its report is saved in S at once. The loop for one pull request: `launch-review-round.sh` (`CEILING` 75 to 120), `round-result.mjs`, `worker-report.mjs`, `review-after-round.sh` (a first pass uses `whole - -`), `review-verdict.mjs`, `merge-main.mjs`, `push-round.mjs`, `pr-body.mjs`, then `tools/wait-ci.mjs` in the background; `pr-bar.mjs`, and merge at once at the bar. New builds: `tools/create-worktree.mjs`, rename the branch, then S `launch-build.sh`. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once unless the listing names a new ticket worktree. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 42, placed 42, unplaced 0, placed twice 0.

## In flight

UI `main` `e8fa116f9`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`; production API `3930b6d5b`, web `d356d1b5d`, landing `20c1b0a90`. Owner question queue: empty. No stash. No worker runs (the drain finished). The relay checkout holds `origin/main`.

| Item | Disposition |
| --- | --- |
| Committed rounds, not pushed: ui#2464 r26, ui#2475 r9, ui#2476 r6, ui#2490 r2, ui#2491 r2, api#1126 r2, ui#2492 r2, api#1127 r2 (delta review NOTES, push next) | Delta review each (api#1127 is reviewed), `main` merge (UI), push with `push-round.mjs`, wait-ci. Run tooling first: 2464, 2475, 2476. |
| Refused by the drain, notes written: ui#2486 r4 (`main` merge plus 2 threads), ui#2488 r3, ui#2483 r9, ui#2480 r5, ui#2451 r28, ui#2485 r4, api#1121 r4, ui#2489 base merge | Launch each at once, ui#2486 and the harness ones first. api#1124: read why `pullfrog-approval` failed with 0 threads. |
| New pull requests with no review: ui#2493 (`#2170`), ui#2495 (`#2171`), ui#2494 (`#2165`), ui#2496 (`#1561`, the iPad sign-in field) | The whole review of each, CI, Pullfrog. |
| api#1125, api#1128 | Approved, stacked on api#1120: merge after api#1120, retargeted to `main`. |
| `#2122` (ui#2453) | Green locally at `963491ace`, not pushed: critic pass 2, the copy approval, push, whole review (task-map). |
| `#2146` | ui#2484 merged: the device proof worker, then the web release and the mobile pair, then close. |
| `#2172` (owner live report: the Orbit insight lists raw titles) | Build it now on orbit-api `main`, root cause first, then the production API release. |
| `#2173` (relay without draining) | Build it from `main`; the live relay proof is a merge condition. |
| `#2167`, `#2168` | Build stacked on the ui#2492 branch once its round is pushed (the family table is confirmed). |
| `#2174` | Folded into `#1561` by comment: close it as not planned with a ticket tool. |
| landing#137 | Pushed with its copy approval; `Build` red until a patched `picomatch` exists. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then reviews and relaunches, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board, in the spec's `## The order`.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; the Pullfrog token (owner code, D588); ui#2469 and ui#2484 merged; the whole reviews of ui#2491, ui#2492, api#1127, api#1128; the landing#137 delta review, push and approval; the api#1128 copy approval; the first `#2122` fix round decision; `#2165` launch 1 (ui#2494); one intake cycle (`ORBIT-MOBILE-Y` folded into `#1561`, ui#2496).
- Superseded: "ui#2486 FIRST" (owner order: no ordering hold); "Pullfrog is DOWN" (it works).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
