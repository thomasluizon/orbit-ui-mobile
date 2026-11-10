/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP: its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the plan approval question from the spec's `## Open questions` with `updateRunState` (it blocks `#2091`, `#2090` and the two new tickets).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D7). Helpers: `log-decision.sh`, `run-hooks-tools-gate.sh <worktree> <completion file> <log>` (hooks then tools, pair it with `tools/wait-file.mjs`), `play-cycle.sh`, `launch-ticket-gl2.sh` (compose, then `gl2.sh`), `body-2407-r2.mjs` (a body edit template). Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`, never with `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 60` or more to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 11 open, 11 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `09848836c`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; production and staging web `5a9c08e0d` (desktop 0.1.28); Android Open 1.3.151 (211); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| Owner plan approval | Still unanswered. Answer his reply first, in his language. On approval: rescope `#2091` and `#2090` with `update-ticket.mjs`, file the new landing interactions ticket and the app motion audit ticket with `create-ticket.mjs`, and launch landing workers. Until then, hold both landing workers. |
| `ui#2406` `5435ce254` | Round 2 fix and `main` merge pushed; CI running. Arm `wait-ci.mjs --repo ui --pr 2406`, verify delivery, request review round 3, merge, record the sha. |
| Web release | After the `ui#2406` merge: `/release` web staging, then production, for `09848836c` and `ui#2406`. Verify the shell update on the Mac, then close `#1560`. Never with an API release. |
| `ui#2408` | Unwanted delivery of the canceled `#2092` (owner kept the workers off Fable). Close it unmerged with a comment naming the cancellation, and delete the branch `chore/ticket-2092-fable-workers` and its worktree (no other work on it). |
| Launcher stop defect | Killing a record's `workerPid` (node) left the `claude` child alive, and it pushed `ui#2408`. Fix `tools/launch-worker.mjs` so a stop ends the whole worker process group, with a test, in a small harness pull request. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT, the owner types `/model claude-fable-5-2`. Then read the Fable usage on the claude.ai usage page each turn and click the reset at about 98% (never 100%), two times; after that allowance ends, ask him to type `/model claude-opus-5-5`. Workers stay on Sonnet and Opus. |
| `#2071` | Close on the first natural orbit-api and orbit-landing-page Pullfrog runs after the secret update; no probe run. |
| `#2030` | Close on the first `android_update_sheet_shown` event from 1.3.150 or later (PostHog); the latest events came from 1.3.149. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2408`, `#2406`, `#2388`; api none; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none (the `#2092` processes were stopped). Worktrees in use: `ticket-1560-acceptance-waits`; `ticket-2071-token-text` is merged and clean; `ticket-2092-fable-workers` is clean and goes with `ui#2408`. Intake this session: Sentry two known issues, no new event; mailbox one vendor notice (the worker account's Ultra cancellation, access until 5 December 2026), acknowledged; Play reviews none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs. Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. The plan approval is the one open question, already sent. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. The main account is near its weekly limit until Thursday's reset: keep turns lean. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `ui#2407` merged (`09848836c`, D6); `ui#2406` round 2 pushed and `main` merged in (D1, D7); intake cycles.
- Carried: `ui#2406` merge; web release; `#2089`; `#2030`; `#2071` close; `#1560`, `#1561`, `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.
- Superseded: "check the first orbit-api and orbit-landing-page Pullfrog runs" now waits for natural runs (D6). New: the owner's Fable plan (D3 to D5) and `#2092` canceled (D4).

Every identifier here came from a previous session: treat each as a lead to verify.
