/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB; `prune-durable.sh` in the scratchpad deletes only redundant run-carry mirrors). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D8). Helpers: `run-spec.sh`, `prove-2400-rb3.sh`, `prove-2400-rb4.sh`, `compare-ico-layers.mjs`, `mark-merged.mjs` (ledger merge sha), `wait-main-push.sh` (main push CI for a release), `log-decision.sh`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 20 open, 20 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `fd0eebb6c`; API `main` `3da71dcf6`; landing `main` `5d9971870`. Production web `b9ed49284` with desktop 0.1.27 (smoke passed), API `3da71dcf6`, landing `5d9971870`; staging web `b9ed49284` with staging desktop 0.1.28; Android Open 1.3.149 (209); TestFlight `a727bce32`. No open pull request is approved at its current head, and each is one commit behind `main`.

| Item | Disposition |
| --- | --- |
| `ui#2396` (`#2086`) `0b26f9911` | CI green. Review 5 COMMENTED, no behavioural issue: thread `PRRT_kwDOR5Siws61jkBq` (`habit-row-trailing.tsx:156`) wants the menu id dispatch map beside `buildMenuItems` in `apps/web/components/habits/habit-row.tsx`; the body says the PR body is stale. Move the map, rewrite the body for the shipped design, merge `main`, run the web habit-row tests and `node tools/test-tools.mjs`, resolve, push once, CI, review, merge. |
| `ui#2400` (`#2088`) `54e83a5e7` | CI green, review requested (review 4 answered in a fourth round). Waiter: `wait-ci.mjs --repo ui --pr 2400 --require-check pullfrog-approval`. On approval merge `main`, CI, re-review, merge, close `#2088`. |
| `ui#2394` (`#2087`) `0af426ba2` | 16 px native mark fix pushed, thread resolved, CI running. Then delivery with the branch's own `verify-delivery.mjs` (it changes the parity rule), review request, merge `main` before a merge, merge, next desktop release. |
| `#2083`, `#2077`, `#2061`, `#2062` | Live in production web `b9ed49284`. Android Open (with `#2086` once merged), then the Android proof and close each. |
| `#1861`, `#2084` | Shipped in production desktop 0.1.27 (release run 42750394540). Close each with that evidence. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2400`, `#2396`, `#2394`, `#2388`; api none; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Detached checks: none. Intake: Sentry 1 known issue (no new event), mailbox and Play reviews empty, board unchanged.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once `ui#2396` merges; production web again for `#2086` and desktop `#2087` once they merge (staging first).
4. Batch 6 (`#2078`, `#2079`, `#2080`) now that `ui#2398` has merged, then the rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `#2071` question re-added; `ui#2396` batch 4 verified green and pushed; `ui#2398` review 3 fixed and merged (`fd0eebb6c`); `ui#2400` reviews 3 and 4 fixed and pushed; `ui#2394` review 3 fixed and pushed; web staging and production released (`b9ed49284`, desktop 0.1.27), which ships `#2083`, `#2077`, `#2061`, `#1861` and `#2084`; intake cycles (nothing new).
- Carried: `ui#2396`, `ui#2400`, `ui#2394` to merge; Android Open; production web for `#2086` and `#2087`; closes for `#2083`, `#2077`, `#2061`, `#2062`, `#1861`, `#2084`; `#2030`, `#1560`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026; run `npm ci` in the main checkout at a quiet point (no waiter importing packages), because local `check-native-module-copies` fails there and in the worktrees.
- Superseded: "start `tools/wait-file.mjs` on `2086-rb4-done.json`" (the check finished green).

Every identifier here came from a previous session: treat each as a lead to verify.
