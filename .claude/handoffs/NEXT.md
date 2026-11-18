/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D584 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`. Read `date` before you write a time.

Account (owner orders): the session and the workers run on the worker account until the owner switches back. Every `claude` tier is `claude-fable-5-2`; crank stays on. Sentry is connected; Gmail, Orbit and Chrome are not. The Render MCP has no workspace selected: never pick one; use another route.

Pullfrog is DOWN: its Claude token is at the account limit until 19 November 2026, 07:00 UTC, so each review request fails. With no `token-swap` process (`pgrep -fl token-swap`), run `python3 -I` S `token-swap-long.py` in the background and give the owner the link from S `token-swap-url.txt` on the first line of each report; he authorizes as the worker account. On an owner code, write it to S `token-swap-code.txt`, then ask for each pushed head (`node S/threads.mjs <key> <pr> <full head> 20`) and wait with `--require-check pullfrog-approval`. After the reset time, ask for each head with no code. Until then fix rounds, local reviews, pushes and CI continue, and nothing merges.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). Only a regression of the pull request or a failed acceptance probe starts a fix round. One fix round only, then push with no third review. The coordinator corrects a false statement in a body file before the push (`node S/fix-text.mjs <spec.json>`, a file NAME in S). Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused: use the Write and Edit tools or a helper script. zsh does not split a variable in a `for` loop. `ls` prints nothing in a pipe: use `/bin/ls`. A script that calls `gh issue` is refused: use the ticket tools or `gh api`. `create-worktree.mjs --issue` takes a number. Never merge `main` into a worktree while a worker reads it. Use `git -C`, never `cd`. A cancelled CI job with no error: `gh run rerun <run> --failed`.

Standing: reviews and proofs run as workers; a critic pass runs as read-only agents and its report must be saved in S at once. The loop for one pull request uses the helpers of S (each file starts with its usage line; the top table of S `task-map.md` names each worktree, head and exact next command): `launch-review-round.sh` (`CEILING` 75 to 120), `round-result.mjs`, `worker-report.mjs`, `review-after-round.sh` (a first pass uses `whole - -`), `review-verdict.mjs`, `merge-main.mjs`, `push-round.mjs`, `pr-body.mjs`, then `tools/wait-ci.mjs` in the background; `pr-bar.mjs`, and merge at once at the bar.

New builds: `tools/create-worktree.mjs`, rename the branch, then S `launch-build.sh`; while nothing merges, stack a build on the branch that holds its dependencies. Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, but never while the listing names a new ticket worktree. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 37, placed 37, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `d356d1b5d`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`; production API `3930b6d5b`, web `d356d1b5d`, landing `20c1b0a90`. Owner question queue: one row (the Pullfrog token). No stash. No worker runs. The spec bullets hold each next step; S `task-map.md` wins for each worktree state.

| Item | Disposition |
| --- | --- |
| ui#2486, ui#2488, ui#2469, ui#2464, ui#2475, ui#2476, ui#2483, ui#2485, ui#2484, ui#2480, ui#2451, ui#2489, ui#2490, api#1121, api#1124, api#1125, api#1126 | Green, pushed after a local review with no blocking finding; no Pullfrog review yet. Ask Pullfrog when it works, merge at the bar, ui#2486 FIRST. ui#2488 is stacked on the ui#2486 branch: retarget it to `main` before that branch is deleted. Retarget each other stacked pull request when its base merges. |
| ui#2491 (`#2164`), ui#2492 (`#2166`), api#1127 (`#2163`), api#1128 (`#2161`) | Delivered builds with no review: the whole review of each and `wait-ci.mjs` (S `task-map.md` has each command and each report file). Confirm the family table of ui#2492. |
| ui#2453 (`#2122`) | Local head `f4d1cffd6`, not pushed, NOT green: read S `report-2453-critic1.md` first, decide its open point, fix the four red web test files, then critic pass 2, the copy approval, push, the whole review. |
| landing#137 (`#2126`) | Local commit `d450681cb` (18 copy corrections), not pushed: delta review, push, post S `comment-137-copy-approval.md`. `Build` stays red until a patched `picomatch` exists. Merge conditions are in its spec bullet. |
| `#2165` | Build it stacked on `chore/ticket-2164-eval-catalog-paths`. |
| api#1120 | Green and approved at `d7596be4f`, behind `main`; its k=1 gate needs ui#2480 merged and the `#2135` baseline window. |
| Releases | Web, landing, Android Open 1.3.157 (218) and TestFlight 1.3.157 (7) are done; the iOS build waits for Beta App Review. No API release. |
| `#2167`, `#2168`, `#2169`, `#2146` item 5, `#2125` Parts 3 and 4 | As their spec bullets say. |
| Intake | One cycle ran with no new item. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then reviews and relaunches, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; api#1125 and api#1126 pushed; the `#2122` base merge read, two fix rounds, critic pass 1; ui#2490 reviewed; rows 5-ui, 6-ui and 7 filed (`#2164` to `#2169`); the checks of ui#2451 and ui#2489 read (both pass); one intake cycle.
- Superseded: "`#2161` and `#2163` wait for a merge" (both are built, stacked).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
