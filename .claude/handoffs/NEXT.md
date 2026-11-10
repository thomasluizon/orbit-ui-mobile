/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the plan approval question from the spec's `## Open questions` with `updateRunState` (it blocks `#2091`, `#2090` and the two new tickets).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D16). The full plan sent to the owner is `best-implementation-landing-motion.md` in the scratchpad. Helpers: `log-decision.sh`, `mark-merged.mjs` (prints `[]` when the ledger has no row: append one with `updateRunState`), `sentry-listed.mjs <issue ids>`, `run-tools-gate.sh <worktree> <completion file> <log>` (pair it with `tools/wait-file.mjs`), `watch-api-ci.sh <completion file> <run ids>`, `play-cycle.sh`, `gl2.sh` (load and spacing gate, then `launch-worker.mjs`). Carried completion files are stale: use a fresh name, and give `wait-file.mjs` a `--started-at` at or before the check's real start, never in the future. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`, never with `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 60` or more to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery. Run `verify-delivery.mjs` for a pull request that changes `tools/` from its own worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 11 open, 11 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `c86dcbb83`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; production and staging web `5a9c08e0d` (desktop 0.1.28); Android Open 1.3.151 (211); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| Owner plan approval | Still unanswered. Answer his reply first, in his language. On approval: rescope `#2091` and `#2090` with `update-ticket.mjs`, file the new landing interactions ticket and the app motion audit ticket with `create-ticket.mjs`, and launch landing workers through `gl2.sh` with `compose-prompt.mjs`. Until then, hold both landing workers. |
| `ui#2406` | Remote head `8801b3a3c`; local commit `e8cc5596c` in `ticket-1560-acceptance-waits` holds review round 2 (thread resolved, body updated). If the remote head is still `8801b3a3c`: run `run-tools-gate.sh` in that worktree (install already fresh), push on `ORBIT TOOLS GATE OK`, arm `wait-ci.mjs`, verify delivery, request review round 3, merge. |
| `ui#2407` `97b1653b2` | Review round 1 fixed, body link corrected to `Tracks`, CI running: arm `wait-ci.mjs`, verify delivery, request the review, merge. Then check the first orbit-api and orbit-landing-page Pullfrog runs after the swap and close `#2071`. |
| Web release | After the `ui#2406` merge: `/release` web staging, then production, for `c86dcbb83` and `ui#2406` (desktop inputs). Never with an API release. |
| `#2030` | Close on the first `android_update_sheet_shown` event from 1.3.150 or later (PostHog), once Play offers 1.3.151. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2407`, `#2406`, `#2388`; api none; landing none. Unpushed commits: `e8cc5596c` on `fix/ticket-1560-acceptance-waits` (above). Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Worktrees in use: `ticket-1560-acceptance-waits`, `ticket-2071-token-text`. `ticket-1560-ci-limits` is merged and clean. Detached worktrees with no unique work: `combined-2065`, `drift-evidence-path`, `ticket-1560-mac-signing`, `ticket-2077-expo-patch-set`, `verify-2036-main`. Intake this session: Sentry two issues, no new event; mailbox empty; Play reviews none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. The plan approval is the one open question, already sent; act on his answer when it arrives. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `ui#2405` merged (`c86dcbb83`, D7); API staging and production released at `f418f94e7` (D1, D3, D8, D10, D11); Android Open 1.3.151 (D5, D9); `#2071` worker delivered `ui#2407` (D4, D6); `ui#2406` review rounds 1 and 2 fixed (D2, D15); intake cycles.
- Carried: `ui#2406` and `ui#2407` merge; web release; `#2089`; `#2030`; `#2071` close; `#1560`, `#1561`, `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.
- Superseded: "launch a small worker for the `#2071` skill text" (done as `ui#2407`); "run `/release` for API staging, then production" (done).

Every identifier here came from a previous session: treat each as a lead to verify.
