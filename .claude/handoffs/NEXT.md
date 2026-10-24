/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting live defects: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; build his orders in full or not at all; never mention rotating an API key that showed in a log; and do every step yourself that needs no password, 2FA or payment from him ("why is that waiting on me? just do it yourself"): when an MCP reaches the wrong account, use `claude-in-chrome`.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB. A `max` UI worker holds about 36 GiB of temporary files while it runs, so check the floor before launching one. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run` (its `SKIP_SESS` already lists `d478b40e`, `c609480b`, `d6298537` and `62304552`; add `71945967` and the new session's 8-character id); run the carried `nm-prune.sh dry`, then `run`; remove only rebuildable build output (`apps/web/.next`) from proof trees whose ticket work is merged; clear `npm`, Homebrew, `uv` and Gradle transform caches. Docker images and volumes belong to other projects. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad. Read the previous session's carried `prev-sleep-decisions-71945967.md` (D1 to D16; before it `prev-sleep-decisions-d478b40e.md` D1 to D28 and `prev-sleep-decisions-c609480b.md` D1 to D27) first. Run `carry-out.sh` after every few decisions and before any relay. `log.sh` inserts each entry above `## Blocked, needs owner decision`. Redirects in Bash use literal paths (the guardrail refuses a variable or a command substitution in a redirect target; write the file with the Write tool or a script); the shell is zsh, so `set -- $var` does not split words: write a script. Ticket writes go through `node tools/create-ticket.mjs`, `node tools/comment-ticket.mjs` and `node tools/complete-ticket.mjs`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit, Orbit Staging); Gmail for Orbit mail is Gmail web in `claude-in-chrome` (`thomaslrgregorio@gmail.com`). Play Console Open testing for the production app: `https://play.google.com/console/u/0/developers/4913102794253829646/app/4976229514306926604/tracks/open-testing`. The Render MCP workspace is `tea-ctg9ljtumphs73dep1o0`; staging web is `https://orbit-web-staging-eakn.onrender.com`, production web `https://orbit-web-3qmv.onrender.com`, staging API `https://orbit-api-staging-uqu2.onrender.com`. Carried helpers: `launch-new-ticket.sh`, `launch-review-round.sh <key> <issue> <worktree> <base> <tier> <round> <note> <reason>`, `new-worktrees.sh`, `prstat.sh <repo name> <pr>...`, `base-overlap.sh <pr>...`, `answer-push.sh <key> <pr> <worktree> [thread]...` (reply files `reply-<thread>.md`), `layout-check.sh <label> <head sha> <spec>...` (root hermetic layout run in `mc-<label>`, output `layout-<label>/`), `repro-1984.sh <head sha> <spec>...`, `mc-full.sh <label> <head sha>...` (UI combined check), `api-combined.sh <label> <head sha>...`, `poll-checks.sh`, `log.sh`, `carry-out.sh`, `scratch-wt-prune.sh`, `prod-sql.sh`, `staging-sql.sh`, `render-allowlist-set.mjs`; `../joblogs.sh <repo name> <job id>...` (one level above the scratchpad) saves failed CI job logs. All hermetic layout runs take the session lock `<scratchpad>/playwright.lock`. Thread ids come only from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --wait-seconds 0 --no-request`. Before any push, run `git merge-tree --write-tree --name-only origin/main HEAD` in the worktree. Copy every full SHA from `gh api .../pulls/<n> --jq .head.sha`.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 74, placed 74, unplaced 0, placed twice 0 (`#1613` closed, `#1669` filed and placed in Batch 0b). Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `f587be05`, API `main` is `78ca5334`, landing `main` is `0d5e3df4`. Production and staging web `f587be05` (runs 40056393401 and 40056095067, Post-deploy smoke success); staging and production API `78ca5334`; production landing `0d5e3df4`. Android Open `1.3.93` (`152`) is available. Open pull requests: UI `#2005`, `#2004`, `#2003`, `#1998`, `#1991`, `#1990`, `#1989` (relay docs), `#1984`; API `#877`, `#876`; landing none. No worker is running.

| Item | Disposition |
| --- | --- |
| `ui#2005` (`#1668`, owner order) | Published `b06f7b0d`; local rounds 3 `74f21b07` and 4 `dfc34ac1` in `ticket-1668-astra-mark-only`, not pushed. Run `layout-check.sh 2005r4 dfc34ac1263ba639dfddc9e6cc4ddf66e5332e59` on the 24 spec files in `fail-2005-specs.txt` (second column) plus `e2e/layout/label-fit-composer-placeholder.spec.ts`; push only on layout exit 0 (body first: rounds 3 and 4 and the inventory `design/astra-mark-only-surfaces.md`), then CI, a fresh Pullfrog review, merge, release web. |
| `ui#1984` (`#577`) | Pushed `9df648be` (root layout 223 of 223 on the eight spec files). Wait for CI: its last reds were Authed Today Lighthouse, layout shards 1 to 3, Upgrade geometry and SonarCloud. Fix any red with a `max` round (recorded reason), then a fresh review, merge, release web. |
| `ui#1998` (Dependabot zod plus `#1669`) | Pushed `53336dc3` (main merged, UTF-16 length helper); thread resolved; CI and a fresh Pullfrog review pending. Merge when green and approved, release web, close `#1669` after the Android Open carries it. |
| `orbit-api#877` (`#1655`) | Pushed `a0da59dc`. Read the hosted `application-chat-habits-1` shard time (local 626 s), request Pullfrog if it has not reviewed the head, merge, then `orbit-api#876` on the new base. |
| Android Open | Dispatch the next Open release once `ui#2005` merges (carries `#1668`, `#1588`, `#181`, `#1620` and, if merged, `#1669`); verify availability in Play Console, then record each ticket's Android acceptance. |
| `ui#2003`, `ui#2004` | Failed jobs rerun (flakes: `habit-list.test.tsx` offscreen family 45 s timeout; tools `wait-ci: SIGTERM` shim pids). Merge when green and approved; if a flake repeats, file it and fix it on main. |
| `ui#1991`, `ui#1990` | Share `package-lock.json` with main; Dependabot ignores `@dependabot rebase`. After `ui#1998` merges, base-merge main into each with `npm install` (or `@dependabot recreate`), one at a time. |
| `#1660` | Waits on the owner's next Orbit connector reconnection (open question). |
| `#1641` | Waits on the owner's password at `admin.google.com/u/1/`. |
| `#1622`, `#1656`, staging Postgres | Unchanged: favicon lookup still old; no widget event on `1.3.92`; `staging-reseed.yml` replaces staging before its free-plan expiry. |
| Relay harness | The previous relay failed twenty times on `orca terminal create` ETIMEDOUT; if the next relay fails the same way, research the Orca terminal-host daemon (several versions alive) before retrying blindly. |
| Remaining rows | `#1624`, `#1623`, device acceptance lane, Batch 0c closures, `#1658`, `#1617`, `#1627`, `#1612`, `#1626`, `#213`, `#227` step 3, `#31`, `#32`, `#1560`: unchanged from the spec's Current state. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. `ui#2005` root layout check and push; `ui#1998`, `ui#1984` and `orbit-api#877` CI and reviews; merge each when green and approved, and release web after each set of merges.
3. The next Android Open release once `ui#2005` merges; record Android acceptance on every carried ticket.
4. `orbit-api#876`; the Dependabot and snapshot pull requests one at a time.
5. Follow `## The order` for everything else, keeping the pool full under the load gate and the disk floor.
6. Run the full real-call Astra staging sweep only after `#1668` is deployed (`#1620` already is).

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. A `wait-ci.mjs` waiter exits `PR_CLOSED` as soon as any one of its pull requests merges, so restart it for the rest. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. Read every worker diff (`git show --remerge-diff` for a base merge) before pushing it, and reject a fix that leaves the reported defect in a different size or shape. Resolve review threads before the push that answers them. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`, and keep the root checkout on the relay docs branch until the successor confirms.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried (the entry point gains the manual adoption path; helpers gain `layout-check.sh`, `answer-push.sh` and `joblogs.sh`).
- Answer the owner first: carried; no owner message arrived this relay.
- Record `#181` and `#1620` web acceptance: done (ticket comments; production web `a4ef1097`, then `f587be05`).
- `ui#2005` CI round: rounds 3 and 4 done locally; root layout and push carried.
- `ui#2002`: done, merged as `f587be05` after a root base merge, released to staging and production web.
- `ui#1984` decision and round: done (D4 native window host; round 6 pushed at `9df648be`); CI carried.
- `orbit-api#877` relaunch: done (`a0da59dc` pushed); merge and `#876` carried.
- Dependabot and snapshot: `ui#1998` fixed through `#1669` and pushed; `ui#2003` and `ui#2004` reruns; `ui#1991` and `ui#1990` carried with the base-merge route.
- Verify Android `1.3.93`: done (available since 23 Oct 18:34); `#1613` closed.
- `#1641`, `#1622`, `#1656`, staging Postgres, `#1660`, remaining rows: carried with the readings above.
- Astra staging sweep after `#1668` and `#1620`: carried (`#1620` deployed, `#1668` not yet).

Every identifier here came from a previous session: treat each as a lead to verify.
