/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` (Batch T first), `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> 63d0e926-8e4b-4733-9215-e5630a271cd4 c3158faf-35c7-488b-b71d-2cfd386f8291` as a background task (absolute paths, no shell variable in a redirect target) before writing any file there, then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. The predecessor log is `sleep-decisions.md` in the `63d0e926` scratchpad (D1 to D21). Helpers there: `gl.sh`, `co.sh` (compose an order plus a note), `launch-*.sh`, `order-*.md`, `note-*.md`, `token-swap.py`, `repro-2030-cover.sh`.

## Goal

Finish the spec: Batch T merged, then an empty board except `#33`, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 13 open, 13 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `f063561d7`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26 on both channels; Android Open 1.3.149 (209).

| Item | Disposition |
| --- | --- |
| `ui#2390` (`#2065`) | Head `40a20e256`, CI green, its one thread resolved, review requested at that head. Merge on a fresh approval with zero threads. |
| `ui#2389` (`#2077`) | Head `93d906554`. Only `Android release build` red (Gradle download timeout), rerun of run 42583811157 in progress. Request the review after green CI, merge, then Android Open with `#2062` and `#2061`, then production web. |
| `ui#2377` (`#2061`) | Head `2e0aa1a8d`, both threads resolved. Reruns of runs 42582157724 and 42582157708 (flaky Layout shard 3 search-empty spec, Android build 504). Request the review after green CI, merge. |
| `ui#2391` (`#1560`) | Head `abaff0ab4`, diff read. Red only on 504 outages (Android AAB Kotlin jar, Windows measure electron-builder binaries). Rerun failed jobs, request the review after green CI, merge. |
| `ui#2374` (`#1861`) | Head `0e83d9839`, macOS installed passes. Launch round 11 now: `launch-1861-r11.sh` (order `order-1861-r11.md`, deep tier). |
| `ui#2388` | This relay's docs PR now carries this handoff; its threads `PRRT_kwDOR5Siws61KxNT` (Astra rule line now matches `ui#2389`) and `PRRT_kwDOR5Siws61KxNd` (stale rows) are answered by this rewrite: resolve them with `resolve-bot-thread.mjs`. |
| `#2030` | Matrix green on current `main`, comment posted. Close on the owner-device probe after the next Android Open. AVD `orbit-repro-2030` stays until the `#2077` Android proof. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). Then `python3 -I token-swap.py` in the scratchpad. |
| `#2074` | Prove one requested review publishes `pullfrog-approval` (ui#2390 is the candidate); the measurement follows one week after the config change. |

Inventory: open pull requests ui `#2391`, `#2390`, `#2389`, `#2388`, `#2377`, `#2374`; api none; landing none. Unpushed branches: none. Stashes: 0. Detached worktrees `combined-2065`, `drift-evidence-path`, `ticket-1560-mac-signing`: clean, no unmerged work. Running workers: none. Worktree `ticket-2030-cover-screen` clean (debug switch reverted).

## Then, in this order

1. Answer any owner message first, in his language.
2. One `tools/wait-ci.mjs` over the open ui pull requests; rerun 504-only failures.
3. The in-flight rows above, Batch T first (`ui#2390` merge, `#2074` proof).
4. Android Open for `#2062`, `#2077` and `#2061` once `ui#2389` and `ui#2377` merge, then production web.
5. Then the rest of `## The order`: `#1861`, `#1560`, `#2030`, `#1561` device checks, `#1563`, the `#315` live Astra gate window, `#33` last, and the auto-work intake cycle when idle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads; Pullfrog reviews only on request. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `#2065` pushed and opened as `ui#2390`, review fix `40a20e256`; `ui#2377` round 4 verified, threads resolved, pushed, CI fix `2e0aa1a8d`; `ui#2389` body evidence added and round 3 `93d906554`; `#1560` launched and delivered `ui#2391`; `ui#2374` round 10 `0e83d9839`; `#2030` AVD matrix run and posted; the four older `ui#2388` threads resolved; `token-swap.py` URL parse fixed (OSC 8 target).
- Carried: `#2071`, `#2074` proof, `#2077` Android Open, `#1861`, `#1561`, `#1563`, `#315`, `#33`, intake, the AVD deletion.
- Superseded: the `ui#2374` round 10 step (now round 11); the `#2030` worktree matrix step (done, now waits on the probe).

Every identifier here came from a previous session: treat each as a lead to verify.
