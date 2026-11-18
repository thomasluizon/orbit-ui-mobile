/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D519 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'` copies it from the full backup (`'^b2135-'`).

Account (owner orders): the session and the workers run on the worker account until the owner switches back. FULL crank until that account's weekly reset (10:00 UTC; `rateLimits.seven_day.resets_at` in `$HOME/.claude/usage-snapshot.json`). Workers run `claude-opus-5-5` until the reset. At the reset, set every `claude` tier in `.claude/orchestrator.json` to `claude-fable-5-2` and return to the normal pace. Set a one-shot `CronCreate` reminder for 07:03 local now. Sentry is connected; Gmail, Orbit and Chrome are not.

Pullfrog token: on an owner code, write it to `token-swap-code.txt` in the scratchpad of the live `token-swap.py` (`pgrep -fl token-swap.py`). With no process, run `python3 -I` S `token-swap.py` in the background and give him the link from S `token-swap-url.txt`.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE. Push on CLEAN or NOTES; file each note once on its ticket (`node S/ticket-ops.mjs <ticket> <key>`, then `tools/comment-ticket.mjs` with the file it prints). One fix round only for a BLOCKING finding, then push with no third review. Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters; S `split-body.mjs` moves older evidence into a comment.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused, so use the Write and Edit tools or a helper script. `ls` is an alias that prints nothing in a pipe: use `/bin/ls`. A script that calls `gh issue` is refused by a hook: use the ticket tools. A thread id passes only after `node S/threads.mjs <key> <pr>` printed it; with a head and `20` it also asks for the review. `compose-prompt.mjs` refuses a ticket of another `repo:` label. Never merge `main` into a worktree while a review worker reads it: the new commit voids the review. Print short outputs: the relay arms at 350,000 tokens.

Standing: reviews and proofs run as workers. The loop for one pull request, with the helpers of S `task-map.md`:

1. Pullfrog threads: `node S/auto-round-note.mjs <key> <pr> <round> <head> "<title>" [extra file]`, post the note on the ticket, then `S/launch-review-round.sh <key> <ticket> <worktree> main max <pr>-r<round> <note> <reason>` (`CEILING` 75 to 120).
2. Round result: `node S/round-result.mjs <task> <worktree> <head before the round>`; read the diff.
3. Delta review: `S/review-after-round.sh <key> "<repo>#<pr>" <ticket> <worktree> <head> <commits> <earlier review file | -> <note>`; a first pass uses `whole - -`. Read it with `node S/review-verdict.mjs <task> <key>`.
4. Push: `node S/merge-main.mjs <repo>/<worktree>` first, then `node S/push-round.mjs <key> <pr> <worktree> <body file | ->`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background.
5. Bar: `node S/pr-bar.mjs <key>:<pr> ...`. Merge at once at the bar.

New builds: S `gated-launch.sh` with `LOAD_MAX=60 SPACING=45`. Read every worker diff (S `diff-scan.mjs`). Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, but never while the listing names a new ticket worktree. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 27, placed 27, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `c3fad04a3`; API `main` `3930b6d5b`; landing `main` `20c1b0a90`. Owner order: `/crank` and `/sleep` stay on; finish every ticket. Owner question queue: empty. The spec bullets hold each next step; S `task-map.md` names each worktree.

| Item | Disposition |
| --- | --- |
| `#2150` | api#1116 merged; `test.yml` and `guards.yml` were dispatched on API `main`: when both pass, the API release with the manual steps. Merge `main` into api#1120, api#1121 and api#1122. |
| ui#2481 (`#2149`), ui#2469 (`#2074`) | ui#2481: Pullfrog approved, merge when the checks are green. ui#2469: round 22 pushed, Pullfrog asked. |
| ui#2486 (`#2074` speed build) | Pushed, Pullfrog asked: merge FIRST at the bar, then start `#2152`. |
| ui#2483, ui#2478, ui#2475, ui#2451, api#1120, api#1122 | Pushed, Pullfrog asked: `wait-ci.mjs` each, merge at the bar (api#1120 also needs its k=1 gate; ui#2478 after ui#2480 and after CodeQL alert 59 closes; ui#2451 needs a rerun of its cancelled tool shard). After api#1122: a targeted apply of `render_env_group.staging_api`. |
| ui#2485, ui#2484, ui#2480, ui#2476, ui#2464, api#1121 | A fix round ran at the relay: read `git status` and S `task-map.md`; a commit gets the delta review, else relaunch its note with a continuation. |
| landing#137 | Round 2 committed (`3a6e2a1`): delta review, push. Its `Build` is red on `npm audit` until a patched `picomatch` exists. |
| `#2135` k=1 gate | Build ran at the relay (worktree `ticket-2121-part6-critic`): a pull request gets the whole review, else relaunch its order with a continuation. |
| `#2129` | A background agent wrote the 5-api and 6-api drafts and the gate rule options at the relay (spec bullet): file the two tickets and post the two gate rules. |
| `#2152`, `#2135` baseline, `#2146` item 5, `#2125` Parts 3 to 5, releases, ui#2453 | As their spec bullets say. |
| Intake | One cycle ran with nothing new. Run the next; recheck `npm view picomatch version`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: merges first, then reviews and relaunches, then new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption, 2 merges, 3 tickets closed or folded, fourteen heads pushed, api#1121 and api#1122 opened, one intake cycle (spec `## Current state`).
- Superseded: "merge at the bar" for six UI heads (each got a new Pullfrog review and one fix round).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
