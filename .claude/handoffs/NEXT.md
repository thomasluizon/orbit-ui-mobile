/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff; read a `design/canvas/README.md` section only for the surface a diff touches.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths; about 2 minutes) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that still holds the predecessor's first 8 characters with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs`), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its last entries (D28 to D33 are lines that start with "Then"). Write scratchpad files with the Write tool; the guardrail refuses a redirect to a path that holds a shell variable or a command substitution, so answer threads with `answer-push.sh <key> <pr> <worktree> <thread id>...` and a `reply-<thread id>.md` file each. After a chain exit, read `chain-read.sh <key> <pr>`; a thread id must come from such a read in the same session. Context is the limit: the previous session reached the relay threshold in about 5 hours. Print at most 40 lines from any tool call, never print a whole report, skill or log (grep it), and send every review fix and diagnosis to a background subagent (`opus`) with `review-fix-brief.md`, a note that names the open threads, a report file path, and one sweep of the finding's class. Start a fresh subagent for each round. The coordinator runs the Chromium unit files and the layout specs itself before a push (`proof-2437-r2.sh`, `proof-2420-r11.sh`).

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 17 open, 17 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `fb715c807`; API `main` `1a70835b4`; landing `main` `381b253fa`. Production and staging API `1a70835b4`; staging and production web `fb715c807`; staging and production landing `381b253fa`; Android Open 1.3.153 (214); TestFlight production 1.3.153 (3). Merged in the previous session: `ui#2425` (`#2105`), `ui#2422` (`#2102`), `ui#2431` (`#2097`), `ui#2437` (`#2115`). Closed: `#2114`, `#2109`, `#2106`. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `ui#2419` (`#2101`), next to merge | At `f4bd90b28`, holds `main` `fb715c807`. Run `43205246536` attempt 2 reran its one red Chromium job. Read `chain-read.sh ui 2419`; with no review yet, arm `chain-review.sh ui 2419`. Merge with `merge-gate.sh ui 2419` (`MSUBJ` with a `feat:` or `fix:` prefix, `MBODY` `Tracks thomasluizon/orbit-tickets#2101`), then `record-merge.mjs`. |
| `ui#2420` (`#2100`), round 12 | Head `afb3d1292` on the remote. The round 12 subagent wrote `rb-2420-r12-report.md`; its commit, when it made one, is local in `ticket-2100-habit-form-motion` (`git log -1`). Read the diff, run the Chromium files the report lists, write `reply-<id>.md` from its `## Thread replies` for `PRRT_kwDOR5Siws62ntXP` and `PRRT_kwDOR5Siws62ntXu`, then `main-merge-push.sh`, `answer-push.sh`, `chain-review.sh ui 2420`. It conflicts with `ui#2419` in `motion-pressable.tsx`: it takes `main` after `ui#2419` merges. |
| Approved, behind `main` | `ui#2421`, `ui#2418`, `ui#2426`, `ui#2424`, `ui#2434`; `ui#2430` (no approval yet). Each takes `main-merge-push.sh`, a chain and the merge in its turn, one at a time. A `main` conflict goes to a subagent (`mm-2422-note.md` is the pattern). At most three pull requests in CI at once. |
| Shared mobile release 1.3.154 | After the motion merges (or at a quiet point when the train stalls): Android Open first (`android-run.sh`), then `ios-release.yml` with the same version from the same commit, no UI merge between the two dispatches. Then close `#2115`, `#2105`, `#2102` and each motion ticket whose pull request is in that commit and on production web. |
| Web releases | After each group of merges: `web-staging-after-main.sh <full sha>` (waits for the `main` push runs), then `release-run.sh ui production <sha> https://orbit-web-3qmv.onrender.com`. |
| `tools/wait-ci.mjs` fix (`#2074`) | Cause, fix and test are in the `#2074` comment of 12 November 2026. Launch a worker for it when two or fewer pull requests are in CI. |
| `#2096` | The press gap list is a ticket comment: one pull request after the area merges. Add `apps/mobile/components/referral/referral-drawer.tsx:275` (no reduced motion guard; not verified). |
| App Review (`#2097`) | `WAITING_FOR_REVIEW` at 07:34Z on 12 November 2026: read it again (the command is in the `#2097` bullet). |
| Intake | One cycle done: mailbox and store reviews empty, board all placed. Sentry is unreadable (no connector, no `sentry-cli` token, `claude-in-chrome` not connected); last checked 7 November 2026. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2434`, `#2430`, `#2426`, `#2424`, `#2421`, `#2420`, `#2419`, `#2418`, `#2388`; landing none; api none. Unpushed commits: the `ui#2420` round 12 commit, when it exists. Dirty worktrees, stashes, workers and detached checks: none. Waiters to arm: one `chain-review.sh` per pull request in CI or review, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. The `ui#2419` merge, the `ui#2420` round 12 push, then the merge order, within the load gate.
3. The web releases, the shared mobile release 1.3.154 and its ticket closes.
4. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (scratchpad `merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY` set) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; iOS 1.3.153 (3); four merges; the `#2114`, `#2109` and `#2106` closes with the owner told; two web production releases; `staging-day-focus.cjs` 4 of 4; one intake cycle; the App Review read.
- Changed: `#2115` stays open until 1.3.154 (it changes mobile).
- Carried: the merge order; `ui#2420` and `ui#2419`; `#2096`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
