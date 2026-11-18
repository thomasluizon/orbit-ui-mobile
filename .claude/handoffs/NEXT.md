/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D494 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'` copies it from the full backup (`'^b2135-'`).

Account (owner orders): the session and the workers run on the worker account until the owner switches back. FULL crank until that account's weekly reset (10:00 UTC; `seven_day.resets_at` in `$HOME/.claude/usage-snapshot.json`). Workers run `claude-opus-5-5` until the reset. At the reset, set every `claude` tier in `.claude/orchestrator.json` to `claude-fable-5-2` and return to the normal pace. Set a one-shot `CronCreate` reminder for 07:03 local now. Sentry is connected; Gmail, Orbit and Chrome are not.

Pullfrog token: when the owner pastes a code and `pgrep -fl token-swap.py` shows the process, write the code to `token-swap-code.txt` in its scratchpad. When the process is gone, run `python3 -I` S `token-swap.py` in the background and give him the link from S `token-swap-url.txt`.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE (write orders with S `make-review-orders.mjs <key>`; add a row first). Push on CLEAN or NOTES; file each note once on its ticket. One fix round only for a BLOCKING finding, then push with no third review. Workers run focused tests only (S `note-verify-cap.md`). A pull request body stays under 60,000 characters: GitHub refuses 65,536. S `split-body.mjs` moves older evidence into a comment.

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused, so use the Write and Edit tools or a helper script. zsh does not split an unquoted variable: call a function with arguments, never `set -- $pair`. A thread id passes only after `node S/threads.mjs <key> <pr>` printed it; with a head and `20` it also asks for the review. `node S/resolve-threads.mjs <key> <pr> <thread> <reply file> ...` replies and resolves. `compose-prompt.mjs` refuses a ticket of another `repo:` label. Print short outputs: the relay arms at 350,000 tokens.

Standing: reviews and proofs run as workers (S `launch-review-worker.sh <ticket> <worktree> <order> <reason>`; a review counts with `commitsSinceLaunch` 0 and `treeClean` true). Fix rounds: S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>`, `CEILING` 75 to 120. New builds: S `gated-launch.sh` with `LOAD_MAX=60 SPACING=45`. Post each round note on its ticket with `tools/comment-ticket.mjs` before the launch. Read every worker diff (S `diff-scan.mjs`). Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, but never while the listing names a new ticket worktree. Resolve threads, push, ask for the review, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 27, placed 27, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `b9c2fd519`; API `main` `944398f4f`; landing `main` `20c1b0a90`. Owner question queue: empty. The spec bullets hold each file name.

| Item | Disposition |
| --- | --- |
| ui#2481, ui#2469, ui#2464, ui#2451, api#1116 | Pushed, Pullfrog requested, 0 open threads. Start `wait-ci.mjs` for each again, then merge at the bar. After api#1116: dispatch `test.yml` and `guards.yml` on API `main`, then the API release with the manual steps (the production webhook is broken until then). |
| Eight stopped fix rounds | Each note is on its ticket; each worker stopped 3 to 9 minutes in. Read `git status`, add a `## Continuation` paragraph to the note (model: S `note-2469-r20.md`), relaunch. ui#2480: S `note-2480-r2.md`, ticket 2135, worktree `ticket-2122-part3`. ui#2478: `note-2478-r3.md`, 2135, `ticket-2121-part5-sign-in`. ui#2484: `note-2484-r4.md`, 2146, `ticket-2121-part7-critic2`. ui#2483: `note-2483-r5.md`, 2143, `ticket-2143-stale-auto-delete`. ui#2476: `note-2476-r3.md`, 2145, `ticket-2121-part4`. ui#2475: `note-2475-r5.md`, 2149, `ticket-2121-part2`. ui#2482: `note-2482-r1.md`, 2149, `ticket-2144-icon-eyes` (its worker never started). api#1118: `note-1118-r1.md`, 2153, API worktree `scratch-1090-merge`. |
| `#2074` speed build, `#2126` build | Relaunch each order as written; each holds its continuation section (S `ticket-2074-speed-prompt.md`, `ticket-2126-prompt.md`; `--tier deep --hard-ceiling-minutes 150 --relaunch-reason`). |
| `#2129` | `#2154` (2-api): rename the branch of API worktree `ticket-2154-short-references`, compose, launch. `#2155` (3a): create an API worktree, compose, launch. Then the three open items of the `#2129` bullet. |
| `#2125` | Start now (`#2144` merged). |
| Sentry ORBIT-WEB-1H | New, production web, 2 events. Verified: a POST to `/login` with `Content-Type: multipart/form-data` and a body that is not form data makes Next throw `Failed to parse body as FormData.` (500 on staging with curl). Create its ticket (`repo:ui`), record `intake.sentry`, admit it. |
| `#2135` baseline | PARTIAL, 17 cases left: one more window after ui#2480 and ui#2478 merge. |
| `#2152` | Admitted, not started: build after the `#2074` speed changes. |
| Intake not run | Every source of step 3 below. |
| Releases | After api#1116: API release; then web and one Android Open plus iOS TestFlight pair carrying `#2148`, `#2131`, `#2144` and `#2146`. |
| ui#2453 (`#2122`) | Stacked; after `#2121`, in seven parts. |
| Research record | Save the S `speed-research/` verdict to the brain. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: waiters and merges first, then the relaunches, then the new launches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the adoption; ui#2469, ui#2464, ui#2451 and api#1116 pushed; ui#2481 updated; eight notes posted; `#2153` to `#2155` filed.
- Superseded: "merge ui#2480 first" (it has two threads; its round comes first).
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
