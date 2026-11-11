/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 65 GiB at handoff; `git clean -fdXq` in a clean, closed worktree frees space). The open owner question is in the spec's `## Open questions`: never ask it again.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`. Helpers: `rb-note.sh <pr> <out>`, `rb-body.sh <pr> <report>`, `extract-report.mjs <worker log> <out>`, `launch-rb-ui.sh <ticket> <worktree> <branch> <note>`, `landing-verify.sh`, `record-merge.mjs <key> <pr> <sha> [issue]`, `staging-sql.sh '<sql>'`, `staging-allow-ip.mjs <cidr>`; App Store: `asc-api.mjs`, `asc-review-detail.mjs`, `sim-shot.sh`, `ax-buttons.sh`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background` (never with `&`). `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 24 open, 24 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `da19f01fd`; API `main` `2bdd96e30`; landing `main` `49257d7`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; production landing `5d9971870`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). Re-arm one `wait-ci.mjs` per open pull request first (exit 3 is the ceiling: re-arm it). Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `ui#2427` (`#2109`), `ui#2426` (`#2108`), `ui#2422` (`#2102`), `ui#2421` (`#2104`), `ui#2419` (`#2101`), `ui#2418` (`#2103`), `ui#2414` (`#1561`) | Review round 1 fixed, threads resolved, pushed; CI running. Request the round 2 review on green, merge at the bar, record the sha. `ui#2414` before `ui#2423`. |
| `ui#2424` (`#2099`) | Round 1 fixed at `5cba3cb92` (web refetch dim and scope-change fade removed for parity, checks settle at rest, 4 threads resolved; launches spent), pushed, CI running: review on green, merge. |
| `ui#2425` (`#2105`) | Round 1 (caution, 3 threads, a blank revisited tab on device): orchestrator review fix (launches spent), resolve, push, review on green. |
| `ui#2420` (`#2100`) | Round 1 (mobile mirrors still draw `tokens.hairline`, 2 threads): fix, resolve, push, review on green. |
| `ui#2412` (`#2094`) | Round 3 body finding answered in a PR comment; the same-head re-review left 1 unresolved thread: read, fix, merge, then the Android Open release, then close. |
| `ui#2430` (`#2110`) | New, CI running. `/second-opinion` copy verdict for `chat.operation.newHabitsWithExisting` posted on the pull request, review on green, merge. |
| `ui#2429` (`#1561` status bar) | CI green, PR Metadata fixed. Prove it on the iPhone simulator (system appearance light, Orbit theme dark: white glyphs) with an `/ios-generate` build of the branch, then review, merge. |
| `ui#2414` then `ui#2423` | After `ui#2414` merges: production iOS Release 1.3.152 (2), read the `testflight-access` job; then `main` into `ui#2423`, review, merge. |
| `landing#130` (`#2091`) | Round 8 thread fixed at `c86d715`, CI running: review on green, merge, then `main` into `landing#129`. |
| `landing#129` (`#2090`) | Lighthouse red (24,049 of 24,000) until `landing#130` merges: then `main` merge, `landing-verify.sh`, push, review on green, merge. Never raise the budget. |
| `#2107` | `landing#131` merged `49257d7`. Landing staging and production releases after `#130` and `#129` merge (or now if they stall), then close `#2107`. |
| `#2097` App Store review | Waits on the owner's contact phone and review code (spec `## Open questions`); then its `## The order` steps. |
| Intake | No intake cycle ran in the predecessor session. Run the full cycle: Sentry (last listed 06:37Z with only `ORBIT-WEB-1E` and `ORBIT-MOBILE-Q`), mailbox, store reviews (the last `--cycle` timed out at 600 s and resumes on the next call), board. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark (09:35Z) in `intake.sentry` with no event newer than its recorded `lastEventAt`, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2430`, `#2429`, `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2412`, `#2388`; landing `#130`, `#129`; API none. Unpushed commits: none. Dirty worktrees: none. Stashes: 0 (ui, landing, api). Running workers: none. Background subagents: none. Detached checks: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (board 24 open).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2416` merged (`2ef7f36a4`); `#2110` delivered as `ui#2430`; round 1 reviews requested on every green UI pull request and fixed on `ui#2427`, `ui#2426`, `ui#2422`, `ui#2421`, `ui#2419`, `ui#2418` and `ui#2414`; `ui#2429` PR Metadata fixed; `landing#130` round 8 thread fixed; `ui#2428` (contract rebaseline) merged (`da19f01fd`).
- Carried: every other in-flight row; `#2097` submission (owner phone and code first); `#2089`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.
- Superseded: the `ui#2421` timeout note now lives in the `#2104` bullet.

Every identifier here came from a previous session: treat each as a lead to verify.
