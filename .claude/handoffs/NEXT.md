/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it (a full read costs too much context). Read `DESIGN.md` `## Bans` and `BRAND.md` before a UI diff, and `## Motion` only before a motion diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (`mirror.sh`, `intake-noboard.sh`), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings (D1 to D11). Write scratchpad files with the Write tool and literal paths. The shell is zsh: loop only inside a `bash` script. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note (pattern `fix-note-ui-2445-round7.md`); correct a one-line defect yourself. Read each subagent diff and the review body, then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>` (the report needs the heading `## Test evidence`).

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. Workers run through scratchpad `prep-launch.sh <issue> <worktree name>` after `compose-ui.sh <issue> <worktree> <branch> <note>`; `new-ticket-wt.sh <issue> <name> <prefix> <base>` makes the worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner's newest order (pt-BR, in chat): finish Orbit faster. Reply to him in pt-BR. Its rescope is the `#2120` order bullet: stack Batch M.

## In flight

UI `main` `1ffaaa7ae`; API `main` `1cf355934`; landing `main` `381b253fa`. Production web `10cb968e5`; production API `2f49ed78f`; staging API `1cf355934`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `#2120` | NOT started. Start its worker now on a branch stacked on `chore/ticket-2119-file-ledger-hygiene`; free disk first (51 GiB at the last read, a worktree takes 5). |
| `api#1111` (`#2129`) at `8ace97c76` | The worker ended (launch 1 of 2): 3 commits, red first on the failed capture turn. Run `verify-delivery`, read the diff and the body, then `chain-review.sh api 1111`. After the merge: staging, 5 captures, production. |
| `ui#2447` (`#2131`) at `f155e85e9` | The worker diff is read. One subagent fix round (F1 to F6): see the `ui#2447` line under Inventory. Then the staging web release of the branch, the device proof (SE first), review and merge. |
| `ui#2448` (`#2132`) at `2b0082d4b` | Diff read, copy approved. Read the failed `installed (macos-latest, Developer ID)` job first, then `chain-review.sh ui 2448`. Read the Windows acceptance screenshots before the close. |
| `ui#2442` (`#2096`) at `2a51ea766` | The SonarCloud issues are fixed in code. Arm `chain-review.sh ui 2442`. It merges before `ui#2444`. |
| `ui#2445` (`#2128`) at `639cb2a0c` | Round 7 delivered, zero open threads. Arm `chain-review.sh ui 2445`. |
| `ui#2444` (`#2119`) at `2408256d5` | Waits for `ui#2442`. Then `main-merge-push.sh ticket-2119-file-ledger-hygiene`, the ledger steps and `chain-review.sh ui 2444`. No rerun of its red `Layout shard 1`. |
| `#1561` | Build 4 is `WAITING_FOR_BETA_REVIEW`: read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2121` to `#2126` | Batch M, in ticket order, each stacked on the ticket before it. `#2121` carries the owner's onboarding rework order. |
| Claude usage | Not read this session. Read `https://claude.ai/settings/usage` at the first tick, then at each hourly Sentry tick. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry: the `#2120` launch steps, the `#2129` cause, the `#2131` proof steps, and the `ui#2448` and `ui#2442` detail.

Inventory: open pull requests ui `#2442`, `#2444`, `#2445`, `#2447`, `#2448`, `#2388`; api `#1111`; landing none. Running workers: none. Stashes and dirty worktrees: none. Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Three simulators stay booted (notes file). Unpushed: `ui#2447` holds subagent commit `daeca6ec5` (F1 to F6; web parity for F2 and F4 is open); read it and `report-ui-2447-r1.md`, then push. Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request in CI or review (`ui#2442`, `ui#2445`, `ui#2448`, `api#1111`), `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. Launch the stacked `#2120` worker, then arm the four chains.
3. `api#1111` to merged, then staging, 5 captures and production.
4. `ui#2447` to proved, reviewed and merged; production web first, then the Android Open and TestFlight pair.
5. `ui#2448`, `ui#2442`, `ui#2445` and `ui#2444` to merged. Merge each approved pull request at once, then base-merge every other open branch in the same step (`behind_by=0`). Then one web release (never with an API release), which also publishes the desktop shell. Then the intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator, a simulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the `#2129` table and its second pull request (`api#1111`); `ui#2449` merged; the `ui#2442` and `ui#2448` red checks fixed; `ui#2445` round 7 delivered; two worker diffs read.
- Changed: Batch M is stacked (owner order to finish faster).
- Carried: the production API release; the open pull requests; the web release; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
