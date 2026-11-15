/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 81 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the guard refuses `$HOME` and any variable in a redirect target; write no file there before it ends; the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D141 with the Write tool. Repoint `mirror.sh` and `intake-noboard.sh` (they hold the predecessor's first 8 characters) with `perl -pi` in `bash -c` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. Common agent rules: scratchpad `agent-rules.md` (repoint its scratchpad path too). Loops go in `bash -c`; print at most 40 lines.

GO FASTER (owner order, this relay): start every independent item below in the first turn, in parallel, within the caps. Never let a worker with a clean tree hold a relay drain: stop its launcher (SIGTERM the launcher pid) and carry its branch. Coordinator lean: every read, review, fix and diagnosis goes to a background subagent (final message at most 12 lines plus a result file); agent briefs point at `agent-rules.md`. Read each diff before a push (gate files and `DESIGN.md` hunks first). Before each push one review agent reads the new commits; ask the last pass for concrete defects only. Edit a pull request body before its push, never after (a body edit cancels a check run and `wait-ci.mjs` reads the cancel as failing; rerun the cancelled run if it happens). `scratchpad/chain-review.sh <key> <pr>` waits CI, requests the review and waits the verdict; copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and base-merge each open pull request before its review. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2120` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `471448e01`; API `main` `07a9b0898`; landing `main` `7e6d150e0`. Owner question queue: empty.

| Item | Disposition |
| --- | --- |
| `ui#2464` (`#2137`) | Launch the round 2 worker now: `scratchpad/gated-launch.sh --issue "#2137" --worktree <orca>/ticket-2137-no-prompt --prompt scratchpad/ticket-2137-r2-prompt.md --tier deep --hard-ceiling-minutes 150` (fixes D1 to D8 of `review-2464-r1.md` on top of the unpushed CI fix `9dc85b328`). Then review, push, chain, merge. |
| `ui#2465` (`#2138`) | Delivered at `38b33956c`. Verify delivery, whole-diff review agent, fix, chain, merge. |
| `ui#2459` (`#2135`) | Ready locally at `3adfc96c0` (worktree `ticket-2129-eval-gate`; reviews r7 to r9 fixed; core 207, eval 2500 green; `corpusDigest` `0099ed0309bd0c48`). Post the two thread replies (compose from `fix-2459-r6-result.md` plus "Updated replies" in `fix-2459-r7-result.md`) with `resolve-bot-thread.mjs` for `PRRT_kwDOR5Siws63nQba` and `PRRT_kwDOR5Siws63nQbc`, update the body, push, chain. |
| `ui#2450` (`#2120`) | Round r11 ready locally at `f9ee41f42` (overlay loop fix `13b8d0e1e`, turbo input `f9ee41f42`; shared 7900, web 15542, mobile 13709 green). Narrow review agent, then reply and resolve `PRRT_kwDOR5Siws63qnYI` (reply text in `fix-2450-r10-result.md` Round r11), body `body-2450-r11.md` BEFORE the push, push, chain. At approval merge, then base-merge into `#2121` and `#2122`. |
| `ui#2457` (`#2074`) | CI green at `b2037f2b4`; Pullfrog left one P1 thread `PRRT_kwDOR5Siws63q9Ko` (`.github/actions/desktop-acceptance-setup/action.yml:2`: six producer suites run on ubuntu-latest, 12 cases are platform-bound). Branch at its 2 launch cap: in-process fix agent, review, resolve, push, chain. At approval: P14, merge. This is the UI round time fix (review at the push). |
| `ui#2463` (`#2074`) | At `5eef1210e` the macOS and Windows installed checks pass (key delivery fix). Red on `Unit Tests` (132856722190) and `Web unit (chromium 1/20)` (132852684001): the branch touches only `tools/desktop-bench` and `desktop-release.yml`, so compare with `main` first; root-cause, no blind rerun. Then chain; merge at approval; then base-merge `ui#2448` (same macOS cause) and chain it. |
| `#2121` part 6 | Worker stopped by the coordinator at a clean tree: `feature/ticket-2121-part6-critic` holds 10 or more commits to `32357b0ba` (critic items 2 to 5, 8 to 10, parent picker title, docs). Check item 1 (reminder kind step) landed; run web jsdom, web Chromium, mobile and both tsc; review agent; merge into `feature/ticket-2121-guided-flows` (local `d266c4c85`); copy approval for the new strings; completeness critic pass 2; read, push `ui#2451`, chain. |
| `#2131` | Releases done. Next: device proof. |
| `#2074` work orders | The `#2074` ticket comment of this relay: Actions cache over 10 GB, the emulator image download, the `wait-ci` cancelled-run fix. Plus the UI timeless port of `api#1114` (the orbit-ui-mobile to orbit-api Edit direction). |
| `ui#2462` | Bot contract snapshot pin; review and merge. |

The relay stops this session's chains and waiters: restart `chain-review.sh` for each pushed pull request without a verdict. Uncommitted on purpose: `.claude/orchestrator.json` (tiers on `claude-fable-5-2`) and `tools/__tests__/launch-worker.mjs`. No stash, no detached work.

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. `#2137` round 2 and `#2138` to merge.
3. `#2074`: `ui#2457` merged with P14; the work orders; `tools/review-rounds.mjs` on or after 16 November 2026.
4. Merge each approved pull request at once, then one web release (never with an API release).
5. The AI build: `#2135`, then step 2 onward from `orbit-ai-build-steps.md`.
6. The `ui#2447` device proof, the stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the `#2131` releases; `api#1114` merged; `#2137` and `#2138` built; stale-file cleanup; intake clean.
- Changed: see In flight.
- Carried: every merge and release; the `#2074` measurement and work orders; the `ui#2447` proof; the stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
