/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; about 44 GiB now).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D446 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI --null` for its first 8 characters into a list file, drop `./sleep-decisions.md`, then `xargs -0 perl -pi` in `bash -c`, full id first, then the 8-character form, literal paths in every redirect); then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Worker model: every `claude` tier runs `claude-opus-5-5`. The worker account is at its weekly limit until 18 November 07:00 BRT; `launch-worker.mjs` falls back to the main account by itself. Do not ask for a weekly reset (under 3 days left). If the main account reaches its limit, stop launches and tell the owner.

Owner orders (this session): reviews and device proofs run as workers, never as in-session subagents (`#2145`). Until `#2145` merges, use S `launch-review-worker.sh <ticket> <worktree> <review order> <reason>` (an ordinary worker with a read-only contract, `--measurement`) and count it only with `commitsSinceLaunch` 0 and `treeClean` true (S `launch-result.mjs <task id>`). Delete only with Node, never `rm`; any search longer than one plain `grep` goes in a `.mjs` file run with `node` (S `agent-rules.md` rules 10 and 11). Stale files: never offer, never ask; `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Fix rounds go to workers with S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (ticket number, never PR number). Read every worker diff before it counts. Merge each worker report into the body with `node tools/merge-review-batch-body.mjs`, resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin, literal paths), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run (S `threads-snapshot.mjs <tag> ui:<n>`). After every `main` merge, merge `origin/main` into the relay checkout and each idle branch; a clean UI merge then runs S `comment-fix.mjs`; a conflict goes to a worker. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, the owner's report shipped (`#2131`), the icon with eyes (`#2144`), the entry background and the live summary Orbit (`#2146`), the mascot rebrand (`#2121` to `#2126`, the landing as a tone change with motion), every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 25 open, 25 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority.

## In flight

UI `main` `e353daa9d`; API `main` `38513551a`; landing `main` `7e6d150e0`. Staging web `f58a889af`; production web `0ed7244d3`, desktop 0.1.34. Owner question queue: empty. No stash. Ten launchers were live at the relay: S `inflight-tasks.md` lists each task id, its order and its result file; their outputs stay in the predecessor's `tasks/` directory named there. Read each result with S `launch-result.mjs` adapted to that directory, or read the result file the order names. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| ui#2473 (`#2144`) | Red at `0d9baa6d6` (2 P1 threads, a flaky turnstile test): round 3 result S `fix-2144-r3-result.md`, then review worker, push. |
| `#2146` (owner order) | Round 1 `6d35d0df2` (live loop done, diff not read yet); background: launch round 2 with S `note-2146-r2.md` (decision: `--bg-elev` circle with a 1px `--border-control` edge); then read both diffs, review worker, push, open the pull request. |
| `#2131` | Round 8 result S `fix-2131-r8-result.md`; the next round fixes `turnstile-widget.test.tsx:250`. |
| ui#2464 (`#2137`) | Review S `review-2464-r17-local.md`: clean, push; defects, round 18. |
| ui#2469 (`#2074`) | Round 17 result: read the diff, review worker. |
| landing#136 + UI JSDoc (`#2074`) | Review S `review-136-r15-local.md`: clean, push both. |
| ui#2470 (`#2140`) | Round 14 result S `fix-2470-r14-result.md`: read, review worker. |
| ui#2451 (`#2121`) | Round 18 result S `fix-2451-r18-result.md`: read, review worker. |
| `#2143` | Round 2 result: read, review worker, open the pull request. |
| `#2135` | Baseline BLOCKED (S `result-2135-baseline.md`): the staging Pro eval account lost Pro (its trial ended), so every fixture precondition fails before any paid call. Restore its Pro access on staging through the existing admin path (read the result for the account label and the precondition), then relaunch S `order-2135-baseline.md`. |
| `#2148` (owner order) | New: build it (S `ticket-create-loading.md` is its body); reuse an idle merged worktree. |
| `#2145` | Build when free disk allows, or in a reused merged worktree. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request at the bar.
3. The `#2135` baseline run, the rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `#2142` closed (alert 180 fixed); Sentry V and W investigated and folded into `#2131`; six idle branches merged `main`; ui#2451 r17 and landing#136 r15 committed and read; review workers on ui#2464, ui#2451; `#2131` investigation started; `#2135` baseline started; ui#2470 decisions D439 and D443; owner orders filed: `#2146` (started), `#2147`, the `#2126` tone-change work order; the Orbit Instagram and X accounts decision recorded; stale files deleted (27 GB); intake: Sentry 6, mail 0, reviews 0.
- Carried: every In flight row above; the GO FASTER, stale-file and worker-model orders.

Every identifier here came from a previous session; treat each as a lead to verify.
