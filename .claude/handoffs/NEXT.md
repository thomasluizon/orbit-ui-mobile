/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` (Batch T first), `## Decision pointers`, the first `## Current state` paragraph and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff. This prompt stays short (owner's harness token diet, `#2064`); older owner-message history and the helper catalogue are in `git show b40d003ed:.claude/handoffs/NEXT.md`, read only when a step needs a part.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> dfebfac5-ec49-4f55-8476-9d4c7207c308 4b980cf7-b273-4058-b961-72df627e1968` as a background task before writing any file there, then point `mirror.sh` at `durable-<new id>` with `perl -pi`. The predecessor log is `sleep-decisions.md` in the `dfebfac5` scratchpad (D1 to D14). Helpers there: `gl.sh` (gated launcher), `batch-body.sh <launch json> <pr> <label>` (worker report into the PR body), `open-threads.sh`, `views-2062.sh`, `drag-2063.sh`, `check-2061-r3.sh`, `play-complete.mjs`. Write files there with the Write tool or from inside the directory: the guardrail refuses a redirect target that holds a shell variable.

## Goal

Finish the spec: Batch T merged first (no new board ticket before it), then an empty board except `#33`, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 23 open, 23 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `ec54a1f6a`; API `main` `3da71dcf6`; landing `main` `aab36c695`. Production web `6602756f3`, staging web `9a964ccad`, API `998823218` both, Android Open 1.3.149 (209), desktop 0.1.25.

| Item | Disposition |
| --- | --- |
| `ui#2386` (`#2064`) | Clean republish, both harnesses green. CI, review, merge first; then close `ui#1989`, start the next relay branch from `main`, launch `#2065`. |
| `ui#2378`, `#2379`, `#2380`, `#2383`, `#2384` (`#2066`, `#2067`, `#2073`, `#2070`, `#2072`) | Round 2 pushed by the orchestrator, threads resolved. CI, fresh review, merge at the merge bar; base-merge the `orchestrate/SKILL.md` editors as they conflict and reseed the calibration (`node tools/reseed-calibration.mjs`). After `ui#2378`: `disabledMcpServers` in `~/.claude.json` and `MEMORY.md` to 6 KB. After `ui#2383`: the `#2071` token swap. |
| `ui#2381`, `ui#2382` (`#2068`, `#2069`) | Worker round 2 pushed (`d612f46c2`, `a79854516`), bodies merged. CI, review, merge. After `ui#2382`: intake step 5 runs `node tools/orbit-play-reviews.mjs --cycle`. |
| `ui#2387` (`#2074`) | Delivered, body fixed to `Tracks`. CI, review; at the base merge after `ui#2386`, move its three spec Constraints lines to `.claude/playbooks/operations.md`. After merge, `npx pullfrog@latest config set review.mode none` and `review.re-review false` in all three repositories, then prove one requested review. |
| `ui#2375` (`#2063`) | Round 3 `a6e248e41` pushed; device proof posted (main 1 of 20 drags, branch 20 of 20). CI, review, merge, then one Android Open for `#2062` and `#2063`. |
| `ui#2377` (`#2061`) | Local `3712bdf65` and `9519dc39c` NOT pushed (third worker hit its ceiling, no report). Salvage checks green (`check-2061-r3/`: mobile 83/83, web 38/38, both type checks, both ESLint). Write `## Test evidence` from those logs, resolve threads `PRRT_kwDOR5Siws61FNhy` and `PRRT_kwDOR5Siws61FNh4`, push. |
| `ui#2374` (`#1861`) | Round 8 `249eaa4d0` local, NOT pushed (max worker, exit 0; report in the log named by `launch-1861-r8.json`). Read the diff, run `batch-body.sh` on it, resolve thread `PRRT_kwDOR5Siws61FYgX`, push, then read the new acceptance and measure runs. |
| Desktop Release 0.1.26 staging | Run 42492679821 attempt 2. File waiter on `wait-desk-42492679821-a2.done.json` in the `25768799` scratchpad, `--started-at` 21:04:30Z on the previous relay day. Then production, the staging and production web releases, then `landing#127`. |
| Notary `e44eaa63` | File waiter on `notary-e44eaa63/done.json` in the `36945796` scratchpad, `--started-at` 08:03:50Z on the previous relay day. A signal only. |
| `landing#127` (`#1563`) | Approved and green; merge after signed 0.1.26 is on `desktop-production`. |
| Throwaway AVD | `orbit-repro-2030` runs headless on `emulator-5594`; delete it (`avdmanager delete avd -n orbit-repro-2030`) once `#2063` needs no more proof. |

Inventory: open pull requests ui `#1989`, `#2374`, `#2375`, `#2377` to `#2384`, `#2386`, `#2387`; api none; landing `#127`. Unpushed: `fix/ticket-2061-search-clear-centre` (`9519dc39c`), `feature/ticket-1861-done-acceptance` (`249eaa4d0`). Running workers: none. Intake this relay: Sentry `ORBIT-MOBILE-Q` only (no new event), mail 0, Play 0 (cycle `dfebfac5-c1` complete).

## Then, in this order

1. Answer any owner message first, in his language.
2. Start the two file waiters above and one `tools/wait-ci.mjs` over the open ui pull requests (fold so no more than three run).
3. Push `ui#2377` and `ui#2374` as their rows say; drive Batch T to merged, `ui#2386` first.
4. Merge `ui#2375`, then Android Open for `#2062` and `#2063`.
5. Then the rest of `## The order`: desktop 0.1.26 releases, `#2057`, `#2056`, `#1560`, `#1563`, `#1561` device checks, `#2030`, the `#315` live Astra gate window, `#33` last, and the auto-work intake cycle when idle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs` or `tools/wait-file.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Batch T rows: carried with new heads (table above); `ui#2385` replaced by `ui#2386`; `#2074` delivered as `ui#2387`.
- `ui#2376` device proof and merge: done (`ec54a1f6a`). `#2063` device proof: done. `#2075`, `#2076`: folded into `#2061` and canceled.
- `ui#2374` root cause: found (the runner's shared apsd keychain, a collapsed Windows toast), round 8 committed, push carried.
- Waiters, desktop and web releases, `landing#127`, `#315`, `#33`, intake: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
