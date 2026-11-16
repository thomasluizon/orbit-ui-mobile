/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` bullets and `## Open questions`; search `## Current state` for a fact.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and read free disk on `/System/Volumes/Data` (floor 50 GiB; it was 55 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task with literal paths (the predecessor id is `relay.from`; write no file there before it ends). Start a new `sleep-decisions.md` from D278 with the Write tool. Repoint every scratchpad script and order that names the predecessor's id (`grep -l` for its first 8 characters) with `perl -pi` in `bash -c`, full id first, then the 8-character form, then run `mirror.sh` with `bash` and `durable-dedupe.sh` in the background. Use literal paths in every redirect.

GO FASTER (owner order): start every independent item in the first turn, in parallel. Code fixes, review fix rounds and conflicted merges go to workers on the worker account: `node tools/compose-prompt.mjs --review-batch` plus a `## This review batch` section naming the review file and `agent-rules.md`, then `node tools/launch-worker.mjs` with `--relaunch-reason` past the 2-launch branch cap. In-session subagents only read and review (final message at most 12 lines plus a result file; briefs point at scratchpad `agent-rules.md`). Read every worker diff before it counts. Before each push one review agent reads the new commits, bounded to concrete defects in what they claim; a pass with only text fixes needs no new agent. Run React Doctor (`npx -y react-doctor@0.7.6 . --blocking error --scope changed --base origin/main --no-dead-code --no-supply-chain --no-score --yes`) before a UI push. Edit the pull request body before its push. Resolve threads with `node tools/resolve-bot-thread.mjs --thread <id> --repo <key> --pr <n>` (reply on stdin) before the push. Request the review at the push: `node tools/list-bot-threads.mjs --repo <key> --pr <n> --head <full sha>`, then `node tools/wait-ci.mjs --repo <key> --pr <n> --require-check pullfrog-approval` in the background. Copy every `PRRT_` id from `list-bot-threads.mjs --no-request --wait-seconds 0` output in the same run. After every `main` merge, merge `origin/main` into the relay checkout and each open branch before its review; a clean UI merge then runs S `comment-fix.mjs` (see `## Current state`). Every turn ends with a registered wake source (`tools/wait-auto-work.mjs` when nothing else is live).

## Goal

Finish the spec: an empty board except `#33`, verified releases, the assistant fixed as a class (`#2135` first), the owner's reports shipped (`#2131`, `#2132`), the mascot rebrand (`#2121` to `#2126`), every `#315` ticket closed, then `#315`. Re-derive with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation: 21 open, 21 placed, 0 unplaced, 0 placed twice.

The owner is present now and then; answer him first, in English. `#2074` is MAX priority; worker model rotation per the spec (on `usageLimitReached: true`, tell the owner at once).

## In flight

UI `main` `3a3a8a1cd`; API `main` `38513551a`; landing `main` `7e6d150e0`. Released: production web `c95546c4c`; Android 1.3.156 (217) Open; iOS 1.3.156 (6) in `Orbit beta`, waiting for Beta App Review. `#2120` closed. Owner question queue: empty. No stash. No worker or agent is running. Read each named result file first; every row needs the coordinator now.

| Item | Disposition |
| --- | --- |
| ui#2459 (`#2135`) | Local `aab172db4` fixes P1 `PRRT_kwDOR5Siws63zNDp` (S `fix-2459-r19-result.md`). Bounded review of `edcecfa87..aab172db4`, resolve with S `reply-2459-zNDp.md`, body S `body-2459-r16.md`, React Doctor, push, merge at approval; then the live baseline run with a written cost estimate. |
| ui#2464 (`#2137`) | Local `d11204007` (S `fix-2464-r11-result.md`). Bounded review of `5d801546b..d11204007`, resolve FYx/FYz/FY5/FY9 (S `reply-2464-*.md`), body S `body-2464-r7.md`, push, merge; post S `comment-2139.md`, close `#2139`. |
| ui#2465 (`#2138`) | Local `f01fd6c33` (S `fix-2465-r11-result.md`). Bounded review of `c9ddec9e6..f01fd6c33`, resolve `PRRT_kwDOR5Siws63x_tT` with S `reply-2465-x_tT.md`, body S `body-2465-r6.md`, push, merge. |
| ui#2451 (`#2121`) | Local `1d1a7e6df` (round 8, 6 commits; S `fix-2451-r8-result.md`). Read the diff, bounded review of `d4d059cbd..1d1a7e6df`, copy approval for any new string, resolve the 4 `yK_` threads, push, merge; then merge `main` into `#2122`. |
| landing#136 + UI rule (`#2074`) | Landing local `d1ccf3a`, UI `fix/ticket-2074-legal-comments` local `44c7d9877` (S `fix-136-r7-result.md`). Bounded review of `689ea54..d1ccf3a` and `966317f53..44c7d9877`, resolve `PRRT_kwDORqm3lM63yD24` and `-yD3C`, body S `body-136-r4.md`, push; open the UI pull request with S `body-ui-legal-comments-r1.md`. |
| ui#2469 (`#2074`) | Pushed `eb213ba3d`, CI green, 2 P1 threads (S `review-2469-pullfrog-r8.json`). One worker round, review, resolve, push, merge; then delete the four orphaned cache entries once. |
| ui#2470 (`#2140`) | Pushed `8e1cd52ab`, CI green, 2 P1 threads (S `review-2470-pullfrog-r1.json`). One worker round, review, resolve, push, merge. |
| ui#2448 (`#2132`) | Pushed `a65d57f7f`: Windows installed drag check red and P1 `PRRT_kwDOR5Siws63y_OY`. Launch the composed S `order-2448-r6.md` (`--tier max --hard-ceiling-minutes 110`); the drain refused it. |
| `#2131` | Proof S `report-2131-proof-c95546c4c.md`: symptoms gone; decide the 44.5 pt column move on check pass, root-cause the Android check load failure (1 in 7), then resolve Sentry ORBIT-MOBILE-S and -T. |
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

- Done: iOS 1.3.156 (6) uploaded, added to `Orbit beta` and submitted to Beta App Review; `#2120` closed; the `#2131` device proof ran; ui#2448, ui#2459, ui#2469 pushed and ui#2470 opened after local reviews; worker rounds finished for ui#2451, ui#2464, ui#2465, ui#2459, landing#136 and the UI rule; intake ran (nothing new).
- Carried: every merge; the new Pullfrog threads on ui#2448, ui#2459, ui#2469, ui#2470; the ui#2448 worker round; the `#2131` follow-ups; the rebrand stack; `#1561`, `#1563`, `#315`, `#33`.

Every identifier here came from a previous session; treat each as a lead to verify.
