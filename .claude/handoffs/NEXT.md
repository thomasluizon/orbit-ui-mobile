/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (the full id first: `mirror.sh`, `intake-noboard.sh`, `chain-review.sh`, `chain-review-v2.sh`, `last-message.mjs`, `resolve-per-thread.mjs`, `staging-web-branch.sh`, `release-run.sh`, `ledger-2444-*.sh`), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. A shell redirect target must be a literal path. The shell is zsh: every loop goes in `bash -c`; quote each glob; use `/bin/ls` in the scratchpad. Print at most 40 lines from a tool call; read each log time from `date -u`.

KEEP THE COORDINATOR LEAN: load no skill text you do not need, read no report in full, and send every read, review, fix and diagnosis to a background subagent (`opus`) or a worker with a narrow note. Ask each agent for ONLY a final message of at most 12 lines and a result file not named `report-*`. Read each diff before a push (gate files and `DESIGN.md` hunks first). Read `sysctl -n vm.loadavg` before each launch: an agent that runs whole suites starts only under 18.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`), the owner's live reports fixed and shipped (`#2131`, `#2132`), the mascot rebrand (`#2119` to `#2126`) shipped with no spinner on any surface, every `#315` launch list ticket closed, then `#315` closed. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 18 open, 18 placed, 0 unplaced, 0 placed twice.

Reply to the owner in the language of his latest message. His orders: `#2074` (the GitHub Actions order) is MAX priority; a review round of about 15 minutes; every workflow job deleted unless it has a reason. Worker account model rotation (spec `## Standing rules`): workers run `claude-fable-5-2`; when `launch-worker.mjs` prints `usageLimitReached: true`, tell the owner at once (he resets); then Opus 5.5, tell him again; then back to Sonnet 5.5. Never plan around a usage limit otherwise.

## In flight

UI `main` `4afd790f0` (on production web); API `main` `de4a8db30`; landing `main` `381b253fa`. Scratchpad `handoff-notes.md` holds the detail, the result file of each row and the protection lists.

| Item | Disposition |
| --- | --- |
| `#2074` UI | Worker on the worker account (Fable 5.2) fixes both review files in worktree `ticket-2074-round-time` → `fix-ui-2074-r1-result.md`. Outcome unknown: read `git log` there first. Then read the diff, push, open the pull request (`body-ui-2074-final.md`), chain. No protection change. |
| `#2074` API | Fixed at `9878b61ab` (api worktree `ticket-2074-round-time`, not pushed), all suites green (`fix-api-2074-result.md`). Read the diff, push, open the pull request (`body-api-2074-final.md`), chain; protection before and after the merge as the result file lists. |
| `#2074` landing | `e5672b4`, ready. After `landing#134` merges: base-merge, push, open, protection, chain. |
| `landing#134` | Local `7e212b0` moves Vite into Astro's range (graph 23,447 bytes). Narrow review → `narrow-review-landing-134-vite.md`. Then push to the Dependabot branch, resolve `PRRT_kwDORqm3lM63bF7U` with `reply-landing-134-vite.md`, chain, merge, landing release. |
| `ui#2444` (`#2119`) | Pushed `1e8be67a1`, threads resolved. Start `chain-review.sh ui 2444`; merge at approval; retarget `ui#2450` to `main`. |
| `ui#2447` (`#2131`) | Local `335d7e42e` (Turnstile retry). One narrow review, push, resolve the thread from the last section of `report-ui-2447-r3.md`, staging web, device proof (Android first), chain. |
| `ui#2448` (`#2132`) | Fix agent result `fix-2448-flakes-result.md` (outcome unknown). Read, push, Windows installed proof, chain. |
| `api#1111` (`#2129`) | Fix agent result `fix-api-1111-r8-result.md` (outcome unknown). Read, body, resolve, push, chain. |
| `ui#2450` (`#2120`) | Fix agent with the critic and review lists → `fix-2120-critic2-result.md` (outcome unknown). Read, push, merge up the stack. |
| `ui#2451`, `ui#2453` | `#2121` local `bb361d3a7`; `#2122` local `c46822fbe` (holds `#2121`). Next: `#2122` Parts 5, 6, 7 as worker part builds. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Uncommitted on purpose in the main checkout: `.claude/orchestrator.json` (Fable 5.2 tiers) and `tools/__tests__/launch-worker.mjs`; the `#2074` UI worker ports both into its pull request. Stashes: none in the three repositories. Leave the detached worktrees `combined-2065`, api `scratch-1090-merge` and api `scratch-877-timing`. Waiters to arm: `chain-review.sh` after each push, `wait-release.mjs` for each release, `wait-auto-work.mjs` always. A Sentry listing is due.

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. `#2074`: push the three pull requests, the protection changes at each merge (mark each D150 row DONE), then measure one round in each repository and write the figures on the ticket; `tools/review-rounds.mjs` on or after 16 November 2026.
3. Beside it: finish each pull request from its result file. Before every push: one local review of the new commits.
4. Merge each approved pull request at once, base-merge every other open branch (`behind_by=0`), then one web release (never with an API release). Tell the owner each merge in product terms.
5. The `ui#2447` device proof, the stack, then the intake cycle, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` (`merge-gate.sh <key> <pr>` with `MSUBJ` and `MBODY`) after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2444` base-merged and pushed twice; `api#1112` merged and the staging landing apply; production web release of `ui#2454`; the `#2074` UI parts joined; the `#2074` API review and fix; the brain ADR (D150); `#2120` scanner fix and the `#2122` base merge.
- Changed: `landing#134` now also moves Vite into Astro's range; the Android not-found screen keeps its drawn edge; the Turnstile wait skeleton moved to `#2121`.
- Carried: every other merge and release; the `#2074` measurement; the `ui#2447` proof; the stack; Batch M; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session: treat each as a lead to verify.
