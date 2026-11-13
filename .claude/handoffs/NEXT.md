/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it (a full read costs too much context). Read `DESIGN.md` `## Bans` and `BRAND.md` before a UI diff, and `## Motion` only before a motion diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; `docker system df` shows what a `docker builder prune -af` gives back).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before; the predecessor id is `relay.from`; it takes about 5 minutes). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (`mirror.sh`, `intake-noboard.sh`; repoint a copied folder before use), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings. Write scratchpad files with the Write tool and literal paths; a shell redirect target must be a literal path. The shell is zsh: loop only inside a `bash` script, quote each glob, and use `/bin/ls` in the scratchpad. Print at most 40 lines from any tool call, and read every log time from `date -u`. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note; correct a one-line defect yourself. Write the full thread text for a note with `full-threads.sh <key> <pr> <round>`. A subagent cannot write a report file: save its final message with `save-agent-report.mjs <agent id> <report name>`. Read each subagent diff (gate files, `DESIGN.md` hunks first), then `deliver-fix.sh <key> <pr> <worktree> <absolute report> <absolute reply> <thread ids>`, or `resolve-per-thread.mjs` when each thread has its own reply.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. A worker launch ends after about 30 minutes, so a ticket part goes to an opus agent in its own worktree: `clone-wt.sh`, `make-part-note.sh`, `part-build-brief.md` (usage in `handoff-notes.md`). Run at most 4 build agents at one time (the load reached 62).

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped with no spinner on any surface (owner order, `#2120`), every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 19 open, 19 placed, 0 unplaced, 0 placed twice.

Reply to the owner in the language of his latest message (English now). His order stands: finish Orbit faster. Never tell him that the usage limit will end and never plan around it (he has resets).

## In flight

UI `main` `1f1c6d312`; API `main` `1cf355934`; landing `main` `381b253fa`. Production web: read `/api/health` (the release of `1f1c6d312` was dispatched; result in `handoff-notes.md`); production API `2f49ed78f`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4), approved for outside testers.

| Item | Disposition |
| --- | --- |
| `ui#2448` (`#2132`) at `a458f11a5` | Round 4 delivered, seven threads resolved. No chain is armed: arm it, read the Windows evidence, merge, release web. |
| `ui#2444` (`#2119`) at `2adb61dd9` | Round 4 delivered, ledger verified. Arm the chain, merge, retarget `ui#2450` to `main`. |
| `api#1111` (`#2129`) at `33d60d654` | Round 3 delivered, copy approved. Arm the chain, merge, then staging, 5 captures, production. Four more cases: an agent result on `fix/ticket-2129-atomic-turn-rest`. |
| `ui#2454` (`#2096`) at `60b23fa3e` | The tab transition root fix. Arm the chain, merge. |
| `ui#2447` (`#2131`) at `0eb44b1e5` | Two fix agent results (`handoff-notes.md`): read, merge the part branch, push, staging web of the new head, new builds, a new proof, then `main`, review, merge. |
| `ui#2450` (`#2120`) at `8359df687` | Round 3 pushed. The base merge (22 conflicts) is an agent result: read, push, merge up the stack, body, ledger, design reviewer, completeness critic. |
| `ui#2451` (`#2121`) | The local branch holds `#2120` round 3 and Part 4, not pushed. Three part agents are ready to start: the rest of Part 1, Part 2, Part 3. |
| `ui#2453` (`#2122`) | The local branch holds the local `#2121` head, not pushed. A merge agent for Part 3 and Part 4 is ready to start; then the rest of Part 1 and Part 2, and Parts 5, 6, 7. |
| `#1561` | Read `externalBuildState` with `asc-api.mjs` at each intake cycle; add each new build to the group. |
| `#2123` to `#2126` | Batch M, in ticket order. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry (row detail, helpers, ready notes, drain results).

Inventory: open pull requests ui `#2444`, `#2447`, `#2448`, `#2450`, `#2451`, `#2453`, `#2454`, `#2388`; api `#1111`; landing none. Running workers: none after the relay. Stashes: none. Dirty worktrees: read `git status` first in each worktree that `handoff-notes.md` names (never discard uncommitted work). Local only, not pushed: the heads of `ticket-2121-guided-flows` and `ticket-2122-destinations`, the part branches `ticket-2121-part4`, `ticket-2122-part3`, `ticket-2122-part4`, the new clones `ticket-2121-part2`, `ticket-2121-part3`, `ticket-2131-android-turnstile`, and api `ticket-2129-atomic-turn-rest`. Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request in CI or review, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. Arm the four chains (`ui#2448`, `ui#2444`, `api#1111`, `ui#2454`). Confirm production web serves `1f1c6d312`.
3. Read the drain results in `handoff-notes.md`. Start the ready agents first (the three `#2121` parts, the `#2122` merge), within the limit of 4.
4. Read and push each agent result: `ui#2447` (then its staging release and proof), the `#2120` base merge (then merge up the stack), the `#2129` cases.
5. Merge each approved pull request at once, then base-merge every other open branch in the same step, before another approval lands (`behind_by=0`). Then one web release (never with an API release), which also publishes the desktop shell. Then the intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator, a simulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: round 4 of `ui#2448` and of `ui#2444`, round 3 of `api#1111`, `ui#2454` opened, `#2120` round 3 pushed, the staging web release, one intake cycle, the fix agents for `ui#2447` started.
- Changed: the Calendário view selector sits under the Orbit line row (the `#2122` ticket orders it). Four more `#2129` cases are in work.
- Carried: every merge; the production web result; the `ui#2447` proof; the `#2121` and `#2122` parts; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
