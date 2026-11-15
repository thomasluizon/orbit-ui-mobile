/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 77 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the guard refuses `$HOME` and any variable in a redirect target; write no file there before it ends; the predecessor id is `relay.from`). Start a new `sleep-decisions.md` from D162 with the Write tool. Repoint every scratchpad script and order that names the predecessor's id (`grep -l` for its first 8 characters: `mirror.sh`, `intake-noboard.sh`, `agent-rules.md`, `gated-launch.sh`, `chain-review.sh`) with `perl -pi` in `bash -c` (full id first), run `mirror.sh` with `bash`, then `durable-dedupe.sh` in the background. Loops go in `bash -c`; print at most 40 lines.

GO FASTER (owner order): start every independent item in the first turn, in parallel, within the caps. Never let a worker with a clean tree hold a relay drain: SIGTERM its launcher and carry its branch. Coordinator lean: every read, review, fix and diagnosis goes to a background subagent (final message at most 12 lines plus a result file); briefs point at scratchpad `agent-rules.md`. Read each diff before a push (gate files and `DESIGN.md` hunks first). Before each push one review agent reads the new commits; ask the last pass for concrete defects only. Edit a pull request body before its push, never after. `scratchpad/chain-review.sh <key> <pr>` waits CI, requests the review and waits the verdict; copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and base-merge each open pull request before its review (`gh pr update-branch`; on conflict an agent merges locally). `scratchpad/gated-launch.sh` takes no `--repo` flag. Every turn ends with a registered wake source.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2120` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 21 open, 21 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `0134c198b`; API `main` `07a9b0898`; landing `main` `7e6d150e0`. Owner question queue: empty. No stash; the relay checkout is clean.

| Item | Disposition |
| --- | --- |
| `ui#2464` (`#2137`) | Local `e0a57ac31` in worktree `ticket-2137-no-prompt` (reviewed clean, `review-2464-r3.md`). Body `body-2464-r3-review.md` before the push, push, chain, merge. Then fold `#2139` (spec bullet). |
| `ui#2465` (`#2138`) | Pushed `09d220204`, two Pullfrog threads. A fix agent was running (result `fix-2465-r2-result.md`, replies `reply-2465-silr.md`, `reply-2465-silw.md`, body `body-2465-r2.md`); if absent, relaunch it. Then last-pass review, resolve, body, push, chain. |
| `ui#2459` (`#2135`) | Pushed `f28a94958`: thread `PRRT_kwDOR5Siws63sN6D` plus main conflicts. A merge and fix agent was running in `ticket-2129-eval-gate` (result `fix-2459-r11-result.md`); read the worktree, then review, resolve, body `body-2459-r11.md`, push, chain. |
| `ui#2450` (`#2120`) | Pushed `0d8e39462`, chain running when the relay started: restart `chain-review.sh ui 2450`. At approval merge; then merge that head into `#2121` and `#2122`. |
| `ui#2466` (`#2074` order 3) | Pushed `fc1eb18ba`: restart its chain; merge at approval. |
| `ui#2463` (`#2074`) | Pushed `e4b032d8f`: restart its chain; merge at approval; then base-merge `ui#2448` (same macOS cause) and chain it. |
| Worker `#2131` | `fix/ticket-2131-height-centre` (worktree `ticket-2131-height-centre`, order `ticket-2131-r3-order.md`), started 14:33, outcome unknown. Read the worktree; review, push, open the pull request, chain, merge, release the Android and iOS pair, prove on devices again. |
| Workers `#2074` | `fix/ticket-2074-ci-cache` and `fix/ticket-2074-comment-lint` (UI worktree `ticket-2074-ci-cache`, `ticket-2074-comment-lint`; landing worktree `orbit-landing-page/ticket-2074-comment-lint`), started about 15:47, outcome unknown. Read each worktree; review, push, open, chain. |
| Worker `#2121` part 7 | `feature/ticket-2121-part7-critic2` (order `ticket-2121-part7-order.md`), started 15:56, outcome unknown. Then merge into `feature/ticket-2121-guided-flows` (local `578089be9`, unpushed), copy approval, critic pass 3, tests, push `ui#2451`, chain. |
| `ui#2453` (`#2122`) | Stacked; after `#2121`. |
| `#2074` measurement | `tools/review-rounds.mjs` on or after 16 November 2026. |

## Then, in this order

1. Answer any owner message first. Give each order a ticket or a rescope before the turn ends.
2. Push `ui#2464`; drive `ui#2465`, `ui#2466`, `ui#2463` to merge.
3. `#2074` work order workers to merge, then the measurement.
4. Merge each approved pull request at once, then one web release (never with an API release).
5. `#2131` fix, release pair and device proof; `#2135` merge and its baseline run, then step 2 onward of `orbit-ai-build-steps.md`.
6. The rebrand stack, then intake, as `## The order` gives them.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head, zero unresolved threads and `behind_by=0`. Never add an attribution line. Never release on the App Store. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2462` and `ui#2457` merged (P14 checked); `#2137` round 2 and 3 built and reviewed; `#2138` reviewed (5 defects fixed) and pushed; `ui#2459`, `ui#2450`, `ui#2463` pushed; `#2121` part 6 merged and its copy approved; `#2131` Android proof run; `wait-ci` fix opened as `ui#2466`; intake clean.
- Changed: see In flight.
- Carried: every merge and release; the `#2074` work orders and measurement; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
