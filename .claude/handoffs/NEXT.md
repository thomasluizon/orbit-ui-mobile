/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; about 45 GiB now).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D432 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI --null` for its first 8 characters into a list file, drop `./sleep-decisions.md`, then `xargs -0 perl -pi` in `bash -c`, full id first, then the 8-character form, literal paths in every redirect); then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Worker model: every `claude` tier runs `claude-opus-5-5`. The worker account is at its weekly limit until 18 November 07:00 BRT; `launch-worker.mjs` falls back to the main account by itself. Do not ask for a weekly reset (under 3 days left). If the main account reaches its limit, stop launches and tell the owner.

Owner orders (this session): reviews and device proofs run as workers, never as in-session subagents (`#2145`). Until `#2145` merges, use S `launch-review-worker.sh <ticket> <worktree> <review order> <reason>` (an ordinary worker with a read-only contract, `--measurement`) and count it only with `commitsSinceLaunch` 0 and `treeClean` true (S `launch-result.mjs <task id>`). Delete only with Node, never `rm`; any search longer than one plain `grep` goes in a `.mjs` file run with `node` (S `agent-rules.md` rules 10 and 11). Stale files: never offer, never ask; `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Fix rounds go to workers with S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (ticket number, never PR number). Read every worker diff before it counts. Merge each worker report into the body with `node tools/merge-review-batch-body.mjs`, resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin, literal paths), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run (S `threads-snapshot.mjs <tag> ui:<n>`). After every `main` merge, merge `origin/main` into the relay checkout and each idle branch; a clean UI merge then runs S `comment-fix.mjs`; a conflict goes to a worker. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, the owner's report shipped (`#2131`), the icon with eyes (`#2144`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 23 open, 23 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority.

## In flight

UI `main` `e353daa9d`; API `main` `38513551a`; landing `main` `7e6d150e0`. Staging web `f58a889af`; production web `0ed7244d3`, desktop 0.1.34. Owner question queue: empty (`owner-questions.mjs --list` gave `[]`). No stash. No worker or agent runs; one waiter: `wait-ci` on ui#2473 (stopped by the relay; start it again). Each row's detail is its `## The order` bullet; S notes are written.

| Item | Disposition |
| --- | --- |
| ui#2473 (`#2144`) | Pushed `0d9baa6d6`, Pullfrog requested: wait-ci, merge at approval. |
| `#2131` | Proof FAIL (1): SE code step blank about 60 s once. Investigate Sentry ORBIT-MOBILE-V and -W (`intake.sentry`, new during the proof) and the blank; then the releases. |
| ui#2464 (`#2137`) | Local `11972b8a9` (round 17): read the diff, review worker, push. |
| ui#2469 (`#2074`) | Round 17 worker with S `note-2469-r17.md`. |
| landing#136 + UI JSDoc branch (`#2074`) | Round 15 worker with S `note-136-r15.md` (UI worktree `ticket-2074-legal-comments`). |
| ui#2470 (`#2140`) | Round 12 worker with S `note-2470-r12.md`. |
| ui#2451 (`#2121`) | Round 17 worker with S `note-2451-r17.md`. |
| `#2143` | Round 2 worker with S `note-2143-r2.md`, then open its pull request. |
| `#2135` | Merged; one live baseline run of `main` with a written cost estimate. |
| `#2142` | Confirm Dependabot alert 180 closed, then close. |
| `#2145` | Build when free disk allows a worktree (or a merge frees one). |
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

- Done: ui#2459 merged (`e353daa9d`); staging web released at `f58a889af` and the `#2131` proof run; `#2143` built (`60cbe0f36`); `#2144` opened as ui#2473; rounds committed on ui#2464, ui#2469, ui#2451, ui#2470; reviews done on each; stale files deleted twice; `#2145` filed for the owner order; intake at entry (Sentry 4 carried then V and W new; mail 0; reviews 0).
- Carried: every In flight row above; the GO FASTER, stale-file and worker-model orders.
- Superseded: "In-session subagents only read and review" by the owner order to run reviews and proofs as workers (`#2145`).

Every identifier here came from a previous session; treat each as a lead to verify.
