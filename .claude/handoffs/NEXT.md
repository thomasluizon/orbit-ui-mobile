/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D508 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'` copies it from the full backup (`'^b2135-'`).

Account (owner orders): the session and the workers run on the worker account until the owner switches back. FULL crank until that account's weekly reset (10:00 UTC; `seven_day.resets_at` in `$HOME/.claude/usage-snapshot.json`). Workers run `claude-opus-5-5` until the reset. At the reset, set every `claude` tier in `.claude/orchestrator.json` to `claude-fable-5-2` and return to the normal pace. Set a one-shot `CronCreate` reminder for 07:03 local now. Sentry is connected; Gmail, Orbit and Chrome are not.

Pullfrog token: when the owner pastes a code and `pgrep -fl token-swap.py` shows the process, write the code to `token-swap-code.txt` in its scratchpad. When the process is gone, run `python3 -I` S `token-swap.py` in the background and give him the link from S `token-swap-url.txt`.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE (write orders with S `make-review-orders.mjs <key>`; add a row first). Push on CLEAN or NOTES; file each note once on its ticket. One fix round only for a BLOCKING finding, then push with no third review. Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters: GitHub refuses 65,536. S `split-body.mjs` moves older evidence into a comment.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused, so use the Write and Edit tools or a helper script. zsh does not split an unquoted variable: call a function with arguments, never `set -- $pair`. A thread id passes only after `node S/threads.mjs <key> <pr>` printed it; with a head and `20` it also asks for the review. `node S/resolve-threads.mjs <key> <pr> <thread> <reply file> ...` replies and resolves. `compose-prompt.mjs` refuses a ticket of another `repo:` label. Print short outputs: the relay arms at 350,000 tokens.

Standing: reviews and proofs run as workers (S `launch-review-worker.sh <ticket> <worktree> <order> <reason>`; a review counts with `commitsSinceLaunch` 0 and `treeClean` true). Fix rounds: S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>`, `CEILING` 75 to 120. New builds: S `gated-launch.sh` with `LOAD_MAX=60 SPACING=45`. Post each round note on its ticket with `tools/comment-ticket.mjs` before the launch. Read every worker diff (S `diff-scan.mjs`). Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, but never while the listing names a new ticket worktree. Resolve threads, push, ask for the review, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 30, placed 28, unplaced 2 (`#2157`, `#2158`), placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `b9c2fd519`; API `main` `944398f4f`; landing `main` `20c1b0a90`. Owner order: `/crank` and `/sleep` stay on; finish every ticket. Owner question queue: empty. S `task-map.md` names each worktree, note, review key and helper (`round-result.mjs`, `review-after-round.sh`, `review-verdict.mjs`, `push-round.mjs`). The spec bullets hold each next step.

| Item | Disposition |
| --- | --- |
| Pushed, Pullfrog asked, 0 threads: ui#2482, ui#2481, ui#2483, api#1116, api#1118 | `wait-ci.mjs` each, merge at the bar. File the notes of S `review-2483-r5-local.md` (`#2143`) and `review-1118-r1-local.md` (`#2153`). After api#1116: `test.yml` and `guards.yml` on API `main`, then the API release with the manual steps. |
| ui#2478 | Pushed; `Tool tests (1/4)` and `(2/4)` are red (job time limit): rerun the failed jobs. |
| ui#2475 | Pullfrog did not approve again: `threads.mjs ui 2475`, one review-batch round. |
| ui#2469 (review `2469-r21` CLEAN), ui#2480 (`2480-r2`), ui#2464 (`2464-r22`) | Round committed. Read S `review-<key>-local.md`; on CLEAN or NOTES run `push-round.mjs`. |
| ui#2484, ui#2476, ui#2451 | Fix rounds ran at the relay: read `git status`; a commit gets `review-after-round.sh`, else relaunch its note with a continuation. |
| landing#137 (`#2126`), ui#2485 (`#2156`) | New. landing#137: read the whole review `137-r1`. ui#2485: start its whole review. Then Pullfrog. |
| `#2074` speed, `#2154`, `#2155` | Builds ran at the relay: a pull request gets the whole review, else relaunch its order with a continuation (`--tier deep --hard-ceiling-minutes 150`). |
| `#2125` | Parts 1 and 2 by a background agent in the thomas-brain worktree: find its pull request, else continue. Parts 3 to 5 are not started. |
| Research record | A background agent wrote the brain note: read it, else write it. |
| `#2129`, `#2152`, `#2135` baseline, releases, ui#2453 | As their spec bullets say. |
| ui#2486 (`#2074` speed build) | New: whole review, Pullfrog, merge FIRST. |
| api#1118 | Merged by the bot: verify, then close `#2153`. |
| `#2157`, `#2158` | Worker-filed, unplaced: fold each into its area ticket and cancel it. |
| Intake | One full cycle ran; only `#2156` was new. Run the next cycle. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: waiters and merges first, then the relaunches, then the new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; the eight relaunches and five new fix rounds; `#2156` filed and built (ui#2485); the builds of `#2074` speed, `#2126` (landing#137), `#2154` and `#2155` launched; seven heads pushed again; one full intake cycle; 9.4 GB of stale session files deleted.
- Superseded: "merge at the bar" for ui#2481, ui#2469, ui#2464, ui#2451 and api#1116 (each got a new Pullfrog review and one fix round).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
