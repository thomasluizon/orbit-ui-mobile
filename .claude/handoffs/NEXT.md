/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D304 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI` for its first 8 characters) with `perl -pi` in `bash -c`, full id first, then the 8-character form, with literal paths in every redirect; then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Code fixes, review fix rounds and conflicted merges go to workers on the worker account: `node tools/compose-prompt.mjs --review-batch` plus a `## This review batch` section naming the review file and `agent-rules.md`, then `node tools/launch-worker.mjs` (as a background task, never with `&`) with `--relaunch-reason` past the 2-launch branch cap. Relaunch an API 529 Overloaded exit after a short pause. In-session subagents only read and review (final message at most 12 lines plus a result file; briefs point at scratchpad `agent-rules.md`). Read every worker diff before it counts. Before each push one review agent reads the new commits, bounded to concrete defects in what they claim; a pass with only text fixes needs no new agent. Run React Doctor (`npx -y react-doctor@0.7.6 . --blocking error --scope changed --base origin/main --no-dead-code --no-supply-chain --no-score --yes`) before a UI push. Merge each worker report into the body with `node tools/merge-review-batch-body.mjs`, edit the body, resolve threads with `node tools/resolve-bot-thread.mjs --thread <id> --repo <key> --pr <n>` (reply on stdin), then push. Request the review with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20` (0 asks nothing), then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each open branch before its review; a clean UI merge then runs S `comment-fix.mjs`. Every turn ends with a registered wake source (`tools/wait-auto-work.mjs` when nothing else is live).

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once). Offer the stale-file cleanup in one line when the prompt hook asks; delete only after his yes.

## In flight

UI `main` `0f8cc1e33`; API `main` `38513551a`; landing `main` `7e6d150e0`. Owner question queue: empty. No stash. No worker or agent runs. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| ui#2470 (`#2140`) | Pushed `4f7918031`, threads resolved; the CI waiter stops at the relay: start `wait-ci.mjs --require-check pullfrog-approval`, merge at approval. |
| ui#2459 (`#2135`) | Pushed `0b23d1b20`, CI green, P1 `PRRT_kwDOR5Siws6316PG` (S `review-2459-pullfrog-r20.json`): worker round, review, resolve, push. |
| ui#2469 (`#2074`) | Local `ecd41eb58`: review `da20b00b2..ecd41eb58`, body, resolve 2 threads, push. |
| ui#2451 (`#2121`) | Local `1c66ae2dc`: review `2c23d26c0..1c66ae2dc`, body (r8 to r10 reports), resolve 4 `yK_` threads, push. |
| ui#2464 (`#2137`) | Local `f2c2c9b7f`: review the non-merge commits of `d11204007..f2c2c9b7f`, resolve 4 FY threads, body S `body-2464-r7.md`, push. |
| ui#2448 (`#2132`) | Local `603ddc511`: review `a65d57f7f..603ddc511`, merge `main`, resolve `PRRT_kwDOR5Siws63y_OY`, push, read the installed Windows run. |
| `#2131` | Branch `fix/ticket-2131-check-settle`, no PR: round 3 worker for the 2 defects of S `review-2131-r2-local.md`, review, push, open the PR, device proof. |
| landing#136 + UI rule (`#2074`) | Round 9 worker: fail-safe pragma check (spec bullet), bodies; review, push both, open the UI PR. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. Add `check-surface-scope` on `plan-block.tsx:20`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request at the bar.
3. `#2135` baseline run with a written cost estimate, then step 2 of `orbit-ai-build-steps.md`; the rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2465 merged (`0f8cc1e33`), `#2138` closed; ui#2459 and ui#2470 pushed; worker rounds for ui#2451, ui#2464, ui#2469, ui#2448, `#2131` and landing#136; `#2141` folded into `#2140`; intake ran (Sentry no new event, 3 automated mails acked, 0 reviews).
- Carried: every other In flight row above; the `#2131` follow-ups; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
