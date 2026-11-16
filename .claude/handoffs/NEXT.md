/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 42 GiB: no new worktree until the owner approves the stale-file cleanup; reuse an existing worktree for a new branch).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D384 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI --null` for its first 8 characters into a list file, then `xargs -0 perl -pi` in `bash -c`, full id first, then the 8-character form, with literal paths in every redirect; macOS `grep -Z` is not NUL output); then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Worker model: every `claude` tier in `.claude/orchestrator.json` runs `claude-opus-5-5` (the Fable 5.2 limit resets 18 November 07:00 BRT; follow the spec model rotation).

GO FASTER (owner order): start every independent item in the first turn, in parallel. Code fixes, review fix rounds and conflicted merges go to workers: S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (the ticket number, never the PR number; `#2074` composes as `ui`, including for the landing worktree: launch from the UI worktree and name both in the note). Write notes with the Write tool (the guard refuses a variable redirect target). A note that chases another spelling of a guard hole asks for the class fix (default-deny, or the real parser). In-session subagents only read and review (final message at most 12 lines plus a result file; briefs point at S `agent-rules.md`). Read every worker diff before it counts. Before each push one review agent reads the new commits, bounded to concrete defects; a pass with only text fixes needs no new agent (fix the text by hand). Run React Doctor (`npx -y react-doctor@0.7.6 . --blocking error --scope changed --base origin/main --no-dead-code --no-supply-chain --no-score --yes` in the worktree) before a UI push that changes React. Merge each worker report into the body with `node tools/merge-review-batch-body.mjs`, resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each open branch before its review; a clean UI merge then runs S `comment-fix.mjs`. Every turn ends with a registered wake source (`tools/wait-auto-work.mjs` when nothing else is live).

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class (`#2135` first), the owner's report shipped (`#2131`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority. Offer the stale-file cleanup in one line when the prompt hook asks; delete only after his yes.

## In flight

UI `main` `0ed7244d3`; API `main` `38513551a`; landing `main` `7e6d150e0`. Production web `0ed7244d3` with desktop 0.1.34; production API `38513551a`. Owner question queue: empty. No stash. No worker or agent runs; the ui#2471 wait-ci waiter may still run. Each row's detail is its `## The order` bullet. Every local branch below already merged `main` `0ed7244d3`.

| Item | Disposition |
| --- | --- |
| ui#2471 (`#2131`) | Pushed `be524996d`, threads resolved, Pullfrog requested: read the verdict, merge at approval, device proof, release pair. |
| ui#2459 (`#2135`) | Local `e382038bd`, review CLEAN: body, resolve `PRRT_kwDOR5Siws635Nim`, push, request; then the baseline run. |
| ui#2470 (`#2140`) | Local `adeb3cf5f`, review CLEAN: body, resolve `PRRT_kwDOR5Siws6323V1`, push, request. |
| ui#2464 (`#2137`) | Local `79fb860f9` (round 15): read the diff, review, body, resolve 4 FY threads, push. |
| ui#2469 (`#2074`) | Local `28ecd33fe`: round 15 worker (2 defects in S `review-2469-r14-local.md`), review, body, resolve 2 threads, push. |
| landing#136 + UI `fix/ticket-2074-jsdoc-type-tags` (`#2074`) | Local `84f5ad9` and `97dc771e0` (round 13, TypeScript parser): read both diffs, review, resolve `PRRT_kwDORqm3lM633iTX`, push landing, open the UI pull request. |
| ui#2451 (`#2121`) | Local `a8bb97059`: round 15 worker (2 defects in S `review-2451-r14-local.md`), review, body, resolve 5 threads, React Doctor, push. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request at the bar.
3. `#2135` baseline run with a written cost estimate, then step 2 of `orbit-ai-build-steps.md`; the rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: API `38513551a` and web `0ed7244d3` released to production with desktop 0.1.34; `#2132` closed; ui#2471 rounds 6 and 7 pushed (`be524996d`); intake at entry (Sentry 4 carried issues, 0 new; mail 0; reviews 0); seven branches merged `main`.
- Carried: every In flight row above; the `#2131` device proof and release pair; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
