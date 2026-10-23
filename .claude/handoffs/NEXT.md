/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`; if that frees too little, `docker builder prune -af` and `npm cache clean --force` are rebuildable caches. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,000 entries with `cp -c`, so run it as a background task), and read `prev-sleep-decisions-16506611.md` (D1 to D27 of the previous session), then `prev-sleep-decisions-e07e969e.md`. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (write a script or a log entry with the Write tool, then run it). Ticket writes go through `node tools/create-ticket.mjs` and `node tools/comment-ticket.mjs`, never raw `gh issue`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. Production SQL reads go through the carried read-only `prod-sql.sh`. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo name> <issue>:<branch>...` (repo name such as `orbit-api`, not a path); `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `answer-push.sh <repo> <pr> <worktree> <thread id>...` (needs `reply-<thread>.md`); `reopen-queue.sh <pr>...`; `wait-ci-retry.sh <repo key> <pr>...` (retire it once ui#1973 merges); `failed-tests.sh <pr>`; `ticket-pr-map.sh <ticket>...`; `branch-overlap.sh <worktree>`; `reconcile-order.py`; `tf-plan-dir.sh <api tree> <label> [plan args]`. Thread ids for `resolve-bot-thread.mjs` come from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0`. A Codex launch that ends on "Selected model is at capacity" is relaunched; if its tree already holds the finished, tested diff, read it and commit it at root as a review fix.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`reconcile-order.py`): open 91, placed 91, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm a waiter for every open pull request below (use `wait-ci-retry.sh` until ui#1973 merges). UI `main` is `f060fdf1`; API `main` is `92436cd5`; landing `main` is `bc7baf57`. Every Pullfrog review counts only at the exact head and after its push. A pending check can still show the red of an earlier cancelled run with the same name: read the run before calling it red.

| Item | Disposition |
| --- | --- |
| Fifteen reopened approved UI PRs | ui#1971 `2477be89`, ui#1965 `2555f37c`, ui#1959 `4cd2ebe1`, ui#1963 `7820eff7`, ui#1958 `8cbcc393`, ui#1955 `b240fd3d`, ui#1961 `4832f1fc`, ui#1946 `6e5ca232`, ui#1944 `2edf0d1f`, ui#1903 `5539c3fd`, ui#1897 `8be3e663`, ui#1952 (snapshot bot moved it to `6c428d28`; needs a fresh review), ui#1968 `10512faf`, ui#1969 `508a3394`, ui#1970 `a2bbb735`. Each was APPROVED at that head with 0 threads; they were reopened again so every merge commit's first parent is `f060fdf1`, and the new runs are pending. Merge each green one with `gh pr merge --squash --match-head-commit <full sha>`, in this order. A real red is fixed through a review round; a conflict after an earlier merge gets a base merge and a fresh review. After ui#1958 merges, the `#1619` gamification consumer follow-up starts; after ui#1970 merges, `#577` and `#579` start; after ui#1946 merges, `#1613` carries. |
| ui#1964 | `a59bbcc4` plus this handoff's commit (relay docs and the design-reviewer calibration reseed); needs CI and a fresh review. |
| ui#1967 `#62` | `85789fda`; CI nearly done; needs a fresh review. Production web and Android Open delivery follow. |
| ui#1972 `#1638` | `6233d7f3` (surface manifest fix after Pullfrog approved `8ce4d943`); CI pending. If the incremental review posts none, request one with `--re-review`. Ships in the next production web release and Android Open. |
| ui#1973 `#1640` | `9464c53f` (review round 1 answered and resolved); CI and a fresh review. Read the diff for gate edits before merging; run `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs` on the merge result. |
| ui#1974 `#1645` | `5560c1fd`; CI and review. Its two i18n templates reproduce the CLDR list patterns (no copy change). |
| ui#1975 `#32` | `5b49722f`; Pullfrog thread `PRRT_kwDOR5Siws6vfnCC` (Play connection failure leaves both Android paywalls loading). Launch round 1 first with `note-32-r1.md`, default tier, on worktree `ticket-32-web-mobile-sentry`. |
| ui#1976 `#1646` | `9af99223` (regression tests; the loop does not reproduce on `main`); CI and review. |
| ui#1977 `#1560` | `395c64ec` (desktop install, `parity:exempt`); CI and review; after the web release, root checks the installed window on staging per the ticket. |
| orbit-api#860 `#1639`, #861 `#227`, #862 `#1644` | All checks green at `5a98cd77`, `f4111f08`, `2aa015f7`. Confirm Pullfrog approval and zero threads at each head, then merge; then the staging and production API releases and a rendered check of the period insight block (`#1639`). After #861 merges, launch `#227` batch 3 (remaining adapters and the `NextDueDate` split) with `note-227-b2.md` updated. |
| orbit-api#863 `#1643`, #865 `#1642` | CI and review. Both change `RunCalendarAutoSyncCommand.cs`; the second to merge needs a base merge. |
| orbit-api#864 `#418` | `576d707f`, the recovery proof with the root mutation evidence; CI and review. |
| orbit-api#866 `#1641` | `1fe836ef`; SonarCloud Code Analysis is red: read it and fix through a round. The logo serves at `/bimi/orbit.svg` after the API release. |
| orbit-api#867 `#1555` step 1 | `c5c0229d`; CI and review; after its production release, take a fresh Render export and a second counter snapshot, then launch step 2 (the drop) per the ticket comments. |
| orbit-api#868 `#1559` | `17e83b88` (7 commits); CI and review. Its UI halves `#1561`/`#1562` need the owner's Apple enrollment. |
| Releases | After ui#1965 and the reopened PRs merge: one production web release, then rerun the post-deploy smoke; `#1633` closes only on 6 of 6. After ui#1959 `#1628`, ui#1963 `#1635`, ui#1972 and ui#1974 merge: an Android Open release through the android-release skill; verify Play availability and close what it completes. API releases after the API PRs merge. |
| `#1630`, `#1622`, `#1624`, `#1534`, `#1625`, `#1627`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626`, `#213` | `#1630` closes after the Android Open release carries the shared validator and Sentry `ORBIT-WEB-V` shows no new events. `#1622` waits on Google's favicon cache. `#1624`: the pt-BR feature graphic (with `#1623`) and the profile uploads of the regenerated covers and marks from `thomas-brain` `orbit/brand/outputs.json` remain. `#1534`: cancel once `#1626` detaches the routing Worker route. `#1625` waits on the owner's Gmail app check. `#1627` waits for the Astra staging sweep; `#1612` waits on the staging admin Orbit MCP; `#1623` needs real captures; `#1620` is blocked; `#1626` follows `#1635`; `#213` needs its event prerequisites confirmed in PostHog first. |
| Dependabot UI1915/1916/1930/1932 | Sequential, after the reopen queue. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. Every worktree named above is clean on its branch. Zero stashes. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Launch ui#1975 round 1, then drive the in-flight rows: the API merges (#860, #861, #862 are green), the reopen-and-merge queue, the remaining PRs, the releases and the smoke rerun.
3. Follow `## The order`: Batch 0b (`#1637` ui#1971, `#1640` ui#1973); Batch 0c's Sentry and owner tickets; Batch 2b; Batch 3 `#249` (ui#1968); Batch 4 (`#576` ui#1970, then `#577`, `#579`); Batch 5 waits on the Astra staging sweep; Batch 6 (`#227` batch 3, `#753` ui#1969, `#1555` step 2); Batch 7 (`#31`, `#32`); Batch 8 (`#1559` orbit-api#868, `#1560` ui#1977).
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above (helpers added: `answer-push.sh`, `branch-overlap.sh`, `reconcile-order.py`; disk cleanup fallback added).
- Answer the owner first: carried (no owner message arrived).
- Launch `#1642`, `#1643`, `#1645`, `#32`: done (orbit-api#865, orbit-api#863, ui#1974, ui#1975).
- Sixteen reopened approved UI PRs, merge in order: carried as fifteen plus ui#1964; all reopened again because their runs merged into old main `ea102cc9`.
- ui#1967, ui#1972, ui#1973, orbit-api#860, #861, #862: carried (ui#1972 got the manifest fix, ui#1973 its review round; the three API PRs are green).
- `#418` publication: done (orbit-api#864; 21 of 21 guard gaps killed).
- Releases, `#1630`, `#1622`, `#1624`, `#1534`, `#1625`, `#1641`, `#1627`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626`, Dependabot: carried (`#1641` scope 1 is orbit-api#866).
- "Follow the order": carried; new this relay: `#1646` filed and delivered (ui#1976), `#1555` step 1 (orbit-api#867), `#1559` (orbit-api#868), `#1560` (ui#1977), the `#32` triage comment.

Every identifier here came from a previous session: treat each as a lead to verify.
