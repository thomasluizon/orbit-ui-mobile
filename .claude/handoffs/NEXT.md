/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 44 GiB: no new worktree until the owner approves the stale-file cleanup).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D328 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI` for its first 8 characters) with `perl -pi` in `bash -c`, full id first, then the 8-character form, with literal paths in every redirect; then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Worker model: the worker account hit its Fable 5.2 limit (resets 18 November 07:00 BRT). Before the first launch, move every `claude` tier in `.claude/orchestrator.json` to `claude-opus-5-5` (spec model rotation) and tell the owner in one line.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Code fixes, review fix rounds and conflicted merges go to workers: S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (the ticket number, never the PR number; `#2074` composes as `ui`), or `gated-launch.sh` with `--hard-ceiling-minutes 150` for a large batch. Write notes with the Write tool (the guard refuses a variable redirect target). In-session subagents only read and review (final message at most 12 lines plus a result file; briefs point at S `agent-rules.md`). Read every worker diff before it counts. Before each push one review agent reads the new commits, bounded to concrete defects; a pass with only text fixes needs no new agent (fix the text by hand). Run React Doctor before a UI push. Merge each worker report into the body with `node tools/merge-review-batch-body.mjs`, resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each open branch before its review; a clean UI merge then runs S `comment-fix.mjs`. Every turn ends with a registered wake source (`tools/wait-auto-work.mjs` when nothing else is live).

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority. Offer the stale-file cleanup in one line when the prompt hook asks; delete only after his yes.

## In flight

UI `main` `7f542e04c`; API `main` `38513551a`; landing `main` `7e6d150e0`. Owner question queue: empty. No stash. No worker or agent runs. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| ui#2451 (`#2121`) | Local `0e7e6cdcd` (round 11): diff read, review `1c66ae2dc..0e7e6cdcd`, merge `main`, body, resolve 5 threads, push. |
| ui#2459 (`#2135`) | Local `821979d03` (round 22 keeps `--rerun`): review `0b23d1b20..821979d03`, merge `main`, resolve, push; then the baseline run. |
| ui#2464 (`#2137`) | Local `b9c8f9c48` (round 13, allow list): diff read, review `f2c2c9b7f..b9c8f9c48`, merge `main`, resolve 4 FY threads, push. |
| ui#2470 (`#2140`) | Pushed `5bb1194bd`, CI green, P1 `PRRT_kwDOR5Siws6323V1` (radius constants): worker round. |
| ui#2471 (`#2131`) | Pushed `3ad0bef7b`, two P1 and Layout shard 7 red: worker round, then device proof and release pair. |
| ui#2448 (`#2132`) | Local `08715f04b`: round 8 for the one defect of S `review-2448-r7-local.md`, merge `main`, push. |
| ui#2469 (`#2074`) | Local `d306a85f6`: round 11 makes the cache guard an allow list (S `review-2469-r10-local.md`). |
| landing#136 + UI follow-up (`#2074`) | Pushed `5333127`, P1 `PRRT_kwDORqm3lM633iTX` (JSDoc type tags): one round in landing and a new UI branch from `main`. |
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

- Done: ui#2472 opened and merged (`7f542e04c`); landing#136 pushed `5333127`; ui#2451, ui#2470, ui#2471 (new, `#2131`) pushed and reviewed by Pullfrog; worker rounds for ui#2470, ui#2459 (r21, r22), `#2131`, landing#136 and the UI rule, ui#2448, ui#2464, ui#2469, ui#2451; intake ran (Sentry no new event, 4 bounce mails acked as noise, 0 reviews).
- Carried: every In flight row above; the `#2131` device proof and release pair; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
