/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 69 GiB at handoff; `git clean -fdXq` in a clean, closed worktree frees space). The open owner question is in the spec's `## Open questions`: never ask it again.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that holds the predecessor scratchpad path or its 8-character id with `perl -pi` (`grep -l <predecessor id> *.sh` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`. The spec's `## Current state` names the helpers of the review round; the older helpers keep their names (`record-merge.mjs <key> <pr> <sha> [issue]`, `landing-verify.sh`, `landing-prod-check.cjs <origin>`). Write scratchpad scripts with the Write tool, with literal absolute paths in every redirect. Start every waiter as a Bash background task with `run_in_background` (never with `&`). A `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session (`verdict.sh` does one). Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `e9a388d0a`; API `main` `2bdd96e30`; landing `main` `43a0bf5`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; staging and production landing `43a0bf5`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). The coordinator runs on the worker account. Pullfrog reviews again, on a worker account token. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `ui#2432` (`#2111`, owner report, first priority) | Worker delivered 5 commits at `4b63dd6a4`, CI running. Read the diff, run `chain-review.sh ui 2432`, fix any finding, merge at the bar, record the sha. Then the production web release and the Android Open release at once, check the habit detail log on production web, close `#2111`. |
| ui `#2414`, `#2419`, `#2421`, `#2422`, `#2424`, `#2425`, `#2426`, `#2427`, `#2430`, `#2431` | Round 2 fixed and pushed, threads resolved, `main` merged; CI was running at the head in each bullet, no review requested at that head. Run one `chain-review.sh ui <pr>` per pull request (the relay stopped the old ones). On a verdict: `verdict.sh`, fix (background subagent with `review-fix-brief.md`, or the orchestrator for a small one), `deliver-fix.sh`, or merge at the bar and record the sha. |
| `ui#2420` (`#2100`) | Same state, but `Tool tests (2/4)` is red at `6f1cddf51`: read the job, fix the cause, push, then the chain. |
| `ui#2418` (`#2103`) | Same state, but `installed (macos-latest, Developer ID)` is red at `3aca1e4cb`: read the job; rerun once when it is the `hdiutil` flake; then the chain. |
| `ui#2429` (`#1561` status bar) | Approved at `89c8e3b01`, `main` merged to `4c5ffb0fa`, CI nearly done. Request the review, merge at the bar. |
| Merge order | Merge the approved pull requests one after another; after each merge, merge `main` into the next approved branch, wait for CI and one more review (readiness needs `behind_by=0`). `ui#2414` before `ui#2423`. |
| `ui#2423` (`#2106`) | After `ui#2414` merges: production iOS Release 1.3.152 (2), read the `testflight-access` job; then `main` into `ui#2423`, CI, review, merge. |
| `landing#132` (`#2107`) | Round 1 fixed (two guard tests) at `92dfbe0f7`, threads resolved, CI running. Run `chain-review.sh landing 132`, merge at the bar, landing staging and production releases, `landing-prod-check.cjs https://useorbit.org` at every width, close `#2107`. |
| `landing#129` (`#2090`), `landing#133` (`#2095`) | After `landing#132` merges: `main` into `landing#129`, `landing-verify.sh`, CI, review, merge, releases; then retarget `landing#133` to `main`, merge `main`, CI, review, merge, releases. Never raise a byte budget. |
| Web and Android releases | `ui#2412` (`#2094`) is merged as `e9a388d0a`: the Android Open release closes `#2094`. The next web release also carries `#2109`, `#2110` and the motion merges. iOS shares the version per `#2106`. |
| `#2097` App Store review | Waits on the owner's phone and review code (`## Open questions`). |
| Intake | Last cycle: mailbox empty, board placed. Sentry unreadable (no Sentry MCP tool, Chrome not connected, `sentry-cli` unauthorized): retry hourly via `wait-auto-work.mjs`. |
| Fable plan | After the Thursday 04:00 BRT reset per D149, when the owner types `/model claude-fable-5-2`. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2432`, `#2431`, `#2430`, `#2429`, `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2388`; landing `#133`, `#132`, `#129`; API none. Unpushed commits, dirty worktrees, stashes, running workers, subagents and detached checks: none. Worker launches: `#2111` 1 of 2. Waiters to re-arm: the chains above and `wait-auto-work.mjs`. Free disk 69 GiB.

## Then, in this order

1. Answer any owner message first, in his language. When you name a blocker, name its fix and who does it in the same line.
2. `ui#2432` (`#2111`), then the other in-flight rows, within the load gate. Record each merge sha with `record-merge.mjs` at merge time.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the review requests (the owner signed in; the workflow secret holds a worker account token); `ui#2412` merged (`e9a388d0a`); the `ui#2431` copy approval (posted twice); round 2 fixes on thirteen pull requests and `landing#132`; the drift review.
- Superseded: waiting for the Thursday reset before any review (the new token works now).
- Carried: every other in-flight row; `#2097` submission (owner phone and code first); `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
