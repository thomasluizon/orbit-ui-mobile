/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 84 GiB at handoff). No owner question is open.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D15). Helpers: `main-into.sh` (read its JSON before any push), `launch-ticket-gl2.sh`, `launch-ui-ci.sh <n> <worktree> <tier> <note> <label>` and `launch-landing-ci.sh` (commit-only CI-fix orders), `body-merge-report.sh <gh repo> <pr> <label>` (reads `report-<label>.md`; one `## Test evidence` section only), `record-merge.mjs <key> <pr> <sha> [issue]` (with `CLAUDE_CODE_SESSION_ID`), `landing-script-bytes.cjs`, `landing-sweep.cjs`, `landing129-behaviour.cjs`, `landing129-a11y.cjs`, `landing-ios-scroll.cjs`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`. `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 24 open, 24 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `091ca49d7`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; web `691323673`; desktop 0.1.29; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). CI waiters stop at succession: re-arm one per open pull request first.

| Item | Disposition |
| --- | --- |
| `ui#2415` (`#2098`) | `cf5d7ce28`, CI runs. Round 2 on green, merge first, then `main-into.sh` every open UI branch. |
| `ui#2412` (`#2094`) | Round 2 pushed `f14c8c59e`, threads resolved. Round 3 on green. |
| `ui#2414` (`#1561`) | CI green at `63ab58fa1`. Merge `main` if behind, review. After merge: production iOS Release 1.3.152 (2), read `TestFlight access`. |
| `ui#2420` (`#2100`) | CI green at `903d74f01`. Read the diff (D95), merge `main` if behind, review. |
| `ui#2419` (`#2101`), `ui#2421` (`#2104`), `ui#2422` (`#2102`), `ui#2418` (`#2103`) | CI fixes or `main` merges pushed (`96fd8d495`, `ebb781f42`, `f930cd21d`, `5d19e85e0`); diffs read. Review on green. Both launches spent on 2419 and 2421. |
| `ui#2424` (`#2099`), `ui#2423` (`#2106`) | CI runs. Read each diff (D95), merge `main` if behind, review. |
| `ui#2425` (`#2105`) | New, `489caca57`. Read the diff and `## Assumptions`, merge `main` if behind, review on green. Both launches spent. |
| `ui#2417`, `ui#2416`, `api#1106` | Dependabot. 2417 review requested; 2416 and api#1106 get `list-bot-threads.mjs --re-review` on green; auto-merge lands them. |
| `landing#129` (`#2090`) | Round 2 `b999b25` plus Prettier fix `023b54c`, threads resolved, CI runs. Round 3 on green, merge, landing releases. |
| `landing#131` (`#2107`) | CI fix `d922609`, CI runs (Lighthouse margin may be thin). Review on green; a red gets a coordinator cut. |
| `landing#130` (`#2091`) | Round 1, five P1 threads unanswered (spec). Coordinator writes the batch (`npm run format:check` before push), sweep, merge. |
| After both landing merges | Launch `#2095`, then landing staging and production. |
| `#2097` App Store review | The owner is signed in to App Store Connect in Chrome. Adapt the Play listing (both locales), `/second-opinion`, screenshots, subscriptions, App Privacy, submit with manual release. |
| `#2071`, `#2030`, `#2089` | `#2071`: close on the first natural API and landing Pullfrog runs after the secret update. `#2030`: close on the first `android_update_sheet_shown` from 1.3.150 or later. `#2089`: resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| Review intake | `intake.play.workflowCycle` holds a cycle whose run passed 600 s; the next `orbit-play-reviews.mjs --cycle` resumes it. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2417`, `#2416`, `#2415`, `#2414`, `#2412`, `#2388`; api `#1106`; landing `#131`, `#130`, `#129`. Unpushed commits: none. Dirty worktrees: none. Stashes: 0. Running workers: none. Intake: the Sentry listing ran this session (two carried issues, no new event); mailbox empty.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs (`main-into.sh`). Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2412` round 2 pushed and threads resolved; `#2105` relaunched and delivered `ui#2425`; `landing#131` CI-fix order delivered and pushed; `landing#129` round 2 written and pushed; `ui#2419`, `ui#2421`, `ui#2422` CI reds fixed; Sentry and mailbox intake run.
- Carried: every in-flight row above; `landing#130` round 1; `#2097`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
