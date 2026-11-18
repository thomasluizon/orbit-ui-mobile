/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`) and run `node tools/relay-checkout.mjs --check`.

Scratchpad (S): run `node $HOME/.orbit-run-carry/carry-lean.mjs <new full id> <predecessor full id>` (the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D487 with the Write tool. A missing file: `node S/restore-missing.mjs '<name pattern>'` copies it from the full backup (`'^b2135-'`).

Account (owner orders): the session and the workers run on the worker account until the owner switches back. FULL crank until that account's weekly reset (10:00 UTC; `seven_day.resets_at` in `$HOME/.claude/usage-snapshot.json`). Workers run `claude-opus-5-5` until the reset. At the reset, set every `claude` tier in `.claude/orchestrator.json` to `claude-fable-5-2` and return to the normal pace. Set a one-shot `CronCreate` reminder for 07:03 local now. Sentry is connected; Gmail, Orbit and Chrome are not.

Pullfrog token: `token-swap.py` runs from the predecessor's scratchpad until about 23:15 local, and the owner has its link. When he pastes a code and `pgrep -f token-swap.py` shows the process, write the code to `token-swap-code.txt` in the predecessor's scratchpad. When the process is gone, run `python3 -I` S `token-swap.py` as a background task and give him the link from S `token-swap-url.txt`.

Speed rules (in force): a review order names the new commits only, asks for no open search, and labels each finding BLOCKING or NOTE (write orders with S `make-review-orders.mjs <key>`; add a row first). Push on CLEAN or NOTES; file each note once on its ticket. One fix round only for a BLOCKING finding, then push with no third review. Workers run focused tests only (S `note-verify-cap.md`).

Tool facts: a Bash command with `<` or `>` and a variable in its target is refused, so use the Write and Edit tools. A thread id passes only after `node S/threads.mjs <key> <pr>` printed it; with a head and `20` it also asks for the review.

Standing: reviews and proofs run as workers (S `launch-review-worker.sh <ticket> <worktree> <order> <reason>`; a review counts with `commitsSinceLaunch` 0 and `treeClean` true). Fix rounds: S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>`, `CEILING` 75 to 120. New builds: S `gated-launch.sh` with `LOAD_MAX=60 SPACING=45`. Post each round note on its ticket with `tools/comment-ticket.mjs` before the launch. Read every worker diff (S `diff-scan.mjs`). Act only on pull requests of the owner account and the configured bots. Delete only with Node; stale files: `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once. Resolve threads with `node tools/resolve-bot-thread.mjs`, push, ask for the review, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 24, placed 24, unplaced 0, placed twice 0.

Answer the owner first, in English. `#2074` is MAX priority, then `#2152`.

## In flight

UI `main` `b9c2fd519`; API `main` `38513551a`; landing `main` `20c1b0a90`. Owner question queue: empty. The spec bullets hold each file name.

| Item | Disposition |
| --- | --- |
| `#2074` speed build, `#2126` build | Both stopped for the relay, with uncommitted edits. Relaunch each order (S `ticket-2074-speed-prompt.md`, `ticket-2126-prompt.md`; `--tier deep --hard-ceiling-minutes 150 --relaunch-reason`) with a `## Continuation` paragraph (model: the end of S `note-2469-r20.md`). |
| ui#2469 (`#2074`), ui#2464 (`#2137`) | Committed and ready: do the spec bullet steps (notes, thread replies, body, push, Pullfrog). |
| ui#2451 (`#2121`) | Round 23 ran at the relay. No round commit above `fc7c0f0a9` and a dirty tree means it stopped: relaunch S `note-2451-r23.md` with a continuation paragraph. A commit: read the diff, body, push. |
| ui#2480, ui#2478 (`#2135`) | ui#2480: start its CI waiter and merge it first. ui#2478: one review-batch fix round for thread `PRRT_kwDOR5Siws64ve_B`. |
| ui#2475, ui#2476, ui#2483, ui#2484 | Pushed. ui#2475 has 3 Pullfrog threads; the CI waiters of ui#2476 and ui#2483 ended with failing checks (ui#2483: only `pullfrog-approval`): read each verdict with S `threads.mjs`, one review-batch round each. Start a waiter for ui#2484. |
| api#1116 (`#2150`) | Read S `review-1116-r2-local.md`, then push, Pullfrog, merge, and the API release with the manual steps (the production webhook is broken until then). |
| Bot pull requests | ui#2481, api#1117, api#1118: start CI waiters, merge at the bar. ui#2482: a worker updates the `sonarqube-scan-action` pin. |
| `#2129` | Create the 2-api and 3a tickets from S `ticket-2129-2api.md` and `ticket-2129-3a.md`, then launch both. First build the two gaps in the spec bullet. |
| `#2125` | Start now (`#2144` merged). |
| Sentry ORBIT-WEB-1H | New, production web `0ed7244d3`, 2 events, no user. Verified: a POST to `/login` with a multipart body that is not form data makes Next throw `Failed to parse body as FormData.` (staging: `curl -X POST 'https://app-staging.useorbit.org/login?returnUrl=%2F' -H 'Content-Type: multipart/form-data; boundary=----probe' --data-binary 'not a form body'` gives 500). Create its ticket (`repo:ui`), record `intake.sentry`, admit it. |
| `#2135` baseline | PARTIAL, 17 cases left: one more window after ui#2480 merges. |
| `#2152` | Not started and not in `remaining`: admit it; build after the `#2074` speed changes. |
| Intake not run | `node tools/orbit-mail.mjs --collect`, `node tools/orbit-play-reviews.mjs --cycle`, board admission. Sentry is listed: 11 unresolved, 10 with tickets. |
| Releases | After api#1116: API release; then web and one Android Open plus iOS TestFlight pair carrying `#2148`, `#2131`, `#2144` and `#2146`. |
| ui#2453 (`#2122`) | Stacked; after `#2121`, in seven parts. |
| Research record | Save the S `speed-research/` verdict to the brain. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once: pushes and merges first, then the relaunches.
3. Intake each cycle: Sentry, mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay adoption; the speed orders applied; ui#2473 merged and `#2144` closed; ui#2483 and ui#2484 opened; four fix rounds pushed; the baseline window.
- Superseded: the carried review orders.
- Carried: every In flight row and every standing order above.

Treat every identifier here as a lead to verify.
