/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; about 38 GiB now).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D464 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI --null` for its first 8 characters into a list file, drop `./sleep-decisions.md`, then `xargs -0 perl -pi` in `bash -c` that first changes directory into the new scratchpad, full id first, then the 8-character form, literal paths in every redirect); then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Usage order (owner, this week only): the main account (this session) stops ALL work when its weekly usage reaches 89%. Run S `usage-guard.mjs` at every wake and before every launch: it reads `~/.claude/usage-snapshot.json` (the status line writes it), exits 7 at 89% and expires at this week's reset (the guard holds the time). At exit 7: launch nothing, stop every worker, tell the owner. It read 85% at this relay.

Worker model: every `claude` tier runs `claude-opus-5-5` on the worker account (contact@useorbit.org); every launch of this relay showed `account=worker`. A fall back to the main account means the limit came back: tell the owner. Pass a real ceiling: `--hard-ceiling-minutes` 75 to 120 for a build or fix round (S `launch-review-round.sh` reads `CEILING`), 240 for the `#2135` baseline; the 45 minute default stopped five workers.

Owner orders (this session): reviews and device proofs run as workers, never as in-session subagents (`#2145`). Until `#2145` merges, use S `launch-review-worker.sh <ticket> <worktree> <review order> <reason>` and count it only with `commitsSinceLaunch` 0 and `treeClean` true (S `launch-result.mjs <task id>`). `#2149` scope: act only on pull requests of the configured bots and the owner account; report any other author to the owner, never merge it (the repositories are private). Until `#2149` merges, run S `prs-alerts.mjs` each cycle (every open pull request and every code scanning, secret scanning and Dependabot alert of the three repositories) and act on each. Delete only with Node, never `rm`; any search longer than one plain `grep` goes in a `.mjs` file run with `node`. Stale files: never offer, never ask; `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Fix rounds go to workers with S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (ticket number, never PR number). Read every worker diff before it counts. Resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin, literal paths), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from S `threads-snapshot.mjs <tag> ui:<n>` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch; a clean UI merge then runs S `comment-fix.mjs <worktree> origin/main HEAD`; a conflict goes to a worker. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, the owner's report shipped (`#2131`), the icon with eyes (`#2144`), the entry background and the live summary Orbit (`#2146`), the mascot rebrand (`#2121` to `#2126`, the landing as a tone change with motion), every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority.

## In flight

UI `main` `8b81175e7`; API `main` `38513551a`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. S `inflight-tasks.md` lists each launcher task id of the predecessor and its order; outputs stay in the predecessor's `tasks/` directory (read with S `launch-result.mjs` adapted to that directory, or the result or review file the order names).

| Item | Disposition |
| --- | --- |
| ui#2475 (`#2149`) | Review worker on round 2 `be052e853` -> S `review-2475-r2-local.md`: clean, push and request; defects, round 3. |
| ui#2476 (`#2145`) | Review worker on `43867fb40` -> S `review-2476-r1-local.md`. |
| ui#2477 (`#2148`) | Review worker on `57ca0a38e` -> S `review-2477-r1-local.md`. |
| ui#2469 (`#2074`) | Review worker on round 18 `189d445ed` -> S `review-2469-r18-local.md`; clean: body, resolve threads, push. |
| ui#2464 (`#2137`) | Round 19 runs (S `note-2464-r19.md`); then review worker. |
| ui#2473 (`#2144`) | Round 5 runs (S `note-2473-r5.md`, Pullfrog P1 `PRRT_kwDOR5Siws64EFCH`, reply S `reply-2473-EFCH.md`); then review worker, push. |
| ui#2451 (`#2121`) | Round 21 runs (S `note-2451-r21.md`); then review worker. |
| `#2131` | Round 11 runs (S `note-2131-r11.md`); then review worker, merge main, push, open the pull request from S `body-2131-r10.md` or r11. |
| `#2146` | Round 2 continues (S `note-2146-r2b.md`); then read the diffs, review worker, push, open the pull request. |
| `#2143` | Round 3 runs (S `note-2143-r3.md`); then review worker, push, open the pull request. |
| `#2135` | Baseline runs (S `order-2135-baseline-r3.md`, 240 min); exporter fix runs (S `order-2135-exporter-r2.md`), then review worker and pull request. |
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

- Done: landing#136 and ui#2474 merged (comment lint, `#2074`); ui#2470 merged and `#2140` closed; ui#2475 (`#2149`), ui#2476 (`#2145`), ui#2477 (`#2148`) opened; staging Pro restored for the `#2135` baseline; React Doctor run-time resolve found and fixed in `ui#2469` round 18; ORBIT-MOBILE-X folded into `#2131`; intake: mail 2 (noise), reviews 0, alerts 0, bot pull requests 0; stale files deleted (4.3 GB); usage guard installed.
- Carried: every In flight row above; the usage, GO FASTER, stale-file, `#2149` scope and worker-model orders.

Every identifier here came from a previous session; treat each as a lead to verify.
