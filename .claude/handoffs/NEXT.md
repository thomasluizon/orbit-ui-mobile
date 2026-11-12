/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (on failure, read its `## Decision` section from the file). Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB; it was 30 to 37 GiB, see `## Current state`).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from`). Then repoint every helper that holds the predecessor's first 8 characters with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs`), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read D13 to D32 and its `## Blocked, needs owner decision`. Write scratchpad files with the Write tool, with literal paths. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a note that names only the open threads and one sweep of the finding's class; it returns its report as its final message. The coordinator runs the Chromium unit files a report lists before a push.

Workers run on the worker account (contact@useorbit.org) through scratchpad `gl.sh <launch-worker arguments>` or `prep-launch.sh <issue> <worktree name>`. A worker order says: no background task, every command in the foreground, one pull request for the whole ticket, never file a ticket.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the mascot rebrand (`#2117` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 27 open, 27 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `d564a9a12`; API `main` `1a70835b4`; landing `main` `381b253fa`. Staging and production web `46af750f6`; API `1a70835b4`; landing `381b253fa`; Android Open 1.3.153 (214); TestFlight 1.3.153 (3). Merged in the previous session: `ui#2434`, `ui#2420` (`#2100`), `ui#2430` (`#2110`), `ui#2418` (`#2103`), `ui#2440` (`#2074`).

| Item | Disposition |
| --- | --- |
| `ui#2424` (`#2099`) at `a8e7257f5` | In CI with `main` merged and the settle race fixed. Read `chain-read.sh ui 2424`; with no review at the head, arm `chain-review.sh ui 2424`. Merge at the bar with `merge-gate.sh ui 2424` (`MSUBJ` with `feat:`, `MBODY` `Tracks thomasluizon/orbit-tickets#2099`), then `record-merge.mjs ui 2424 <sha> 2099`. |
| `ui#2439` (`#2116`) at `84ceccdeb` | In CI, three review rounds answered. Same chain and merge steps (`MSUBJ` with `fix:`). Then the web release and the three live checks in its order bullet. |
| `api#1108` (`#2118`) at `f6a6d6315` | In CI after the OpenAPI name fix; no review yet. `chain-review.sh api 1108`, fixes through a subagent in worktree `orbit-api/ticket-2118-api-speaks-orbit`, merge at the bar. Then the API release with a fresh Render export first (it adds a migration). |
| `#2117` | Coordinator work; waits for the owner's yes (`## Open questions`). Worktree `ticket-2117-play-listing-allowance` holds no change. |
| `#2119` to `#2126` | In the run queue (Batch M). Launch `#2119` when a UI CI slot and disk allow; the others follow their blockers. |
| Shared mobile release 1.3.154 | After `ui#2424` merges: Android Open first (`android-run.sh`), then `ios-release.yml` with the same version from the same commit, no UI merge between the two dispatches. Then close each ticket its order bullet names, and tear down their worktrees (`teardown-worktree.mjs`), which returns about 25 GiB. |
| Web releases | After the merges: `web-staging-after-main.sh <full sha>`, then `release-run.sh ui production <sha> https://orbit-web-3qmv.onrender.com`. |
| `#2096` | One pull request for the press gap list in its comments, after `ui#2424` merges. |
| `wrapped-player-geometry.test.tsx` | Second red in CI (`Chrome warm start failed`), rerun once. Give it a root diagnosis under `#2074`. |
| App Review (`#2097`) | Was `WAITING_FOR_REVIEW`: read it again (the command is in the `#2097` bullet). |
| Claude usage | Main account: 17% weekly use, one weekly reset available. Read `https://claude.ai/settings/usage` at each hourly Sentry tick and apply the weekly reset rule in `## Open questions`. |
| Intake | Mailbox and store reviews empty; Sentry listed (Q and R, both on `#1561`); board all placed. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Inventory: open pull requests ui `#2439`, `#2424`, `#2388`; api `#1108`; landing none. Unpushed commits on a branch: none. Dirty worktrees: none after this commit. Stashes: none in the three repositories. Running workers: none. Detached worktrees with commits on no remote branch: `combined-2065`, api `scratch-1090-merge` and api `scratch-877-timing`, scratch merge checks from earlier sessions; leave them. Waiters to arm: one `chain-review.sh` per pull request in CI or review, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. A yes to the `#2117` sentences starts the Play Console publish.
2. The merges at the bar: `ui#2424`, `ui#2439`, `api#1108`. After each UI merge, `main-merge-push.sh` on every open UI branch, then re-arm its chain.
3. The web releases, the API release for `#2118`, the shared mobile release 1.3.154 and its ticket closes.
4. Batch M in its order, then the rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner, except the one open question already asked; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; the merges of `ui#2430`, `ui#2420`, `ui#2418` and `ui#2434`; the `ui#2424` `main` merge; one intake cycle with Sentry; the owner's rebrand start order (all ten tickets admitted).
- Changed: the merge order (above); "there is no open owner question" is superseded by the `#2117` question; the 1.3.154 close list no longer holds `#2101` (closed, carried into `#2120`).
- Carried: `ui#2439` and its web release; the 1.3.154 release; `#2096`; App Review; `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026; the scratchpad carry steps; the worker account rules.

Every identifier here came from a previous session: treat each as a lead to verify.
