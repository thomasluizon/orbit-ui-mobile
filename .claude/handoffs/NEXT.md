/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; about 38 GiB now).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D472 with the Write tool. Repoint every scratchpad file that names the predecessor's id (`grep -rlI --null` for its first 8 characters into a list file outside the scratchpad, drop `./sleep-decisions.md`, then `xargs -0 perl -pi` in `bash -c` that first changes directory into the new scratchpad, full id first, then the 8-character form, literal paths in every redirect); then run `mirror.sh` and `durable-dedupe.sh` with `bash` in the background.

Usage order (owner, this week only): the main account (this session) stops ALL work when its weekly usage reaches 89%. Run S `usage-guard.mjs` at every wake and before every launch. At exit 7: launch nothing, stop every worker, tell the owner. It read 87% at this relay. Scan diffs with S `diff-scan.mjs`.

Worker model: every `claude` tier runs `claude-opus-5-5` on the worker account; a fall back to the main account means the limit came back: tell the owner. Pass `--hard-ceiling-minutes` 75 to 120 for a build or fix round (`CEILING`), 240 for the `#2135` baseline.

Owner orders (this session): reviews and device proofs run as workers (`#2145`); until it merges use S `launch-review-worker.sh <ticket> <worktree> <review order> <reason>` and count a review only with `commitsSinceLaunch` 0 and `treeClean` true (S `launch-result.mjs <task id>`). `#2149` scope: act only on pull requests of the configured bots and the owner account; report any other author, never merge it. Until `#2149` merges, run S `prs-alerts.mjs` each cycle (last read: 0 alerts, 0 bot pull requests). Delete only with Node. Stale files: never offer, never ask; `node tools/stale-files.mjs --list`, then `--delete --listing <id>` at once.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Fix rounds go to workers with S `launch-review-round.sh <key> <ticket> <worktree> main max <round> <note> <reason>` (ticket number). Read every worker diff before it counts. A review defect only in a scratchpad body or reply is fixed by the coordinator. Resolve threads with `node tools/resolve-bot-thread.mjs` (reply on stdin), push, request with `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha> --wait-seconds 20`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from S `threads-snapshot.mjs <tag> ui:<n>` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each idle branch; a clean UI merge then runs S `comment-fix.mjs <worktree> origin/main HEAD`. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class, every `#315` ticket closed, then `#315`, then the store images (`#2147`) before `#33`. Left: `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. The order reconciles: open 24, placed 24, unplaced 0, placed twice 0.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority.

## In flight

UI `main` `ca538e933`; API `main` `38513551a`; landing `main` `20c1b0a90`. Owner question queue: empty. No stash. S `inflight-tasks.md` lists each launcher task id and its result; this session's outputs stay in its `tasks/` directory (read with S `launch-result.mjs` adapted to that directory). Read each worktree first.

| Item | Disposition |
| --- | --- |
| Flakes for `#2074` | `turbo-inputs.test.mjs` and `nested-control-fill.spec.ts:101` (green on rerun), `calendar-header-controls-geometry.test.tsx` 320 today ring (ui#2473 chromium 9/16, rerun 43950026215). Fold into `#2074` after r20. |
| ui#2473 (`#2144`) | At `f3ddba9e2`: Pullfrog COMMENTED, no thread: the body stops at round 4. Add rounds 5 and 6 to the body (the `menus.rs` tray change, the eight tray rasters, the Win32 `SM_CXSMICON` and `tray-icon` behaviour; S `reply-2473-EFCH.md` and S `review-2473-r6-local.md` hold the evidence), read the web unit rerun, request Pullfrog, merge at the bar. |
| ui#2478 (`#2135`) | Round 2 was refused by the relay drain and never ran: launch it (S `note-2478-r2.md`, Pullfrog P1 `PRRT_kwDOR5Siws64Hdlx`). Review worker, resolve with S `reply-2478-Hdlx.md`, push. |
| ui#2480 (`#2135` grader) | Open at `8d3174826` (worktree `ticket-2122-part3`). Diff, review, Pullfrog, merge before the read cases run. |
| `#2135` baseline | After 00:10 UTC: relaunch S `order-2135-baseline-r4.md` per S `result-2135-baseline.md` `## Next window` (240 min). |
| api#1116 (`#2150`) | Round 2 was refused by the relay drain and never ran: launch it first (S `note-1116-r2.md`). Review, push, Pullfrog, merge, then the API release with the manual steps (production webhook is broken until then). |
| ui#2469 (`#2074`) | Round 20 was refused by the relay drain and never ran: launch it (S `note-2469-r20.md`). Review, push. |
| ui#2464 (`#2137`) | Round 20 committed `fef49f8ff` on a main merge. Diff, review, push. |
| ui#2451 (`#2121`) | Round 22 committed (`2cfecef3c` to `fc7c0f0a9`, two main merges). Diff, review, push. |
| ui#2475 (`#2149`) | Round 3 review: DEFECTS (5) (S `review-2475-r3-local.md`). Round 4 fixes all five. |
| ui#2476 (`#2145`) | Round 2 committed `3d0b39885` (a macOS write sandbox for read-only workers) on a merge of main. Read the diff, review worker, push with S `body-2476-r2.md`. |
| `#2146` | Round 3 committed `1822e2e0d` on a main merge. Diff, review, push, open the pull request (S `body-2146-r3.md`). |
| `#2143` | Round 4 committed `3b9fdecc5` on a merge of main. Read the diff, review worker, push, open the pull request with S `body-2143-r4.md`. |
| Releases | After api#1116: API release; then web and one Android Open plus iOS TestFlight pair carrying `#2148` (`b25ab685d`), `#2131` (`ca538e933`) and `#2146`. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request at the bar.
3. Intake each cycle: Sentry (listed 19:20Z; ORBIT-API-25/26/27 carried by `#2150`), mail, reviews, S `prs-alerts.mjs`, then the board.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Close a merged ticket with `node tools/complete-ticket.mjs`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: ui#2477 and ui#2479 merged (`#2148` and `#2131` closed); every In flight row driven; `#2150` filed and admitted; intake clean except the Stripe issues.
- Carried: the In flight rows and every order above.

Treat every identifier here as a lead to verify.
