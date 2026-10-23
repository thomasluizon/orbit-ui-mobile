/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (it clones about 18,000 entries with `cp -c`, so run it as a background task), update the session line in `open-log.sh` (the header names the session and the one it relays), and read `prev-sleep-decisions-f233d076.md` (D1 to D24 of this chain's tenth session), then `prev-sleep-decisions-6f988b14.md`. Run `carry-out.sh` after every few decisions and before any relay. Redirects in Bash use literal paths (write a script or a log entry with the Write tool, then run it). Ticket comments go through `node tools/comment-ticket.mjs`, never raw `gh issue comment`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo dir> <issue>:<branch>...` (creates from `main`, never touches an existing folder); `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>` for commit-only review rounds; `failed-tests.sh <pr>`; `ticket-pr-map.sh <ticket>...`; `tf-plan-dir.sh <api tree> <label> [plan args]` for read-only targeted plans (pass `-var production_redesign_web_digest=<live web digest>`). Thread ids for `resolve-bot-thread.mjs` come from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0`. Landing `main` requires up-to-date branches: after each landing merge, `gh pr update-branch` the next landing PR; GitHub then shows the old approval at the new head, but it counts only if submitted after that push, so request `--re-review`. A Codex launch that ends on "Selected model is at capacity" is relaunched; if its tree already holds the finished, tested diff, read it and commit it at root as a review fix.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 83, placed 83, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm `tools/wait-ci.mjs` for every open pull request below. UI `main` is `ea102cc9`; API `main` is `6963761f`; landing `main` is `bc7baf57`. Every Pullfrog review counts only at the exact head and after its push.

| Item | Disposition |
| --- | --- |
| ui#1966 `#1630` test fix | `dd6537dd`, APPROVED at that head; the fresh run's `PR Tests` (run 39892299816) is green on every job, layout shards were still running. The rollup still lists the old run's red `Unit Tests`; read the newest run per workflow. All green: merge with `--match-head-commit`. It unblocks every open UI pull request. |
| Approved UI PRs waiting only on main's jsdom red | ui#1965 `2555f37c`, ui#1959 `4cd2ebe1`, ui#1963 `7820eff7`, ui#1958 `8cbcc393`, ui#1955 `b240fd3d`, ui#1961 `4832f1fc`, ui#1946 `6e5ca232`, ui#1944 `2edf0d1f`, ui#1903 `5539c3fd`, ui#1897 `8be3e663`, ui#1952 `03c81672`, ui#1968 `10512faf`, ui#1969 `508a3394`, ui#1970 `a2bbb735`: each was APPROVED at its exact head with 0 threads (re-read before merging). After ui#1966 merges, close and reopen each at the same head in this order, wait for green, merge with `--match-head-commit`, using the local merge-result check where the base moved onto a shared file. After ui#1958 merges, the `#1619` gamification consumer follow-up starts. |
| ui#1967 `#62` | Remote `c313fc7e` (APPROVED there); two local commits in `ticket-62-referral-reward`: `3bdf0fd15` (Sonar paths) and `85789fda8` (query client for the share sheet and Wrapped player geometry tests; mobile 14 of 14 in the worker, web Chromium 14 of 14 at root). Push both once after ui#1966 merges, then CI and a fresh review. Copy already approved. Production web and Android Open delivery follow. |
| ui#1971 `#1637` CI rerun artifacts | `2477be89` (attempt-qualified shard artifacts and a newest-attempt selector in `tools/`); waits on CI and review. Read the diff for gate edits before merging. The installed `download-artifact` lists artifacts with `latest: true`, and a rerun's artifact can carry a lower id than the stale one, so check the fix against that source. |
| ui#1964 docs | This handoff's PR; merge after CI and review. |
| orbit-api#859 `#227` step 2 batch 1 | `52f8202e`, APPROVED at that head; waits on CI. Merge, then launch batch 2 (domain Create/Update/Log/Unlog branching, commands and validators, profile and gamification, chat and MCP, sync and export, seed, `HabitFieldSummary`, the `NextDueDate` property and column split) with `note-227.md` updated to name batch 1 as merged. |
| `#272` | Merged and live at `bc7baf57`. Do the rendered check in the open Chrome window (claude-in-chrome): the waitlist widget renders on `useorbit.org` at the window's width and at a phone width, then close `#272` with the evidence. |
| `#418` | `576d707f` on `thomasluizon/ticket-418-recovery-proof`, no PR. The detached root Stryker run writes into the packet `418-root-mutation-576d` in the scratchpad of the chain session that started it; `pgrep -fl Stryker.CLI` shows its `--output` directory. When `root-result.exit` appears in that packet, read the dispositions per owner, confirm the 21 guard-gap mutants are killed, compose the body (Tracks) from `report-418-survivors-576d707f.md` and publish once. If the run died, relaunch it with `launch-root-mutation.py` in that packet. |
| Releases | After ui#1965 and the reopened approved PRs merge: one production web release, then rerun the post-deploy smoke; `#1633` closes only on 6 of 6. After ui#1959 `#1628` and ui#1963 `#1635` merge: an Android Open release through the android-release skill; verify Play availability and close what it completes. |
| `#1630`, `#1622`, `#1624`, `#1534` | `#1630` closes after the Android Open release carries the shared validator and Sentry `ORBIT-WEB-V` shows no new events. `#1622` waits on Google's favicon cache. `#1624`: pt-BR feature graphic and profile uploads remain. `#1534`: cancel once `#1626` detaches the routing Worker route. |
| `#1627`, `#1625`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626` | Unchanged: `#1627` waits for the Astra staging sweep; `#1625` waits on the owner's phone check; `#1612` waits on the staging admin Orbit MCP; `#1623` needs real captures; `#1613` carries after `#1607` (ui#1946) merges; `#1620` is blocked; `#1626` follows `#1635`. |
| Dependabot UI1915/1916/1930/1932 | Sequential, unchanged. |
| Workers, waiters, chain | No worker running. The `#418` Stryker run is detached and outlives the relay. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows: ui#1966 first, then the reopen-and-merge queue, ui#1967's push, ui#1971, orbit-api#859 and its batch 2, the production web release and smoke rerun, the Android Open release, and `#272`'s rendered check.
3. Follow `## The order`: Batch 0b `#1637` (ui#1971); Batch 0c and Batch 2b remain only on named conditions; Batch 3 has `#249` (ui#1968) and `#272`'s check; Batch 4 `#576` is ui#1970 and `#577`/`#579` start after it merges; Batch 5 waits on the Astra staging sweep and `#418`; Batch 6 has `#227` (step 2 in flight) and `#753` (ui#1969); then Batch 7 onward.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above (helpers updated: `launch-review-round.sh`, `tf-plan-dir.sh`, the capacity-relaunch and landing re-review rules).
- ui#1966 first: carried (fresh run green; the rerun could not clear the aggregate, which `#1637` fixes in ui#1971).
- Ten approved PRs: carried, joined by ui#1952, ui#1968, ui#1969 and ui#1970 in one reopen queue.
- ui#1965, ui#1964, Dependabot, Android, `#1630`, `#1622`, `#1627`, `#1625`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626`, `#1624`, `#1534`: carried.
- ui#1967 waits on CI and review: superseded by the two local fix commits to push after ui#1966.
- ui#1968 waits on CI and review: carried in the reopen queue (approved at `10512faf`).
- landing#117 merge and landing release: done (`dedd3fc4`; production landing `bc7baf57`; `#280` closed).
- landing#118 Turnstile key and merge: done (key on both Render landing sites and the CI variable, review fix `66f73d4`, merged `bc7baf57`, released); the rendered check is carried.
- `#418` root mutation acceptance and publication: carried (run still mutating).
- "Follow the order": carried; Batch 4 started (`#576`), Batch 6 started (`#753`, `#227` step 2), `#1636` filed and closed, `#1637` filed and published as ui#1971.

Every identifier here came from a previous session: treat each as a lead to verify.
