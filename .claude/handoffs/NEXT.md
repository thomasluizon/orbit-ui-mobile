/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (the full id first: `mirror.sh`, `intake-noboard.sh`, `chain-review.sh`, `chain-review-v2.sh`, `last-message.mjs`), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. A shell redirect target must be a literal path. The shell is zsh: every loop goes in `bash -c` or a `bash` script file; quote each glob; use `/bin/ls` in the scratchpad. Print at most 40 lines from a tool call; read each log time from `date -u`.

KEEP THE COORDINATOR LEAN: load no skill text you do not need, read no report in full, and send every read, review, fix and diagnosis to a background subagent (`opus`) with a narrow note. Ask each agent for ONLY a final message of at most 12 lines and a result file not named `report-*` (the harness refuses that name). Read each subagent diff before a push (gate files and `DESIGN.md` hunks first). Read `sysctl -n vm.loadavg` before each launch: an agent that runs whole suites starts only under 18.

A worker order says: no background task, one pull request for the whole ticket, never file a ticket, never `git stash`, commit and push early, never the full `node tools/test-tools.mjs`, and in `apps/web` only `npx vitest run --project jsdom <files>`. A ticket part goes to an opus agent in its own worktree (`clone-wt.sh`, `build-2074-brief.md`, `part-build-brief.md`). Run at most 4 part build agents at one time.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`), the owner's live reports fixed and shipped (`#2131` iPhone sign-in, `#2132` Windows top bar), the mascot rebrand (`#2119` to `#2126`) shipped with no spinner on any surface, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 18 open, 18 placed, 0 unplaced, 0 placed twice.

Reply to the owner in the language of his latest message. His orders stand: finish Orbit faster; a review round of about 15 minutes; every workflow job deleted unless it has a reason, and each job that stays as fast as it can be. Never tell him that the usage limit will end and never plan around it.

## In flight

UI `main` `1f1c6d312`; API `main` `1cf355934`; landing `main` `381b253fa`. Nothing merged in the last session. Two heads were pushed; every other fix is a LOCAL commit in its worktree.

| Item | Disposition |
| --- | --- |
| `#2074` round time | Six parts on local branches; built: UI harness, UI tests, landing. Read the drain results for the other three. One merge agent joins the four UI parts; local review; push; protection changes; the brain ADR. |
| `ui#2454` (`#2096`) at `c21978804` | Pushed. Start `chain-review.sh ui 2454`; merge at the bar. |
| `ui#2448` (`#2132`) at `53c184035` | Pushed. Start `chain-review.sh ui 2448`; it needs a new Windows installed proof before the merge. |
| `ui#2444` (`#2119`) at `c53c4eda4` | Local `b1298a8dc` is ready. Read the narrow review result, then ledger comments, body, resolve, push, chain. |
| `api#1111` (`#2129`) at `b1ab3e924` | Read the fix agent's drain result; one narrow review; body, resolve, push, chain. |
| `ui#2447` (`#2131`) at `a55538a33` | Read the fix agent's drain result; push, staging web of the branch, the device proof (Android first), chain. |
| `landing#134` | Not approved (Node floor). Read the fix agent's drain result and `live-plan-landing-node.md`; run the Render change; push to the Dependabot branch; open the API Terraform pull request; chain. It gates every landing pull request. |
| `ui#2450`, `ui#2451`, `ui#2453` | `#2120`: read the fix drain result, push, merge up the stack. `#2121`: two parity mappings. `#2122` holds a local head. |
| `#1561` | Add each new build to the outside group (`asc-external-group.mjs`). |
| `#2123` to `#2126` | Batch M, in ticket order. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Read scratchpad `handoff-notes.md` after the carry: the lessons, the detail of each row, the protection changes done and still to do, and `## Results that arrived during the relay drain`.

Inventory: open pull requests ui `#2444`, `#2447`, `#2448`, `#2450`, `#2451`, `#2453`, `#2454`, `#2388`; api `#1111`; landing `#134`. Running workers: none after the relay. Stashes: none. Dirty worktrees: read `git status` first in each worktree that `handoff-notes.md` names (never discard uncommitted work). Local only, not pushed: each branch that `handoff-notes.md` names, the six `#2074` branches included. Leave the detached worktrees `combined-2065`, api `scratch-1090-merge` and api `scratch-877-timing`. Waiters to arm: `chain-review.sh <key> <pr>` after each push and for `ui#2454` and `ui#2448` now, `wait-release.mjs` for each release run, `wait-auto-work.mjs` always.

## Then, in this order

1. Answer any owner message first, before any other work and before a relay step. Give each order a ticket or a rescope before the turn ends.
2. OWNER ORDER, FIRST: finish `#2074` from the drain results: merge the UI parts, a local review of each diff, push the three pull requests, the protection changes at each merge, a brain ADR, then measure one round in each repository and write the figures on the ticket.
3. Beside it: finish each red pull request from its drain result. Before every push: the fix, then one local review agent on the new commits (`local-review-brief.md`), then one push.
4. Merge each approved pull request at once, then base-merge every other open branch in the same step (`behind_by=0`). Then one web release (never with an API release). Tell the owner each merge in product terms.
5. The `ui#2447` device proof, the stack (`#2120`, `#2121`, `#2122`), then the intake cycle, as the spec's `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: three `#2074` parts built; `ui#2454` and `ui#2448` pushed; five delta reviews; the `#2120` and `#2121` gate checks; one intake cycle; the first landing protection change.
- Changed: `landing#134` now merges before the landing `#2074` pull request; the `#2120` ring width goes back to the base values.
- Carried: every merge and release; the rest of the `#2074` build and its measurement on or after 16 November 2026; the `ui#2447` proof; the stack; Batch M; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session: treat each as a lead to verify.
