/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 64 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D219 with the Write tool. Repoint every scratchpad script and order that names the predecessor's id (`grep -l` for its first 8 characters) with `perl -pi` in `bash -c`, full id first, then run `mirror.sh` with `bash` and `durable-dedupe.sh` in the background. Use literal paths in every redirect.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Coordinator lean: every read, review, fix and diagnosis goes to a background subagent (final message at most 12 lines plus a result file); briefs point at scratchpad `agent-rules.md`. Before each push one review agent reads the new commits, bounded to concrete defects in what they claim; a pass with only text fixes needs no new agent. Edit the pull request body before its push. Request the review at the push: `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha>`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background (pair two pull requests in one waiter to stay near three GitHub children). Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each open branch before its review. Every turn ends with a registered wake source (`tools/wait-auto-work.mjs` when nothing else is live).

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2120` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 22 open, 22 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `aea8cddc7`; API `main` `07a9b0898`; landing `main` `7e6d150e0`. Owner question queue: empty. Stash: `stash@{0}` on `fix/ticket-2138-stale-files` (the ui#2465 fix agent's; read it, then drop or apply). No worker launcher runs. Subagents may still be finishing: read each named result file first; a missing file means the agent died, so rerun its order. Every branch carries `aea8cddc7`. None is approved.

| Item | Disposition |
| --- | --- |
| ui#2467 + landing#136 (`#2074` orders 5, 6) | Pushed `d7d5ddcbf` / `99fead6e7`, threads resolved, reviews requested. Restart their waiters; merge at approval. |
| ui#2469 (`#2074` order 4) | Local `096cb0581` (`fix-2469-r1-result.md`): review, resolve v543/v547, body `body-2074-ci-cache-r5.md`, push, merge; then delete the four orphaned npm and NDK entries once. |
| api `fix/ticket-2074-timeless-loop` | Local `fcfcc2d21`: fix the body bullet of `review-2074-api-timeless.md`, push, open, review, merge. |
| ui#2464 (`#2137`, `#2139`) | Local `00c201348`; `review-2464-r7.md` DEFECTS 3: fix, read, resolve FYx/FYz/FY5/FY9, body `body-2464-r6.md`, push, merge; post `comment-2139.md`, close `#2139`. |
| ui#2465 (`#2138`) | Pushed `d5b440335`, round 4 IMPORTANT: result `fix-2465-r6-result.md`; read, resolve, body `body-2465-r5.md`, push. |
| ui#2459 (`#2135`) | Local `728d7105d`; `review-2459-r16.md` (GUID swap): resolve vZVP/vZVS/vZVU, body `body-2459-r14.md`, push, merge, then the live baseline run with a written cost estimate. |
| ui#2468 (`#2131`) | Pushed `5b79c87f8`, CodeQL and 2 threads red: result `fix-2468-r1-result.md`; read, resolve, body `body-2131-r5.md`, push, merge; Android Open plus TestFlight pair; device proof. |
| ui#2450 (`#2120`) | Pushed `7aa7460e0`, one structural thread: result `fix-2450-r17-result.md`; read, resolve, body `body-2450-r15.md`, push, merge; merge into `#2121`, `#2122`. |
| ui#2448 (`#2132`) | Local `538b2464b` (`fix-2448-r2-result.md` rounds 2, 3): read `538b2464b`, resolve vpl9, body `body-2448-r2.md`, push, merge. |
| ui#2451 (`#2121`) | Local `91554fdda`; `review-2121-part7-r4.md` items 3 to 5 and text: fix, read, post the copy approval table, push. |
| ui#2453 (`#2122`) | Stacked; after `#2121`. Add `check-surface-scope` on `plan-block.tsx:20`. |
| `#2140` | After ui#2468 merges. |
| `#2074` measurement | `tools/review-rounds.mjs` on or after 16 November 2026. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Drive every In flight row at once; merge each approved pull request, then one web release (never with an API release).
3. `#2131` release pair and device proof; `#2135` baseline run, then step 2 of `orbit-ai-build-steps.md`.
4. The rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: main merged into every branch; ui#2448, ui#2450, ui#2465 pushed; ui#2467, ui#2468, ui#2469, landing#136 opened; ui#2459 and ui#2464 rounds fixed locally; `#2121` part 7 fixes, critic pass 3 and copy approval landed locally; intake cycles found nothing new.
- Changed: `chain-review.sh` is superseded by the request at the push (orchestrate step 8).
- Carried: every merge and release; the `#2074` measurement; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
