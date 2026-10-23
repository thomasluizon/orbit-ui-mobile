/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting live defects: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; build his orders in full or not at all; never mention rotating an API key that showed in a log; and do every step yourself that needs no password, 2FA or payment from him ("why is that waiting on me? just do it yourself"): when an MCP reaches the wrong account, use `claude-in-chrome`.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB. A `max` UI worker holds about 36 GiB of temporary files while it runs, so check the floor before launching one. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run` (its `SKIP_SESS` already lists `d478b40e`, `c609480b`, `d6298537` and `62304552`; add the new session's 8-character id); run the carried `nm-prune.sh dry`, then `run` (it removes only `node_modules` and the web build from orca UI worktrees whose ticket is closed and whose branch has no open pull request); remove only rebuildable build output (`apps/web/.next`) from proof trees whose ticket work is merged; clear `npm`, Homebrew, `uv` and Gradle transform caches. Docker images and volumes belong to other projects. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad. Read the previous session's carried `prev-sleep-decisions-d478b40e.md` (D1 to D20, and `prev-sleep-decisions-c609480b.md` D1 to D27 before it) first. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above `## Blocked, needs owner decision`. Redirects in Bash use literal paths (the guardrail refuses a variable in a redirect target); the shell is zsh, so `set -- $var` does not split words: write a script. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit, Orbit Staging); Gmail for Orbit mail is Gmail web in `claude-in-chrome` (`thomaslrgregorio@gmail.com`). The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`; staging web is `https://orbit-web-staging-eakn.onrender.com`, production web `https://orbit-web-3qmv.onrender.com`, staging API `https://orbit-api-staging-uqu2.onrender.com`. Carried helpers: `launch-new-ticket.sh`, `launch-review-round.sh`, `new-worktrees.sh`, `prstat.sh <repo name> <pr>...`, `base-overlap.sh <pr>...`, `mc-full.sh <label> <head sha>...` (UI combined check), `api-combined.sh <label> <head sha>...` (API combined check: build and every test project), `repro-1984.sh <head sha> <spec>...`, `poll-checks.sh`, `render-1665/shoot-widths.mjs <dir>` (consent page at six widths; re-render first with `dotnet run render.cs <dir>` in `render-1665/app`, whose project is the `api-render` worktree in the `d6298537` scratchpad), `log.sh`, `carry-out.sh`, `scratch-wt-prune.sh`, `prod-sql.sh`, `staging-sql.sh`, `render-allowlist-set.mjs`. All hermetic layout runs take the session lock `<scratchpad>/playwright.lock` (`mc-check.sh` and `repro-1984.sh` both use it); a lock may be pinned to another session's live check pid. Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. Copy every full SHA from `gh api .../pulls/<n> --jq .head.sha`.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 74, placed 74, unplaced 0, placed twice 0 (no ticket closed or filed this relay; `#1668` now carries `ui#2005`). Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `a4ef1097`, API `main` is `78ca5334`, landing `main` is `0d5e3df4`. Production web `9157ff3f`, staging web `9157ff3f`; staging and production API `78ca5334`; production landing `0d5e3df4`. Android Open `1.3.93` (`152`) was in Play review. Open pull requests: UI `#2005`, `#2004`, `#2003`, `#2002`, `#1998`, `#1991`, `#1990`, `#1989` (relay docs), `#1984`; API `#877`, `#876`; landing none. No worker is running.

| Item | Disposition |
| --- | --- |
| Web release | `ui#1903` (`#181`) and `ui#1993` (`#1620`) merged; release web staging at the current main SHA with `-f sha=`, then production, smoke must pass. |
| `ui#2005` (`#1668`, owner order) | Head `b06f7b0d`, Pullfrog APPROVED, copy approved and posted. CI red: `Tool and Hook Tests` and `Web unit (jsdom 1/2)` (others were pending). Read the failed logs, run a review round on the worktree `ticket-1668-astra-mark-only` (`launch-review-round.sh ui 1668 ...`), push, merge when green and approved, release web, then the next Android Open. |
| `ui#2002` (`#1588`) | Head `6d9eea4c`, Pullfrog APPROVED at head, 0 threads, one check pending at the relay. Merge when green, release web, next Android Open. |
| `ui#1984` (`#577`) | Round 5 commit `069406ae` local in `ticket-577-headless-overlays`, not pushed; report `report-577-r5.txt` in the scratchpad. Its NEEDS_DECISION: an app-owned Android native window host for the rn-primitives Dialog above TrueSheet. Research the installed rn-primitives, TrueSheet and Expo sources first, decide and log it, then a `max` round with a recorded reason; rerun the eight failing layout spec files at root with `repro-1984.sh` and push only on layout exit 0. |
| `orbit-api#877` (`#1655`) | Commit `1d1539cc` (xunit `preEnumerateTheories` false) stays unpushed: no gain (55m53s against 57m33s; outcomes 25 killed and 37 survived against 25, 34 and 3 timeouts). Relaunch `max` with both timings (`time-877c/summary.txt` in the scratchpad and the worker's `orbit-1655-r4/before` report in the system temporary directory). Then `orbit-api#876`. |
| Dependabot and snapshot | `ui#1991` rebase asked (its red was an unrelated `action-rows.spec.ts:123` click timeout); then `ui#1990`, `ui#1998`, `ui#2004`, one lockfile at a time; `ui#2003` (contract snapshot) by its own review. Request Pullfrog with `list-bot-threads.mjs --re-review --wait-seconds 900` when it has not reviewed the head. |
| Android `1.3.93` | Verify Play Open availability (Play Console, one tab, close it after); then update `#1613`'s Android acceptance. |
| `#1660` | Waits on the owner's next Orbit connector reconnection (open question); no production consent is run by the session. |
| `#1641` | Waits on the owner's password at `admin.google.com/u/1/`. |
| `#1622`, `#1656`, staging Postgres | Unchanged: favicon still old; no widget event on `1.3.92`; `staging-reseed.yml` replaces staging before its free-plan expiry. |
| Remaining rows | `#1624`, `#1623`, device acceptance lane, Batch 0c closures, `#1658`, `#1617`, `#1627`, `#1612`, `#1626`, `#213`, `#227` step 3, `#31`, `#32`, `#1560`: unchanged from the spec's Current state. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. Release web staging then production for the merged `#181` and `#1620`.
3. `ui#2005` CI round, then `ui#2002`; merge each when green and approved, and release web after each set of merges.
4. `ui#1984` decision and round; `orbit-api#877` relaunch, then `#876`; the Dependabot and snapshot pull requests one at a time.
5. Follow `## The order` for everything else, keeping the pool full under the load gate and the disk floor.
6. Run the full real-call Astra staging sweep only after the current Astra work (`#1668`, `#1620`) is deployed.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. A `wait-ci.mjs` waiter exits `PR_CLOSED` as soon as any one of its pull requests merges, so restart it for the rest. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it, and reject a fix that leaves the reported defect in a different size or shape. Resolve review threads before the push that answers them. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`, and keep the root checkout on the relay docs branch until the successor confirms.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried (disk note gains `nm-prune.sh`; the 55 GiB relay target is gone with 118 GiB free).
- Answer the owner first: carried; no owner message arrived this relay.
- Launch `#1668`: done (`ui#2005`, round 2 plus a root copy fix pushed, copy approved); CI round carried.
- Verify Android `1.3.93`: carried (still in review at the relay).
- `ui#2002`: rounds 3 and 4 pushed as `6d9eea4c`, approved; merge carried.
- `ui#1984` round 5: done as a local commit `069406ae`; decision and push carried.
- q6: done, `ui#1903` and `ui#1993` merged; their web release carried.
- `orbit-api#877`: measured, no gain, relaunch carried; `#876` carried.
- Dependabot: `ui#2001` merged; `ui#1991` rebase asked; `ui#1990`, `ui#1998`, `ui#2004`, `ui#2003` carried.
- `#1641`, `#1622`, `#1656`, staging Postgres, `#1660`, remaining rows: carried with the readings above.

Every identifier here came from a previous session: treat each as a lead to verify.
