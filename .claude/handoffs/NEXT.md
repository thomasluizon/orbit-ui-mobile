/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; a new UI worktree costs about 2 GiB). No owner question is open.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D27 onward). Helpers: `main-into.sh` (read its JSON before any push), `launch-ticket-gl2.sh <key> <n> <worktree> main <tier> [note]`, `body-merge-report.sh <gh repo> <pr> <label>` (reads `report-<label>.md`; a worker report can sit in an earlier `result` line than the last), `record-merge.mjs <key> <pr> <sha> [issue]` (with `CLAUDE_CODE_SESSION_ID`), `landing-script-bytes.cjs <dist>`, `landing-sweep.cjs <dist> <label>`, `landing129-behaviour.cjs <dist>`, `landing-ios-scroll.cjs <dist>`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`. `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 24 open, 24 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `091ca49d7`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; web `691323673`; desktop 0.1.29; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1).

| Item | Disposition |
| --- | --- |
| `ui#2412` (`#2094`) | Local `919a5cce7` plus a `main` merge, gate exit 0, unpushed. Refresh the body, resolve its three threads, push, round 3. |
| `ui#2414` (`#1561`) | `63ab58fa1`, CI runs. Review on green; after merge, production iOS Release 1.3.152 (2), read `TestFlight access`. |
| `ui#2415` (`#2098`) | `cf5d7ce28`, CI runs. Round 2 on green, merge first, then `main-into.sh` every open UI branch. |
| `ui#2418`, `#2419`, `#2420`, `#2421`, `#2422`, `#2424` (`#2103`, `#2101`, `#2100`, `#2104`, `#2102`, `#2099`) | Worker PRs, CI runs (waiters hit their ceiling; re-arm). Read each diff (D95), merge `main` in if behind, then review. `ui#2418`'s diff is read. |
| `ui#2423` (`#2106`) | `parity:exempt`, CI runs. Read the diff, review. |
| `#2105` | Relaunch once, deep tier, with `note-2105-decision.md` (refused by the drain; still the second launch). |
| `landing#129` (`#2090`) | Round 2 COMMENTED, three P1 threads (spec). Coordinator writes the batch, sweep, merge. |
| `landing#130` (`#2091`) | Round 1, five P1 threads unanswered (spec). Coordinator writes the batch, sweep, merge. |
| `landing#131` (`#2107`) | Lighthouse red (24,573 B > 24,000). One commit-only CI-fix order; never raise the budget. |
| After both landing merges | Launch `#2095`, then landing staging and production. |
| `#2097` App Store review | The owner is signed in to App Store Connect in Chrome. Adapt the Play listing (both locales), `/second-opinion`, screenshots, subscriptions, App Privacy, submit with manual release. |
| `#2071`, `#2030`, `#2089` | `#2071`: close on the first natural API and landing Pullfrog runs after the secret update (landing#129 and landing#130 reviews count). `#2030`: close on the first `android_update_sheet_shown` from 1.3.150 or later. `#2089`: resolve `ORBIT-WEB-1E` at the first hourly listing after `resolveAfter` with no new event, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2415`, `#2414`, `#2412`, `#2388`; api none; landing `#131`, `#130`, `#129`. Unpushed commits: `ui#2412` branch (`919a5cce7` and its `main` merge). Stashes: 0. Running workers: none. Intake: the Sentry listing is due (hourly); mailbox and store reviews not collected this session.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs (`main-into.sh`). Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2413` merged (`091ca49d7`); `ui#2415` round 1 delivered; `landing#129` round 1 delivered; `#2099` to `#2104` and `#2106` delivered as PRs; `#2107` filed (live landing defect) and delivered as `landing#131`.
- Carried: every in-flight row above; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
