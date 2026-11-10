/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the plan approval question from the spec's `## Open questions` with `updateRunState` (it blocks `#2091`, `#2090` and the two new tickets).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D7). The full plan sent to the owner is `best-implementation-landing-motion.md` in the scratchpad. Helpers: `log-decision.sh`, `mark-merged.mjs`, `sentry-listed.mjs <issue ids>` (marks an hourly listing), `wait-main-push.sh`, `gl2.sh` (load and spacing gate, then `launch-worker.mjs`), `staging-login-probe.mjs`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`, never with `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 60` or more to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery. Run `verify-delivery.mjs` for a pull request that changes `tools/` from its own worktree. A worktree `npm ci --ignore-scripts` skips the esbuild postinstall: run `npm rebuild esbuild` before `node tools/test-tools.mjs`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 11 open, 11 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `5a9c08e0d`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging web `5a9c08e0d` (desktop 0.1.28); production API `3da71dcf6`; Android Open 1.3.150 (210); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| Owner plan approval | The owner was sent the `/g-best-implementation` plan (spec `## Open questions`). Answer his reply first, in his language. On approval: rescope `#2091` and `#2090` with `update-ticket.mjs`, file the new landing interactions ticket and the app motion audit ticket with `create-ticket.mjs`, and launch landing workers through `gl2.sh` with `compose-prompt.mjs`. Until then, hold both landing workers. |
| `ui#2405` `d7f413f3b` | Review round 2 fixed, 0 unresolved threads, body updated. CI running: arm `wait-ci.mjs`; on green verify delivery from its worktree, `list-bot-threads.mjs --wait-seconds 900`, clear findings, merge. |
| `ui#2406` `9c2751f27` | Three acceptance proofs green; `pullfrog-approval` FAILURE with three P1 threads (spec `#1560` bullet). Fix them as the coordinator in `ticket-1560-acceptance-waits`, run `node tools/test-tools.mjs`, reply and resolve, update the body, push once, then CI, review and merge. |
| API release | `api#1105` merged as `f418f94e7` (runtime packages changed): run `/release` for API staging, then production. |
| `#2071` | Token swapped in all three repositories; launch a small worker for the skill and doc text, then close. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| `#2030` | Close on the owner-device `android_update_sheet_shown` event from 1.3.150 or later. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2406`, `#2405`, `#2388`; api none; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Worktrees: `ticket-1560-ci-limits`, `ticket-1560-acceptance-waits` (clean, pushed). Detached worktrees with no unique work: `combined-2065`, `drift-evidence-path`, `ticket-1560-mac-signing`, `ticket-2077-expo-patch-set`, `verify-2036-main`, `orca/workspaces/orbit-api/dependabot-1105`. Intake this session: Sentry two issues, no new event; mailbox empty.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. The plan approval is the one open question, already sent; act on his answer when it arrives. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `api#1105` merged (`f418f94e7`, D1); `ui#2405` macOS `hdiutil` flake rerun green (D2), review round 2 fixed (D6); `ui#2406` third acceptance proof green (D7); `#2071` token swapped (D5); intake cycles.
- Carried: `ui#2405` and `ui#2406` merge; API release; `#2089`; `#2030`; `#2071` skill text; `#1560`, `#1561`, `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.
- Superseded: "launch a landing worker for `#2090`" (held for the owner's plan approval, D3 and D4); "re-add the `#2071` sign-in question" (answered: the owner signed in and the token is set).

Every identifier here came from a previous session: treat each as a lead to verify.
