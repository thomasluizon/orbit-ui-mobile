/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it (a full read costs too much context). Read `DESIGN.md` `## Bans` and `BRAND.md` before a UI diff, and `## Motion` only before a motion diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (entry floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (`mirror.sh`, `intake-noboard.sh`), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings. Write scratchpad files with the Write tool and literal paths; a shell redirect target must be a literal path. The shell is zsh: loop only inside a `bash` script, and use `/bin/ls` in the scratchpad. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note (pattern `fix-note-ui-2445-round8.md`); correct a one-line defect yourself. A subagent cannot write a report file: its final message is the report, and you save it. Read each subagent diff and the review body (`review-dump.sh <key> <pr> <round>`), then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>`.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. Workers run through scratchpad `prep-launch.sh <issue> <worktree name>` after `compose-ui.sh <issue> <worktree> <branch> <note>` (stacked: `compose-ui-stacked.sh <issue> <worktree> <branch> <base> <note>`); `new-ticket-wt.sh <issue> <name> <prefix> <base>` makes the worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner writes in pt-BR: reply in pt-BR. His order stands: finish Orbit faster. Never tell him that the usage limit will end and never plan around it (he has resets).

## In flight

UI `main` `1ffaaa7ae`; API `main` `1cf355934`; landing `main` `381b253fa`. Production web `10cb968e5`; production API `2f49ed78f`; staging API `1cf355934`; staging web `10cb968e5`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `api#1111` (`#2129`) at `0649ae9be` | Review round 1 delivered, copy verdict posted. Arm `chain-review.sh api 1111`. After the merge: staging, 5 captures, production. |
| `ui#2442` (`#2096`) at `237c890f1` | Review round 1 delivered. Arm `chain-review.sh ui 2442`. It merges before `ui#2444`. |
| `ui#2445` (`#2128`) | Round 8 (one P1 thread) was with a subagent at the relay: read the end of `handoff-notes.md`, then the commit, deliver, and arm the chain. |
| `ui#2447` (`#2131`) at `4be3a69ed` | Two fix rounds pushed. Run `staging-web-wait.sh fix/ticket-2131-iphone-sign-in 4be3a69ed730e8f7425a5fa6ce3b59f623e44e78` as a background task, start the device proof subagent with `proof-note-ui-2447.md`, then review and merge. |
| `ui#2448` (`#2132`) at `f3785b048` | Two fix rounds pushed. Approve the `desktopWindow.menu` copy, read the `installed (windows-latest)` job and its two captures, then `chain-review.sh ui 2448`. |
| `ui#2450` (`#2120`), base `chore/ticket-2119-file-ledger-hygiene` | Launch 2 of 2 ended at its time limit with Part 2 and a part of Part 3: read the end of `handoff-notes.md`. Then the spec bullet. `#2121` starts stacked on it when Part 3 is on the branch. |
| `ui#2444` (`#2119`) at `2408256d5` | Waits for `ui#2442`. Then `main-merge-push.sh ticket-2119-file-ledger-hygiene`, the ledger steps and `chain-review.sh ui 2444`. No rerun of its red `Layout shard 1`. |
| `#1561` | Build 4 is `WAITING_FOR_BETA_REVIEW`: read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2121` to `#2126` | Batch M, in ticket order, each stacked on the ticket before it. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry.

Inventory: open pull requests ui `#2442`, `#2444`, `#2445`, `#2447`, `#2448`, `#2450`, `#2388`; api `#1111`; landing none. Running workers: none after the relay. Stashes: none. Dirty worktree: `ticket-2120-orbit-identity` holds uncommitted Part 3 work and one unpushed commit from the worker that the time limit stopped (never discard it). Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request in CI or review, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. Arm the chains (`api#1111`, `ui#2442`), start the staging web wait and the `ui#2447` device proof, and deliver `ui#2445` round 8.
3. `ui#2450`: read the launch result and the diff, then the missing parts; start `#2121` when Part 3 is on the branch.
4. `api#1111` to merged, then staging, 5 captures and production.
5. `ui#2447` to proved, reviewed and merged; production web first, then the Android Open and TestFlight pair.
6. `ui#2448`, `ui#2442`, `ui#2445` and `ui#2444` to merged. Merge each approved pull request at once, then base-merge every other open branch in the same step (`behind_by=0`). Then one web release (never with an API release), which also publishes the desktop shell. Then the intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator, a simulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: two `#2120` launches (`ui#2450`); fix rounds on `api#1111`, `ui#2442`, `ui#2447` and `ui#2448`; one intake cycle.
- Changed: `ui#2448` gets a Menu action.
- Carried: every merge and release; the `ui#2447` device proof; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
