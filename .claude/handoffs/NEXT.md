/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 71 GiB at handoff). The open owner question is in the spec's `## Open questions`: never ask it again.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that still holds the predecessor id with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`. The spec's `## Current state` names the helpers. Write scratchpad scripts with the Write tool, with literal absolute paths in every redirect. Start every waiter as a Bash background task with `run_in_background` (never with `&`). A `resolve-bot-thread.mjs` id must come from a `verdict.sh` read in the same session. Read the review body and the threads before every delivery. Read each log time from `date -u`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `e9a388d0a`; API `main` `2bdd96e30`; landing `main` `599bdfb69`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; staging and production landing `599bdfb69`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). The coordinator runs on the worker account. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| Runner mirror outage (first) | Layout Guard fails in its install step on most jobs (`## Current state`). Run `outage-probe.sh 43037159976` in the background. On RECOVERED: `rerun-if-infra.sh` on the failed Layout run of each UI branch, then one `chain-review.sh ui <pr>` each. Still down after its 8 probes: file the harness ticket and launch its worker. |
| `ui#2432` (`#2111`, owner report, first priority) | Head `e82429dcb`, diff read, only the Layout shards are red (run `43046124548`). After the rerun passes: chain, verdict, merge at the bar, record the sha, then the production web release and the Android Open release at once, check the habit detail log on production web, close `#2111`. |
| ui `#2419`, `#2420`, `#2421`, `#2422`, `#2427`, `#2430`, `#2431` | Round 2 fixed, threads resolved; only the Layout shards are red at the heads in the bullets. Rerun, chain, verdict, fix or merge at the bar. |
| ui `#2424`, `#2425`, `#2426` | Same state; their chains ended at the ceiling. Read `gh pr checks`, rerun a Layout failure, chain. |
| `ui#2418` (`#2103`) | Layout red (outage) and the macOS acceptance job red two times on lost key presses. Read the `main` control run `43058365219` (`wait-run.sh orbit-ui-mobile 43058365219`), then fix the cause it names. |
| `ui#2414` (`#1561`) | Two cleanup threads at `6bba12a1a`; note `rb-note-2414-r3.md`. Run `verdict.sh ui 2414`, fix through a background subagent with `review-fix-brief.md` in worktree `ticket-1561-testflight-access`, read the diff, `deliver-fix.sh`, chain. |
| `ui#2429` (`#1561` status bar) | Round 3 fixed at `8ba4d14f4`, thread resolved, CI running. Chain, merge at the bar. |
| Merge order | Merge the approved pull requests one after another; after each merge, merge `main` into the next approved branch, wait for CI and one more review (readiness needs `behind_by=0`). `ui#2414` before `ui#2423`. |
| `ui#2423` (`#2106`) | After `ui#2414` merges: production iOS Release 1.3.152 (2), read the `testflight-access` job; then `main` into `ui#2423`, CI, review, merge. |
| `landing#129` (`#2090`) | Two threads at `8f04fe7a1` (the order bullet names both). `verdict.sh landing 129`, fix in worktree `ticket-2090-downloads-panel`, `landing-verify.sh`, deliver, chain, merge at the bar, landing staging and production releases, `landing-check-5.cjs https://useorbit.org`. |
| `landing#133` (`#2095`) | After `landing#129` merges: retarget to `main`, merge `main`, CI, review, merge, releases. Never raise a byte budget. |
| Web and Android releases | Planned web and Android source is `main` (6 commits past `691323673`); released with the `#2111` merge. The Android Open release closes `#2094`. iOS shares the version per `#2106`. |
| `#2097` App Store review | Waits on the owner's phone and review code (`## Open questions`). |
| Intake | Mailbox empty. Store review cycle run `43048667647` was queued behind CI; the next `orbit-play-reviews.mjs --cycle` resumes it. Sentry unreadable (`## Current state`): retry hourly via `wait-auto-work.mjs`. |
| Fable plan | Per D149. This chain already runs on Fable 5.2; the owner was told once. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2432`, `#2431`, `#2430`, `#2429`, `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2388`; landing `#133`, `#129`; API none. Unpushed commits, dirty worktrees, stashes, running workers, subagents and detached checks: none. Worker launches: `#2111` 1 of 2. Waiters to re-arm: the outage probe, the chains above and `wait-auto-work.mjs`. Free disk 71 GiB.

## Then, in this order

1. Answer any owner message first, in his language. When you name a blocker, name its fix and who does it in the same line.
2. `ui#2432` (`#2111`), then the other in-flight rows, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `landing#132` merged (`599bdfb69`), landing staging and production released and checked at five widths, `#2107` closed; the `ui#2432` diff read and its cache fix pushed (`e82429dcb`); `ui#2429` round 3 fixed (`8ba4d14f4`); `main` merged into `landing#129`; the `ui#2420` tool tests and the first `ui#2418` macOS rerun.
- Superseded: one chain per pull request at once (probe the outage first).
- Carried: every other in-flight row; `#2097` submission (owner phone and code first); `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
