/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`; if that frees too little, `docker builder prune -af` and `npm cache clean --force` are rebuildable caches. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,500 entries, so run it as a background task), and read `prev-sleep-decisions-df5da99d.md` (D1 to D10 of the previous session), then `prev-sleep-decisions-ca6cb6b3.md`. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (a variable in a redirect target is refused by the guardrail hook; write a script or a file with the Write tool, then run it); the shell is zsh. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`, never raw `gh issue`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`. Production SQL reads go through the carried read-only `prod-sql.sh`; on `SSL connection has been closed unexpectedly`, compare `curl -sS https://api.ipify.org` with the `operator mac` allowlist entry and repoint it with `render-allowlist-set.mjs dpg-dasotg8473hc739a5gpg-a "operator mac" <ip>/32`. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo dir> <issue>:<branch>`; `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `bm-note.sh <pr> [extra note]`; `answer-push.sh <repo> <pr> <worktree> <thread id>...`; `prstat.sh <repo name> <pr>...`; `main-overlap.sh <ci base> <pr>...`; `pair-overlap.sh <pr>...`; `tools-merge-check.sh <label> <pr>...`; `mc-detached-main.sh <label> <full sha>...` and `wait-done.sh <label>` (a predecessor's detached check: `wait-done-prev.sh`, repoint its path); `joblog.sh <repo name> <job id> <out name>`; `state-remaining.mjs --drop "#N" --add "#N"`; `render-export.mjs <postgres id>` then `wait-new-export.sh <postgres id> <started at UTC>`; `prod-sql.sh`; `ticket-pr-map.sh`; `reconcile-order.py`. Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. Copy every full SHA from `gh api .../pulls/<n> --jq .head.sha`; never complete one by hand. Redact any finished worker log with secret-shaped `NAME=value` pairs (`perl -pi` replacing values with `[REDACTED]`) before quoting it.

GitHub REST budget: `ui#1981` (`#1648`) landed, but the root checkout runs the tools it has checked out; after this handoff merges, switch the root checkout to `main` (the relay branch is squash-merged) so waiters use the shared budget.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`reconcile-order.py`): open 79, placed 79, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending. Helpers added this session: `board-map.sh` (every open ticket mapped to its pull requests; prints tickets with none), `q3-bisect.sh` and `q3-prove-1607.sh` (examples of a one-file Chromium bisect on scratch trees).

## In flight

UI `main` is `22f4227f`, API `main` is `b0bfe642`, landing `main` is `0d5e3df4`. Production API and staging API `b0bfe642`, production and staging web `e56cd27c`, production landing `0d5e3df4`. Zero stashes in all three repositories. No worker is running. The only unpushed commit is `ticket-1613-weekly-language` `0ed1bd1f`.

| Item | Disposition |
| --- | --- |
| Android Open `1.3.91` (`150`) | Dispatched from main `42cef618`, run 39956909127; a `wait-release.mjs` watcher was live at relay. Read the run result, verify Play Open availability (Play API first), then close the Batch 0c tickets whose acceptance is production web plus Android Open and whose code this build carries (`#1638`, `#1629`, `#1630` with a quiet `ORBIT-WEB-V`, `#1645`, `#1635`, `#753` and the rest by their bodies; confirm `#1564`'s Android half). `#1628` stays open until `ui#1959` merges and a later Open build carries it. |
| `ui#1985` (relay docs) | Head carries this handoff, the `#1628` thread fix (answered and resolved) and the release skill calibration reseed (tools and hooks harnesses exit 0). Main's Guards calibration step fails on every PR until it merges. Merge on green plus approval, then switch the root checkout to `main`. |
| `ui#1946` (`#1607`) | `e25fca64`: the q3 owner fix `03ae2e58` plus a clean base merge of main (GitHub had marked it dirty and ran no CI). CI and a fresh review are pending. |
| q3 four | `ui#1946`, `ui#1959` `ff048533`, `ui#1967` `9fabd472`, `ui#1955` `4771d189` (approved). The detached q3 layout lane in the previous-but-one scratchpad (`ca6cb6b3`, `check-q3/layout.log`, `summary.txt`) was at 744 of 2,669 with no failure; read its result. Then run one combined check of main plus the four current heads (`mc-detached-main.sh`) and merge each that is green, approved at head, 0 threads. Then `#1620` (blocked by `#1618`) can launch. |
| `ui#1984` (`#577`) | `d86f97da`, 8 red checks: Guards (the stale calibration on main, cleared by `ui#1985`) and real reds in surface manifest (`node tools/surface-manifest.mjs`), Web unit chromium 2/8 and 4/8, jsdom 1/2, Workspace unit shared and mobile, Layout shard 1 and the Authed Today Lighthouse budget. A CI waiter was live. Collect every failing job log (`joblog.sh`), route one deep fix round, read the diff, then merge. `#579` follows it. |
| `orbit-api#877` (`#1655`) | Worker PR, read: PR mutation runs mutate only token-changed new-side spans (a Roslyn helper drops comment-only hunks) and `User.cs` splits into five nightly span shards. Acceptance: its `workflow_dispatch` full-matrix run 39958472456 shows every domain shard inside 45 minutes; then CI, review, merge. |
| `orbit-api#876` (`#1654` step 1) | Approved at `013ae8f3`; only `Mutation (domain-user-invariants)` failed (timeout). After `orbit-api#877` merges, base-merge `#876` so its mutation workflow re-runs on the new matrix, then merge and release step 1 (staging with `-f sha=`, then production). |
| Dependabot `ui#1915`, `ui#1916`, `ui#1932` | Conflict on `package-lock.json` after `ui#1930` merged. After `ui#1985` lands, ask Dependabot to rebase one at a time (`@dependabot rebase`), then merge each on green and approval. |
| `ui#1903` (`#181`) | Conflicts with main; base-merge round after `ui#1946` merges. |
| `#1613` | After `ui#1946` merges, carry local `0ed1bd1f` onto main and publish. |
| `#1617`, `#1627` | Merged as `orbit-api#853` and `#854` and live in production; the local worktrees only look ahead because of the squash. They stay open for the real-call Astra sweep. |
| `#1560`, `#1622`, `#1624`, `#1623`, `#1151`, `#1612`, `#1625`, `#1626`, `#213`, `#227` step 3 | Unchanged from the spec's Current state. |
| Sentry | `#31` closes when the API groups stay quiet; `#32` after the Android Open release and a quiet window. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Settle the Android Open release and its ticket closures; merge `ui#1985` and switch the root checkout to `main`.
3. Drive `ui#1946`, then the q3 combined check and merges, `ui#1984`'s fix round, `orbit-api#877` then `#876`, the Dependabot queue, then the `ui#1903` and `#1613` carries.
4. Release as PRs land: production web after each merge batch (staging with `-f sha=` first), another Android Open after `ui#1959` merges, `#1654` step 1 to staging then production.
5. Follow `## The order` for everything else, keeping the worker pool full under the load gate (`#579` after `#577`, `#1620` after `#1618`, `#1654` steps 2 and 3).
6. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane and any PostgreSQL proof container. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it: reject a fix that trades one defect for another. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above (decision log pointer moved to this session's log).
- Answer the owner first: carried (no owner message arrived).
- Root checkout to `main` after the relay docs merge: carried (the relay docs PR is now `ui#1985`).
- q3 combined check: owner found (`ui#1946`, bisect 5 runs per tree), fix pushed; the re-check and merges are carried.
- Android Open release: done as a dispatch (run 39956909127, `1.3.91` (`150`)); verification and ticket closures carried; `#1628` excluded.
- `ui#1955`: carried with q3.
- `ui#1984`: carried with its red-check fix round.
- `orbit-api#876`: root-caused; `#1655` filed, `orbit-api#877` opened; merge and release carried.
- `ui#1930`: done (merged `22f4227f`); `ui#1915`, `ui#1916`, `ui#1932` carried.
- `ui#1903`, `#1613`: carried.
- `#1560`, `#1622`, `#1624`, `#1623`, `#1151`, `#1612`, `#1625`, `#1626`, `#213`, `#227` step 3, Sentry: carried.
- Then-in-order steps 1 to 5: carried as steps 1 to 6 above.

Every identifier here came from a previous session: treat each as a lead to verify.
