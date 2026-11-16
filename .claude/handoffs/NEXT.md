/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 61 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the guard refuses `$HOME` and any variable in a redirect target; write no file there before it ends; the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D192 with the Write tool. Repoint every scratchpad script and order that names the predecessor's id (`grep -l` for its first 8 characters: `mirror.sh`, `intake-noboard.sh`, `agent-rules.md`, `gated-launch.sh`, `chain-review.sh`, `play-cycle.sh`, `ticket-*-order.md`) with `perl -pi` in `bash -c` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. Use literal paths in every redirect. Loops go in `bash -c`; print at most 40 lines.

GO FASTER (owner order): start every independent item in the first turn, in parallel, within the caps. Coordinator lean: every read, review, fix and diagnosis goes to a background subagent (final message at most 12 lines plus a result file); briefs point at scratchpad `agent-rules.md` and tell the agent to wait for a one-minute load under 25 before a long suite. Read each diff before a push. Before each push one review agent reads the new commits, bounded to concrete defects in what those commits claim; a CLEAN pass with only text fixes needs no new agent. Edit a pull request body before its push. `scratchpad/chain-review.sh <key> <pr>` waits CI, requests the review and waits the verdict; copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and into each open branch before its review. Every turn ends with a registered wake source (`tools/wait-file.mjs` heartbeat, 45 minutes, when nothing else is live).

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2120` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 22 open, 22 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `aea8cddc7` (after `ui#2463`); API `main` `07a9b0898`; landing `main` `7e6d150e0`. Owner question queue: empty. No stash; the relay checkout is clean. No worker launcher runs. Every local head below is unpushed unless marked pushed; each branch except `ui#2459` still needs `origin/main` `aea8cddc7` merged.

| Item | Disposition |
| --- | --- |
| `ui#2459` (`#2135`) | Pushed `3f4fe6a7e`, last pass CLEAN, thread resolved. Restart `chain-review.sh ui 2459`; merge at approval; then the live baseline run of `main` with a written cost estimate. |
| `ui#2464` (`#2137`, `#2139`) | Pushed `b3afb8a19`, CI green, Pullfrog 4 suggestions (`review-2464-pullfrog-r5.json`): fix agent, last pass, resolve, body, push, chain, merge; then post `comment-2139.md` and close `#2139`. |
| `ui#2465` (`#2138`) | Local `6dae93480` fixes Pullfrog round 3 (`fix-2465-r4-result.md`, replies `reply-2465-61E.md`, `-61H.md`, `-61K.md`, body `body-2465-r3.md`): last pass, resolve, body, push, chain. |
| `ui#2450` (`#2120`) | Local `8b000647c` (`fix-2450-r15-result.md`): last pass bounded to that commit, resolve `PRRT_kwDOR5Siws63tNfv` with `reply-2450-tNfv.md`, body `body-2450-r13.md`, push, chain, merge; then merge into `#2121` and `#2122`. |
| `#2131` | Branch `fix/ticket-2131-height-centre` local `95eae82c4`, cause proven (Render wake 503). Fix the 7 low defects of `review-2131-r5.md`, last pass, push, open the pull request (body `body-2131-r3.md`), chain, merge, Android Open plus TestFlight pair, device proof. |
| `#2074` order 4 | `fix/ticket-2074-ci-cache` local `7978e165c` (`fix-2074-ci-cache-r3-result.md`): last pass, push, open (body `body-2074-ci-cache.md`), chain, merge; then delete the four orphaned npm and NDK cache entries once. |
| `#2074` orders 5 and 6 | UI `fix/ticket-2074-comment-lint` `3d7fe92c4`, landing `f93cb9341` (`fix-2074-comment-lint-unify-result.md`): read `ui-web-tests.log` last line in the UI worktree, last pass, push both, open both (bodies `body-2074-ui-comment-lint.md`, `body-2074-landing-comment-lint.md`), chain both. |
| `#2121` part 7 | Ticket branch local `be4ccaa62` (`fix-2121-part7-r2-result.md`): web About row `translate="no"`, rerun `habit-list.test.tsx` at low load, approve `2121-part7-strings.md`, critic pass 3, last pass, push `ui#2451`, chain. |
| `ui#2448` (`#2132`) | DIRTY; local main merge in its worktree (`merge-2448-main-result.md`): merge main again, last pass, push, chain, merge. |
| `ui#2453` (`#2122`) | Stacked; after `#2121`. |
| `#2140` | After the `#2131` pull request merges. |
| `#2074` measurement | `tools/review-rounds.mjs` on or after 16 November 2026. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request, then one web release (never with an API release).
3. `#2131` release pair and device proof; `#2135` baseline run, then step 2 onward of `orbit-ai-build-steps.md`.
4. The rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2463` merged (`aea8cddc7`); `ui#2459` pushed with its thread resolved; `#2140` placed; disk back above the floor.
- Changed: every other row moved to a new local head; see In flight.
- Carried: every merge and release; the `#2074` work orders and measurement; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
