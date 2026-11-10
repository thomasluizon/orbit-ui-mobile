/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP: its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the plan approval question from the spec's `## Open questions` with `updateRunState` (it blocks `#2091`, `#2090` and the two new tickets).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D16). Helpers: `main-into.sh <worktree> <label>` (merge `main`, full `npm ci`, hooks then tools gate), `run-hooks-tools-gate.sh`, `play-cycle.sh`, `launch-ticket-gl2.sh`, `body-2409-rb1.sh` (a review batch body template). Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`, never with `&`. `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 12 open, 12 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `12b135e3e`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; production web `5a9c08e0d` (desktop 0.1.28); staging web `6c0d4dfe8`; Android Open 1.3.151 (211); TestFlight staging `a727bce32`, production 1.3.152 (1) uploaded.

| Item | Disposition |
| --- | --- |
| Owner plan approval | Still unanswered. Answer his reply first, in his language. On approval: rescope `#2091` and `#2090` with `update-ticket.mjs`, file the landing interactions ticket and the app motion audit ticket with `create-ticket.mjs`, launch landing workers. Until then, hold them. |
| Web release | Staging run 42891223021 succeeded: staging serves `6c0d4dfe8` (`/api/health` ok). The server HTML of staging `/login` carries no rendered Apple button text, so run a rendered check (headless Playwright from `apps/web`) for Continue with Apple before production; if it is missing, investigate at the root. Then production from `node tools/release-plan.mjs`, verify the desktop shell update on the Mac, close `#1560`. Never with an API release. |
| Android Open | After web production: `/android-release` open track from `main` (carries the Apple button, `#2094`). |
| `ui#2412` (`#2094`) | Head `fca69e908` (main merged, gates passed); CI running, review requested. Merge at a fresh approval; complete `#2094` after the release checks. |
| `#1561` production iPhone | Run 42891265580 uploaded 1.3.152 (1) to app `6831372835`. Confirm Apple processing and add the owner to an internal testing group of the production app through the App Store Connect API in a workflow step (the key lives only in the `ios-production` environment). |
| `ui#2411` (bot contract snapshot), `ui#2410` (Dependabot) | Read each diff, request review (`list-bot-threads.mjs --re-review` when the head is already reviewed), merge at green or let auto-merge. |
| `#2071` | Close on the first natural orbit-api and orbit-landing-page Pullfrog runs after the secret update; no probe run. |
| `#2030` | Close on the first `android_update_sheet_shown` event from 1.3.150 or later (PostHog); latest is 1.3.149. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT: the owner types `/model claude-fable-5-2`; read Fable usage each turn and click the reset at about 98%, two times; then ask him to type `/model claude-opus-5-5`. Workers stay on Sonnet and Opus. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2412`, `#2411`, `#2410`, `#2388`; api none; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Worktrees in use: `ticket-2094-apple-variable`. Intake this session: Sentry two known issues, no new event; mailbox none; Play reviews none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs (`main-into.sh`). Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. The plan approval is the one open question, already sent. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `ui#2406` merged (`6c0d4dfe8`); `ui#2408` closed unmerged, branch and worktree deleted; launcher stop defect fixed as `#2093` (`ui#2409` merged `12b135e3e`); owner Apple button report (`#2094`, variables set); owner production iPhone order (`#1561`, build uploaded).
- Carried: web release; `#2089`; `#2030`; `#2071`; Fable plan; `#1560`, `#1561`, `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.
- Superseded: "fix the launcher stop" is done (`#2093`).

Every identifier here came from a previous session: treat each as a lead to verify.
