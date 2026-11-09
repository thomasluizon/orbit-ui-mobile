/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 97850de8-58ec-415f-8fca-036f341ec263` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D8). Helpers: `gl.sh`, `launch-new-ticket.sh`, `new-ticket-wt.sh`, `co-rb.sh`, `last-report.mjs`, `run-spec.sh`, `repro-2062-guard.sh` (restore a `layout-build` artifact, red then green), `log-decision.sh`, `reconcile.sh`, `inventory.sh`, `note-2087-ci3.md`, `note-verify-cap.md`. Write scratchpad files to literal absolute paths. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `cd10e29ef`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. Merged this relay: `ui#2395` (`#2085`) as `e42dcdaf7`, `ui#2393` (`#2083`) as `cd10e29ef`, both in the run ledger. No open pull request is approved; every thread is resolved.

| Item | Disposition |
| --- | --- |
| `ui#2399` (`#2077` Expo patch set) `eab862d03` | New from a worker. Read its diff and report (`last-report.mjs` on its `orbit-workers` log; check the safe-area 5.11.1 changelog claim), CI waiter, review request, merge. Then merge `main` into `ui#2394`. |
| `ui#2398` (`#2062`) `376d30b16` | CI running on the CI fix (red and green proven, body updated). CI waiter, review request, approval waiter, merge, close `#2062`. |
| `ui#2397` (`#2084`) `abcee8e66`, `ui#2396` (`#2086`) `740b2d410` | CI running. CI waiter, review request, approval waiter, merge. |
| `ui#2389` (`#2077`) `ed1238943`, `landing#128` (`#2082`) `53195f6` | CI green, review requested. Approval waiter, merge; then the landing `/release` for `#2082`. |
| `ui#2394` (`#2087`) `9cee6293d` | Three reds (spec `#2087` row). Launch `note-2087-ci3.md` as a commit-only order (`--relaunch-reason`), read the diff, merge `main` after `ui#2399`, push once, rerun the macOS job if it fails again on a flake. |
| `#2083` | Merged: check the rendered sign-in on staging at 412 and 1280 px, then ship. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2399`, `#2398`, `#2397`, `#2396`, `#2394`, `#2389`, `#2388`; api none; landing `#128`. Unpushed commits: none in any ticket worktree. Stashes: 0 in all three. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077` (with `ui#2399`), `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle (Sentry, mailbox, reviews: due now).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; the `#2071` question re-added; `ui#2398` red and green proof and its CI fix pushed; the `#2077` Expo patch worker (opened `ui#2399`); `ui#2395` and `ui#2393` merged; reviews requested on `ui#2389` and `landing#128`.
- Carried: the CI waiters, review requests, approval waiters and merges for every open pull request; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "read the macOS log" for `ui#2394` (read: a likely flake, rerun after the next push); "the shipped 200000 threshold" (`ui#2395` merged).

Every identifier here came from a previous session: treat each as a lead to verify.
