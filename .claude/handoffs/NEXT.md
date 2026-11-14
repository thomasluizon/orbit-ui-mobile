/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. A shell redirect target must be a literal path. The shell is zsh: loops go in `bash -c`. Print at most 40 lines from a tool call.

KEEP THE COORDINATOR LEAN: send every read, review, fix and diagnosis to a background subagent or a worker with a narrow note; ask each for a final message of at most 12 lines plus a result file. Read each diff before a push (gate files and `DESIGN.md` hunks first). A branch gets at most 2 worker launches, then an in-process agent. Tell a long agent to wrap up before a relay; never wait hours on one.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2127`, `#2129` with the owner's AI plan), the owner's reports fixed and shipped (`#2131`, `#2132`), the mascot rebrand (`#2119` to `#2126`), `#2133` merged, every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 19 open, 19 placed, 0 unplaced, 0 placed twice.

Reply to the owner in English. His orders: `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell him at once); never mention ChatGPT Plus.

## In flight

UI `main` `4afd790f0`; API `main` `d39bc7376`; landing `main` `5e6dbdbbd`. Scratchpad `handoff-notes.md` and the result files hold detail; `sleep-decisions.md` holds D1 to D24.

| Item | Disposition |
| --- | --- |
| Owner AI order (`#2129`) | Fable 5.2 AGREES at round 9 (`fable-ai-review-r9.md` on `best-impl-orbit-ai-v9.md`). An agent writes `best-impl-orbit-ai-final.md`, `orbit-ai-plan-for-owner.md` (plain words) and `orbit-ai-build-steps.md`. Next: send the owner the plain explanation, then build the steps in order. |
| `api#1111` (`#2129`) | Pushed `6709d28f7` (round 14: earlier previews keep their state). CI green except `PR Text` run 43650936080, cancelled by a newer run: rerun it, then request the review (`list-bot-threads.mjs`) and wait for `pullfrog-approval`. At approval: merge, API staging, captures, production API, close `#2127`. |
| `ui#2457` (`#2074` UI) | Pushed `e8631d4d3` (artifact layout fix); chain running. At approval: confirm the UI required set (P14), merge; then the `wait-ci` follow-up recorded on `#2074` (cancelled superseded runs; re-review lower bound). |
| `ui#2444` (`#2119`) | Pushed `437db470a`; chain running. At approval: merge, retarget `ui#2450` to `main`. |
| `ui#2455` (`#2133`) | Pushed `a83aa6de6`; chain running. At approval: merge. |
| `ui#2447` (`#2131`) | Local `0c73797de` plus an agent's centring fix (`narrow-review-ui-2447-r3.md`, result `fix-ui-2447-r3-result.md`). Then narrow review, publish `body-ui-2447-r2.md`, resolve the Apple thread, push, chain; device proof (Android first), merge, web release, mobile pair. The Apple title follows Apple's 43% rule (D23, comment on `#2131`). |
| `ui#2448` (`#2132`) | Pushed `56ec939de`; only Expo SDK Pin red. Root fix: a chore PR on `main` moving the Expo patch set, then base-merge and request review. |
| `#2074` landing | Merge commit `53a6c79` in worktree `ticket-2074-round-time`, not pushed: narrow review, push, open (Tracks #2074), protection P1 to P7 before, merge, P8 after. |
| `ui#2450` (`#2120`) | Local `add892fbc` (14 commits; 162 Chromium failures fixed). Run the full Chromium suite once, add the "Talk to Orbit" sidebar label per `#2120` and `DESIGN.md:224`, push after `ui#2444` merges. |
| `#2122` Parts 5 to 7 | Part 5 needs critic pass 2, the web footer sweep and copy approval for `upgrade.orbitLine.billingError`; then merge parts into `feature/ticket-2122-destinations`. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Waiter note: `wait-ci` settles at once on a cancelled superseded run or on an old failed `pullfrog-approval` after `--re-review`; rerun the cancelled run, or watch the review run with `gh run watch`. Uncommitted on purpose in the main checkout: `.claude/orchestrator.json` and `tools/__tests__/launch-worker.mjs` (already in `ui#2457`). Sentry was listed at 22:33Z (4 issues, all carried).

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. The AI order: the plain explanation to the owner, then the build steps in order.
3. `#2074`: `ui#2457` and the landing pull request merged with their protection changes; `tools/review-rounds.mjs` on or after 16 November 2026.
4. Finish each pull request from its row; one local review before every push. Merge each approved one at once, then one web release (never with an API release).
5. The `ui#2447` device proof, the stack, then the intake cycle, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: Fable rounds 4 to 9 (AGREE); `ui#2457` CI fixes pushed; `api#1111` rounds 13 and 14 pushed; `ui#2444` thread fixes pushed; `ui#2455` rounds 2 to 4 pushed; idle compaction off.
- Changed: each pull request row above carries its new next step.
- Carried: every merge and release; the `#2074` measurement; the `ui#2447` proof; the stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
