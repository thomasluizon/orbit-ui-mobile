/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; about 38 GiB now).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D464 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI --null` for its first 8 characters into a list file, drop `./sleep-decisions.md`, then `xargs -0 perl -pi` in `bash -c` that first changes directory into the new scratchpad, full id first, then the 8-character form, literal paths in every redirect); then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Usage order (owner, this week only): the main account (this session) stops ALL work when its weekly usage reaches 89%. Run S `usage-guard.mjs` at every wake and before every launch: it reads `~/.claude/usage-snapshot.json` (the status line writes it), exits 7 at 89% and expires at this week's reset (the guard holds the time). At exit 7: launch nothing, stop every worker, tell the owner. It read 86% at this relay.

Worker model: every `claude` tier runs `claude-opus-5-5` on the worker account (contact@useorbit.org); every launch of this relay showed `account=worker`. A fall back to the main account means the limit came back: tell the owner. Pass a real ceiling: `--hard-ceiling-minutes` 75 to 120 for a build or fix round (S `launch-review-round.sh` reads `CEILING`), 240 for the `#2135` baseline.

Owner orders (this session): reviews and device proofs run as workers, never as in-session subagents (`#2145`). Until `#2145` merges, use S `launch-review-worker.sh <ticket> <worktree> <review order> <reason>` and count it only with `commitsSinceLaunch` 0 and `treeClean` true (S `launch-result.mjs <task id>`). `#2149` scope: act only on pull requests of the configured bots and the owner account; report any other author to the owner, never merge it. Until `#2149` merges, run S `prs-alerts.mjs` each cycle (every open pull request and every code scanning, secret scanning and Dependabot alert of the three repositories) and act on each. Delete only with Node, never `rm`; any search longer than one plain `grep` goes in a `.mjs` file run with `node`. Stale files: never offer, never ask; `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Fix rounds go to workers with S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (ticket number, never PR number). Read every worker diff before it counts. Resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin, literal paths), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from S `threads-snapshot.mjs <tag> ui:<n>` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch; a clean UI merge then runs S `comment-fix.mjs <worktree> origin/main HEAD`; a conflict goes to a worker. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, the owner's report shipped (`#2131`), the icon with eyes (`#2144`), the entry background and the live summary Orbit (`#2146`), the mascot rebrand (`#2121` to `#2126`, the landing as a tone change with motion), every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority.

## In flight

UI `main` `8b81175e7`; API `main` `38513551a`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. No launcher is live at the relay. S `inflight-tasks.md` lists each launcher task id of the predecessor and its result; outputs stay in the predecessor's `tasks/` directory (read with S `launch-result.mjs` adapted to that directory, or the result or review file the order names).

| Item | Disposition |
| --- | --- |
| ui#2477 (`#2148`) | Pullfrog red at `b4689580a`: P1 `PRRT_kwDOR5Siws64FVTB` (`tag-editor-row.tsx:67`, the waiting face copies `waitingFaceClasses`). Fix round, then push. |
| ui#2475 (`#2149`) | Review S `review-2475-r2-local.md`: DEFECTS (6), D1 the run's own pull requests count as pending. Round 3 fixes all six. |
| ui#2476 (`#2145`) | Review S `review-2476-r1-local.md`: DEFECTS (17). Round 2 fixes them. |
| ui#2469 (`#2074`) | Review S `review-2469-r18-local.md`: DEFECTS (2), the npx rule test gap and four draft lines. Round 19. |
| ui#2464 (`#2137`) | Round 19 committed (directory runners and index-recording subcommands); read the diff, review worker. |
| ui#2473 (`#2144`) | Round 5 committed (tray raster, Pullfrog P1 `PRRT_kwDOR5Siws64EFCH`, reply S `reply-2473-EFCH.md`); read the diff, review worker. |
| ui#2451 (`#2121`) | Round 21 committed (one precedence rule for every field and source); read the diff, review worker. |
| `#2131` | Round 11 committed (worklet direction in the same frame); read the diff, review worker, merge main, push, open the pull request (S `body-2131-r10.md`). |
| `#2146` | Round 2 committed in two commits (`042bae955` and one more); read both diffs, review worker, push, open the pull request. |
| `#2143` | Round 3 committed (liveness recheck at each removal); read the diff, review worker, push, open the pull request. |
| ui#2478 (`#2135`) | Exporter fix open at `dd3959de2`; read the diff, review worker, Pullfrog. |
| `#2135` baseline | Stopped by the coordinator to relay. Relaunch S `order-2135-baseline-r3.md` with 240 minutes: step 0 is done, keep the saved windows (S `b2135-r3/`, `eval-2135-baseline/`). The worktree `verify-2036-main` still holds the generated `evals/astra/catalog.yaml`; the worker restores it at the end. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request at the bar.
3. Intake each cycle: Sentry (listed 17:18Z; ORBIT-MOBILE-X folded into `#2131`), mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: landing#136, ui#2474, ui#2470 merged (`#2140` closed); ui#2475 to ui#2478 opened; intake clean.
- Carried: the In flight rows and every order above.

Treat every identifier here as a lead to verify.
