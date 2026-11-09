/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` (Batch T first, `#2077` in Batch 0c), `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff. Older history: `git show archive/prod-release-spec-full:.claude/specs/orbit-prod-release.md`.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> c3158faf-35c7-488b-b71d-2cfd386f8291 dfebfac5-ec49-4f55-8476-9d4c7207c308` as a background task before writing any file there, then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. The predecessor log is `sleep-decisions.md` in the `c3158faf` scratchpad (D1 to D13). Helpers there: `gl.sh` (gated launcher), `merge-gate.sh` (needs `MSUBJ` and `MBODY`), `batch-body.sh`, `intake-noboard.sh` (Play and mail, no board read), `play-complete.mjs <cycle> <run>`, `wait-desk-*.sh`. Write files there with the Write tool or from inside the directory: the guardrail refuses a redirect target that holds a shell variable.

## Goal

Finish the spec: Batch T merged, then an empty board except `#33`, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 17 open, 17 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `bd8df6080`; API `main` `3da71dcf6`; landing `main` `aab36c695`. Staging web `0e43371b0`, staging API `3da71dcf6`; production web `6602756f3`, production API `998823218`; Android Open 1.3.149 (209); desktop 0.1.26 on staging, 0.1.25 on production.

| Item | Disposition |
| --- | --- |
| `#2077` owner order (fixed Astra button above `+`, no drag) | Worker killed at the 45 minute ceiling: 11 commits on `fix/ticket-2077-astra-fixed-stack`, head `96d1b4954`, tree clean, not pushed, no pull request. Worktree `ticket-2077-astra-fixed-stack`, launch record `launch-2077.json`. Read the diff against the ticket, run both focused suites, type checks and ESLint, push, open the pull request (`Tracks`); relaunch with `--relaunch-reason` only if work is missing. Then Android Open with `#2062`. |
| Release chain | Landing staging `aab36c695`, then production API `3da71dcf6`, production web `0e43371b0` (publishes desktop 0.1.26 production), production landing, one at a time through `/release`'s waiter. Then merge `landing#127` and release landing. |
| `ui#2379` (`#2067`) | Conflicts on `.claude/calibration.json`: base-merge, reseed, both harnesses, push, CI, review, merge. |
| `ui#2387` (`#2074`) | Conflicts on `orchestrate/SKILL.md` and the spec: base-merge, move its three spec Constraints lines to `.claude/playbooks/operations.md`, push, CI, review, merge; then the Pullfrog `config set` steps. |
| `ui#2377` (`#2061`) | Round 3 `9519dc39c` pushed, threads resolved, no Pullfrog review of that head yet: request it, CI, merge. |
| `ui#2374` (`#1861`) | Round 8 `249eaa4d0` pushed, thread resolved; `installed (windows-latest)` red. Read the acceptance and measure runs and their artifacts. |
| `#2066` | Merged; local steps done. Prove the nine connectors are absent from this session's deferred tool list, then close it. |
| `#2071` | Token swap now (blocker merged). |
| `ui#1989` | Old relay docs pull request: close it once this branch's relay pull request is open. |
| Throwaway AVD `orbit-repro-2030` | Delete it (`avdmanager delete avd -n orbit-repro-2030`) after the `#2077` Android proof. |

Inventory: open pull requests ui `#1989`, `#2374`, `#2377`, `#2379`, `#2387`, plus this relay's; api none; landing `#127`. Unpushed: `fix/ticket-2077-astra-fixed-stack` (`96d1b4954`). Running workers: none. Stashes and detached heads: none checked beyond the worktrees above.

## Then, in this order

1. Answer any owner message first, in his language.
2. Start one `tools/wait-ci.mjs` over the open ui pull requests.
3. Salvage `#2077`, drive `ui#2379`, `ui#2387`, `ui#2377` to merged, `#2071`, `#2065`, `#2066` proof.
4. The release chain above, then Android Open for `#2062` and `#2077`.
5. Then the rest of `## The order`: `#1861`, `#2057`, `#2056`, `#1560`, `#1563`, `#1561` device checks, `#2030`, the `#315` live Astra gate window, `#33` last, and the auto-work intake cycle when idle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs` or `tools/wait-file.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2386`, `#2384`, `#2383`, `#2382`, `#2381`, `#2380`, `#2378`, `ui#2375` merged; `#2064`, `#2068`, `#2069`, `#2070`, `#2072`, `#2073` closed; `ui#2377` and `ui#2374` pushed; desktop 0.1.26 staging published; notary `e44eaa63` accepted; `#2066` local steps; Play cycle 1 imported.
- Superseded: `#2063` canceled by the owner order `#2077`; the Android Open for `#2063` became the one for `#2062` and `#2077`.
- Carried: `ui#2379`, `ui#2387`, `#2071`, `#2065`, production releases, `landing#127`, `#315`, `#33`, intake, the AVD deletion.

Every identifier here came from a previous session: treat each as a lead to verify.
