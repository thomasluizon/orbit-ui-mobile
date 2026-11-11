/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 65 GiB at handoff; `git clean -fdXq` in a clean, closed worktree frees space). The open owner question is in the spec's `## Open questions`: never ask it again.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`. Helpers: `rb-note.sh <pr> <out>`, `rb-body.sh <pr> <report>`, `request-reviews.sh <key> <pr>...`, `extract-report.mjs <worker log> <out>`, `launch-rb-ui.sh <ticket> <worktree> <branch> <note>`, `landing-verify.sh <worktree> <label>`, `record-merge.mjs <key> <pr> <sha> [issue]`, `log-decision.sh <title>`, `staging-sql.sh '<sql>'`, `staging-allow-ip.mjs <cidr>`; iOS: `statusbar-check.sh <udid> <label>`, `asc-api.mjs`, `asc-review-detail.mjs`, `sim-shot.sh`, `ax-buttons.sh`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background` (never with `&`). `list-bot-threads.mjs` needs `--wait-seconds 60` or more to request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `da19f01fd`; API `main` `2bdd96e30`; landing `main` `43a0bf5`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; production landing `5d9971870`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). The coordinator runs on the worker account. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| ui `#2430` (`#2110`), `#2429` (`#1561` status bar), `#2427` (`#2109`), `#2426` (`#2108`), `#2425` (`#2105`), `#2424` (`#2099`), `#2422` (`#2102`), `#2421` (`#2104`), `#2420` (`#2100`), `#2419` (`#2101`), `#2418` (`#2103`), `#2414` (`#1561`), `#2412` (`#2094`) | CI green at the head in each bullet, round 2 review requested. First arm one `node tools/wait-ci.mjs --repo ui --pr <n> --require-check pullfrog-approval --ceiling-minutes 110` per pull request. On a verdict: read body and threads, fix (worker launches are spent on every motion branch and on `#2108`, `#2110`, `#2094`: orchestrator review fix, a subagent for a large batch), or merge at the bar and record the sha. `ui#2414` before `ui#2423`. After each UI merge, merge `main` into every open UI branch whose CI is still running. |
| `ui#2423` (`#2106`) | After `ui#2414` merges: production iOS Release 1.3.152 (2), read the `testflight-access` job; then `main` into `ui#2423`, CI, review, merge. |
| `landing#129` (`#2090`) | Merge landing `main` `43a0bf5`: conflicts in `package.json`, `Hero.astro`, `landing-startup.test.mjs`, `landing.css`. Resolve keeping both, `landing-verify.sh`, push, review on green, merge. Never raise the Lighthouse budget. |
| `#2107`, `#2091` | Landing staging and production releases after `landing#129` merges (or now if it stalls), then close both. Then launch the `#2095` landing worker. |
| Web and Android releases | After the `#2109`, `#2110`, `#2094` and motion merges: production web release, Android Open release (closes `#2094`), the shared iOS version per `#2106`. |
| `#2097` App Store review | Waits on the owner's contact phone and review code (spec `## Open questions`); then its `## The order` steps. |
| Intake | Cycle 1 ran: 0 new mail, 0 new store reviews (Play cycle cleared), board 23 open and placed, Sentry listed 09:37Z (only `ORBIT-MOBILE-Q`). Next Sentry listing is due hourly; register `wait-auto-work.mjs` when nothing else is launchable. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149, when the owner types `/model claude-fable-5-2`. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2430`, `#2429`, `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2412`, `#2388`; landing `#129`; API none. Unpushed commits: none. Dirty worktrees: none (the `landing#129` merge was aborted). Stashes: 0 (ui, landing, api). Running workers: none. Background subagents: none. Detached checks: none. Free disk 79 GiB.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `landing#130` merged (`43a0bf5`); `ORBIT-WEB-1E` resolved and `#2089` closed; round 1 fixed on `ui#2425`, `ui#2420`, `ui#2412`; `ui#2430` copy approved; `ui#2429` proven on the simulator; `main` merged into every UI branch; desktop test timeout fixed in `ui#2418`; `ui#2414` cache gate fixed; round 2 reviews requested on 13 UI pull requests; intake cycle 1.
- Carried: every other in-flight row; `#2097` submission (owner phone and code first); `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
