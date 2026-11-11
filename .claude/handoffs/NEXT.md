/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 71 GiB at handoff). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that still holds the predecessor id, full or first 8 characters, with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`. The spec's `## Current state` names the helpers. Write scratchpad scripts with the Write tool, with literal absolute paths in every redirect. Start every waiter as a Bash background task with `run_in_background` (never with `&`). A `resolve-bot-thread.mjs` id must come from a `verdict.sh` read in the same session. Read the review body and the threads before every delivery. Read each log time from `date -u`. In zsh, never `echo` a row of `=` characters.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `2f383eb51`; API `main` `2bdd96e30`; landing `main` `599bdfb69`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; staging and production landing `599bdfb69`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). iOS 1.3.152 is in App Review (`#2097`). The coordinator runs on the worker account. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| Merge order | Readiness needs a branch level with `main`, so one branch merges at a time. `ui#2432` first; `ui#2414` and `ui#2433` never before it. After each merge: `main` into the next approved branch, CI, one more review, merge. Record each merge sha with `record-merge.mjs`. |
| `ui#2432` (`#2111`, owner report, first priority) | Head `1ebc02a18`, `main` merged, CI was running. Chain, verdict, merge at the bar, then the production web release and the Android Open release at once, check the habit detail log on production web, close `#2111`; the Android release closes `#2094`. |
| `ui#2433` (`#2112`) | Head `94f266e68`, diff read. After CI: read the Layout install step log (no apt line, three shards green), review, `main` merge after `ui#2432`, merge with a squash body `Tracks thomasluizon/orbit-tickets#2112`, close. |
| `ui#2414` (`#1561`) | Head `371f4e3af`, round 4 fixed, threads resolved. Chain, `main` merge after `ui#2432`, merge at the bar. |
| `ui#2423` (`#2106`) | After `ui#2414` merges: production iOS Release 1.3.152 (2), read the `testflight-access` job; then `main` into `ui#2423`, CI, review, merge. |
| `ui#2420` (`#2100`) | One parity thread at `6f1cddf51` (the order bullet names it). `verdict.sh ui 2420`, `rb-note.sh 2420 <out>`, fix through a background subagent with `review-fix-brief.md` in worktree `ticket-2100-habit-form-motion`, read the diff, `deliver-fix.sh`, chain. |
| ui `#2419`, `#2421`, `#2422`, `#2424`, `#2425`, `#2426`, `#2427`, `#2430`, `#2431` | Layout jobs restarted after the outage; each waits for a review of its round 2 fix at the head in its bullet. Chain each, read the verdict, fix or queue for the merge order. |
| `ui#2418` (`#2103`) | As above, plus the third attempt of macOS acceptance run `43037012523` (a runner key-press flake, see the bullet). |
| `landing#129` (`#2090`) | Head `9344598a2`, rounds 8 and 9 fixed, threads resolved, CI was running. Chain, merge at the bar, landing staging and production releases, then `129-r10-render.cjs <dist>` and `landing-check-5.cjs https://useorbit.org`. |
| `landing#133` (`#2095`) | After `landing#129` merges: retarget to `main`, merge `main`, measure the startup graph (23,947 of 24,000 raw bytes before it), CI, review, merge, releases. Never raise a byte budget. |
| `#2097` App Review | Submitted. Read `asc-api.mjs GET /v1/reviewSubmissions/a7a890f6-71dc-4595-a297-d4ed05608bb3`; act on the result as the bullet says. |
| Intake | Mailbox and store reviews empty at 16:55Z. Sentry unreadable on the worker account (`## Current state`): retry hourly via `wait-auto-work.mjs`. |
| Fable plan | Per D149. This chain already runs on Fable 5.2; the owner was told once. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2433`, `#2432`, `#2431`, `#2430`, `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2388`; landing `#133`, `#129`; API none. Unpushed commits, dirty worktrees, stashes, running workers, subagents and detached checks: none. Worker launches: `#2111` 1 of 2, `#2112` 1 of 2. Waiters to re-arm: one `chain-review.sh` for every open pull request except `ui#2423`, `ui#2420` (fix first), `ui#2388` and `landing#133`, plus `wait-auto-work.mjs`. Free disk 71 GiB.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. Give the literal value he asks for. When you name a blocker, name its fix and who does it in the same line.
2. `ui#2432` (`#2111`), then the other in-flight rows, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2429` merged (`2f383eb51`); the mirror outage ended and `#2112` is filed with `ui#2433` open; `ui#2414` round 4 and `landing#129` rounds 8 and 9 fixed and pushed; `ui#2418` control run read; `#2097` submitted to App Review after the owner's phone and code; every Layout run restarted.
- Superseded: the outage probe; the owner question on the App Review phone and code.
- Carried: every other in-flight row; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
