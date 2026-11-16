/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 62 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D242 with the Write tool. Repoint every scratchpad script and order that names the predecessor's id (`grep -l` for its first 8 characters) with `perl -pi` in `bash -c`, full id first, then run `mirror.sh` with `bash` and `durable-dedupe.sh` in the background. Use literal paths in every redirect.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Code fixes, review fix rounds included, go to workers on the worker account: `node tools/compose-prompt.mjs --review-batch` plus a `## This review batch` section naming the review file, then `node tools/launch-worker.mjs` with `--relaunch-reason` past the 2-launch branch cap. In-session subagents only read and review (final message at most 12 lines plus a result file; briefs point at scratchpad `agent-rules.md`). Read every worker diff before it counts. Before each push one review agent reads the new commits, bounded to concrete defects in what they claim; a pass with only text fixes needs no new agent. Run React Doctor (`npx -y react-doctor@0.7.6 . --blocking error --scope changed --base origin/main --no-dead-code --no-supply-chain --no-score --yes`) before a UI push. Edit the pull request body before its push. Request the review at the push: `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha>`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each open branch before its review. Every turn ends with a registered wake source (`tools/wait-auto-work.mjs` when nothing else is live).

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 22 open, 22 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `c95546c4c`; API `main` `38513551a`; landing `main` `7e6d150e0`. Merged this relay: api#1115, ui#2450 (`#2120`), ui#2468 (`#2131`); no release yet. Owner question queue: empty. No stash. Read each named result file first; a missing file means the agent or worker died, so rerun its order. None of the open pull requests is approved at its current head.

| Item | Disposition |
| --- | --- |
| Web release | FIRST: `/release` production web from `main` `c95546c4c` or later (carries `#2120` and `#2131`), never with an API release; then `/android-release` Open plus `/ios-release` TestFlight at one version; device proof for `#2131`. |
| ui#2469 (`#2074` order 4) | Pushed `55d3183b9`, review requested. Restart its waiter; merge at approval; then delete the four orphaned npm and NDK cache entries once. |
| ui#2467 + landing#136 (`#2074` orders 5, 6) | Local `8b0bcd82c` / `da446c7`; `review-2467-136-r7.md` DEFECTS 1, text only. Fix the bullet in `body-2467-r4.md`, merge `main` into ui, resolve wUvy / wU1o, bodies `body-2467-r4.md`, `body-136-r4.md`, push both, merge. |
| ui#2464 (`#2137`, `#2139`) | Worker on order `order-2464-r9.md` (review r8 DEFECTS 3); report `fix-2464-r9-result.md`, outcome unknown. Read diff, review, resolve FYx/FYz/FY5/FY9, body `body-2464-r7.md`, push, merge; post `comment-2139.md`, close `#2139`. |
| ui#2465 (`#2138`) | Worker on order `order-2465-r9.md` (review r8 DEFECTS 1); report `fix-2465-r9-result.md`, outcome unknown. Read diff, resolve the round 4 threads, body `body-2465-r6.md`, push, merge. |
| ui#2459 (`#2135`) | Local `edea60dd2` or later; `fix-2459-r17-result.md` (2 threads fixed, `main` merged, hono override pinned). Bounded review, resolve whGy / whG0, body `body-2459-r15.md`, push, merge, then the live baseline run with a written cost estimate. |
| ui#2448 (`#2132`) | Local `e8e1ffcb6`; `fix-2448-r4-result.md`. Merge `main`, bounded review, resolve vpl9, body `body-2448-r2.md`, push, merge. |
| ui#2451 (`#2121`) | Local `294c9eb53` or later; `fix-2451-r6-result.md` (14 tools failures, `main` merge, React Doctor). Bounded review, post `comment-2451-copy-approval.md`, body `body-2451-r6.md`, push, merge; then merge `main` into `#2122`. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. Add `check-surface-scope` on `plan-block.tsx:20`. |
| `#2140` | ui#2468 merged: start it (same helper file). |
| `#2074` measurement | `tools/review-rounds.mjs` (date reached). |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. The web release, then the mobile pair, as the first In flight row says.
3. Drive every other In flight row at once; merge each approved pull request.
4. `#2135` baseline run, then step 2 of `orbit-ai-build-steps.md`; the rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: api#1115 opened and merged; ui#2450 and ui#2468 merged; ui#2459, ui#2469, ui#2468 pushed with threads resolved; every listed result file read and acted on; Sentry, mailbox and Play intake ran (nothing new); the stash on `fix/ticket-2138-stale-files` was already gone.
- Superseded: "Coordinator lean: every read, review, fix and diagnosis goes to a background subagent" (it contradicted the spec rule that fix work goes to worker-account workers); replaced by the worker routing above.
- Carried: every other merge and release; the `#2074` measurement; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
