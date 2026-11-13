/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it (a full read costs too much context). Read `DESIGN.md` `## Bans` and `BRAND.md` before a UI diff, and `## Motion` only before a motion diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (`mirror.sh`, `intake-noboard.sh`; repoint a copied folder before use), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its `## D` headings. Write scratchpad files with the Write tool and literal paths; a shell redirect target must be a literal path. The shell is zsh: loop only inside a `bash` script, quote each glob, and use `/bin/ls` in the scratchpad. Print at most 40 lines from any tool call. Send every review fix and diagnosis to a fresh background subagent (`opus`) with `review-fix-brief.md` and a narrow note; correct a one-line defect yourself. A subagent cannot write a report file: save its final message with `save-agent-report.mjs <agent id> <report name>`. Read each subagent diff and the review body (`review-dump.sh <key> <pr> <round>`), then `deliver-fix.sh <key> <pr> <worktree> <report> <reply> <thread ids>`.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. A worker launch ends after about 30 minutes, so a ticket part goes to an opus agent in its own worktree: `clone-wt.sh`, `make-part-note.sh`, `part-build-brief.md` (usage in `handoff-notes.md`). Run at most 4 build agents at one time (the load reached 62).

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped with no spinner on any surface (owner order, `#2120`), every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 19 open, 19 placed, 0 unplaced, 0 placed twice.

Reply to the owner in the language of his latest message (English now). His order stands: finish Orbit faster. Never tell him that the usage limit will end and never plan around it (he has resets).

## In flight

UI `main` `1f1c6d312`; API `main` `1cf355934`; landing `main` `381b253fa`. Production web `10cb968e5`; production API `2f49ed78f`; Android Open 1.3.154 (215); TestFlight 1.3.154 (4), `IN_BETA_REVIEW`.

| Item | Disposition |
| --- | --- |
| `api#1111` (`#2129`) at `08f78fb57` | Round 3 of 3: the fix agent's result is in `handoff-notes.md`. Read, deliver, chain, merge, then staging, 5 captures, production. |
| `ui#2448` (`#2132`) at `d5c963d4a` | Review round 4 is red (`review-ui-2448-4.md`): a fix agent, the chain, merge. Windows evidence read. |
| `ui#2444` (`#2119`) at `2e585aaa5` | Review round 4 is red (`review-ui-2444-4.md`): a fix agent, ledger, chain, merge, retarget `ui#2450`. |
| `ui#2447` (`#2131`) at `0eb44b1e5` | The device proof is red, 5 defects (`handoff-notes.md`): fix agents, a new build, a new proof, then `main`, review, merge. |
| `fix/ticket-2096-tab-transition-wait` | The root fix of the layout test that timed out twice: the agent's result is in `handoff-notes.md`. Read, push, open the pull request (`Tracks` `#2096`). |
| `ui#2450` (`#2120`) at `22da54ac2` | Round 3 plus the no-spinner order: result in `handoff-notes.md`. Read, push, merge up the stack, body, ledger, design reviewer, completeness critic. |
| `ui#2451` (`#2121`) | Both launches spent. Part 4 has a part branch; the edit flow, Part 2 and Part 3 need part agents. |
| `ui#2453` (`#2122`) | Launch 1 of 2 spent. Part 3 and Part 4 have part branches; launch 2 takes the rest of Part 1; Part 2 rest and Parts 5, 6, 7 need part agents. |
| `#1561` | Read `externalBuildState` with `asc-api.mjs` at each intake cycle. |
| `#2123` to `#2126` | Batch M, in ticket order. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry (row detail, helpers, drain results).

Inventory: open pull requests ui `#2444`, `#2447`, `#2448`, `#2450`, `#2451`, `#2453`, `#2388`; api `#1111`; landing none. Running workers: none after the relay. Stashes: none. Dirty worktrees: read `git status` first in each worktree that `handoff-notes.md` names (never discard uncommitted work; the three part branches `ticket-2121-part4`, `ticket-2122-part3` and `ticket-2122-part4` are local only). Detached worktrees with unpushed commits (leave them): `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`. Waiters to arm: one `chain-review.sh <key> <pr>` for each pull request in CI or review, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. Read the drain results in `handoff-notes.md`. Start the fix agents: `ui#2448`, `ui#2447`, `ui#2444`.
3. `api#1111`: read and deliver round 3. Release web (`main` holds 4 merges).
4. Read and push each agent result (`#2120` first: the stack builds on it), merge each part branch into its ticket branch, then start the next part agents.
5. Merge each approved pull request at once, then base-merge every other open branch in the same step, before another approval lands (`behind_by=0`). Then one web release (never with an API release), which also publishes the desktop shell. Then the intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate and the disk limit, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator, a simulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2445` and `ui#2452` merged, `#2128` closed; `#2120` round 2 pushed; the `#2121` launch 2; the `#2122` launch 1; one intake cycle.
- Changed: `#2122` started by parts before `#2121` ends. No spinner anywhere.
- Carried: every other merge and release; `api#1111`; the `ui#2447` proof; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
