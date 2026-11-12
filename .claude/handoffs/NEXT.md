/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that holds the predecessor's first 8 characters with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs`), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its last entries (D20 to D28). Write scratchpad files with the Write tool; the guardrail refuses a redirect to a path that holds a shell variable. A thread id passed to `answer-push.sh` must come from `node tools/list-bot-threads.mjs --repo ui --pr <n> --no-request` in the same session. Print at most 40 lines from any tool call, and send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md`, a note that names only the open threads, a report file path, and one sweep of the finding's class. The coordinator runs the Chromium unit files a report lists before a push.

Workers run on the worker account (contact@useorbit.org): `tools/launch-worker.mjs` reads `ORBIT_WORKER_CLAUDE_CONFIG_DIR`, and its log name ends in `-worker-account.log`. Launch through scratchpad `gl.sh <launch-worker arguments>` (`prep-launch.sh` no longer passes `--allow-subagents`). A worker order says: no background task, every command in the foreground.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 18 open, 18 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `b4c02ba2a`; API `main` `1a70835b4`; landing `main` `381b253fa`. Staging and production web `46af750f6`; API `1a70835b4`; landing `381b253fa`; Android Open 1.3.153 (214); TestFlight 1.3.153 (3). Merged in the previous session: `ui#2419` (`#2101`), `ui#2426` (`#2108`), `ui#2438` (`#2074` code), `ui#2421` (`#2104`). Created: `#2116`.

| Item | Disposition |
| --- | --- |
| `ui#2430` (`#2110`) at `9d184a0e3` | Round 2 pushed, thread answered. Read `chain-read.sh ui 2430`; with no review at the head, arm `chain-review.sh ui 2430`. Merge at the bar with `merge-gate.sh ui 2430` (`MSUBJ` with `fix:`, `MBODY` `Tracks thomasluizon/orbit-tickets#2110`), then `record-merge.mjs`. A red `macos-signing-workflow` 5 s timeout is the known desktop flake: rerun the failed jobs. |
| `ui#2420` (`#2100`) at `f46226196` | Body rewritten to match the code (last review: no code issue). Same chain and merge steps. |
| `ui#2418` (`#2103`) at `fce6893b8` | Round 2 pushed, thread answered. Same chain and merge steps; landing it ends the desktop flake. |
| `ui#2439` (`#2116`) at `6a48f564a` | Worker delivery (2 of 2 launches spent). Chain, review, merge, web release, then the two live checks in its order bullet. |
| `ui#2424` (`#2099`) at `9aa5694c1` | Approved earlier, behind `main`. After `ui#2420` merges: `main` merge (add/add conflict in `press-scale.tsx`: a subagent, `mm-2421-note.md` is the pattern), CI, review, merge. |
| `ui#2434` (contract snapshot) | Behind `main`: `main` merge, CI, review, merge in its turn. |
| Shared mobile release 1.3.154 | After the motion merges: Android Open first (`android-run.sh`), then `ios-release.yml` with the same version from the same commit, no UI merge between the two dispatches. Then close each ticket its order bullet names. |
| Web releases | After each group of merges: `web-staging-after-main.sh <full sha>`, then `release-run.sh ui production <sha> https://orbit-web-3qmv.onrender.com`. |
| `#2096` | One pull request for the press gap list in its comments, after the area tickets merge. |
| App Review (`#2097`) | `WAITING_FOR_REVIEW` at 13:10Z on 12 November 2026: read it again (the command is in the `#2097` bullet). |
| Intake | Mailbox and store reviews empty; Sentry listed (Q and R, both on `#1561`); board all placed. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2439`, `#2434`, `#2430`, `#2424`, `#2420`, `#2418`, `#2388`; api none; landing none. Unpushed commits, dirty worktrees, stashes, detached checks and running workers: none. Waiters to arm: one `chain-review.sh` per pull request in CI or review, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. The merges at the bar in this order: `ui#2430`, `ui#2420`, `ui#2418`, `ui#2439`; then `ui#2424` and `ui#2434`, at most three in CI.
3. The web releases, the shared mobile release 1.3.154 and its ticket closes.
4. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; the `ui#2419` merge; the `ui#2420` round 12 push; web releases of `4785fddf8` and `46af750f6`; the `#2074` `wait-ci.mjs` fix (`ui#2438`); one intake cycle with Sentry.
- Changed: the merge order (above); the staging smoke rerun rule is superseded by `#2116`.
- Carried: the 1.3.154 release; `#2096`; App Review; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
