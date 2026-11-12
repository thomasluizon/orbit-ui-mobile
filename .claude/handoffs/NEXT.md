/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff; read a `design/canvas/README.md` section only for the surface a diff touches.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths; about 2 minutes) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that still holds the predecessor's first 8 characters with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs`), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read the `## D` headings of its last ten entries. Write scratchpad files with the Write tool; the guardrail refuses a redirect to a path that holds a shell variable or a command substitution. After a chain exit, read `chain-read.sh <key> <pr>`; a `resolve-bot-thread.mjs` id must come from such a read in the same session. Context is the limit: the previous session reached the relay threshold in about 80 minutes. Print at most 40 lines from any tool call, never print a whole report, skill or log (grep it), read only the skill sections a step needs, and send every review fix and diagnosis to a background subagent (`opus`) with `review-fix-brief.md`, a note that names the one open thread, a report file path, and one sweep of the finding's class.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 20 open, 20 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `7ee7bae21`; API `main` `1a70835b4`; landing `main` `381b253fa`. Production and staging API `1a70835b4`; staging and production web `2a017455d`; staging and production landing `381b253fa`; Android Open 1.3.153 (214); TestFlight production 1.3.152 (2). Merged in the previous session: `ui#2436` (`#2114`), `ui#2435` (`#1561`), `landing#133` (`#2095`). Closed: `#2090`, `#2095`. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| iOS 1.3.153 (first, before any UI merge) | Check that UI `main` is still `7ee7bae21` and that `Mobile iOS Build` passed on it. Read the newest build of app `6831372835` with `asc-api.mjs` (builds 1 and 2 exist). Dispatch `ios-release.yml` on `main` with `variant=production`, `app_version=1.3.153`, `build_number=3`, an empty `platform_only_reason`, and wait on the run (`release`, `record-upload` and `testflight-access` must pass). |
| `ui#2425` (`#2105`) | Approved at `e5ab20d1b`, 57 checks green, zero threads, `behind_by=0`. Right after the iOS dispatch: `merge-gate.sh ui 2425` with `MSUBJ` and `MBODY`, `record-merge.mjs`. |
| `#2114`, `#2109`, `#2106` | The fix is live on production web and in Android 1.3.153. After the iOS upload: tell the owner in his language that `#2114` is fixed (web now, Android Open 1.3.153, TestFlight 1.3.153), post the evidence and close the three tickets. |
| Approved, behind `main` | `ui#2422`, `ui#2431`, `ui#2421`, `ui#2418`, `ui#2426`, `ui#2424`, `ui#2434`; `ui#2430` (no approval yet). Each takes `main-merge-push.sh`, a chain and the merge in its turn, one at a time, only the next one. |
| `ui#2437` (`#2115`, the day focus ring) | At `83cce7d32`, delivered by the worker, diff read, Chromium proven. Its chain was armed: read `chain-read.sh ui 2437`, then its turn in the merge order, a web release, `staging-day-focus.cjs` 4 of 4, close. |
| `ui#2420` (`#2100`) | At `9f3ff19d6`, round 7 delivered, zero open threads. Its chain was armed: read `chain-read.sh ui 2420`. |
| `ui#2419` (`#2101`) | At `25f27997b`, round 6 delivered, zero open threads, no chain armed: arm `chain-review.sh ui 2419`. |
| `#2096` | The press gap list is a ticket comment: one pull request after the seven area merges. |
| App Review (`#2097`) | `WAITING_FOR_REVIEW` at the last read: read it again (the command is in the `#2097` bullet). |
| Intake | One cycle done: one Render notice acknowledged as noise, store reviews empty, board all placed. Sentry is unreadable: this account has no Sentry connector and `sentry-cli` has no token. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2437`, `#2434`, `#2431`, `#2430`, `#2426`, `#2425`, `#2424`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2388`; landing none; api none. Unpushed commits, dirty worktrees, stashes, workers, subagents and detached checks: none. Worker launches: `#2115` 1 of 2. Waiters to arm: one `chain-review.sh` per pull request in CI or review, the iOS run waiter, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. The iOS dispatch, then the `ui#2425` merge, then the chains, the three ticket closes and the merge order, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (scratchpad `merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY` set) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; `ui#2436` merged and released to staging and production web with the signed-in check; `ui#2435` and `landing#133` merged; the landing releases and the `#2090` and `#2095` closes; the `ui#2420` and `ui#2419` deliveries; the day cell ticket (`#2115`) with its pull request; Android 1.3.153; one intake cycle; the App Review read.
- Superseded: "Do not rerun run `43111017034`" (the tool fix is merged; the iOS 1.3.153 release proves it).
- Carried: the iOS half of the shared release; the merge order; `#2096`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
