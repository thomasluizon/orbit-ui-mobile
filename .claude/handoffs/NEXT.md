/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (the harness token diet; list the Decisions directory for its name) through the Obsidian MCP. Read `DESIGN.md` (`## Motion`, `## Bans`) and `BRAND.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (about 10 minutes; do read-only work until it exits) and write no file there before (the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (`mirror.sh`, `intake-noboard.sh`), and run `mirror.sh` with `bash`, then `durable-dedupe.sh`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings (D1 to D16). Write scratchpad files with the Write tool and literal paths. The shell is zsh and does not split words: loop only inside a `bash` script. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note (pattern `fix-note-ui-2445-r7.md`). Read each subagent diff and the review body, then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>`.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. Workers run through scratchpad `prep-launch.sh <issue> <worktree name>` after `compose-ui.sh <issue> <worktree> <branch> <note>`; `new-ticket-wt.sh <issue> <name> <prefix> main` makes the worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 20 open, 20 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `ecb3e6388`; API `main` `1cf355934`; landing `main` `381b253fa`. Production web `10cb968e5`; production API `2f49ed78f`; staging API `1cf355934`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `#2129` captures | The 5 staging captures ended and did NOT pass: run 1 failed at sign-in (invalid), runs 2 and 4 pass, run 3 lost the rename (its only preview is `habits.bulk.delete`; the 4 kept sub-habits stay "Water - 710ml"); read run 5. No production release of `1cf355934`. Post the table on `#2129` and `#2127`, then a second `orbit-api` pull request, red first on the run 3 turn (streams in `capture-2129-run3/`), then staging and 5 new captures. |
| `ui#2447` (`#2131`) at `f155e85e9` | The worker ended (launch 1 of 2). Read its diff, then the green device proof, the SE first, and one review fix for the findings in the notes. |
| `ui#2448` (`#2132`) at `eaee93165` | The worker ended (launch 1 of 2). Read its diff, then `chain-review.sh ui 2448`. Read the Windows acceptance screenshots before the close. |
| `ui#2442` (`#2096`) at `f3fa4872d` | Only `SonarCloud Code Analysis` is red ("C Reliability Rating on New Code"): read its open issues, fix the cause (subagent), then the chain. It merges before `ui#2444`. |
| `ui#2445` (`#2128`) at `dd41795eb` | Round 7: one P1 thread (review saved as `review-ui-2445-r7.md`). Write the note, send it to a subagent, deliver. |
| `ui#2444` (`#2119`) at `2408256d5` | Waits for `ui#2442`. Then `main-merge-push.sh ticket-2119-file-ledger-hygiene`, the ledger steps and `chain-review.sh ui 2444`. No rerun of its red `Layout shard 1`. |
| `#1561` | Build 4 is `WAITING_FOR_BETA_REVIEW`: read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2120` to `#2126` | Batch M, in ticket order; `#2120` after `ui#2444` merges. `#2121` carries the owner's onboarding rework order (newest comment). |
| Claude usage | 28% of the week at the last read. Read `https://claude.ai/settings/usage` at each hourly Sentry tick. |
| Intake | Nothing new at the last cycle (Sentry: Q, R, `ORBIT-WEB-1F`). |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry: it holds the `#2131` red proof (all five symptoms show on an iPhone SE and an iPhone 17 simulator, both left booted), how to drive a simulator (AXe CLI), the green proof steps, the findings that go back to `ui#2447` as one review fix, and the capture files.

Inventory: open pull requests ui `#2442`, `#2444`, `#2445`, `#2447`, `#2448`, `#2388`; api none; landing none. Unpushed commits, dirty worktrees, stashes, running workers and subagents: none. Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Three simulators stay booted (notes file). Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request in CI or review, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. The `#2129` second pull request (the lost rename), then staging, 5 captures and production. The assistant is the owner's live defect.
3. `ui#2447` to proved, reviewed, merged, and shipped in an Android Open and TestFlight pair: a person cannot finish e-mail sign-in on iPhone today.
4. `ui#2448`, `ui#2442`, `ui#2445` and `ui#2444` to merged, one at a time (`behind_by=0`; a branch takes `main` with its next push), then one web release (never with an API release), which also publishes the desktop shell. Then Batch M in its order and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator, a simulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2446` and `api#1110` merged; `api#1110` on staging; `ui#2442` pushed; `ui#2445` round 6 delivered; `#2131` and `#2132` filed and built; the onboarding order placed on `#2121`.
- Changed: every device proof runs on the smallest device first (the owner's iPhone is an SE 2020).
- Carried: the production API release; the open pull requests; the web release; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
