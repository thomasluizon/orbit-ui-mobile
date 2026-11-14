/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it (a full read costs too much context).

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (the full id first: `mirror.sh`, `intake-noboard.sh`, `chain-review.sh`, `last-message.mjs`, and each note you give to an agent), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. Write scratchpad files with the Write tool and literal paths; a shell redirect target must be a literal path. The shell is zsh: every loop goes in a `bash` script file; quote each glob, and use `/bin/ls` in the scratchpad. Print at most 40 lines from any tool call, and read every log time from `date -u` before you write it.

KEEP THE COORDINATOR LEAN: the last session filled its context in 35 minutes. Load no skill text you do not need, read no tool file or report in full, and send every read, review, fix and diagnosis to a background subagent (`opus`) with a brief and a narrow note. Ask each agent for a final message of at most 12 lines, with its full report as the message before it (`last-message.mjs <agent id> <file> longest` saves it). Read each subagent diff before a push (gate files and `DESIGN.md` hunks first).

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, never `git stash`, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. A ticket part goes to an opus agent in its own worktree: `clone-wt.sh`, `make-part-note.sh`, `part-build-brief.md`. Run at most 4 build agents at one time.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped with no spinner on any surface, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 18 open, 18 placed, 0 unplaced, 0 placed twice.

Reply to the owner in the language of his latest message. His orders stand: finish Orbit faster; a review round of about 15 minutes; every workflow job deleted unless it has a reason, and each job that stays as fast as it can be. Never tell him that the usage limit will end and never plan around it.

## In flight

UI `main` `1f1c6d312`; API `main` `1cf355934`; landing `main` `381b253fa`. Nothing merged and nothing was pushed in the last session: every fix below is a LOCAL commit or a dirty file in its worktree.

| Item | Disposition |
| --- | --- |
| `#2074` round time | The proposal is decided and written: scratchpad `plan-2074-round-time.md`, six `advocate-*.md` reports. Nothing is built. Start three build agents at once (API, landing, UI). |
| `ui#2448` (`#2132`) at `0fa57c06d` | Round 8 (one race) is fixed in two uncommitted files; the local review has 5 more findings. One fix agent, body, commit, resolve, push, chain. |
| `api#1111` (`#2129`) at `b1ab3e924` | Round 6 is fixed locally; the same agent worked on 10 local review findings. Read the drain results, delta review, body, resolve, push, chain. |
| `ui#2444` (`#2119`) at `c53c4eda4` | One agent worked on the two round 8 threads and 12 local review findings. Read the drain results, ledger verify, body, resolve, push, chain. |
| `ui#2454` (`#2096`) at `3961706a4` | The thread is fixed locally; one agent worked on 3 local findings and the new body. Read, publish the body, resolve, push, chain. |
| `ui#2447` (`#2131`) at `a55538a33` | Four local commits plus an agent on 8 local review findings. Then the delta review, the body, push, the device proof (Android first), review, merge, web release and the mobile pair. |
| `ui#2450`, `ui#2451`, `ui#2453` | Merge agents worked on the `#2120` slices and the `#2121` parts; `#2122` holds a local head. Read the gate hunks first. |
| `landing#134` | No review can start until the landing protection change of `#2074` (two required CodeQL contexts never report on a Dependabot pull request). |
| `#1561` | Add each new build to the outside group (`asc-external-group.mjs`). |
| `#2123` to `#2126` | Batch M, in ticket order. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry: the detail of each row, the helpers, and `## Results that arrived during the relay drain`.

Inventory: open pull requests ui `#2444`, `#2447`, `#2448`, `#2450`, `#2451`, `#2453`, `#2454`, `#2388`; api `#1111`; landing `#134`. Running workers: none after the relay. Stashes: none. Dirty worktrees: read `git status` first in each worktree that `handoff-notes.md` names (never discard uncommitted work). Local only, not pushed: each branch that `handoff-notes.md` names. Leave the detached worktrees `combined-2065`, api `scratch-1090-merge` and api `scratch-877-timing`. Waiters to arm: one `chain-review.sh <key> <pr>` after each push, `wait-release.mjs` for each release run, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. OWNER ORDER, FIRST: build `#2074` from `plan-2074-round-time.md`: three build agents now, a local review of each diff, push, the protection changes at each merge, a brain ADR, then measure one round in each repository and write the figures on the ticket.
3. Beside it: finish each red pull request from its drain result. Before every push: the fix, then one local review agent on the new commits (`local-review-brief.md`), then one push.
4. Merge each approved pull request at once, then base-merge every other open branch in the same step (`behind_by=0`). Then one web release (never with an API release). Tell the owner each merge in product terms.
5. The `ui#2447` device proof, the stack (`#2120`, `#2121`, `#2122`), then the intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the `#2074` proposal; local reviews of five pull requests; one intake cycle.
- Changed: every push follows a local review.
- Carried: every merge and release; the `#2074` build; the `ui#2447` proof; the stack; Batch M; `#1561`, `#1563`, `#315`, `#33`; the `#2074` measurement on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
