/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`; if that frees too little, `docker builder prune -af` and `npm cache clean --force` are rebuildable caches. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,500 entries, so run it as a background task), and read `prev-sleep-decisions-e101183e.md` (D1 to D19 of the previous session), then `prev-sleep-decisions-50636166.md`. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (a variable in a redirect target is refused by the guardrail hook; write a script or a file with the Write tool, then run it); the shell is zsh. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`, never raw `gh issue`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`. Production SQL reads go through the carried read-only `prod-sql.sh`; on `SSL connection has been closed unexpectedly`, compare `curl -sS https://api.ipify.org` with the `operator mac` allowlist entry and repoint it with `render-allowlist-set.mjs dpg-dasotg8473hc739a5gpg-a "operator mac" <ip>/32`. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]` (no relaunch reason; past the per-branch cap call `gated-launch.sh` with `--relaunch-reason`); `new-worktrees.sh`; `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `bm-note.sh <pr> [extra note]` writes a base-merge order naming merge-tree conflicts; `answer-push.sh <repo> <pr> <worktree> <thread id>...` (refuses a head that conflicts with `origin/main`); `body-append.sh`; `prstat.sh`; `main-overlap.sh <ci base> <pr>...`; `tools-merge-check.sh <label> <pr>...` (tools and hooks harnesses on main plus the heads); `mc-detached-main.sh <label> <full sha>...` and `wait-done.sh <label>`; `render-export.mjs <postgres id>` then `wait-new-export.sh <postgres id> <started at UTC>` (verifies the new export downloads); `snap-1555.sh <label>` (retired-table counters); `prod-sql.sh`; `ticket-pr-map.sh`; `reconcile-order.py`. Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request` (`--bot github-advanced-security` for CodeQL threads). Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree.

GitHub REST budget: `tools/wait-ci.mjs` costs about four requests per watched pull request per minute; watch at most about a dozen until `#1648` (ui#1981) lands. A waiter exits when any watched pull request closes, so re-arm after merges.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`reconcile-order.py`): open 84, placed 84, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `0adb4e98`, API `main` is `ba070607`, landing `main` is `0d5e3df4`. Production API `bceaa597`, staging API `ba070607` Healthy, production web `9c9f4c24`, production landing `0d5e3df4`. No worker or release watcher is running; the relay tool stops this session's CI waiters, so re-arm them. Every Pullfrog review counts only at the exact head and after its push. Every worktree below is clean and pushed except `ticket-1613-weekly-language` (one unpushed commit). Zero stashes in all three repositories.

| Item | Disposition |
| --- | --- |
| q2 combined check | Running detached (`mc-detached-main.sh q2` on main `9c9f4c24` with `ui#1974` `5560c1fd`, `ui#1970` `a2bbb735`, `ui#1897` `8be3e663`); type-check, i18n, shared and mobile Vitest exit 0 so far. Run `wait-done.sh q2`; on OVERALL fail=0 merge them in that order at those heads (each still every check green, approved, 0 threads; main since `9c9f4c24` only gained docs `0adb4e98`). |
| Base-merge rounds pushed | `ui#1972` (`#1638`, `1b98f16b`), `ui#1959` (`#1628`, `ff048533`), `ui#1946` (`#1607`, `7070f4b4`), `ui#1967` (`#62`, `9fabd472`): each needs CI and a fresh exact-head review, then merge. After `ui#1972` merges, a base-merge round for `ui#1955` (`#1618`); after `ui#1946` and `ui#1897`, one for `ui#1903` (`#181`). After `ui#1946` merges, `#1613` carries (local `0ed1bd1f`, one unpushed commit). |
| `ui#1980` (`#1651`) | Round 2 pushed `697b26b9` (base merge plus CodeQL fix, both CodeQL threads resolved). After CI and review, merge; then one staging web release from `main` with `-f sha=<full sha>` closes `#1651` when the summary records it. |
| `ui#1977` (`#1560`) | Reopened on current main; one flaky `subhabit-indent.spec.ts` shard rerun (run 39936009862). Merge when every check is green and approved at `bbe0b268`; a repeat of that flake gets a harness ticket. |
| `ui#1981` (`#1648`) | New: shared paced REST budget across waiters with ETag reads. CI and review, then merge; after it, re-arm waiters freely. |
| `orbit-api#874` (`#1555` step 2) | Pushed `6edb4971` (drop regenerated as `20261023103527_DropRetiredFeatureTables` on top of `#868`). CI and review. `orbit-api#875` (`#1491`, `20261023102941_DropSentProactiveCheckins`) is open too: the second to merge needs a snapshot regeneration round. |
| Production API release | Bundle `#868`, `#874`, `#875`: take snapshot B (`snap-1555.sh b`; write counters must equal snapshot A on `#1555` and no API scan of a dropped table after 09:51:29 UTC), post it on `#1555`, take a fresh export (`render-export.mjs` then `wait-new-export.sh`), release staging with `-f sha=`, then production, read `/health` and `__EFMigrationsHistory`, then close `#1491`, `#1555` step 2 (step 3, `Users.Handle`, stays on `#1555` or gets its own ticket with its writer retirement), and `#1559` only per its own acceptance. |
| Android Open release | After `ui#1959`, `ui#1972`, `ui#1974` merge, through the android-release skill; verify Play availability. Then close the Batch 0c tickets whose acceptance is production web plus Android Open (`#1629`, `#1630` with a quiet `ORBIT-WEB-V`, `#1645`, `#1638`, `#1628`, `#1635`, `#753` and the rest by their bodies), and run the next production web release after the remaining UI merges. |
| Sentry | API groups `-19`, `-1C`, `-18`, `-16`, `-15`, `-1B`, `-1D` are resolved with the fixing release; a reopen means regression. `#31` closes when they stay quiet; `#32` when its web and mobile groups stay quiet after the Android Open release. |
| `#1622` | Live favicons are the new mark; Google's s2 cache still shows the old purple planet; no Search Console property exists. Re-check later; close when the cache and the connector list show the new mark. |
| `#1624`, `#1623`, `#1151`, `#1612`, `#1625`, `#1626`, `#1534`, `#213`, `#227` step 3 | Unchanged from the spec's Current state (`#227` step 3 waits on `#210`'s MinSupportedVersion raise; `#1626` after the Android Open release). |
| Dependabot UI1915/1916/1930/1932 | Sequential, after the reopen queue. |
| Workers, waiters, chain | No worker running. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Re-arm waiters within the budget; finish q2 and merge it; drive the pushed rounds to merge.
3. Release in order as PRs land: the bundled production API release, the Android Open release, the web releases (staging with `-f sha=` after `ui#1980`, then production), each verified.
4. Follow `## The order` for everything else, keeping the worker pool full under the load gate.
5. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane and any PostgreSQL proof container. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it: reject a fix that trades one defect for another. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, REST budget, Sleep rules: carried above (helpers added: `bm-note.sh`, `tools-merge-check.sh`, `wait-new-export.sh`, `snap-1555.sh`; `answer-push.sh` now refuses a conflicting head).
- Answer the owner first: carried (no owner message arrived).
- Production API release with a fresh export: done (run 39934429107, `bceaa597` Healthy); `#1650`, `#1642`, `#1643`, `#1644`, `#1639`, `#418` closed; `#1555` step 1 verified live.
- `#1555` step 2: in flight as `orbit-api#874` (snapshot A posted; snapshot B carried).
- q2 combined check: in flight (detached), carried.
- Base-merge rounds for `ui#1972`, `ui#1959`, `ui#1946`, `ui#1967`: done (pushed); CI, review and merge carried; `ui#1955`, `ui#1903`, `#1613` carried.
- Pushed rounds: `ui#1977` reopened and rerun (carried); `ui#1973` merged (`9c9f4c24`, `#1640` closed); `orbit-api#868` merged (`ba070607`); `ui#1980` round 2 pushed (carried); `ui#1975` merged (`e0c72215`); `ui#1964` merged (`0adb4e98`). `#1648` launched as `ui#1981` (carried).
- Web and Android releases: production web done (`9c9f4c24`, smoke 6 of 6, `#1633` closed) ahead of `ui#1980` (decision D7); production landing done (`0d5e3df4`); `#1651` staging web release and Android Open carried.
- `#1624`, `#1622`, `#1630`, `#1534`, `#1625`, `#1627`, `#1612`, `#1623`, `#1620`, `#1626`, `#213`, Dependabot: carried (`#1622` recrawl impossible without a property; recorded on the ticket).
- "Follow the order": carried; new this relay: `#1491` started (`orbit-api#875`).

Every identifier here came from a previous session: treat each as a lead to verify.
