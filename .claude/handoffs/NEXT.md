/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (it clones about 18,000 entries with `cp -c`, so run it as a background task), and read `prev-sleep-decisions-e07e969e.md` (D1 to D22 of the previous session), then `prev-sleep-decisions-f233d076.md`. Run `carry-out.sh` after every few decisions and before any relay. Redirects in Bash use literal paths (write a script or a log entry with the Write tool, then run it). Ticket writes go through `node tools/create-ticket.mjs` and `node tools/comment-ticket.mjs`, never raw `gh issue`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo dir> <issue>:<branch>...`; `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `reopen-queue.sh <pr>...` (close and reopen at the same head); `wait-ci-retry.sh <repo key> <pr>...` (reruns `tools/wait-ci.mjs` after a read error; retire it once ui#1973 merges); `failed-tests.sh <pr>`; `ticket-pr-map.sh <ticket>...`; `tf-plan-dir.sh <api tree> <label> [plan args]`. Thread ids for `resolve-bot-thread.mjs` come from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0`. A Codex launch that ends on "Selected model is at capacity" is relaunched; if its tree already holds the finished, tested diff, read it and commit it at root as a review fix.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 90, placed 90, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm a waiter for every open pull request below (use `wait-ci-retry.sh` until ui#1973 merges). UI `main` is `f060fdf1`; API `main` is `92436cd5`; landing `main` is `bc7baf57`. Every Pullfrog review counts only at the exact head and after its push.

| Item | Disposition |
| --- | --- |
| Sixteen reopened approved UI PRs | ui#1971 `2477be89`, ui#1965 `2555f37c`, ui#1959 `4cd2ebe1`, ui#1963 `7820eff7`, ui#1958 `8cbcc393`, ui#1955 `b240fd3d`, ui#1961 `4832f1fc`, ui#1946 `6e5ca232`, ui#1944 `2edf0d1f`, ui#1903 `5539c3fd`, ui#1897 `8be3e663`, ui#1952 `03c81672`, ui#1968 `10512faf`, ui#1969 `508a3394`, ui#1970 `a2bbb735`, ui#1964 `8523d8a2` (this handoff's branch; it gains this handoff's commit, so it needs a fresh review). Each was APPROVED at that head with 0 threads and reopened on main `f060fdf1`. Read the newest run per workflow; merge each green one with `gh pr merge --squash --match-head-commit <full sha>`, in this order. A real red is fixed through a review round. A PR that conflicts after an earlier merge gets a base merge and a fresh review. After ui#1958 merges, the `#1619` gamification consumer follow-up starts; after ui#1970 merges, `#577` and `#579` start. |
| ui#1967 `#62` | `85789fda` pushed with a CI round section in the body; waits on CI and a fresh review. Production web and Android Open delivery follow. |
| ui#1972 `#1638` | `8ce4d943` (owner report, Ver no Progresso). Waits on CI and review. Ships in the next production web release and Android Open. |
| ui#1973 `#1640` | `24d44604` (transient GitHub reads). Waits on CI and review; read the diff for gate edits before merging; run `node tools/test-tools.mjs` and `node .claude/hooks/test-hooks.mjs` on the merge result. |
| orbit-api#860 `#1639` | `5a98cd77` (owner report, `**` and English narrative). Waits on CI and review; then staging and production API releases and a rendered check of the period insight block. |
| orbit-api#861 `#227` | Step 2 batch 2 at `f4111f08`. Waits on CI and review; after it merges, launch batch 3 (the remaining adapters and the `NextDueDate` split) with `note-227-b2.md` updated. |
| orbit-api#862 `#1644` | `2aa015f7` (rate-limit overflow and MCP request id). Arm a waiter; waits on CI and review. |
| `#1642`, `#1643`, `#1645`, `#32` | Prepared, never started (refused by the relay drain). Launch first, from their existing clean worktrees and orders: `#1642` deep with `note-1642.md` (no PostgreSQL harness; use the existing concurrency test patterns), `#1643` default, `#1645` default, `#32` deep with `note-32.md` (live Sentry groups). |
| `#418` | The detached root Stryker run finished: `root-result.exit` is `0` in the packet `418-root-mutation-576d` (chain scratchpad `6f988b14`). Read the dispositions per owner, confirm the 21 guard-gap mutants are killed, compose the body (Tracks) from `report-418-survivors-576d707f.md` and publish `576d707f` (`thomasluizon/ticket-418-recovery-proof`) once. |
| Releases | After ui#1965 and the reopened PRs merge: one production web release, then rerun the post-deploy smoke; `#1633` closes only on 6 of 6. After ui#1959 `#1628`, ui#1963 `#1635` and ui#1972 merge: an Android Open release through the android-release skill; verify Play availability and close what it completes. API releases after orbit-api#860, #861 and #862 merge. |
| `#1630`, `#1622`, `#1624`, `#1534`, `#1625`, `#1641` | `#1630` closes after the Android Open release carries the shared validator and Sentry `ORBIT-WEB-V` shows no new events. `#1622` waits on Google's favicon cache. `#1624`: pt-BR feature graphic and profile uploads remain. `#1534`: cancel once `#1626` detaches the routing Worker route. `#1625` waits on the owner's Gmail app check. `#1641`: prepare the BIMI SVG Tiny PS file from the canonical mark (rebuildable source, served over HTTPS); the certificate or account path is the owner's choice. |
| `#1627`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626` | Unchanged: `#1627` waits for the Astra staging sweep; `#1612` waits on the staging admin Orbit MCP; `#1623` needs real captures; `#1613` carries after `#1607` (ui#1946) merges; `#1620` is blocked; `#1626` follows `#1635`. |
| Dependabot UI1915/1916/1930/1932 | Sequential, after the reopen queue. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. Worktrees for `#1642`, `#1643`, `#1645` and `#32` are clean on their branches. Zero stashes. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Launch `#1642`, `#1643`, `#1645` and `#32`, then drive the in-flight rows: the reopen-and-merge queue, ui#1967, ui#1972, ui#1973, orbit-api#860, #861 and #862, `#418`'s publication, the production web release and smoke rerun, the Android Open release and the API releases.
3. Follow `## The order`: Batch 0b (`#1637` ui#1971, `#1640` ui#1973); Batch 0c's new Sentry and owner tickets; Batch 2b; Batch 3 `#249` (ui#1968); Batch 4 (`#576` ui#1970, then `#577`, `#579`); Batch 5 waits on the Astra staging sweep and `#418`; Batch 6 (`#227` batch 3, `#753` ui#1969); Batch 7 (`#31` and `#32` through their root-cause tickets); then Batch 8.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above (helpers added: `reopen-queue.sh`, `wait-ci-retry.sh`; ticket writes through the tools).
- ui#1966 first: done (merged as `f060fdf1` at `dd6537dd`).
- Fourteen approved PRs reopen-and-merge queue: carried as sixteen (ui#1971 and ui#1964 joined); all reopened at their heads on `f060fdf1`, merges pending green.
- ui#1967 push: done (`85789fda`); CI and review carried.
- ui#1971: carried in the reopen queue (approved at `2477be89`).
- ui#1964 docs: carried (gains this handoff's commit).
- orbit-api#859 merge and batch 2: done (merged `92436cd5`; batch 2 is orbit-api#861).
- `#272` rendered check: done (closed with the evidence comment).
- `#418` Stryker acceptance and publication: carried (the run finished with exit 0).
- Releases, `#1630`, `#1622`, `#1624`, `#1534`, `#1627`, `#1625`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626`, Dependabot: carried.
- "Follow the order": carried; owner reports filed and started as `#1638` (ui#1972) and `#1639` (orbit-api#860); `#1640` (ui#1973), `#1641` and the Sentry tickets `#1642` to `#1645` filed; `#1644` is orbit-api#862.

Every identifier here came from a previous session: treat each as a lead to verify.
