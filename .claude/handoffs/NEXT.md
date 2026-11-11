/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails): its last section holds the owner's Fable 5.2 plan. Read `DESIGN.md` (`## Motion`, `## Bans`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB; 70 GiB at handoff). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that still holds the predecessor id, full or first 8 characters, with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`. The spec's `## Current state` names the helpers. Write scratchpad scripts with the Write tool, with literal absolute paths in every redirect. Start every waiter as a Bash background task with `run_in_background` (never with `&`). A `resolve-bot-thread.mjs` id must come from a `verdict.sh` read in the same session. Read the review body and the threads before every delivery. Read each log time from `date -u`. In zsh, never `echo` a row of `=` characters.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 24 open, 24 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `2f383eb51`; API `main` `2bdd96e30`; landing `main` `599bdfb69`. Production and staging API `2bdd96e30`; web `691323673`; desktop 0.1.29; staging and production landing `599bdfb69`; Android Open 1.3.152 (212); TestFlight production 1.3.152 (1). iOS 1.3.152 is in App Review (`#2097`). The coordinator runs on the worker account. Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| Merge order | Readiness needs a branch level with `main` (`behind_by` 0 on `gh api .../compare/main...<branch>`), so one branch merges at a time. `ui#2432` first, `ui#2414` second. After each merge: `main` into each approved branch, CI, one more review, merge. Record each merge sha with `record-merge.mjs`. |
| `ui#2432` (`#2111`, owner report, first priority) | Head `e838c3b74`, round 1 fixed, thread resolved, level with `main`. Chain, verdict, merge at the bar, then the production web release and the Android Open release at once, check the habit detail log on production web, close `#2111`; the Android release closes `#2094`. |
| `ui#2414` (`#1561`) | Approved at `371f4e3af`, level with `main`. Merge at the bar right after `ui#2432` (if it fell behind: `main` merge, CI, review). Then `ui#2423`. |
| `ui#2423` (`#2106`) | After `ui#2414` merges: production iOS Release 1.3.152 (2), read the `testflight-access` job; then `main` into `ui#2423`, CI, review, merge. |
| ui `#2427`, `#2431`, `#2422`, `#2418` | Each approved at the head in its bullet but behind `main` by 1. After `ui#2432` merges: `main` merge, chain, merge at the bar, one at a time. |
| ui `#2433`, `#2426`, `#2425`, `#2424`, `#2421`, `#2420`, `#2419` | Review fixes pushed at the heads in their bullets, threads resolved. Chain each, read the verdict (body and threads), fix or queue for the merge order. `ui#2433` also needs its Layout install step log read and a squash body `Tracks thomasluizon/orbit-tickets#2112`. `ui#2419` and `ui#2420` both change `motion-pressable.tsx:45`. |
| `api#1107` (`#2113`) | Head `83c87f0d4`, worker launch 1 of 2, diff read. Chain, merge at the bar, API staging then production release (no migration), close `#2113`. |
| `ui#2430` (`#2110`) | Three round 3 threads wait on the `#2113` API release. Then `verdict.sh ui 2430`, `rb-note.sh 2430 <out>`, one fix through a background subagent with `review-fix-brief.md` in worktree `ticket-2110-astra-create-preview` (the bullet lists the four changes), read the diff, `deliver-fix.sh`, chain. |
| `landing#129` (`#2090`) | Head `d9b6810b0`, rounds 10 and 11 fixed, threads resolved. Chain, merge at the bar, landing staging and production releases, then `129-r10-render.cjs <dist>` and `landing-check-5.cjs https://useorbit.org`. |
| `landing#133` (`#2095`) | After `landing#129` merges: retarget to `main`, merge `main`, measure the startup graph (23,947 of 24,000 raw bytes before it), CI, review, merge, releases. Never raise a byte budget. |
| `#2097` App Review | `WAITING_FOR_REVIEW` at 17:55Z. Read `asc-api.mjs GET /v1/reviewSubmissions/a7a890f6-71dc-4595-a297-d4ed05608bb3`; act on the result as the bullet says. |
| Intake | Mailbox empty (one Apple receipt acknowledged). The Play review cycle failed once on its 600 second wait: the waiter retries. Sentry unreadable on the worker account (`## Current state`): retry hourly via `wait-auto-work.mjs`. |
| Fable plan | Per D149. This chain already runs on Fable 5.2; the owner was told once. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2433`, `#2432`, `#2431`, `#2430`, `#2427`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2414`, `#2388`; landing `#133`, `#129`; API `#1107`. Unpushed commits, dirty worktrees, stashes, running workers, subagents and detached checks: none. Worker launches: `#2111` 1 of 2, `#2112` 1 of 2, `#2113` 1 of 2. Waiters to re-arm: one `chain-review.sh` for ui `#2432`, `#2433`, `#2426`, `#2425`, `#2424`, `#2421`, `#2420`, `#2419`, landing `#129` and api `#1107`, plus `wait-auto-work.mjs`. Free disk 70 GiB.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. Give the literal value he asks for. When you name a blocker, name its fix and who does it in the same line.
2. `ui#2432` (`#2111`), then the other in-flight rows, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; the `ui#2420` parity fix; `ui#2433` round 1; `ui#2414` and `ui#2418` approved; `landing#129` rounds 10 and 11; `#2113` filed with `api#1107` open.
- Superseded: the wait for the round 2 reviews (each row above holds its result).
- Carried: every other in-flight row; the merge order; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
