/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`; if that frees too little, `docker builder prune -af` and `npm cache clean --force` are rebuildable caches. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (about 18,500 entries, so run it as a background task), and read `prev-sleep-decisions-ca6cb6b3.md` (D1 to D27 of the previous session), then `prev-sleep-decisions-e101183e.md`. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above the `## Blocked, needs owner decision` heading. Redirects in Bash use literal paths (a variable in a redirect target is refused by the guardrail hook; write a script or a file with the Write tool, then run it); the shell is zsh. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`, never raw `gh issue`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`. Production SQL reads go through the carried read-only `prod-sql.sh`; on `SSL connection has been closed unexpectedly`, compare `curl -sS https://api.ipify.org` with the `operator mac` allowlist entry and repoint it with `render-allowlist-set.mjs dpg-dasotg8473hc739a5gpg-a "operator mac" <ip>/32`. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo dir> <issue>:<branch>`; `launch-review-round.sh <repo> <issue> <worktree> <base> <tier> <round> <note> <relaunch reason>`; `bm-note.sh <pr> [extra note]`; `answer-push.sh <repo> <pr> <worktree> <thread id>...`; `prstat.sh <repo name> <pr>...`; `main-overlap.sh <ci base> <pr>...`; `pair-overlap.sh <pr>...`; `tools-merge-check.sh <label> <pr>...`; `mc-detached-main.sh <label> <full sha>...` and `wait-done.sh <label>` (a predecessor's detached check: `wait-done-prev.sh`, repoint its path); `joblog.sh <repo name> <job id> <out name>`; `state-remaining.mjs --drop "#N" --add "#N"`; `render-export.mjs <postgres id>` then `wait-new-export.sh <postgres id> <started at UTC>`; `prod-sql.sh`; `ticket-pr-map.sh`; `reconcile-order.py`. Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. Copy every full SHA from `gh api .../pulls/<n> --jq .head.sha`; never complete one by hand. Redact any finished worker log with secret-shaped `NAME=value` pairs (`perl -pi` replacing values with `[REDACTED]`) before quoting it.

GitHub REST budget: `ui#1981` (`#1648`) landed, but the root checkout runs the tools it has checked out; after this handoff merges, switch the root checkout to `main` (the relay branch is squash-merged) so waiters use the shared budget.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`reconcile-order.py`): open 78, placed 78, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `42cef618`, API `main` is `b0bfe642`, landing `main` is `0d5e3df4`. Production API `b0bfe642` Healthy, staging API `b0bfe642` Healthy, production web `e56cd27c` (smoke success), staging web `e56cd27c`, production landing `0d5e3df4`, Android Open `1.3.90 (149)`. No worker, release watcher or waiter is running. Zero stashes in all three repositories; every worktree below is clean and pushed except `ticket-1613-weekly-language` (one unpushed commit `0ed1bd1f`, 45 behind main).

| Item | Disposition |
| --- | --- |
| q3 combined check | Detached in the previous session's scratchpad (`mc-q3.log`, `check-q3/`), main `e56cd27c` plus `ui#1946` `7070f4b4`, `ui#1959` `ff048533`, `ui#1967` `9fabd472`, `ui#1955` `4771d189`. vitest-web exit 1: one Chromium case in `apps/web/__tests__/components/ui/expanded-radio-text.test.tsx` (`keeps the complete editor parent field and Save/Cancel footer reachable at 1280 'en' 'dark' 32`); the other lanes so far exit 0. Find which head owns it (run that file on main, then main plus each head), route a fix round to the owning PR, then re-run the check and merge all four (each green, approved at head, 0 threads). |
| Android Open release | Next after `ui#1959` merges (its `#1628` is the last of the listed carriers); `ui#1972` and `ui#1974` are merged. If q3 takes long, release now: `#1645`'s Hermes crash fix is a live defect. Inputs: `1.3.91` (`150`) to `open` from `main`, through the android-release skill; verify Play availability. Then close the Batch 0c tickets whose acceptance is production web plus Android Open and whose code that build carries (`#1638`, `#1629`, `#1630` with a quiet `ORBIT-WEB-V`, `#1645`, `#1635`, `#753` and the rest by their bodies); `#1628` stays open until `ui#1959` merges and a later Open build carries it; `#1564` auto-closed on merge, so confirm its Android half on that build. |
| `ui#1955` (`#1618`) | Green, approved at `4771d189`, 0 threads; merges with q3. Then `#1620` (blocked by `#1618`) can launch. |
| `ui#1984` (`#577`) | New, `d86f97da`: menus on `@rn-primitives/dropdown-menu` and `@radix-ui/react-dropdown-menu`; dialogs and sheets stay on Base UI and TrueSheet per `DESIGN.md` `## Overlay` (decision D23). Deferred `#578` items are listed in its body. CI and review, read the diff, then merge. |
| `orbit-api#876` (`#1654` step 1) | Approved at `013ae8f3`; `Mutation (domain-user-invariants)` cancelled at about 45 minutes after creating 3,111 mutants for `User.cs` (its only change there is a doc comment). Root-cause the shard (scope mutation to changed lines or raise its timeout with evidence), file it as a harness ticket if it is not this PR's, then merge and release step 1 (staging, then production). |
| `ui#1930` Dependabot vite | All 35 checks green at `837c6e33`, no Pullfrog review yet: request one with `node tools/list-bot-threads.mjs --pr 1930 --repo ui --wait-seconds 900 --re-review`, then merge. Then `ui#1915` (Guards red), `ui#1916`, `ui#1932` (web unit red) one at a time. |
| `ui#1903` (`#181`) | Conflicts with main in 11 files; base-merge round after `ui#1946` merges. |
| `#1613` | After `ui#1946` merges, carry local `0ed1bd1f` onto main and publish. |
| `#1560` | Merged and in production web; stays open for its measured installed-window acceptance (CDP installability on staging, sign-in, push focus and Cmd/Ctrl+K on macOS and Windows Chrome, one PostHog `pwa_installed`). |
| `#1622`, `#1624`, `#1623`, `#1151`, `#1612`, `#1625`, `#1626`, `#213`, `#227` step 3 | Unchanged from the spec's Current state (`#1626`'s Worker detach is already satisfied; its flag listing waits on the staging MCP owner question for staging). |
| Sentry | Only `ORBIT-WEB-V` (last seen 11 h before this handoff) and `ORBIT-WEB-10` (one event) are unresolved in 24 h. `#31` closes when the API groups stay quiet; `#32` after the Android Open release and a quiet window. |
| Workers, waiters, chain | None running. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Settle q3's red, merge q3's four, release Android Open, merge `ui#1984`, `orbit-api#876`, the Dependabot queue, then the `ui#1903` and `#1613` carries.
3. Release as PRs land: production web after each merge batch (staging with `-f sha=` first), Android Open, `#1654` step 1 to staging then production.
4. Follow `## The order` for everything else, keeping the worker pool full under the load gate (`#577`'s follow-up `#579`, `#1620` after `#1618`, `#1654` steps 2 and 3).
5. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane and any PostgreSQL proof container. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with every check green (not only the required ones) and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it: reject a fix that trades one defect for another. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above (helpers added: `pair-overlap.sh`, `joblog.sh`, `state-remaining.mjs`, `wait-done-prev.sh`).
- Answer the owner first: carried (no owner message arrived).
- Re-arm waiters within the REST budget until `#1648` lands: done (`ui#1981` merged, `#1648` closed); the root checkout note above replaces it.
- q2 combined check: done (OVERALL fail=0); `ui#1974`, `ui#1970`, `ui#1897` merged; `#576` closed.
- Base-merge rounds: `ui#1972` merged (`#1638` waits on Android Open), `ui#1959` and `ui#1946` and `ui#1967` carried into q3; `ui#1955` round pushed and approved (q3); `ui#1903` and `#1613` carried.
- `ui#1980` (`#1651`): done (merged `4be333bd`, staging web release run 39943804721 recorded the SHA, `#1651` closed).
- `ui#1977` (`#1560`): merged and in production web; acceptance carried.
- `ui#1981` (`#1648`): done.
- `orbit-api#874` and `#875`: done (merged; production API `b0bfe642`; `#1555` and `#1491` closed; `Users.Handle` became `#1654`).
- Production API release bundle: done (snapshot B and a verified fresh export first, run 39947101718).
- Android Open release: carried.
- Web releases: done (staging `4be333bd` and `e56cd27c`, production `e56cd27c`); next one carried.
- Sentry: carried.
- `#1622`, `#1624`, `#1623`, `#1151`, `#1612`, `#1625`, `#1626`, `#213`, `#227` step 3: carried; `#1534`: superseded (canceled, no production Worker).
- Dependabot: carried (`ui#1930` first).
- Follow the order: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
