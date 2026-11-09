/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` (Batch T first), `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> 422a7ce4-f72e-4ccf-bb5b-3fd15d459f3c c3158faf-35c7-488b-b71d-2cfd386f8291` as a background task before writing any file there, then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. The predecessor log is `sleep-decisions.md` in the `422a7ce4` scratchpad (D1 to D25). Helpers there: `gl.sh`, `launch-*.sh`, `order-*.md`, `note-*.md`. Write scratchpad files with the Write tool: the guardrail refuses a redirect target that holds a shell variable.

## Goal

Finish the spec: Batch T merged, then an empty board except `#33`, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 13 open, 13 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `f063561d7`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26 on both channels; Android Open 1.3.149 (209).

| Item | Disposition |
| --- | --- |
| `ui#2389` (`#2077`) | Head `7ce726f8d` pushed (the CI-fix worker hit its 90 minute ceiling after 5 commits). Wait for CI; take that round's evidence from the worker log named in `launch-2077-r2.json` into the body; request the review (`list-bot-threads.mjs` after green CI); merge; then Android Open with `#2062`. |
| `ui#2377` (`#2061`) | Round 4 commit `e3d3c80b2` local, not pushed, tree clean (worker hit its ceiling). Verify it against both threads in `note-2061-r4.md`, run the suites, merge the body, resolve both threads, push once, request the review after green CI. |
| `#2065` | Branch `chore/ticket-2065-relay-threshold` head `87919f448`, 3 commits, not pushed, no PR. Read the diff, run both harnesses, push, open the PR (`Tracks`). |
| `ui#2374` (`#1861`) | Head `3b4f192f9`, three jobs red after the rerun (spec entry). Send round 10 with the run 42567095698 and 42567095900 artifacts. |
| `#1560` NSIS prefetch | Worktree `ticket-1560-nsis-prefetch` on `fix/ticket-1560-nsis-prefetch` at `3f23ead5f`; order composed (`order-1560-nsis.md`, `launch-1560-nsis.sh`), not launched. Launch it. |
| `#2030` | Worktree `ticket-2030-cover-screen`, tree clean. Run the AVD matrix yourself (spec entry). Delete AVD `orbit-repro-2030` after this and the `#2077` Android proof. |
| `#2074` | Merged; config set done. Prove one requested review; the measurement follows one week after the config change. |
| `#2071` | Waits on the owner's claude.ai sign-in in Chrome (open question). Then rerun `token-swap.py` from the scratchpad after fixing its URL parse (it must take the OSC 8 link target). |
| `ui#2388` | This relay's docs PR now carries this handoff; its four older Pullfrog threads are answered by the rewrite: resolve them. |

Inventory: open pull requests ui `#2388`, `#2389`, `#2377`, `#2374`; api none; landing none. Unpushed: `chore/ticket-2065-relay-threshold` (`87919f448`), `fix/ticket-2061-search-clear-centre` (`e3d3c80b2`). Running workers: none. Stashes and detached heads: none checked beyond the worktrees above.

## Then, in this order

1. Answer any owner message first, in his language.
2. One `tools/wait-ci.mjs` over the open ui pull requests.
3. The in-flight rows above, Batch T first (`#2065`, `#2074` proof).
4. Android Open for `#2062` and `#2077` once `ui#2389` merges, then production web for `#2077`.
5. Then the rest of `## The order`: `#1861`, `#1560`, `#2030`, `#1561` device checks, `#1563`, the `#315` live Astra gate window, `#33` last, and the auto-work intake cycle when idle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs` or `tools/wait-file.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads; Pullfrog now reviews only on request. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `#2077` salvaged and opened as `ui#2389`; `ui#2379` merged (`#2067` closed with the Sonnet proof); `ui#2387` merged with its Pullfrog config set steps; `#2066` proof posted and closed; release chain (landing staging, production API `3da71dcf6`, production web `0e43371b0` with desktop 0.1.26, `landing#127` merged and released to staging and production); `#2057` and `#2056` closed; `ui#1989` already closed.
- Carried: `ui#2377` review, `#2071`, `#2065`, `#2077` Android Open, `#1861`, `#2030`, `#1561`, `#1563`, `#315`, `#33`, intake, the AVD deletion.
- Superseded: the release chain step (done); the `ui#2374` round 8 reading (now round 10).

Every identifier here came from a previous session: treat each as a lead to verify.
