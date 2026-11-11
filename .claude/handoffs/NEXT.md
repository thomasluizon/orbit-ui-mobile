/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 69 GiB at handoff). No owner question is open.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D18). Helpers: `landing-verify.sh <worktree> <label>` (build, test, lint, check, format), `reviews-cycle.sh <label>` (detached review cycle writing `reviews-<label>/done.json` for `wait-file.mjs`), `body-merge-report.sh <gh repo> <pr> <label>` (reads `report-<label>.md`), `gl2.sh`, `compare-landing-bytes.sh`, `record-merge.mjs <key> <pr> <sha> [issue]`, `rss-watchdog.mjs`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background` (never with `&`). `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `015918177`; API `main` `2bdd96e30`; landing `main` `5d9971870`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). CI waiters stop at succession: re-arm one per open pull request first.

| Item | Disposition |
| --- | --- |
| `ui#2415` (`#2098`) | Round 4 `906caedd8` pushed, CI runs. Request the review on green, merge at the bar, then `main` into every open UI branch once. It gates every other UI branch. |
| `ui#2426` (`#2108`) | Opened by the second worker at `bf7d5a4d1`; D95 read passed; CI runs. After `ui#2415`: `main`, review, merge. |
| `ui#2421` (`#2104`) | Desktop unit timed out once (`macos-signing-workflow.test.ts`, "fails the release on 'an unstapled DMG'"); the `main` merge reruns it. After `ui#2415`: `main`, review. |
| `ui#2425`, `ui#2424`, `ui#2420`, `ui#2419`, `ui#2422`, `ui#2418` | CI green, diffs read. After `ui#2415`: `main`, review, merge. |
| `ui#2414` (`#1561`) then `ui#2423` (`#2106`) | After `ui#2415`: `main`, review, merge `ui#2414` first; then production iOS Release 1.3.152 (2) and read `TestFlight access`. |
| `ui#2412` (`#2094`) | Round 3 owed after `ui#2415` and a `main` merge. |
| `ui#2416` | Dependabot. After `ui#2415`: `@dependabot rebase`, then `--re-review`. |
| `landing#129` (`#2090`) | Round 7 `97c275e` CI green: request the review now, merge at the bar. |
| `landing#130` (`#2091`) | Round 6 `b53d00f` CI runs: request the review on green, merge. |
| `landing#131` (`#2107`) | Round 4 `71e31a0`, review requested: merge at the bar. |
| After the landing merges | Launch `#2095`, then landing staging and production. Recheck the 24,000-byte Lighthouse script budget after each landing merge. |
| `#2097` App Store review | Copy approved and posted on the ticket. Next: screenshots on the built simulators (spec `#2097` bullet), then the `/iris/v1` fields in the signed-in App Store Connect tab, App Privacy by web form, subscriptions (the Pro trial is a server-granted 7 days), submit with manual release. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no event newer than its recorded `lastEventAt`, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2416`, `#2415`, `#2414`, `#2412`, `#2388`; landing `#131`, `#130`, `#129`; API none. Unpushed commits: none. Dirty worktrees: none. Stashes: 0 (ui, landing). Running workers: none. Background subagents: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly; the last listing showed only `ORBIT-WEB-1E` and `ORBIT-MOBILE-Q` with no new event; mailbox empty; reviews none).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2415` round 3 pushed (`295522c31`) and reviewed; round 4 pushed. `#2108` worker relaunched and opened `ui#2426`. `landing#129` rounds 6 and 7, `landing#130` rounds 5 and 6, `landing#131` rounds 3 and 4 written, pushed and threads resolved. `#2097` listing copy approved. Intake cycle run.
- Carried: every other in-flight row; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
