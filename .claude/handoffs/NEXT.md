/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D531 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'`.

Account (owner orders): the session and the workers run on the worker account until the owner switches back. FULL crank until that account's weekly reset (10:00 UTC; `rateLimits.seven_day.resets_at` in `$HOME/.claude/usage-snapshot.json`). Workers run `claude-opus-5-5` until the reset. At the reset, set every `claude` tier in `.claude/orchestrator.json` to `claude-fable-5-2` and return to the normal pace. Set a one-shot `CronCreate` reminder for 07:03 local now. Sentry is connected; Gmail, Orbit and Chrome are not.

Pullfrog token: on an owner code, write it to `token-swap-code.txt` in the scratchpad of the live `token-swap.py` (`pgrep -fl token-swap.py`). With no process, run `python3 -I` S `token-swap.py` in the background and give him the link from S `token-swap-url.txt`.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs` with the file it prints). One fix round only for a BLOCKING finding, then push with no third review. The coordinator corrects a false statement in a body file before the push. Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused, so use the Write and Edit tools or a helper script. `ls` is an alias that prints nothing in a pipe: use `/bin/ls`. A script that calls `gh issue` is refused by a hook: use the ticket tools. A thread id passes only after `node S/threads.mjs <key> <pr>` printed it; with a head and `20` it also asks for the review. Never merge `main` into a worktree while a worker reads it. Never `cd` out of the UI checkout: use `git -C`. Print short outputs: the relay arms at 350,000 tokens. A `main` merge puts every open head behind.

Standing: reviews and proofs run as workers. The loop for one pull request, with the helpers of S `task-map.md`:

1. Pullfrog threads: `node S/auto-round-note.mjs <key> <pr> <round> <head> "<title>" [extra file]`, post the note on the ticket, then `S/launch-review-round.sh <key> <ticket> <worktree> main max <pr>-r<round> <absolute note path> <reason>` (`CEILING` 75 to 120).
2. Round result: `node S/round-result.mjs <task> <worktree> <head before the round>`; read the diff (S `diff-scan.mjs`).
3. Delta review: `S/review-after-round.sh <key> "<repo>#<pr>" <ticket> <worktree> <head> <commits> <earlier review file | -> <note>`; a first pass uses `whole - -`. Read it with `node S/review-verdict.mjs <task> <key>`.
4. Push: `node S/merge-main.mjs <repo>/<worktree>` first, then `node S/push-round.mjs <key> <pr> <absolute worktree> <body file | ->`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background.
5. Bar: `node S/pr-bar.mjs <key>:<pr> ...`. Merge at once at the bar.

New builds: `tools/create-worktree.mjs`, rename the branch, `tools/compose-prompt.mjs`, then S `gated-launch.sh` with `LOAD_MAX=60 SPACING=45`. Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, but never while the listing names a new ticket worktree. After every `main` merge, merge `origin/main` into the relay checkout. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 29, placed 29, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `b320dacf8`; API `main` `f7abe19fc`; landing `main` `20c1b0a90`; production API `3930b6d5b`. Owner order: `/crank` and `/sleep` stay on; finish every ticket. Owner question queue: empty. The spec bullets hold each next step; the top table of S `task-map.md` names each worktree, head, note and earlier review file.

| Item | Disposition |
| --- | --- |
| ui#2486 (`#2074` speed build) | Pushed `6e39306a8`, Pullfrog asked, behind `main`: on approval merge `main`, push, wait, merge FIRST; then start `#2152`. |
| ui#2451, ui#2483, ui#2481 | Pushed, Pullfrog asked: `wait-ci.mjs` each, rerun a cancelled `Tool tests` shard, merge at the bar. |
| ui#2464, ui#2485, ui#2469, ui#2476, ui#2480, ui#2484, ui#2475, api#1121 | A fix round ran at the relay: read `git status`; a commit gets the delta review and the push, else relaunch its note with a continuation. ui#2480 also holds a `main` merge conflict fix. |
| `#2159` (5-api) | Its build ran at the relay: a pull request gets the whole review, else relaunch S `order-2159-build.md` with a continuation. |
| `#2129` rows 3b and 4 | Drafts S `ticket-2129-3b.md` and `ticket-2129-4.md` (or `4a`, `4b`): settle the open points (model S `settle-2129.mjs`), then file them. |
| `#2150` | Released. Close it when CodeQL alert 29 has no open instance on API `main` (S `prs-alerts.mjs`). |
| Releases | `node tools/release-plan.mjs`: web when `releaseCi` is `success`, then landing, then the Android and iOS pair. |
| api#1120, landing#137, `#2135` baseline, `#2146` item 5, `#2125` Parts 3 to 5, ui#2453, `#2160` | As their spec bullets say. |
| Intake | One cycle ran: one new CodeQL alert (fixed), no mail. Resume the store review cycle (`node tools/orbit-play-reviews.mjs --cycle`); recheck `npm view picomatch version`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then reviews and relaunches, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; ui#2478, ui#2487, api#1122 and api#1123 merged; the `#2150` API release with its manual steps; the staging ceiling apply; `#2159` and `#2160` filed and both gate rules posted; twelve heads pushed; one intake cycle.
- Superseded: "merge ui#2480 first, then ui#2478" (ui#2478 merged at its bar); the delta reviews of the earlier relay rounds (each ran, and each head got a new Pullfrog review).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
