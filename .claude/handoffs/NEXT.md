/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails). Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that still holds the predecessor id, full or first 8 characters, with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its last ten entries. Write scratchpad scripts with the Write tool, with literal absolute paths. Start every waiter as a Bash background task with `run_in_background`. A `resolve-bot-thread.mjs` id must come from a `verdict.sh` read in the same session. Read the review body and the threads before every delivery. Filter every large tool output before it prints: the previous session reached the relay threshold in under two hours.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `fc6ad1c47`; API `main` `1a70835b4`; landing `main` `aa0eaed9c`. Production and staging API `1a70835b4`; web `691323673`; landing `599bdfb69`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `#2111` releases (owner report, first priority) | Web staging release run `43102924330` and Android Open 1.3.152 (213) run `43103079499`, both at `3db3e8c40`, ran at the handoff. Read each result. Then `release-run.sh ui production 3db3e8c400383de708ad0414cd8e9188e64a307c https://orbit-web-3qmv.onrender.com`, check the habit detail log on production web, close `#2111`; a green Android run closes `#2094`. |
| `landing#129` (`#2090`) | Merged as `aa0eaed9c`. Its staging release run `43104118097` failed: `Render deploy ended with build_failed`. Read the Render build log of `orbit-landing-staging` first (render MCP), fix the cause at its root, never raise a byte budget, then staging, production and the three rendered checks. |
| `landing#133` (`#2095`) | Base is `main`. A subagent merged the final `landing#129` code and `main` in worktree `ticket-2095-landing-motion`: head `13510ba`, clean, not pushed (fix commit `d3d7e38`, startup graph 23,732 of 24,000). Read the diff of `1105e00` and `d3d7e38`, run the six rendered checks listed in the predecessor log, push, chain, merge at the bar. |
| `ui#2414` (`#1561`) | Merged as `fc6ad1c47`. When its `PR Tests` and `Guards` push runs pass: production iOS Release 1.3.152 (2), read the `testflight-access` job. Then `main` into `ui#2423` (`#2106`), chain, merge. |
| Merge order | Every open UI branch is behind `main` again. One at a time: `main` merge, chain, merge at the bar: `ui#2427`, `ui#2431`, `ui#2422`, `ui#2418`, `ui#2426` (each approved before), then `ui#2434` (contract snapshot, one line), then the rest as approved. Record each merge with `record-merge.mjs`. |
| ui `#2433`, `#2419`, `#2430` | Review fixes pushed at `19a40214d`, `635076378`, `6e88d0eec`, threads resolved. Chain each. `ui#2433` also needs its Layout install step log read. |
| ui `#2425`, `#2424`, `#2421`, `#2420` | Their chains reached the ceiling during the GitHub outage. Run `rerun-outage.sh orbit-ui-mobile <pr>...`, then chain each; `ui#2425` `Guards` failed once on an npm publish window. |
| `#2097` App Review | `WAITING_FOR_REVIEW` at 19:56Z. Read `asc-api.mjs GET /v1/reviewSubmissions/a7a890f6-71dc-4595-a297-d4ed05608bb3`. |
| Intake | Mailbox empty. The Play review cycle did not find its run once (outage). Sentry and the Fable usage page are unreadable: no Chrome browser is connected to the worker account. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2434`, `#2433`, `#2431`, `#2430`, `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2388`; landing `#133`. Unpushed commits and dirty worktrees: landing `ticket-2095-landing-motion` holds unpushed commits `1105e00`, `d3d7e38`, `13510ba` (the subagent merge, clean tree). Stashes, running workers and detached checks: none. Worker launches: `#2111` 1 of 2, `#2112` 1 of 2, `#2113` 1 of 2. Waiters to arm: one `chain-review.sh` per pull request in CI or review, `wait-auto-work.mjs`, and a release waiter per dispatch.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. The `#2111` release results and the web production release, then the other in-flight rows, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; `#2113` released to staging and production and closed; `landing#129` merged; `ui#2414` merged; the `ui#2430` fix delivered after the staging check; review fixes on `ui#2433` and `ui#2419`; the web staging and Android Open dispatches for `#2111`.
- Superseded: `ui#2414` first in the merge order (merged); the wait for the `PR Tests` push run on `3db3e8c40` (passed on its second attempt).
- Carried: every other in-flight row; the merge order; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
