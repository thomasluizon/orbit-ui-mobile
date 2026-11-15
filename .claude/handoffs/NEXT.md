/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 70 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D79 with the Write tool (the guard refuses a shell redirect to a variable path). Repoint `mirror.sh` and `intake-noboard.sh` (they hold the predecessor's first 8 characters) with `perl -pi` in `bash -c` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. The shell is zsh: loops go in `bash -c`. Print at most 40 lines from a tool call.

KEEP THE COORDINATOR LEAN: send every read, review, fix and diagnosis to a background subagent with a narrow note; ask each for a final message of at most 12 lines plus a result file. Read each diff before a push (gate files and `DESIGN.md` hunks first). A branch gets at most 2 worker launches, then an in-process agent (SendMessage resumes one with its context). Before each push, one review agent reads the new commits and the same push fixes every confirmed finding; ask the last pass for concrete defects only. `scratchpad/chain-review.sh <key> <pr>` waits CI, requests the review and waits the verdict; copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. A fresh review of an already reviewed head needs `list-bot-threads.mjs --re-review`; `wait-ci` then exits 6 at once on the stale failed check, so wait for a `pullfrog-approval` run started after the request. After every `main` merge, merge `origin/main` into the relay checkout before starting a chain (else `wait-ci` exits 2). Every turn ends with a registered wake source (`wait-ci`, `wait-release`, `launch-worker`); an agent is not one.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2120` to `#2126`), `#2133` and `#2136` merged, every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner is away and asked for no action that needs approval or a click, and no question. Reply in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once); never mention ChatGPT Plus.

## In flight

UI `main` `e86ecdc5e` (timeless fix `ui#2461` merged; push `Tests` and `Guards` runs pending); API `main` `1d2a826b8` (production and staging); landing `main` `7e6d150e0` (P8 applied, brain D150 updated). Scratchpad result files: `fix-*`, `review-*`, `body-*`, `report-2122-*`.

| Item | Disposition |
| --- | --- |
| `#2131` releases | When the push runs at `e86ecdc5e` (or a later `main`) pass, run web staging then production through `/release`, then Android Open and TestFlight; device proof after. |
| `ui#2457` (`#2074` UI) | Pushed `44df9d700`, all threads resolved; layout shard 6 hover flake rerun, chain running. At approval: P14, merge. |
| `ui#2448` (`#2132`) | Approved once; base-merged `64d4e681d`, chain running. Merge at approval. |
| `ui#2455` (`#2133`) | Approved once; base-merged `143782cf6`, chain running. Merge at approval. |
| `ui#2460` (`#2136`) | Approved once; base-merged `9f1b74185`, chain running. Merge at approval. |
| `ui#2459` (`#2135`) | Pushed `936311f23` (round 5), chain running. Merge at approval, then the live baseline of `main` (cost estimate first). |
| `ui#2450` (`#2120`) | Pushed `b869cc9d2` (M11, N4, N7, N8, parity mapping, Apple busy pill), chain running. Merge at approval; then the `ui#2451` base merge. |
| `#2122` | Local `feature/ticket-2122-destinations` `2abfc72c3` (Parts 5 to 7 merged and closed); next the rest of Parts 1 and 2. |
| `#2127` | Closes when `#2135`'s new path passes its case. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

The chains above are scratchpad background tasks of the old session: the relay stops them. Restart `chain-review.sh` for each open PR whose verdict is not in yet. Uncommitted on purpose in the main checkout: `.claude/orchestrator.json` (worker tiers on `claude-fable-5-2`) and `tools/__tests__/launch-worker.mjs`. No stash, no detached work of this run.

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. The `#2131` releases.
3. `#2074`: `ui#2457` merged with P14; the ticket's work orders; `tools/review-rounds.mjs` on or after 16 November 2026.
4. Merge each approved pull request at once, then one web release (never with an API release).
5. The AI build: `#2135`, then step 2 onward from `orbit-ai-build-steps.md`.
6. The `ui#2447` device proof, the stack (`ui#2450`, `ui#2451`, `ui#2453`), then the intake cycle, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the timeless fix merged (`ui#2461`, `e86ecdc5e`, five review rounds); `ui#2458` merged (`24ccc4490`); `landing#135` merged (`7e6d150e0`) with P8 and brain D150; `ui#2448` base-merged and reviewed; the old `ui#2457` temporary worktree removed; intake cycle (Sentry 4 ticketed, mail and Play empty); `#2122` Parts 5 to 7 closed and merged locally.
- Changed: `ui#2457`, `ui#2459`, `ui#2450`, `ui#2455`, `ui#2460` gained fix rounds and pushes (see In flight).
- Carried: every merge and release; the `#2074` measurement and work orders; the `ui#2447` proof; the stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
