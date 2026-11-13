/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it (a full read costs too much context). Read `DESIGN.md` `## Bans` and `BRAND.md` before a UI diff, and `## Motion` only before a motion diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (`mirror.sh`, `intake-noboard.sh`), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings. Write scratchpad files with the Write tool and literal paths; a shell redirect target must be a literal path. The shell is zsh: loop only inside a `bash` script, and use `/bin/ls` in the scratchpad. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note; correct a one-line defect yourself. A subagent cannot write a report file: save its final message with `save-agent-report.mjs <agent id> <report name>`. Read each subagent diff and the review body (`review-dump.sh <key> <pr> <round>`), then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>`.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. Workers run through scratchpad `prep-launch.sh <issue> <worktree name>` after `compose-ui-stacked.sh <issue> <worktree> <branch> <base> <note>` (not stacked: `compose-ui.sh`); `new-ticket-wt.sh <issue> <name> <prefix> <base>` makes the worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, `#2128`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 20 open, 20 placed, 0 unplaced, 0 placed twice.

Reply to the owner in the language of his latest message. His order stands: finish Orbit faster. Never tell him that the usage limit will end and never plan around it (he has resets).

## In flight

UI `main` `585c0ca8a`; API `main` `1cf355934`; landing `main` `381b253fa`. Production web `10cb968e5`; production API `2f49ed78f`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4).

| Item | Disposition |
| --- | --- |
| `api#1111` (`#2129`) at `08f78fb57` | Round 2 delivered. Arm `chain-review.sh api 1111`, merge, then staging, 5 captures, production. |
| `ui#2445` (`#2128`) at `c6eb314bf` | Round 9 delivered, `main` merged in. Arm `chain-review.sh ui 2445`, then merge. |
| `ui#2448` (`#2132`) at `5948c51ca` | Round 3 (Windows acceptance reader) pushed, copy approved. Arm the chain; read the `installed (windows-latest)` job and its two captures before the merge. |
| `ui#2447` (`#2131`) at `0eb44b1e5` | Round 3 (centred web panel) pushed. The staging web release of this head and the device proof subagent ran at the relay: read the end of `handoff-notes.md`. No `main` merge before the proof ends. Then review and merge. |
| `ui#2444` (`#2119`) at `75e06566b` | `main` merged in, ledger verified, comments replaced. Arm `chain-review.sh ui 2444`, then merge and retarget `ui#2450`. |
| `ui#2450` (`#2120`), base `chore/ticket-2119-file-ledger-hygiene` | Part 3 is on the branch except the shared motion layer; subagent round 2 ran at the relay: read the end of `handoff-notes.md`, then the spec bullet. |
| `#2121`, branch `feature/ticket-2121-guided-flows`, base `feature/ticket-2120-orbit-identity` | Launch 1 of 2 (Part 1, Part 2) ran at the relay: read its result, then launch 2 (Parts 3 and 4). |
| `#1561` | Build 4 is `WAITING_FOR_BETA_REVIEW`: read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2122` to `#2126` | Batch M, in ticket order, each stacked on the ticket before it. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry (the detail of each row and the drain results).

Inventory: open pull requests ui `#2444`, `#2445`, `#2447`, `#2448`, `#2450`, `#2388`, and the `#2121` pull request if launch 1 opened it; api `#1111`; landing none. Running workers: none after the relay. Stashes: none. Dirty worktrees: read `git status` in `ticket-2120-orbit-identity` and `ticket-2121-guided-flows` first (never discard uncommitted work). Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request in CI or review, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. Arm the chains (`api#1111`, `ui#2445`, `ui#2448`, `ui#2444`) and read the drain results for `ui#2447`, `ui#2450` and `#2121`.
3. `ui#2447`: the device proof result; a defect goes to a subagent; a green proof starts the `main` merge and the review.
4. `ui#2450`: read and push the round 2 commits, then the spec bullet. `#2121`: launch 2 of 2.
5. `api#1111` to merged, then staging, 5 captures and production.
6. Merge each approved pull request at once, then base-merge every other open branch in the same step (`behind_by=0`). Then one web release (never with an API release), which also publishes the desktop shell. Then the intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator, a simulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2442` merged (`585c0ca8a`); fix rounds on `api#1111`, `ui#2445`, `ui#2447` and `ui#2448`; the Menu copy approval; `#2120` Part 3 except the motion layer; the `#2121` launch 1; one intake cycle.
- Changed: reply in the owner's latest language, not a fixed one. The `ui#2447` proof runs at `0eb44b1e5`, after its layout fix.
- Carried: every other merge and release; the `ui#2447` device proof result; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
