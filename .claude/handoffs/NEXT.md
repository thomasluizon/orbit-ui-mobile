/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D555 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`.

Account (owner orders): the session and the workers run on the worker account until the owner switches back. FULL crank with `claude-opus-5-5` workers until that account's weekly reset (10:00 UTC; `rateLimits.seven_day.resets_at` in `$HOME/.claude/usage-snapshot.json`). At the reset, or at once when it passed, set every `claude` tier in `.claude/orchestrator.json` to `claude-fable-5-2` and return to the normal pace. Set a one-shot `CronCreate` reminder for 07:03 local when that time is ahead. Sentry is connected; Gmail, Orbit and Chrome are not.

Pullfrog is DOWN: its Claude token is at the account limit until 19 November 2026, 07:00 UTC, so each review request fails. With no `token-swap` process (`pgrep -fl token-swap`), run `python3 -I` S `token-swap-long.py` in the background and give the owner the link from S `token-swap-url.txt` on the first line of each report; he authorizes as the worker account. On an owner code, write it to S `token-swap-code.txt`, then ask for each pushed head (`node S/threads.mjs <key> <pr> <full head> 20`) and wait with `--require-check pullfrog-approval`. Until then fix rounds, local reviews, pushes and CI continue, and nothing merges.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs`). A note that names a regression of the pull request gets one probe round before the push. One fix round only, then push with no third review. The coordinator corrects a false statement in a body file before the push (`node S/fix-text.mjs <spec.json>`). Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused: use the Write and Edit tools or a helper script. zsh does not split a variable in a `for` loop. `ls` prints nothing in a pipe: use `/bin/ls`. A script that calls `gh issue` is refused: use the ticket tools. `create-worktree.mjs --issue` takes a number. Never merge `main` into a worktree while a worker reads it; `node S/push-main-merge.mjs <repo>/<worktree> ...` merges and pushes idle heads. Use `git -C`, never `cd`.

Standing: reviews and proofs run as workers. The loop for one pull request uses the helpers of S (each file starts with its usage line; S `task-map.md` names each worktree): `auto-round-note.mjs`, post the note on the ticket, `launch-review-round.sh` (`CEILING` 75 to 120); `round-result.mjs` and `diff-scan.mjs`; `review-after-round.sh` (a first pass uses `whole - -`) and `review-verdict.mjs`; `merge-main.mjs`, `push-round.mjs`, then `tools/wait-ci.mjs` in the background; `pr-bar.mjs`, and merge at once at the bar.

New builds: `tools/create-worktree.mjs`, rename the branch, `tools/compose-prompt.mjs`, then S `gated-launch.sh` with `LOAD_MAX=60 SPACING=45`. Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, but never while the listing names a new ticket worktree. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 31, placed 31, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `d356d1b5d`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`; production API `3930b6d5b`, web `d356d1b5d`, landing `20c1b0a90`. Owner order: `/crank` and `/sleep` stay on; finish every ticket. Owner question queue: one row (the Pullfrog token). No stash; every worktree is clean. The spec bullets hold each next step; the top tables of S `task-map.md` name each worktree, head, note and review file.

| Item | Disposition |
| --- | --- |
| ui#2486, ui#2488, ui#2469, ui#2464, ui#2475, ui#2476, ui#2483, ui#2485, ui#2484, ui#2480, api#1121, api#1124, landing#137 | Pushed after a local review with no blocking finding; no Pullfrog review yet. ui#2488 is stacked on the ui#2486 branch: retarget it to `main` before that branch is deleted. Read `pr-bar.mjs`, rerun a cancelled `Tool tests` shard, ask Pullfrog when it works, merge at the bar, ui#2486 FIRST. landing#137 keeps a red `Build` until a patched `picomatch` exists. |
| ui#2451 | Round 27 is committed and NOT pushed (`b3a0b137a`, `57620f3a7`). Run the delta review of those commits, then merge `main`, push and wait for CI. |
| api#1125 (`#2162`), api#1126 (`#2160`) | New stacked builds, not reviewed: run each whole review (`whole - -`); api#1126 then gets the provider probe and its second launch (spec bullet). |
| `#2125` Part 5 | `thomasluizon/brain#2` is merged; two small steps are left (spec bullet). |
| api#1120 | Green and approved at `d7596be4f`, behind `main`; its k=1 gate needs ui#2480 merged and the `#2135` baseline window. |
| Releases | Web and landing are live. Android Open 1.3.157 (218) is uploaded. iOS 1.3.157 (7) is uploaded too (run 44274605446, from `d356d1b5d`): read its last jobs, then add the build to the outside group. No API release. |
| `#2161`, `#2163`, `#2146` item 5, `#2125` Parts 3 and 4, ui#2453 | As their spec bullets say. ui#2453 starts after round 27 of ui#2451 is pushed. |
| Intake | One cycle ran: no new Sentry event, mail, store review or alert. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then reviews and relaunches, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; the web and landing releases and the mobile pair dispatch; `thomasluizon/brain#2` merged; ui#2488 and ui#2484 fixed and pushed; the stacked builds of `#2162` and `#2160`; round 27 of ui#2451 committed; one intake cycle.
- Superseded: "build `#2162` and `#2160` after their bases merge" (they run stacked); the `pullfrog-approval` wait while Pullfrog is down.
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
