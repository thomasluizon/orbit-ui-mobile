/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). Adoption carries `openOwnerQuestions` (the App Store Connect sign-in); read it back.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D16). Helpers: `main-into.sh <worktree> <label>`, `run-hooks-tools-gate.sh`, `launch-ticket-gl2.sh <key> <n> <worktree> main <tier> [note]`, `launch-rb-2094.sh` (review batch pattern), `body-2412-rb1.sh` (review body merge pattern), `check-apple-login.cjs <origin>` (rendered Continue with Apple check), `landing-sweep.cjs <dist> <label>` (rendered landing sweep), `watch-main-runs.sh` (main push runs, with `wait-file.mjs`). Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`, never with `&`. `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, with a reply body on stdin. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 16 open, 16 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `691323673`; API `main` `f418f94e7`; landing `main` `5d9971870`. Production and staging API `f418f94e7`; staging web `691323673`; production web `691323673`; Android Open 1.3.151 (211); TestFlight production 1.3.152 (1).

| Item | Disposition |
| --- | --- |
| Web production `691323673` (run 42910271885 succeeded) | `/api/health` ok at `691323673` and production `/login` renders Continue with Apple (verified). Next: verify the desktop shell update on the Mac and close `#1560`; then `/android-release` open track from `main` (`#2094` button). |
| `ui#2412` (`#2094`) | Round 1 pushed `242526fd1`; round 2 review waiter running. Merge at a fresh approval and zero threads; close `#2094` after the production and Android checks. |
| `ui#2414` (`#1561`) | Head `0bce70811`, review waiter running (branch at its 2-launch cap: the coordinator writes any review batch). After merge: production iOS Release from `main` 1.3.152 (2), read the `TestFlight access` summary. |
| `ui#2415` (`#2098`) | Head `31c6f8c36`, review waiter running. Merge first when approved, then `main-into.sh` every open UI branch. |
| `landing#130` (`#2091`) | Copy approved and posted; sweep passed. Review waiter running. Round 1 adds the `--color-bg-dialog` fix (`landing.css:1108`, undefined token). |
| `landing#129` (`#2090`) | Review waiter running; run `landing-sweep.cjs` on its `dist` before merge. After both landing merges: launch `#2095`, then landing staging and production. |
| `ui#2413` | New Dependabot pull request (mongoose in `evals/astra`): read the diff, `list-bot-threads --re-review` when reviewed, merge at the bar. |
| `#2097` App Store review | Owner signs in to App Store Connect in the open Chrome tab; then listing (both locales, `/second-opinion`), simulator screenshots, subscriptions, App Privacy, submit with manual release. |
| `#2096` motion audit | Coordinator runs the read-only audit (subagent), posts findings, files one ticket per area. |
| `#2071`, `#2030`, `#2089` | `#2071`: close on the first natural API and landing Pullfrog runs after the secret update. `#2030`: close on the first `android_update_sheet_shown` from 1.3.150 or later (latest 1.3.149). `#2089`: resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. Workers stay on Sonnet and Opus. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2415`, `#2414`, `#2413`, `#2412`, `#2388`; api none; landing `#130`, `#129`. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Worktrees in use: ui `ticket-2094-apple-variable`, `ticket-1561-testflight-access`, `ticket-2098-shard-tools`; landing `ticket-2091-demo-clock`, `ticket-2090-downloads-panel`. Intake this session: Sentry two known issues, no new event; mailbox none; Play reviews none.

## Then, in this order

1. Answer any owner message first, in his language. Tell him plainly when the App Store Connect sign-in is the one thing waiting on him.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs (`main-into.sh`). Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. The App Store Connect sign-in is the one open owner step, already named. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `ui#2411` merged (`310a84590`) and `ui#2410` merged (`691323673`); rendered staging Apple check passed; web staging of `691323673` released; owner plan approval received: `#2091` and `#2090` rescoped, `#2095` and `#2096` filed, both landing workers delivered; owner App Store order filed as `#2097`; owner CI question answered with evidence and `#2098` filed and delivered; `#1561` access step delivered as `ui#2414`.
- Carried: web production verification; Android Open; `#1560`; `#2089`; `#2030`; `#2071`; Fable plan; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.
- Superseded: "hold `#2091`, `#2090` for the plan approval" (approved).

Every identifier here came from a previous session: treat each as a lead to verify.
