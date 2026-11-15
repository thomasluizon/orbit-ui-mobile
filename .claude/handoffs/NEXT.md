/auto-work

Read `.claude/specs/orbit-prod-release.md` first, but only `## Standing rules`, the `## The order` bullets and `## Open questions`; search `## Current state` for a fact when you need it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 74 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (write no file there before it ends; the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D54. Repoint the helpers that hold the predecessor's first 8 characters with `perl -pi` in `bash -c` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. A shell redirect target must be a literal path. The shell is zsh: loops go in `bash -c`. Print at most 40 lines from a tool call.

KEEP THE COORDINATOR LEAN: send every read, review, fix and diagnosis to a background subagent or a worker with a narrow note; ask each for a final message of at most 12 lines plus a result file. Read each diff before a push (gate files and `DESIGN.md` hunks first). A branch gets at most 2 worker launches, then an in-process agent. Before each push, one review agent reads the new commits and the same push fixes every confirmed finding; ask the last pass for concrete defects only. Tell a long agent to wrap up before a relay. `scratchpad/chain-review.sh <key> <pr>` waits CI, requests the review and waits the verdict; copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. Every turn ends with a registered wake source (`wait-ci`, `wait-release`, `launch-worker`); an agent is not one.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2120` to `#2126`), `#2133` and `#2136` merged, every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 20 open, 20 placed, 0 unplaced, 0 placed twice.

The owner is away and asked for no action that needs approval or a click, and no question. Reply in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once); never mention ChatGPT Plus.

## In flight

UI `main` `d3dbd51ac` (Guards push run red: timeless allowlist; it blocks every web release); API `main` `1d2a826b8` (production and staging); landing `main` `5e6dbdbbd`. Scratchpad result files: `fix-*`, `review-*`, `body-*`.

| Item | Disposition |
| --- | --- |
| timeless fix (`#2074`) | Branch `fix/ticket-2074-timeless-allowlist`, worktree `ticket-2074-timeless-allowlist`, local `9dbec895c` (round 2 fixes; read `fix-ui-timeless.md`); one narrow review, push, `gh pr create` with `body-ui-timeless.md`, chain, merge FIRST. Then web staging at the new main (`release.yml`; staging origin `https://orbit-web-staging-eakn.onrender.com`) after push `test.yml` and `guards.yml` pass on that SHA, then production web, then Android Open and TestFlight (`#2131`). |
| `ui#2457` (`#2074` UI) | Local `301819f42`: layout shard limit 23 min, ancestry check moved into `select`; replies in `fix-ui-2457-r5.md`. Merge main `d3dbd51ac` (clean), one narrow review, resolve PRRT_kwDOR5Siws63lgTk and PRRT_kwDOR5Siws63lgTn, body `body-ui-2457.md`, push, chain. Remove the temporary worktree the agent left in the old scratchpad. At approval: P14, merge. |
| `landing#135` | Pushed `c50a94080`, chain running (restart `chain-review.sh landing 135` if no verdict). At approval: merge, then P8 (add `PR Text` app 15368), mark brain D150 P8. |
| `ui#2455` (`#2133`) | Pushed `046e2d8c5`, chain running. Merge at approval. |
| `ui#2458` (`#2132`) | Pushed `4d415ea26`, chain running. Merge at approval; then base-merge `ui#2448` and request its review. |
| `ui#2459` (`#2135`) | Local `32cf1f49d` (round 3); one narrow review of it, push with `body-ui-2459.md`, chain, merge, then the live baseline of `main` (cost estimate first). |
| `ui#2460` (`#2136`) | Local after `6a87becf3`: fix round for the review Medium (`readEveryIssue` 1000 cap with a label filter); read `fix-ui-2460-r1.md`, narrow review, push, chain. |
| `ui#2450` (`#2120`) | Local `056ecf002`: 19 of 26 findings fixed; open M11 (the desktop sign-in callback route registers `OrbitMascot` as a client reference, so desktop sign-in fails: use a still mascot module with no hooks), N4, N7, N8, N11 and body lines for N2, N10 (`fix-ui-2450-whole-r1.md`). Finish in-process, second review, push, chain. |
| `#2127` | Closes when `#2135`'s new path passes its case. |
| `#2122` Parts 5 to 7 | Part 5 needs critic pass 2, the web footer sweep and copy approval for `upgrade.orbitLine.billingError`; then merge parts into `feature/ticket-2122-destinations`. |
| `ui#2388` | This relay's docs branch. Never request a review for it. |

Uncommitted on purpose in the main checkout: `.claude/orchestrator.json` (worker tiers on `claude-fable-5-2`) and `tools/__tests__/launch-worker.mjs`. No stash, no detached work of this run.

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. The timeless fix, then the `#2131` releases.
3. `#2074`: `ui#2457` and `landing#135` merged with their protection rows; the ticket's work orders; `tools/review-rounds.mjs` on or after 16 November 2026.
4. Merge each approved pull request at once, then one web release (never with an API release).
5. The AI build: `#2135`, then step 2 onward from `orbit-ai-build-steps.md`.
6. The `ui#2447` device proof, the stack (`ui#2450`, `ui#2451`, `ui#2453`), then the intake cycle, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2447` merged (`d3dbd51ac`); `ui#2444` merged and `#2119` closed; landing P1 to P7 applied; `ui#2455`, `ui#2458`, `landing#135` fixed and pushed; disk cleanup (42 to 74 GiB); intake cycle (Sentry 4 carried, mail and Play empty); `#2136` filed and built.
- Changed: the `#2131` web release waits for the main Guards fix; `ui#2457`, `ui#2459`, `ui#2450` gained local fix rounds; the comment lint gap, the timeless port and the landing `vm` harness are work orders on `#2074` and `#2126`.
- Carried: every merge and release; the `#2074` measurement; the `ui#2447` proof; the stack; `#2122` Parts 5 to 7; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
