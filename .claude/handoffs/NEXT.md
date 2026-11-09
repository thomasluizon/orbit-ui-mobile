/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> 39be95a1-b20c-480f-bbd2-ee23c2318a3b c86d30f5-8e14-4140-8354-b96a8c2c7d78` as a background task (absolute paths, no shell variable in a redirect target) before writing any file there, then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. The predecessor log is `sleep-decisions.md` in the `39be95a1` scratchpad (D1 to D6). Helpers there: `gl.sh` (gated launch; a branch past its 2-launch cap needs `--relaunch-reason`), `co-rb.sh` (review-batch order), `play-cycle.sh <label>`, `check-2081-tools.sh`, `token-swap.py`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 19 open, 19 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `b913fa08b`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26 on both channels; Android Open 1.3.149 (209); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| `ui#2392` (`#2081`) | Fix commit `f8581cfa2` is local and NOT pushed on `fix/ticket-2081-run-state-lock`. Its tools and hooks suites run detached: start `node tools/wait-file.mjs --file <carried scratchpad>/check-2081-tools.done.json --started-at <ISO in check-2081-tools.started> --what "ui#2392 test-tools and test-hooks"` (logs `check-2081-test-tools.log`, `check-2081-test-hooks.log`). On exit 0: edit the PR body's nested call bullet (the call now throws), re-list the threads, resolve both, push once, wait on CI, request the review, merge on approval. |
| `ui#2389` (`#2077`) | Head `6aeff28f5`, two 412px layout specs red (cause in the spec). Launch the composed CI-fix order `order-2077-ci5.md` with `gl.sh --issue "#2077" --worktree <ticket-2077-astra-fixed-stack worktree> --prompt <order> --relaunch-reason "<CI fix for the pending-slot settle race>"`, then deliver the commit, push, rerun CI, request the review, merge on approval, then production web and Android Open with `#2062` and `#2061`. |
| `ui#2377` (`#2061`) | Merged as `b913fa08b`. Ships in the next Android Open and production web, then close `#2061`. |
| `ui#2391` (`#1560`) | Head `b6ed095d1`, CI was running. Wait on CI, request the review, merge on approval, then the `apps/desktop` ESLint gap plus the 10 s spawn timeout at `tools/desktop-bench/test-acceptance.ts:224`. |
| `ui#2388` | This relay's docs PR carries this handoff. Request the review after green CI and merge. |
| `#2082`, `#2083`, `#2084` | New owner orders, filed this session and placed in the spec. Launch workers when the pool allows. |
| `#1861` | Ship in the next desktop release (with `#2084`), then close. |
| `#2030` | Close on the owner-device probe after the next Android Open. AVD `orbit-repro-2030` stays until the `#2077` Android proof. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). Then `python3 -I token-swap.py` in the scratchpad. |
| `#2074` | Run `tools/review-rounds.mjs` on or after 16 November 2026. Also compare tokens per merged PR in the week before and after `ui#2390` (relay threshold 400k to 200k): the owner asked whether frequent relays cost more. |

Inventory: open pull requests ui `#2392`, `#2391`, `#2389`, `#2388`; api none; landing none. Unpushed branches: `fix/ticket-2081-run-state-lock` (1 commit, `f8581cfa2`). Stashes: 0 in all three repositories. Uncommitted work: none. Running workers: none. Detached checks: `check-2081-tools.sh` (completion file above).

## Then, in this order

1. Answer any owner message first, in his language.
2. One `tools/wait-ci.mjs` over the open pull requests, then a `--require-check pullfrog-approval` waiter over the requested reviews; rerun 504-only failures.
3. The in-flight rows above.
4. Android Open for `#2062`, `#2077` and `#2061` once `ui#2389` merges, then production web.
5. Then the rest of `## The order`: `#2083`, `#2081`, `#1560`, `#2084`, `#1861`, `#2030`, `#2082`, Batch 6 (`#2078`, `#2079`, `#2080`), `#1561` device checks, `#1563`, the `#315` live Astra gate window, `#33` last, and the auto-work intake cycle when idle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2377` review requested, approved and merged (`b913fa08b`); `ui#2389` red layout shard read (spec cause, CI-fix order composed); owner Windows install and auto-update questions answered with live evidence; owner orders ticketed as `#2082`, `#2083`, `#2084`.
- Carried: the `ui#2392` push (suites running), every other merge, review requests on `ui#2389`, `ui#2391`, `ui#2388`, `#2071`, the Android Open, `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion.
- Superseded: "rerun `Layout shard 1` if infrastructure" (it is a real race; the CI-fix order replaces it).

Every identifier here came from a previous session: treat each as a lead to verify.
