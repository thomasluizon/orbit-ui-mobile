/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 84 GiB at handoff). No owner question is open.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D5). Helpers: `main-into.sh <worktree> <label>` (read its JSON before any push), `launch-ui-ci.sh`, `launch-landing-ci.sh`, `body-merge-report.sh <gh repo> <pr> <label>` (reads `report-<label>.md`, which needs `## Test evidence`, `## Assumptions` and `## Manual steps`), `record-merge.mjs <key> <pr> <sha> [issue]` (with `CLAUDE_CODE_SESSION_ID`), `landing-script-bytes.cjs <dist>`, `compare-landing-bytes.sh <base dist> <pr dist>`, `raw-gz-sizes.mjs <dist>`, `landing-sweep.cjs <dist> <label>`, `landing-ios-scroll.cjs <dist>`, `rss-watchdog.mjs <MiB> <seconds> <cwd> -- <command>` (run any red proof that can loop under it). Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`. `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 24 open, 24 placed, 0 unplaced, 0 placed twice (`#2071` closed, `#2108` added).

## In flight

UI `main` `015918177`; API `main` `2bdd96e30`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; web `691323673`; desktop 0.1.29; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). CI waiters stop at succession: re-arm one per open pull request first. Review findings already read are saved in the scratchpad as `2415-r2-threads.json`, `129-r4-threads.json`, `130-r3-threads.json` and `131-r1-threads.json`; reread each with `list-bot-threads.mjs` before resolving.

| Item | Disposition |
| --- | --- |
| `ui#2415` (`#2098`) | Round 2 at `196dbd4e0`: four P1 findings. Write round 3 first: it gates every other UI branch. Merge, then `main-into.sh` every open UI branch once. |
| `#2108` | Worker hit the 45-minute ceiling: `08a52e7e9`, `3e96899a3` committed, two test files staged, no pull request. Finish it (second launch or review-batch path), push, open the pull request. |
| `ui#2425`, `ui#2420` | CI green at `489caca57`, `903d74f01`. Diff reads (D95) still owed. |
| `ui#2424`, `ui#2419`, `ui#2422`, `ui#2418`, `ui#2423` | CI green; diffs read. After `ui#2415`: `main`, then review. `ui#2423` merges after `ui#2414`. |
| `ui#2421` | CI runs at `ebb781f42`. |
| `ui#2414` (`#1561`) | CI green at `63ab58fa1`. After `ui#2415`: `main`, review, merge; then production iOS Release 1.3.152 (2) and read `TestFlight access`. |
| `ui#2412` (`#2094`) | Round 3 owed after `ui#2415` and a `main` merge. |
| `ui#2416` | Dependabot. After `ui#2415`: `@dependabot rebase`, then `--re-review`. |
| `landing#129` (`#2090`) | Round 4: one P1 (no download without JavaScript) plus a body note. Write the batch, review, merge, landing releases. |
| `landing#130` (`#2091`) | Round 3 at `4685c3f`: four P1 suggestions. Write round 4, review, merge. |
| `landing#131` (`#2107`) | Round 1 at `c96a5f1`: two P1 test gaps. Write round 2, review. |
| After the landing merges | Launch `#2095`, then landing staging and production. Recheck the 24,000-byte Lighthouse script budget after each landing merge. |
| `#2097` App Store review | Continue through the `/iris/v1` API in the signed-in App Store Connect tab (state in the spec's `#2097` bullet). Adapt the Play listing (both locales), `/second-opinion`, screenshots, subscriptions, App Privacy, submit with manual release. |
| `#2030`, `#2089` | `#2030`: close on the first `android_update_sheet_shown` from 1.3.150 or later. `#2089`: resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| API release | `api#1106` changed API `main`: dispatch `test.yml` and `guards.yml`, then release the API. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2416`, `#2415`, `#2414`, `#2412`, `#2388`; landing `#131`, `#130`, `#129`. Unpushed commits: none. Dirty worktrees: `ticket-2108-composer-collapse` (two staged test files). Stashes: 0. Running workers: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, last listed 02:55Z; mailbox; reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: owner order on the memory dialog (landing `4685c3f` plus the `com.thomas.memory-guard` agent); `api#1106` merged (`2bdd96e30`); `#2071` closed; `landing#129` round 3 pushed; reviews requested on `landing#129`, `landing#130`, `landing#131` and `ui#2415`; owner order on the composer arrow filed as `#2108`; intake cycle run (one vendor mail acknowledged, no reviews, Sentry unchanged).
- Carried: every in-flight row above; `#2097`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
