/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher; no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>`, update the session line in `open-log.sh`, and read `prev-sleep-decisions-a91ceb57.md` (D1 to D42 of this chain's sixth session), then `prev-sleep-decisions-fd386e2b.md`. Run `carry-out.sh` after every few decisions and before any relay. Redirects in Bash use literal paths (write a log entry with the Write tool, then pipe it into `log.sh`). Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. A root hermetic layout run uses the carried `run-layout.sh <label> <head> <specs...>`; `publish-rb.sh <repo> <pr> <worker log> <label>` merges a review worker's report into the PR body. Thread ids for `resolve-bot-thread.mjs` must first come from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0`.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 87, placed 87 (`#1634` was filed, placed in Batch 0c, shipped and closed this session; `#1631`, `#1632` and `#222` shipped and closed), unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm `tools/wait-ci.mjs` for every open pull request below. Each was pushed once this session on base `547ff309`; UI `main` is now `a2a0afb5`, which touches only the session refresh files, so a head that shares no file with it merges at its approved head (rule 120). A Pullfrog review counts only at the exact head and after its push; if CI settles green with only an older review, use `list-bot-threads.mjs --re-review --wait-seconds 1500`.

| Item | Disposition |
| --- | --- |
| Production web `a2a0afb5` | Live (`#1629`, run 39873429002, health serves `a2a0afb5`, post-deploy smoke passed 6 of 6). `#1629` stays open for its Android half. UI `main` is now `ac2b8010` (ui#1896 `#222` merged); the next production web release carries `#222` with ui#1962 and ui#1956. |
| Production API `b8a9846c` | Live and Healthy on production and staging (run 39877831781). `#1631`, `#1632` and `#1634` shipped and closed. `#1619` (ui#1958) still has to call `POST /api/chat/gamification/refresh` for level-only and achievement-only reads before it closes. |
| ui#1946 `#1607`, ui#1897 `#1564` | Both APPROVED at their heads with 0 threads but red: ui#1946 on Upgrade layout geometry and Layout shard 1 at `7db0ae1e`; ui#1897 on Web unit chromium 4/8, 5/8, 8/8 at `080a07d5`. Read each failing log, then a review batch per PR. |
| ui#1962 `#1633` | `6441504e`; root proof in the body (fixed adapter 4 of 4 pass, main's adapter 4 of 4 fail at `smoke-adapters.ts:57`). Merge on the bar, release production web, rerun the post-deploy smoke, record the result, close `#1633`. |
| ui#1956 `#1630` | `023f284b`, all green except Android release build (transient NDK download); failed job rerun on run 39867729346. Needs a fresh exact-head review, then merge and release with the next production web release. |
| ui#1958 `#1619` | `1370ee43` (both review rounds, threads resolved). Read SonarCloud duplication on the new head. Closes only after api#855 deploys and its UI consumer uses `POST /api/chat/gamification/refresh`. |
| ui#1959 `#1628` | `dbfd9446` (three threads resolved, own reds fixed). Needs the next native build for the Android key-event flag. |
| ui#1955 `#1618` | `e47193ca` (shared function coverage 96.19%). |
| ui#1944 `#1611`, ui#1961 `#1609` | Published carries `d9767773` and `76a13038` (new PR). The second of `#1607`, `#1609` and `#181` to merge takes a `main` merge and full re-check first. |
| ui#1903 `#181` | `179adcda`. Before merge, root runs the 38 whole-app scenarios on a fresh hermetic build of this head: rebind the carried `run-181-f9db-final-rendered-proof.sh` identity constants (head, tree, BUILD_ID, build receipt) to the new build and keep every scenario and assertion. |
| ui#1960 `#1624`, UI1953 (this docs PR) | Main merged forward and pushed; wait for review, then merge. The thomas-brain consolidation and social drafts stay root work. |
| orbit-api#853 `#1617` | `1d54e305` (coverage round plus an unsupported follow-up target crash fix). Its waiter stopped on a GitHub read error; re-arm it. API `main` moved to `b8a9846c` after its merge-result check, so rerun `dotnet build` and `dotnet test` on the merge result if it shares a file with api#855, #856 or #857. Composition stays seeded off until `#26`. |
| `#1627` | Merged as `014d33b5` and live in production; stays open for the real-call staging acceptance in the Astra sweep. |
| `#1625`, `#1626`, `#1622`, `#1612`, `#1623`, `#418`, `#1613`, `#1620` | Unchanged from the spec. Google s2 still served the old purple planet for `useorbit.org`; re-check later. `#1613` local `0ed1bd1f` and `#418` local `b17b97b0` remain unpublished carries. |
| Android | `main` has unreleased Android changes; an Open release follows the android-release skill after `#1630` and `#1628` land. |
| Dependabot UI1915/1916/1930/1932, UI1952 | Sequential, unchanged. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows above: production web verification and ui#1962 first, then each approved pull request at its exact head.
3. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`, with the local merge-result check when the base moved onto a shared file. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above.
- `#1633`: done to publication (ui#1962, red and green proven); carried for merge, release and smoke rerun.
- `#1619`: done to publication (`1370ee43`, threads resolved, SonarCloud duplication fixed in round 2); carried for review and its closure condition.
- `#1617`: coverage round done (`1d54e305`); carried. `#1627`: done (merged `014d33b5`, production Healthy); carried for acceptance. `#1631`: round done (`97f22b32`); carried. `#1632`: round done (`63b1f686`); carried. `#1628`: round done (`dbfd9446`); carried. `#1624`, `#1629`, `#1630`: main merge done; `#1629` merged as `a2a0afb5` and released (run 39873429002); `#1624`, `#1630` carried. `#1618`: coverage round done (`e47193ca`); carried.
- `#1607`, `#1564`, `#181`, `#1609`, `#222`, `#1611`: published once each (heads above); carried for review, and `#181` for its root whole-app run.
- `#1625`, `#1626`, `#1622`, `#1612`, `#1623`, `#418`, `#1613`, `#1620`, Android, UI1953, Dependabot, UI1952: carried.
- "Workers, waiters, chain": superseded by the In flight row.

Every identifier here came from a previous session: treat each as a lead to verify.
