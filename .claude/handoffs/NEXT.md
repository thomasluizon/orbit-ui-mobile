/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 64 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the guard refuses `$HOME` in a redirect target; write no file there before it ends; the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D104 with the Write tool. Repoint `mirror.sh` and `intake-noboard.sh` (they hold the predecessor's first 8 characters) with `perl -pi` in `bash -c` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. Loops go in `bash -c` (zsh). Print at most 40 lines per call.

KEEP THE COORDINATOR LEAN: every read, review, fix and diagnosis goes to a background subagent (final message at most 12 lines plus a result file). Read each diff before a push (gate files and `DESIGN.md` hunks first). A branch gets at most 2 worker launches, then an in-process agent (SendMessage resumes one with its context); a new part branch in its own worktree gets its own 2 (`git worktree add -b`, since `create-worktree.mjs` refuses a local base ahead of origin; then `npm ci` there). Before each push, one review agent reads the new commits and the same push fixes every confirmed finding; ask the last pass for concrete defects only. `scratchpad/chain-review.sh <key> <pr>` waits CI, requests the review and waits the verdict; copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout, and base-merge each open pull request before its review so it merges at `behind_by=0`. Never pipe a waiter through `tail` without echoing its exit code. Every turn ends with a registered wake source (`wait-ci`, `wait-release`, `launch-worker`); an agent is not one.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2120` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 18 open, 18 placed, 0 unplaced, 0 placed twice.

The owner is away and asked for no action that needs approval or a click, and no question. Reply in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `471448e01`; API `main` `1d2a826b8`; landing `main` `7e6d150e0`. Owner question queue: empty.

| Item | Disposition |
| --- | --- |
| `#2131` releases | Production web serves `e86ecdc5e` (run `43695336494`, verified on `https://app.useorbit.org/api/health`). Next: landing staging and production at `7e6d150e0`, then Android Open and TestFlight from `main`, then the device proof. |
| `ui#2448` (`#2132`) | Red at `696ecfefe` only on `installed (macos-latest, Developer ID)` ("Timed out waiting for palette surface"): same check as `ui#2463`. Then chain; merge at approval. |
| `ui#2450` (`#2120`) | CI red at `4639bd3e1`: `label-fit-settings-row.spec.ts:99` pt-BR expired trial still wraps "250 mensagens de IA/semana" at the larger text size (the copy round measured 1x only; find copy that fits both sizes, approve it again); `Workspace unit (shared)` `chat-module-loading.test.ts` (idle budget, stream abort): check against `main` first. Fix agent, review, push, chain. Then base merges into `#2121` and `#2122`. |
| `ui#2463` (`#2074`) | macOS bundle retry at `f365ed33e`. CI red only on `installed (macos-latest, Developer ID)`: "Timed out waiting for Astra dismissal; the page received 0 Escape keydowns". Third red of that check: root-cause it in `ui#2463`, no rerun. Then chain; merge at approval. |
| `api#1114` (`#2074`) | Timeless port. Review at `71aa73514`: no blocking issue, one structural suggestion thread `PRRT_kwDORKgXhc63n51F` (`tools/check-timeless.mjs:405`) keeps `pullfrog-approval` red. Read it; apply it in a commit when it is sound (review agent first), otherwise reply with the reason; resolve, then request a fresh review (`--re-review` if the head is unchanged). Merge at approval (tools only, no API release). |
| `ui#2457` (`#2074`) | Round 8 (rule 13 evidence for seven reads; cache thread `PRRT_kwDOR5Siws63nOTi`): worktree `ticket-2074-round-time` holds unpushed commits; see `fix-2457-r8-result.md`, `body-2457-r8.md`. Review, resolve, push, chain. At approval: P14, merge. |
| `ui#2459` (`#2135`) | The r7 false pass is fixed in `9b95eba34` (the grader reads the model's clear calls from the trace; core 200 and eval 2493 tests green; `corpusDigest` unchanged); worktree `ticket-2129-eval-gate` holds `ca5188207`, `91962f0f3`, `9b95eba34`, unpushed. Next: a narrow review of `9b95eba34`, resolve both threads with the replies in `fix-2459-r6-result.md`, merge `main`, push, chain. |
| `#2121` sign-in | Worker done: all 7 items in 16 commits on `feature/ticket-2121-part5-sign-in` (to `cf2624acf`, unpushed; 4 Chromium layout suites first run in CI). Read the diff, review, merge into the ticket branch. |
| `#2122` | Local branch has Parts 1 to 7 and the motion tests (`b19e927c3`). Then the spec order. |
| `ui#2388` | Relay docs branch, never reviewed. |

The relay stops this session's chains, waiters and agents: restart `chain-review.sh` for each open pull request without a verdict, and `wait-release` for an unverified release. Uncommitted on purpose: `.claude/orchestrator.json` (tiers on `claude-fable-5-2`) and `tools/__tests__/launch-worker.mjs`. No stash, no detached work.

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. The `#2131` releases.
3. `#2074`: `ui#2457` merged with P14; the ticket's work orders (landing PR, UI comment lint PR with the hook fixes); `tools/review-rounds.mjs` on or after 16 November 2026.
4. Merge each approved pull request at once, then one web release (never with an API release).
5. The AI build: `#2135`, then step 2 onward from `orbit-ai-build-steps.md`.
6. The `ui#2447` device proof, the stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2460` (`#2136`), `ui#2455` (`#2133`) merged; web staging `e86ecdc5e` verified; intake clean; owner queue empty.
- Changed: see In flight (new `ui#2463`, `api#1114`; `#2122` Parts 1 and 2 built; `#2121` sign-in part launched).
- Carried: every merge and release; the `#2074` measurement and work orders; the `ui#2447` proof; the stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
