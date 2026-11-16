/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; about 60 GiB after the cleanup).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D407 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI --null` for its first 8 characters into a list file, drop `./sleep-decisions.md` from it, then `xargs -0 perl -pi` in `bash -c`, full id first, then the 8-character form, with literal paths in every redirect); then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Worker model: every `claude` tier in `.claude/orchestrator.json` runs `claude-opus-5-5` (the Fable 5.2 limit resets 18 November 07:00 BRT; follow the spec model rotation).

Stale files (owner order): never offer the cleanup and never ask. When the prompt hook lists stale items, run `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once, except a worktree that a queued launch needs (`ticket-2143-stale-auto-delete` until `#2143` launches).

GO FASTER (owner order): start every independent item in the first turn, in parallel. Code fixes, review fix rounds and conflicted merges go to workers: S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (the ticket number, never the PR number; `#2074` composes as `ui`, including for the landing worktree). A first build of a new ticket uses S `launch-fresh.sh` (commit only, so the review runs before the first push). Write notes with the Write tool. A note that chases another spelling of a guard hole asks for the class fix (default-deny, or the real parser). In-session subagents only read and review (final message at most 12 lines plus a result file; briefs point at S `agent-rules.md`; a reader beside a running worker reads by commit through `git archive`). Read every worker diff before it counts. Before each push one review agent reads the new commits. Run React Doctor before a UI push that changes React. Merge each worker report into the body with `node tools/merge-review-batch-body.mjs`, resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin, literal paths), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each idle open branch; a clean UI merge then runs S `comment-fix.mjs`; a conflict goes to a worker. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class (`#2135` first), the owner's report shipped (`#2131`), the icon with eyes (`#2144`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 22 open, 22 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority.

## In flight

UI `main` `f58a889af`; API `main` `38513551a`; landing `main` `7e6d150e0`. Production web `0ed7244d3` with desktop 0.1.34. Owner question queue: empty. No stash. No worker, agent or waiter runs. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `#2131` | Staging web release at `f58a889af`, proof agent (S `proof-note-2131-main-f58a889af.md`), then production web and the mobile pair. |
| `#2143` | Launch: worktree and S `order-2143-r1.md` ready (refused by the drain). |
| `#2144` | Local `c448facd4`: review, push, open the pull request. |
| ui#2464 (`#2137`) | Local `035c4e5c5` (round 16, diff read): review, body, resolve 4 FY threads, push. |
| ui#2459 (`#2135`) | Local `118abea84` (round 27, diff read): review, body, resolve 2 threads, push. |
| ui#2470 (`#2140`) | Pushed `859e06382`: round 10 worker for 2 threads (safe-area inset). |
| ui#2469 (`#2074`) | Local `f01177b84`: round 16 worker (2 defects in S `review-2469-r15-local.md`). |
| landing#136 + UI JSDoc branch (`#2074`) | Local `e0cb23a` and `bf0131224` (round 14, diff read): review, push, open the UI pull request. |
| ui#2451 (`#2121`) | Local `97b9e7724`: round 16 worker (2 defects in S `review-2451-r15-local.md`). |
| ui#2453 (`#2122`) | Stacked; after `#2121`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request at the bar.
3. `#2135` baseline run with a written cost estimate after ui#2459 merges; the rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2471 merged (`f58a889af`); ui#2459 and ui#2470 pushed, merged `main`, reviewed by Pullfrog (new threads above); stale files deleted (148.8 GB); `#2143` and `#2144` filed for owner orders; intake at entry (Sentry 4 carried, 0 new; mail 0; reviews 0).
- Carried: every In flight row above; the stale-file offer is superseded by the owner's order to delete without asking.

Every identifier here came from a previous session; treat each as a lead to verify.
