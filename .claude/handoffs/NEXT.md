/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 74 GiB at handoff). No owner question is open.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D11). Helpers: `main-into.sh <worktree> <label>`, `launch-ui-ci.sh`, `launch-landing-ci.sh`, `gl2.sh`, `prep-npm.sh`, `body-merge-report.sh <gh repo> <pr> <label>` (reads `report-<label>.md` with `## Test evidence`, `## Assumptions`, `## Manual steps`), `record-merge.mjs <key> <pr> <sha> [issue]` (with `CLAUDE_CODE_SESSION_ID`), `compare-landing-bytes.sh`, `raw-gz-sizes.mjs`, `landing-sweep.cjs`, `129-r4-nojs.cjs <dist>`, `rss-watchdog.mjs <MiB> <seconds> <cwd> -- <command>` (run any red proof that can loop under it). Write scratchpad scripts with the Write tool and literal absolute paths (the guardrail refuses a redirect to a shell variable). Start every waiter as a Bash background task with `run_in_background`. `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice (`#2030` closed).

## In flight

UI `main` `015918177`; API `main` `2bdd96e30`; landing `main` `5d9971870`. Production and staging API `2bdd96e30` (released and verified); web `691323673`; desktop 0.1.29; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). Web `015918177` is unreleased (two Dependabot commits). CI waiters stop at succession: re-arm one per open pull request first. Review findings read are saved in the scratchpad as `131-r2-threads.json`, `129-r5-threads.json`, `130-r4-threads.json`.

| Item | Disposition |
| --- | --- |
| `ui#2415` (`#2098`) | Review batch `295522c31` committed in `ticket-2098-shard-tools`, NOT pushed. Read the worker report and diff (D95), merge the report into the body, resolve the four threads, push, request round 3 on green. It gates every other UI branch: merge, then `main-into.sh` every open UI branch once. |
| `#2108` | No PR. Salvage stopped: `tsc` fails on the two staged tests (`conversation-composer.test.tsx:48`, `astra-shell-navigation.test.tsx:112`); receipts in scratchpad `salvage-2108/`. Second worker launch to fix them, then web unit, lint, push, open the PR. |
| `ui#2421` (`#2104`) | CI fix `e6ad8d977` pushed, CI runs. After `ui#2415`: `main`, then review. |
| `ui#2425`, `ui#2420` | CI green, D95 diff reads done (pass). After `ui#2415`: `main`, then review. |
| `ui#2424`, `ui#2419`, `ui#2422`, `ui#2418`, `ui#2423` | CI green; diffs read. After `ui#2415`: `main`, then review. `ui#2423` merges after `ui#2414`. |
| `ui#2414` (`#1561`) | CI green. After `ui#2415`: `main`, review, merge; then production iOS Release 1.3.152 (2) and read `TestFlight access`. |
| `ui#2412` (`#2094`) | Round 3 owed after `ui#2415` and a `main` merge. |
| `ui#2416` | Dependabot. After `ui#2415`: `@dependabot rebase`, then `--re-review`. |
| `landing#129` (`#2090`) | Round 5: one minor P1 (double press during the panel import). Write it myself, review, merge. |
| `landing#130` (`#2091`) | Round 5: two minor P1 (six reserved rows; the demo-clock order test). Write, review, merge. |
| `landing#131` (`#2107`) | Round 3: delete the dead `press` helper. Write, review, merge. |
| After the landing merges | Launch `#2095`, then landing staging and production. Recheck the 24,000-byte Lighthouse script budget after each landing merge. |
| `#2097` App Store review | Continue through the `/iris/v1` API in the signed-in App Store Connect tab (state in the spec's `#2097` bullet). |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. The last listing showed no change. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2416`, `#2415`, `#2414`, `#2412`, `#2388`; landing `#131`, `#130`, `#129`. Unpushed commits: `295522c31` on `chore/ticket-2098-shard-tools`. Dirty worktrees: `ticket-2108-composer-collapse` (two staged test files). Stashes: 0 (ui, landing). Running workers: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly; mailbox empty; reviews none at handoff).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: API release (staging and production both verified at `2bdd96e30`); `landing#129` round 4 (`6542571`), `landing#130` round 4 (`0a99456`), `landing#131` round 2 (`79d8dbd`) pushed and reviewed; `ui#2421` CI fix pushed; D95 reads of `ui#2425` and `ui#2420`; `#2030` closed on its PostHog event; intake cycle run.
- Carried: `ui#2415` round 3 (committed, push owed), `#2108`, every other in-flight row; `#2097`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
