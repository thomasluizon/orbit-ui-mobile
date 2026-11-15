/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 52 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). The carry renames the decision log to `prev-sleep-decisions-<8>.md`: start a new `sleep-decisions.md` from D42. Then repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. A shell redirect target must be a literal path. The shell is zsh: loops go in `bash -c`. Print at most 40 lines from a tool call.

KEEP THE COORDINATOR LEAN: send every read, review, fix and diagnosis to a background subagent or a worker with a narrow note; ask each for a final message of at most 12 lines plus a result file. Read each diff before a push (gate files and `DESIGN.md` hunks first). A branch gets at most 2 worker launches, then an in-process agent. Tell a long agent to wrap up before a relay; never wait hours on one. `scratchpad/chain-review.sh <key> <pr>` waits CI, requests the review and waits the verdict; copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2129` build steps, `#2135` first; `#2127` closes when the new path passes its case), the owner's reports fixed and shipped (`#2131`, `#2132`), the mascot rebrand (`#2119` to `#2126`), `#2133` merged, every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 20 open, 20 placed, 0 unplaced, 0 placed twice.

Reply to the owner in English. His orders: `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell him at once); never mention ChatGPT Plus.

## In flight

UI `main` `1823697fe`; API `main` `1d2a826b8` (live in production and staging); landing `main` `5e6dbdbbd`. Scratchpad result files: `review-*`, `fix-*`, `body-*`.

| Item | Disposition |
| --- | --- |
| `ui#2457` (`#2074` UI) | Pushed `6d95f4ac7`; thread resolved. CI settled red only because Layout shard 4 was cancelled in "Check upgrade layout" (run 43663268878); its failed jobs were rerun once: if it fails again, diagnose as a real defect (an in-process agent), else run `chain-review.sh ui 2457`. At approval: P14, merge; then the `wait-ci` follow-up on `#2074`. |
| `landing#135` (`#2074` landing) | Pushed `fd007023b`; chain running. At approval: protection P1 to P7 (required: `Build`, `PR Text`, `GitGuardian Security Checks`, `pullfrog-approval`), merge, P8; mark the brain D150 rows. |
| `ui#2447` (`#2131`) | Pushed `6e2d89793` (CI fix); chain running. At approval: merge, web release, Android Open then TestFlight at the same version, device proof (Android first, then VoiceOver on an SE-size iPhone). |
| `ui#2444` (`#2119`) | MERGED `8c2801331`; `ui#2450` retargeted to `main`. Close `#2119` if the merge did not. |
| `ui#2455` (`#2133`) | Pushed `a9690372c`; chain running. Merge at approval. |
| `ui#2459` (`#2135`) | Worker (second and last launch) fixing review round 1, worktree `ticket-2129-eval-gate`, order `order-2135-r1.md`; outcome unknown: read its commits first. Then one narrow review of the new commits, push, chain, merge, then the live baseline of `main` (cost estimate first). |
| `ui#2458` (`#2132` chore) | Remote `9721fdf74`; local adds the base merge, `956790cef` (hermetic Expo check) and `4757e51ee` (calibration renewal; 7 skills are stale on `main` too, a report-only Guards step): rerun `node tools/test-tools.mjs` alone, read `review-ui-2458.md`, push with `body-ui-2458.md`, chain, merge; then base-merge `ui#2448` and request its review. |
| `ui#2450` (`#2120`) | Local `f06fc4630`; full Chromium 7853 passed, 0 failed; mobile 14814 passed. Base-merge `main` (ui#2444 merged), whole-diff review (read the `DESIGN.md` hunk), push, chain. |
| `#2127` | Open; capture 4 of 5 (comment on the ticket). No old-path fix round. |
| `#2122` Parts 5 to 7 | Part 5 needs critic pass 2, the web footer sweep and copy approval for `upgrade.orbitLine.billingError`; then merge parts into `feature/ticket-2122-destinations`. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Uncommitted on purpose in the main checkout: `.claude/orchestrator.json` and `tools/__tests__/launch-worker.mjs` (already in `ui#2457`). No stash, no detached work of this run.

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. `#2074`: `ui#2457` and `landing#135` merged with their protection changes; `tools/review-rounds.mjs` on or after 16 November 2026.
3. Merge each approved pull request at once, then one web release (never with an API release).
4. The AI build: `#2135`, then step 2 onward from `orbit-ai-build-steps.md`, one ticket per step when admitted.
5. The `ui#2447` device proof, the stack (`ui#2450`, `ui#2451`, `ui#2453`), then the intake cycle, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `api#1111` merged (`1d2a826b8`), staging and production API live; `#2127` capture run (4 of 5); `ui#2456` merged; AI step 1 ticket `#2135` filed and built (`ui#2459`); `ui#2457`, `ui#2444`, `ui#2455`, `ui#2447` fixed and pushed; landing `#2074` reviewed, fixed, opened as `landing#135`; `ui#2450` sidebar label; intake cycle 1.
- Changed: `ui#2448`'s root fix is `ui#2458`; `#2127` closes through `#2135`.
- Carried: every merge and release; the `#2074` measurement; the `ui#2447` proof; the stack; `#2122` Parts 5 to 7; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
