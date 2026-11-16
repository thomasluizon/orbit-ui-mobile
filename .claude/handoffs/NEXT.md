/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 60 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D260 with the Write tool. Repoint every scratchpad script and order that names the predecessor's id (`grep -l` for its first 8 characters) with `perl -pi` in `bash -c`, full id first, then the 8-character form, then run `mirror.sh` with `bash` and `durable-dedupe.sh` in the background. Use literal paths in every redirect.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Code fixes, review fix rounds and conflicted merges go to workers on the worker account: `node tools/compose-prompt.mjs --review-batch` plus a `## This review batch` section naming the review file and `agent-rules.md`, then `node tools/launch-worker.mjs` with `--relaunch-reason` past the 2-launch branch cap. In-session subagents only read and review (final message at most 12 lines plus a result file; briefs point at scratchpad `agent-rules.md`). Read every worker diff before it counts. Before each push one review agent reads the new commits, bounded to concrete defects in what they claim; a pass with only text fixes needs no new agent. Run React Doctor (`npx -y react-doctor@0.7.6 . --blocking error --scope changed --base origin/main --no-dead-code --no-supply-chain --no-score --yes`) before a UI push. Edit the pull request body before its push. Resolve threads with `node tools/resolve-bot-thread.mjs --thread <id> --repo <key> --pr <n>` (reply on stdin) before the push. Request the review at the push: `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha>`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each open branch before its review; a clean UI merge then runs S `comment-fix.mjs` (see `## Current state`). Every turn ends with a registered wake source (`tools/wait-auto-work.mjs` when nothing else is live).

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 22 open, 22 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `3a3a8a1cd`; API `main` `38513551a`; landing `main` `7e6d150e0`. Merged this relay: ui#2467. Released: production web `c95546c4c`; Android 1.3.156 (217) Open. Owner question queue: empty. No stash. No worker or agent is running. Read each named result file first.

| Item | Disposition |
| --- | --- |
| iOS 1.3.156 (6) | Run 43804682388 was uploading: read its result; add the build to `Orbit beta` (S `asc-external-group.mjs group <build id>`); then the `#2131` device proof (Android, then SE iPhone); close `#2120` once the iOS upload is confirmed. |
| ui#2459 (`#2135`) | Approved at `6bc968be9`, all green, behind `main` by ui#2467. Merge `main`, `comment-fix.mjs`, bounded review of the merge, body `body-2459-r15.md`, push, merge at approval; then the live baseline run with a written cost estimate. |
| ui#2469 (`#2074` order 4) | Local `d187af272`; review `review-2469-r6.md` clean except a body nit (fixed). Worker: remove the dead `API.calendar.calendars` route from the 4 layout specs it names, merge `main`. Then review, resolve `PRRT_kwDOR5Siws63xY-u` with `reply-2469-xY-u.md`, body `body-2469-r5.md`, push, merge, then delete the four orphaned cache entries once. |
| landing#136 (`#2074` orders 5, 6) | 2 P1 threads at `da446c7` (`review-136-pullfrog-r5.md`). Worker round on the landing rule; if the rule text changes, the same change for the UI rule on a new `fix/` branch. |
| ui#2464 (`#2137`, `#2139`) | Local `5d801546b` (`fix-2464-r10-result.md`, all 4 r9 defects fixed, `main` merged). Bounded review of `85bb6f63d..5d801546b`, resolve FYx/FYz/FY5/FY9, body `body-2464-r7.md`, push, merge; post `comment-2139.md`, close `#2139`. |
| ui#2465 (`#2138`) | Local `0724954cd` (`fix-2465-r10-result.md`, thread `PRRT_kwDOR5Siws63x_tT`). Merge `main`, `comment-fix.mjs`, bounded review, resolve with `reply-2465-x_tT.md`, body `body-2465-r6.md`, push, merge. |
| ui#2451 (`#2121`) | Pushed `d4d059cbd`: 5 CI jobs red and 4 P1 threads (`ci-2451-d4d059cbd-failures.txt`, `review-2451-pullfrog-r7.md`). One worker round: merge `main`, autofix, root fixes, then review, push, merge; then merge `main` into `#2122`. |
| ui#2448 (`#2132`) | Local `2a66d9129` (`fix-2448-r5-result.md`). Merge `main`, `comment-fix.mjs`, bounded review of `538b2464b..`, resolve vpl9, body `body-2448-r2.md`, push, merge. |
| `#2140` | Local `0c9a9437b`, no pull request. Worker fixes review D1 (`review-2140-r1.md`, week grid frame to inset outline), merges `main`; then review, open the pull request with `parity:exempt`, body `body-2140-r1.md`. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. Add `check-surface-scope` on `plan-block.tsx:20`. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request at the bar.
3. `#2135` baseline run, then step 2 of `orbit-ai-build-steps.md`; the rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the web release (staging then production at `c95546c4c`); Android 1.3.156 Open uploaded; iOS 1.3.156 dispatched; ui#2467 merged; ui#2465, ui#2459, ui#2451 and landing#136 pushed with threads resolved; the `#2074` measurement posted; the ui#2469 shard 6 root cause found; `#2140` built; intake ran (nothing new).
- Carried: the iOS upload and device proof; every other merge; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
