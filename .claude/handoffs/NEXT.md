/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (the full id first: `mirror.sh`, `intake-noboard.sh`, `chain-review.sh`, `chain-review-v2.sh`, `gated-launch.sh`, `play-cycle-run.sh`, `last-message.mjs`, `resolve-per-thread.mjs`, `staging-web-branch.sh`, `release-run.sh`, `token-swap.py`, `ledger-2444-*.sh`), and run `mirror.sh` with `bash`, then `durable-dedupe.sh` as a background task. A shell redirect target must be a literal path (use the Write tool otherwise). The shell is zsh: every loop goes in `bash -c`; quote each glob; use `/bin/ls` in the scratchpad. Print at most 40 lines from a tool call; read each log time from `date -u`.

KEEP THE COORDINATOR LEAN: load no skill text you do not need, read no report in full, and send every read, review, fix and diagnosis to a background subagent (`opus`) or a worker with a narrow note. Ask each agent for ONLY a final message of at most 12 lines and a result file not named `report-*`. Read each diff before a push (gate files and `DESIGN.md` hunks first). Read `sysctl -n vm.loadavg` before each launch. A long worker build passes `--hard-ceiling-minutes 150`; a branch gets at most 2 worker launches, then an in-process agent.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129`, including the owner's AI plan below), the owner's live reports fixed and shipped (`#2131`, `#2132`), the mascot rebrand (`#2119` to `#2126`) shipped with no spinner on any surface, `#2133` merged, every `#315` launch list ticket closed, then `#315` closed. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 19 open, 19 placed, 0 unplaced, 0 placed twice.

Reply to the owner in the language of his latest message (English). His orders: `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell him at once); never mention ChatGPT Plus.

## In flight

UI `main` `4afd790f0`; API `main` `de4a8db30`; landing `main` `381b253fa`. Scratchpad `handoff-notes.md` holds each row's state, result file and next step; `sleep-decisions.md` holds D1 to D18.

| Item | Disposition |
| --- | --- |
| Owner AI order (`#2129`) | `/g-best-implementation` done: `best-impl-orbit-ai.md` picks "one typed change plan" (6 steps; detail in `handoff-notes.md`). Next: the second account on Fable 5.2 must AGREE (`CLAUDE_CONFIG_DIR="$ORBIT_WORKER_CLAUDE_CONFIG_DIR" claude -p --model claude-fable-5-2`); iterate until it does; then explain to the owner, in plain words, what changes. |
| `api#1113` (`#2074` API) | Pushed `77d09d857`. At approval: protection changes before and after the merge (`body-api-2074-final.md`), merge, D150 rows DONE. |
| `#2074` UI | Local `f44469008`; agents: N4 suites plus body, narrow review. Then push, open the PR (`body-ui-2074-final.md`), chain. |
| `#2074` landing | `e5672b4`; after `landing#134` merges: base-merge, push, open, protection, merge. |
| `landing#134` | Local `407c9203f` (import nit plus test loader): narrow review, resolve the thread, push, chain, merge, landing release. |
| `ui#2447` (`#2131`) | Pushed `77206077f`, CI green; one App Review thread on the custom Apple button: verify Apple's HIG, fix at the root, push, device proof (Android first), merge, web release, mobile pair. |
| `ui#2448` (`#2132`) | Pushed `f0c6384d1`, CI running: rewrite the body evidence for that head, then request the review. |
| `ui#2444` (`#2119`) | Local `ab9bb1ff4` plus the import walk fix; add the `permissions.deny` rules (decided); push, chain, merge, retarget `ui#2450`. |
| `api#1111` (`#2129`) | Local `6b9c84d0a`; narrow review running → `narrow-review-api-1111-r10.md`. |
| `ui#2450` (`#2120`) | Round 3 agent running (`fix-ui-2450-r3-result.md`). |
| `#2122` Parts 5, 6, 7 | Workers running (`part-2122-<n>-result.md`); then merge into `feature/ticket-2122-destinations`. |
| `#2133` | Worker running; then review, push, PR. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Uncommitted on purpose in the main checkout: `.claude/orchestrator.json` and `tools/__tests__/launch-worker.mjs` (ride the `#2074` UI pull request). Stashes: none. Leave the detached worktrees `combined-2065`, api `scratch-1090-merge`, api `scratch-877-timing`, landing `dependabot-134-astro` (holds `407c9203f`). Waiters to arm: `chain-review.sh` after each push, `wait-release.mjs` for each release, `wait-auto-work.mjs` always. Sentry was listed at 16:00Z (4 issues, all carried).

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. The owner AI order: second opinion, agreement, explanation.
3. `#2074`: push and merge the three pull requests with their protection changes, measure one round in each repository; `tools/review-rounds.mjs` on or after 16 November 2026.
4. Finish each pull request from its result file; one local review of new commits before every push. Merge each approved one at once, base-merge the rest, then one web release (never with an API release).
5. The `ui#2447` device proof, the stack, then the intake cycle, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `api#1113` opened (`#2074` API pushed); `landing#134` dead spreads and Pullfrog suggestions; `ui#2447` narrow review and push; `ui#2448` flake fixes and push; Pullfrog token refreshed; Sentry listing; mail and Play intake.
- Changed: `ui#2444`, `ui#2450`, `api#1111` and `#2074` UI each took one more fix round (D7 to D18); `#2133` and the AI order are new.
- Carried: every merge and release; the `#2074` measurement; the `ui#2447` proof; the stack; Batch M; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session: treat each as a lead to verify.
