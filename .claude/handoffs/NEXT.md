/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D571 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`.

Account (owner orders): the session and the workers run on the worker account until the owner switches back. Every `claude` tier is `claude-fable-5-2` (the weekly reset passed); crank stays on. Sentry is connected; Gmail, Orbit and Chrome are not.

Pullfrog is DOWN: its Claude token is at the account limit until 19 November 2026, 07:00 UTC, so each review request fails. With no `token-swap` process (`pgrep -fl token-swap`), run `python3 -I` S `token-swap-long.py` in the background and give the owner the link from S `token-swap-url.txt` on the first line of each report; he authorizes as the worker account. On an owner code, write it to S `token-swap-code.txt`, then ask for each pushed head (`node S/threads.mjs <key> <pr> <full head> 20`) and wait with `--require-check pullfrog-approval`. Until then fix rounds, local reviews, pushes and CI continue, and nothing merges.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). Only a regression of the pull request or a failed acceptance probe starts a fix round. One fix round only, then push with no third review. The coordinator corrects a false statement in a body file before the push (`node S/fix-text.mjs <spec.json>`, a file NAME in S). Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused: use the Write and Edit tools or a helper script. zsh does not split a variable in a `for` loop. `ls` prints nothing in a pipe: use `/bin/ls`. A script that calls `gh issue` is refused: use the ticket tools. `create-worktree.mjs --issue` takes a number. Never merge `main` into a worktree while a worker reads it. Use `git -C`, never `cd`. A cancelled CI job with no error: `gh run rerun <run> --failed`.

Standing: reviews and proofs run as workers. The loop for one pull request uses the helpers of S (each file starts with its usage line; the top table of S `task-map.md` names each worktree, head and exact next command): `launch-review-round.sh` (`CEILING` 75 to 120), `round-result.mjs`, `worker-report.mjs`, `review-after-round.sh` (a first pass uses `whole - -`), `review-verdict.mjs`, `merge-main.mjs`, `push-round.mjs`, `pr-body.mjs`, then `tools/wait-ci.mjs` in the background; `pr-bar.mjs`, and merge at once at the bar.

New builds: `tools/create-worktree.mjs`, rename the branch, then S `launch-build.sh`. Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, but never while the listing names a new ticket worktree. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 31, placed 31, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `d356d1b5d`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`; production API `3930b6d5b`, web `d356d1b5d`, landing `20c1b0a90`. Owner question queue: one row (the Pullfrog token). No stash. The spec bullets hold each next step; S `task-map.md` wins for each worktree state.

| Item | Disposition |
| --- | --- |
| ui#2486, ui#2488, ui#2469, ui#2464, ui#2475, ui#2476, ui#2483, ui#2485, ui#2484, ui#2480, ui#2451, ui#2489, api#1121, api#1124, landing#137 | Pushed after a local review with no blocking finding; no Pullfrog review yet. Read `pr-bar.mjs`, rerun a cancelled job, ask Pullfrog when it works, merge at the bar, ui#2486 FIRST. ui#2488 is stacked on the ui#2486 branch: retarget it to `main` before that branch is deleted. ui#2451: read the rerun of its `Lint` job. ui#2489: read `iOS simulator compile`. landing#137 keeps a red `Build` until a patched `picomatch` exists. |
| api#1125 (`#2162`), api#1126 (`#2160`) | Fix round 1 of each is a local commit, not pushed: run or read its delta review, push, set the corrected body (S `task-map.md` has each command). api#1126 keeps both shapes until the core set runs on each. |
| ui#2453 (`#2122`) | A worker merges the `#2121` branch into `feature/ticket-2122-destinations` (commit only): read S `merge-2122-base2-result.md`, then the critic passes, the copy approval, push. |
| `#2096` | A worker builds the three stale route intents (worktree `ticket-2096-route-intents`): the whole review, then Pullfrog. |
| Orbit AI rows 5-ui, 6-ui, 7 | S drafts `draft-2129-5ui.md`, `draft-2129-6ui.md`, `draft-2129-7.md`: decide the open points, file each with `file-draft-blocked.mjs`, launch 5-ui first. |
| api#1120 | Green and approved at `d7596be4f`, behind `main`; its k=1 gate needs ui#2480 merged and the `#2135` baseline window. |
| Releases | Web, landing, Android Open 1.3.157 (218) and TestFlight 1.3.157 (7) are done; the iOS build waits for Beta App Review. No API release. |
| `#2161`, `#2163`, `#2146` item 5, `#2125` Parts 3 and 4 | As their spec bullets say. |
| Intake | One cycle ran: Sentry and the store reviews had no new item; two Apple messages are closed on `#1561`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then reviews and relaunches, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; the tier change to `claude-fable-5-2` at the weekly reset (the reminder is no longer needed); round 27 of ui#2451 pushed; the whole reviews of api#1125 and api#1126 and the provider probe; the iOS run read, the build added to the outside group and submitted; `#2125` Part 5; one intake cycle.
- Superseded: "the second launch removes the shape that loses" (both shapes passed the probe, so check 7 of `#2160` chooses).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
