/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 65 GiB at handoff). No owner question is open.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D5). Helpers: `landing-verify.sh`, `reviews-cycle.sh`, `body-merge-report.sh`, `compare-landing-bytes.sh`, `record-merge.mjs <key> <pr> <sha> [issue]`, `ui-main-merge.sh`, `hub-click.sh <x> <y> [wait]` (Device Hub window click plus screenshot to `asc/hub.png`), `asc-seed.mjs status|prep|seed|rename-pt|rename-en|cleanup`, `asc-sendcode.mjs`, `asc-signin-smoke.sh <udid>`, `staging-sql.sh '<sql>'`, `staging-allow-ip.mjs <cidr>`, `chip-repro.ts`. The `#2097` screenshots are in `asc/shots` (16 PNG). Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background` (never with `&`). `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `304484135`; API `main` `2bdd96e30`; landing `main` `49257d7`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; production landing `5d9971870`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). CI waiters stop at succession: re-arm one `wait-ci.mjs` per open pull request first (one per pull request, so each wakes on its own).

| Item | Disposition |
| --- | --- |
| `ui#2427` (`#2109`) | New: worker commit `cf74b216a`, body corrected to `Tracks`, diff read (reuses `isHabitDoneForRange`). CI runs: request the review on green, merge at the bar. |
| `landing#130` (`#2091`) | `939e80f`, only `PR Body Attribution` queued. Request the review when it settles, merge at the bar, then `main` into `landing#129`. |
| `landing#129` (`#2090`) | Lighthouse red (24,049 of 24,000) until `landing#130` merges: then `main` merge, `landing-verify.sh`, push, review on green, merge. Never raise the budget. |
| `landing#131` (`#2107`) | Merged `49257d7`. Landing staging and production releases after `#130` and `#129` merge (or now if they stall), then close `#2107`. |
| `ui#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2412` | CI queued or running since the post-`ui#2415` `main` merge. Request each review on green, merge at the bar, then `main` into the open UI branches whose CI still runs. `ui#2414` before `ui#2423`. |
| `ui#2421` (`#2104`) | A second `macos-signing-workflow.test.ts` timeout gets an investigation. |
| `ui#2412` (`#2094`) | Round 3 review on green, merge, then the Android Open release, then close. |
| `ui#2414` then `ui#2423` | After `ui#2414` merges: production iOS Release 1.3.152 (2), read `TestFlight access`; then `main` into `ui#2423`, review, merge. |
| `ui#2416` | Dependabot: when `PR Metadata` settles, `list-bot-threads.mjs --re-review`, merge at the bar. |
| `#2097` App Store review | Screenshots done. Next per the spec's `#2097` entry: upload, `/iris/v1` fields, App Privacy, subscriptions, review details with the fixed-code review account, submit with manual release. |
| Astra preview findings | Untriaged, in `## Current state`: prove each red, then file or fold. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark (09:35Z) in `intake.sentry` with no event newer than its recorded `lastEventAt`, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2416`, `#2414`, `#2412`, `#2388`; landing `#130`, `#129`; API none. Unpushed commits: none. Dirty worktrees: none. Stashes: 0 (ui, landing, api). Running workers: none (the `#2109` worker exited 0). Background subagents: none. Detached checks: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry listed 06:35Z with only `ORBIT-WEB-1E` and `ORBIT-MOBILE-Q`, no new event; mail and store reviews not read this session, so run steps 4 and 5; board 23 open).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `#2097` screenshots captured (16) and the smoke demo cleaned up; `#2109` filed from a simulator finding, worker delivered `ui#2427`; Sentry hourly listing run; one CI waiter per open pull request armed.
- Carried: every other in-flight row; `landing#129` and `#130` review requests; `#2097` submission; `#2089`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.
- Superseded: "the QA account signed in on the iPhone simulator" (smoke is signed in now).

Every identifier here came from a previous session: treat each as a lead to verify.
