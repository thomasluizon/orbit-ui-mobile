/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`; if that frees too little, `docker builder prune -af` and `npm cache clean --force` are rebuildable caches. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,000 entries with `cp -c`, so run it as a background task), and read `prev-sleep-decisions-1d036b78.md` (D1 to D18 of the previous session), then `prev-sleep-decisions-16506611.md`. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (write a script or a log entry with the Write tool, then run it). Ticket writes go through `node tools/create-ticket.mjs` and `node tools/comment-ticket.mjs`, never raw `gh issue`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0` (pass it as `workspaceId`). Production SQL reads go through the carried read-only `prod-sql.sh`. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo name> <issue>:<branch>...`; `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `answer-push.sh <repo> <pr> <worktree> <thread id>...` (needs `reply-<thread>.md`; list the thread ids with `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0` first, so the identifier gate sees them); `reopen-queue.sh <pr>...`; `wait-ci-retry.sh <repo key> <pr>...` (retire it once ui#1973 merges); `after-rate-reset.sh <min remaining> <command>...` (waits for the GitHub REST limit, then runs the command); `prstat.sh <repo name> <pr>...` (newest run per check, last Pullfrog review, unresolved threads); `failed-tests.sh <pr>`; `ticket-pr-map.sh <ticket>...`; `branch-overlap.sh <worktree>`; `api-overlaps.sh <pr>...`; `reconcile-order.py`; `tf-plan-dir.sh <api tree> <label> [plan args]`. A Codex launch that ends on "Selected model is at capacity" is relaunched; with commits already made, relaunch as a continuation order that names them.

GitHub REST budget: `tools/wait-ci.mjs` costs about four requests per watched pull request per minute. Watch at most about a dozen pull requests at once until `#1648` lands, and check `gh api rate_limit` (free) before a burst of reads. A waiter exits on a read error, so while the limit is spent there is no wake source: bridge it with `after-rate-reset.sh`.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`reconcile-order.py`): open 93, placed 93, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm waiters (within the budget above). UI `main` is `0cbbb19f`, API `main` is `49fb7587`, landing `main` is `bc7baf57`. Every Pullfrog review counts only at the exact head and after its push. A pending check can still show the red of an earlier cancelled run with the same name: `prstat.sh` reads the newest run per name.

| Item | Disposition |
| --- | --- |
| Fourteen reopened approved UI PRs | ui#1965 `2555f37c`, ui#1959 `4cd2ebe1`, ui#1963 `7820eff7`, ui#1958 `8cbcc393`, ui#1955 `b240fd3d`, ui#1961 `4832f1fc`, ui#1946 `6e5ca232`, ui#1944 `2edf0d1f`, ui#1903 `5539c3fd`, ui#1897 `8be3e663`, ui#1968 `10512faf`, ui#1969 `508a3394`, ui#1970 `a2bbb735`, ui#1952 (`6c428d28`, review dismissed: request one with `--re-review`). Each APPROVED at that head with 0 threads; their CI ran on merge commits over `f060fdf1`, still pending in a deep Actions queue at relay. ui#1971 merged after them (`0cbbb19f`, CI workflow files only): each PR merges at its approved head with `gh pr merge --squash --match-head-commit <full sha>` only if it shares no file with `0cbbb19f`, otherwise a base merge and a fresh review. Order as listed. Some show a SonarCloud or unit red: read the newest run first. After ui#1958 merges, the `#1619` gamification consumer follow-up starts; after ui#1970 merges, `#577` and `#579` start; after ui#1946 merges, `#1613` carries (local `0ed1bd1f` on `fix/ticket-1613-weekly-language`). |
| ui#1967 `#62` | `85789fda`, approved; SonarCloud Code Analysis red: read it and fix through a CI round. Production web and Android Open delivery follow. |
| ui#1974 `#1645` | `5560c1fd`, approved; its mobile unit job was cut off with no log and its failed jobs were rerun (`gh run rerun 39904871484 --failed`); read the rerun. |
| ui#1975 `#32` | `badf9a9f` (round 1 pushed, thread resolved); CI and a fresh review. |
| ui#1977 `#1560` | `9fd494a4` (round 1 pushed, thread resolved); CI and a fresh review; after the web release, root checks the manifest locale and the installed window per the body. |
| ui#1964, ui#1972 `#1638`, ui#1973 `#1640`, ui#1976 `#1646` | ui#1964 carries this handoff (CI, fresh review). ui#1972 `6233d7f3`, ui#1973 `9464c53f`, ui#1976 `9af99223` approved, CI pending. For ui#1973 read the diff for gate edits and run `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs` on the merge result before merging; then launch `#1648` on the new main. |
| orbit-api#860 `#1639` | `5a98cd77` approved, but its CI predates `#859`, which also changed `AiSummaryService.cs`, and its application mutation job timed out on another PR's mutants. Merge only with every check green: after orbit-api#869 merges, base-merge #860 and get a fresh review. |
| orbit-api#869 `#1647` | `977e4c37` (mutation `--since` pinned to `HEAD^1`); CI and review. |
| orbit-api#863 `#1643`, #864 `#418`, #865 `#1642`, #867 `#1555` step 1 | Approved at heads `39e366bd`, `576d707f`, `4a0b1d41`, `c5c0229d`; CI was pending; none shares a file with #861/#862, so their CI counts. #863 and #865 both change `RunCalendarAutoSyncCommand.cs`: the second to merge needs a base merge. After #867's production release, take a fresh Render export and a second counter snapshot, then launch `#1555` step 2. |
| orbit-api#866 `#1641` | `e5986ed1` (Sonar fix pushed); CI and a fresh review. The logo serves at `/bimi/orbit.svg` after the API release. |
| orbit-api#868 `#1559` | `17e83b88`; shares `ServiceCollectionExtensions.Infrastructure.cs` with merged #862: needs CI on the new base (base merge) and review. UI halves `#1561`/`#1562` need the owner's Apple enrollment. |
| orbit-api#870 `#227` batch 3 | `8250ac4a`; CI and review. Shares `AiRescheduleSuggestionService.cs` with #860 and `ExportUserDataQuery.cs` (plus test) with #867: whichever merges later needs a fresh check. After it merges, launch the `NextDueDate` column split (lossless Down, rolling-safe, backup step). |
| `#31` | Reconciled on the ticket; closes when `#1642`, `#1643`, `#1644` are live in production and their Sentry groups stay quiet. |
| Releases | API: after #862 (merged) and the other API PRs, staging then production API releases; then a rendered check of the period insight block (`#1639`) and Sentry resolution for 1D/1B. Web: after ui#1965 and the reopened PRs, one production web release and the post-deploy smoke rerun (`#1633` closes only on 6 of 6). Android Open after ui#1959, ui#1963, ui#1972, ui#1974, through the android-release skill; verify Play availability. |
| `#1630`, `#1622`, `#1624`, `#1534`, `#1625`, `#1627`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626`, `#213` | Unchanged from the spec's Current state: `#1630` after the Android Open release and a quiet `ORBIT-WEB-V`; `#1622` Google favicon cache; `#1624` asset uploads; `#1534` after `#1626`; `#1625` owner Gmail check; `#1627` after the Astra staging sweep; `#1612` staging admin MCP; `#1623` real captures; `#1620` blocked; `#1626` after `#1635`; `#213` waits on its PostHog event prerequisites. |
| Dependabot UI1915/1916/1930/1932 | Sequential, after the reopen queue. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. Every worktree named above is clean on its branch. Zero stashes. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Re-arm waiters within the budget, then drive the in-flight rows: merges at approved green heads, the CI rounds (ui#1967 Sonar), the base merges (#860 after #869, #868), the releases and the smoke rerun.
3. Follow `## The order`: Batch 0b (`#1640` ui#1973, `#1647` orbit-api#869, then `#1648`); Batch 0c's Sentry and owner tickets; Batch 2b; Batch 3 `#249` (ui#1968); Batch 4 (`#576` ui#1970, then `#577`, `#579`); Batch 5 waits on the Astra staging sweep; Batch 6 (`#227` orbit-api#870 then the column split, `#753` ui#1969, `#1555` step 2); Batch 7 (`#31`, `#32`); Batch 8 (`#1559` orbit-api#868, `#1560` ui#1977).
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above (helpers added: `after-rate-reset.sh`, `prstat.sh`, `api-overlaps.sh`; REST budget rule added; merge rule now says every check green).
- Answer the owner first: carried (no owner message arrived).
- Launch ui#1975 round 1: done (`badf9a9f`, thread resolved).
- API merges #860, #861, #862: #861 and #862 done (`78f2d9c0`, `49fb7587`); #860 carried (stale CI, mutation timeout traced to `#1647`).
- Fifteen reopened approved UI PRs: ui#1971 done (`0cbbb19f`); fourteen carried.
- ui#1964, ui#1967, ui#1972, ui#1973, ui#1974, ui#1976, ui#1977: carried (ui#1977 round 1 done; ui#1974 rerun; ui#1967 Sonar red found).
- orbit-api#863, #864, #865, #866, #867, #868: carried (#866 CI round done).
- Launch `#227` batch 3 after #861 merges: done (orbit-api#870).
- Releases, `#1630`, `#1622`, `#1624`, `#1534`, `#1625`, `#1627`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626`, `#213`, Dependabot: carried.
- "Follow the order": carried; new this relay: `#1647` (orbit-api#869), `#1648`, and the `#31` reconciliation.

Every identifier here came from a previous session: treat each as a lead to verify.
