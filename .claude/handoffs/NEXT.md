/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`; if that frees too little, `docker builder prune -af` and `npm cache clean --force` are rebuildable caches. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,400 entries with `cp -c`, so run it as a background task), and read `prev-sleep-decisions-50636166.md` (D1 to D19 of the previous session), then `prev-sleep-decisions-1ae53693.md`. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (a variable in a redirect target is refused by the guardrail hook; write a script or a file with the Write tool, then run it); the shell is zsh, so pass several arguments literally. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs` (`--repair-status` when a merge auto-closed the ticket), never raw `gh issue`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0` (pass it as `workspaceId`). Production SQL reads go through the carried read-only `prod-sql.sh` (the hosted Render MCP cannot reach the allowlisted database). If it fails with `SSL connection has been closed unexpectedly`, compare `curl -sS https://api.ipify.org` with the `operator mac` allowlist entry and repoint it with `render-allowlist-set.mjs dpg-dasotg8473hc739a5gpg-a "operator mac" <ip>/32`. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo name> <issue>:<branch>...`; `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `answer-push.sh <repo> <pr> <worktree> <thread id>...`; `body-append.sh <repo name> <pr> <section file>`; `prstat.sh`; `redchecks.sh`; `ci-base.sh`; `main-overlap.sh <ci base> <pr>...`; `pair-files.sh`; `pair-conflicts.sh <base ref> <pr>...` (pairwise textual conflicts; needs `refs/remotes/pr/<n>`, fetch with `git fetch origin pull/<n>/head:refs/remotes/pr/<n>`); `api-overlaps.sh` then `api-main-overlap.sh`; `api-combined.sh <label> main <pr>...`; `mc-detached-main.sh <label> <full sha>...` and `wait-done.sh <label>`; `render-export.mjs <postgres id>` and `wait-export.sh <postgres id>`; `run-proof-1555.sh`; `ticket-pr-map.sh`; `reconcile-order.py`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. A Codex launch that ends on "Selected model is at capacity" is relaunched; with commits already made, relaunch as a continuation order that names them.

GitHub REST budget: `tools/wait-ci.mjs` costs about four requests per watched pull request per minute. Watch at most about a dozen pull requests at once until `#1648` lands, and check `gh api rate_limit` before a burst of reads. A waiter exits when any watched pull request closes (`PR_CLOSED`), so re-arm after merges.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`reconcile-order.py`): open 92, placed 92, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `c6a93c5e`, API `main` is `bceaa597`, landing `main` is `0d5e3df`. Production API `3b199d35`, staging API `bceaa597` Healthy, production web `ea102cc9`, staging web `cb67585a`. No worker or release watcher is running; the relay tool stops this session's CI waiters, so re-arm them. Every Pullfrog review counts only at the exact head and after its push.

| Item | Disposition |
| --- | --- |
| Production API release | Staging serves `bceaa597` Healthy (run 39932688931, pinned SHA). Next: start a fresh Render export (`render-export.mjs dpg-dasotg8473hc739a5gpg-a`, then `wait-export.sh`, verify it downloads like `verify-prod-backup-bf973.mjs`), then dispatch `release.yml` production on `main` (it defaults to the dispatch commit and refuses unless staging serves it Healthy), watch it with `tools/wait-release.mjs`, then read production `/health`. Do not merge to API `main` between dispatch and job start. Then close `#1650` (the staging and production summaries record the SHA) and, once live, `#1642`, `#1643`, `#1644`, `#1639`, `#418`, and verify `#1555` step 1 live in production. |
| `#1555` step 2 | After the production release: a second `pg_stat_user_tables` snapshot, then the drop migration and its contract entry (ticket body). |
| q2 combined check | `ui#1974`, `ui#1970`, `ui#1897` are green and approved, merge cleanly on `main` but share files with it since their CI base: run `mc-detached-main.sh q2` with their three full heads on `origin/main`, then merge them in that order at their approved heads (each still every check green, approved, 0 threads). |
| Base-merge rounds | `ui#1972` (`#1638`), `ui#1959` (`#1628`), `ui#1946` (`#1607`), `ui#1967` (`#62`) conflict with `main` after q1: launch a base-merge round for each (commit-only contract, conflicts named by `git merge-tree`), push with a body section, then CI and a fresh review. After `ui#1972` merges, the same for `ui#1955` (`#1618`); after `ui#1946` and `ui#1897`, the same for `ui#1903` (`#181`). After `ui#1946` merges, `#1613` carries (local `0ed1bd1f` on `fix/ticket-1613-weekly-language`, one unpushed commit). |
| Pushed rounds | `ui#1977` (`#1560`, `bbe0b268`), `ui#1973` (`#1640`, `902eb341`; tools and hooks harnesses already pass on that merge result), `orbit-api#868` (`#1559`, `4d3e8a42`), `ui#1980` (`#1651`, new; read its diff: it pins web `release.yml` to the `sha` input, checks staging `/api/health` `.commit` through `RENDER_WEB_STAGING_SERVICE_ID` before production, and teaches `release-plan.mjs`, `wait-release.mjs` and the release skill the SHA), `ui#1975` (`#32`, Sonar job rerun after a runner loss), `ui#1964` (handoff docs). Each needs CI and a fresh review; then merge by the overlap rule or a combined check. After `ui#1973` merges, launch `#1648`. After `ui#1980` merges, close `#1651` on one staging web release that records the dispatched SHA. |
| Web and Android releases | After `ui#1980`: staging web from `main` with `-f sha=`, then one production web release, then the production smoke rerun (`#1633` closes only on 6 of 6). Android Open after `ui#1959`, `ui#1972`, `ui#1974` merge, through the android-release skill; verify Play availability. Close `#418`, `#1642`, `#1643`, `#1644` once live in production, `#1630` after the Android Open release and a quiet `ORBIT-WEB-V` (last seen before the fix; production web still lacks it), and `#31` when its Sentry groups stay quiet. |
| `#1624` | Part 1 is merged in `thomas-brain` (`031d23df`). Remaining: the pt-BR feature graphic with `#1623`, and the profile uploads of the regenerated covers and marks (Chrome, in the open window). |
| `#1622`, `#1630`, `#1534`, `#1625`, `#1627`, `#1612`, `#1623`, `#1620`, `#1626`, `#213` | Unchanged from the spec's Current state. |
| Dependabot UI1915/1916/1930/1932 | Sequential, after the reopen queue. |
| Workers, waiters, chain | No worker running. Every worktree named above is clean on its branch and pushed, except `ticket-1613-weekly-language` (one unpushed commit, carried above). Zero stashes in all three repositories. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Re-arm waiters within the budget; take the Render export and release production API; start q2; launch the four base-merge rounds.
3. Drive the pushed rounds and the merges, then the web release after `ui#1980`, the smoke rerun and the Android Open release.
4. Follow `## The order`: Batch 0b (`#1651`, `#1640` then `#1648`); Batch 0c's Sentry and owner tickets; Batch 2b; Batch 4 (`#576` ui#1970, then `#577`, `#579`); Batch 5 waits on the Astra staging sweep; Batch 6 (`#1555` step 2, `#227`, `#753` closure after its release); Batch 7 (`#31`, `#32` ui#1975); Batch 8 (`#1559` orbit-api#868, `#1560` ui#1977).
5. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane and any PostgreSQL proof container. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff before pushing it: reject a fix that trades one defect for another. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, REST budget, Sleep rules: carried above (helpers added: `pair-conflicts.sh`, allowlist repair, release `sha`).
- Answer the owner first: carried (no owner message arrived).
- Production API release blocked on `#1555` and `#1650`: `#1555` fix done (`orbit-api#872`, orphan count posted on the ticket), `#1650` done (`orbit-api#873`), staging done (`bceaa597` Healthy); production carried.
- orbit-api#868 push: done (`48328a5f`, both P1 threads resolved), then a base-merge round pushed (`4d3e8a42`); CI and review carried.
- orbit-api#860: done (merged `96c274eb` after combined check a860).
- orbit-api#871: done (merged `e3204404`).
- Combined check q1 and its four merges: done (`47cf0036`, `a6d015b7`, `af9451ff`, `c6a93c5e`; layout 2669 passed).
- UI CI rounds ui#1959, ui#1967, ui#1946: CI green and approved; now conflict with `main`, carried as base-merge rounds.
- New UI PRs ui#1978, ui#1979: done (merged `e2630b88`, `e2e92897`).
- Reruns ui#1955, ui#1970, ui#1903, ui#1976, ui#1968: ui#1976 and ui#1968 done (merged); ui#1955 and ui#1903 carried as base-merge rounds; ui#1970 carried in q2.
- Approved UI PRs waiting on CI: ui#1952 done (merged); ui#1974 and ui#1972 green (carried in q2 and base-merge rounds); ui#1975 Sonar rerun carried; ui#1977 Guards fixed (`bbe0b268`) carried; ui#1973 base-merged (`902eb341`) carried; ui#1897 carried in q2; ui#1964 carried.
- Overlaps rule: carried.
- Releases: API production carried; web and Android carried; ticket closures carried.
- `#1622`, `#1630`, `#1624`, `#1534`, `#1625`, `#1627`, `#1612`, `#1623`, `#1620`, `#1626`, `#213`, Dependabot: carried (`#1624` part 1 found merged).
- "Follow the order": carried; new this relay: `#1651` (ui#1980), `#1652` (closed).

Every identifier here came from a previous session: treat each as a lead to verify.
