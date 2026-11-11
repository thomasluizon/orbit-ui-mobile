/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 65 GiB at handoff). No owner question is open.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D7). Helpers: `landing-verify.sh <worktree> <label>` (build, test, lint, check, format), `reviews-cycle.sh <label>` (detached review cycle writing `reviews-<label>/done.json` for `wait-file.mjs`), `body-merge-report.sh <gh repo> <pr> <label>` (reads `report-<label>.md`; give it empty `## Assumptions` and `## Manual steps` headings when there are none), `compare-landing-bytes.sh <base dist> <pr dist>`, `record-merge.mjs <key> <pr> <sha> [issue]`, `ui-main-merge.sh <worktree name>...`, `sim-press.sh`, `asc-signin.sh <udid>`, `asc-code.sh <udid>`, `asc-seed.mjs status|seed|rename-pt|rename-en|cleanup` (the smoke-account screenshot demo; secrets stay in SSM), `landing130-a11y.cjs <dist>`, `rss-watchdog.mjs`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background` (never with `&`). `list-bot-threads.mjs` needs `--wait-seconds 60` or more; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `304484135`; API `main` `2bdd96e30`; landing `main` `49257d7`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; production landing `5d9971870`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). CI waiters stop at succession: re-arm one per open pull request first.

| Item | Disposition |
| --- | --- |
| `landing#130` (`#2091`) | Round 7 `939e80f` CI green; the body edit reran `PR Body Attribution`. Request the review when it settles, merge at the bar, then `main` into `landing#129`. |
| `landing#129` (`#2090`) | `487fb7a` red only on Lighthouse (24,049 of 24,000) after `landing#131` merged. After `landing#130` merges: `main` merge, `landing-verify.sh`, push, review on green, merge. Never raise the budget. |
| `landing#131` (`#2107`) | Merged `49257d7`. Landing staging and production releases after `#130` and `#129` merge (or now if they stall), then close `#2107`. |
| `ui#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2412` | `main` merged after `ui#2415` and pushed; CI runs (one waiter covered all eleven). Request each review on green, merge at the bar, then `main` into the remaining open UI branches after each merge whose CI still runs. `ui#2414` before `ui#2423`. |
| `ui#2421` (`#2104`) | A second `macos-signing-workflow.test.ts` timeout gets an investigation. |
| `ui#2412` (`#2094`) | Round 3 review on green, merge, then the Android Open release, then close. |
| `ui#2414` then `ui#2423` | After `ui#2414` merges: production iOS Release 1.3.152 (2), read `TestFlight access`; then `main` into `ui#2423`, review, merge. |
| `ui#2416` | Dependabot: `@dependabot rebase` requested; then `list-bot-threads.mjs --re-review`, merge at the bar. |
| `#2097` App Store review | Screenshots next: `node asc-seed.mjs seed` (smoke account, 6 habits, 7-day history), sign the iPhone 18 Pro Max simulator out of QA and in as smoke (Device Hub clicks), override the status bar, capture Hoje, Calendário, Progresso and Astra in English, `rename-pt`, capture pt-BR, repeat on the iPad Pro 13-inch (M5) simulator, then `cleanup`. Then the `/iris/v1` fields, App Privacy, subscriptions, submit with manual release. |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark (09:35Z) in `intake.sentry` with no event newer than its recorded `lastEventAt`, then close. |
| Fable plan | Thursday 12 November 2026 after 04:00 BRT per D149. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2416`, `#2414`, `#2412`, `#2388`; landing `#130`, `#129`; API none. Unpushed commits: none. Dirty worktrees: none. Stashes: 0 (ui, landing, api). Running workers: none. Background subagents: none. Detached checks: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry listed 05:23Z with only `ORBIT-WEB-1E` and `ORBIT-MOBILE-Q`, no new event; mailbox empty; 0 store reviews; board unchanged).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `landing#131` merged (`49257d7`); `ui#2415` merged (`304484135`) and `#2098` closed; `main` merged into all eleven open UI branches; `@dependabot rebase` on `ui#2416`; `landing#130` round 7 written, threads resolved, pushed, body evidence added; `landing#129` and `#130` had `main` merged; intake cycle run; QA signed in on the iPhone simulator.
- Carried: every other in-flight row; `landing#129` and `#130` review requests; `#2097` screenshots and submission; `#2089`; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
