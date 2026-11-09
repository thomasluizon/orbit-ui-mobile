/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order` (Batch T first), `## Decision pointers`, the first `## Current state` paragraph and `## Open questions`. Open the brain ADRs it lists through the Obsidian MCP, including D145 to D149. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff. This prompt is short on purpose (owner's harness token diet, `#2064`): the owner-message history, refused routes, service identifiers and the scratchpad helper catalogue of the previous relays are in `git show b40d003ed:.claude/handoffs/NEXT.md`; read a part of it only when a step needs it.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB).

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> 4b980cf7-b273-4058-b961-72df627e1968 25768799-0367-4f40-a08a-dceeee4f760f` as a background task before writing any file there, then point `mirror.sh` at `durable-<new id>` and `intake-cycle.sh` at `<new id>-c<n>` with `perl -pi`. The predecessor log is `sleep-decisions.md` in the `4b980cf7` scratchpad (D1 to D9). `build-main-staging.sh` now reads `google-services.production.json` from the scratchpad.

## Goal

Finish the spec: Batch T merged first (no new board ticket before it), then an empty board except `#33`, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 25 open, 25 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `501ee4411`; API `main` `3da71dcf6`; landing `main` `aab36c695`. Production web `6602756f3`, staging web `9a964ccad`, API `998823218` both, Android Open 1.3.149 (209), desktop 0.1.25.

| Item | Disposition |
| --- | --- |
| `ui#2385` (`#2064`) | Delivered: spec 20,889 B, `NEXT.md` 6,720 B, size guard. Diff NOT read. It merged the relay branch at `b40d003ed`; merge this relay's later commits into it (carry the newest Current state and Batch T lines into the slim spec), CI, review, merge, then close `ui#1989`. Then launch `#2065`. |
| `ui#2378` (`#2066`), `ui#2379` (`#2067`), `ui#2380` (`#2073`), `ui#2381` (`#2068`), `ui#2382` (`#2069`), `ui#2383` (`#2070`) | Diffs read. CI and review in flight. Merge each at the merge bar; base-merge the `orchestrate/SKILL.md` editors as they conflict. After `ui#2378`: the `~/.claude.json` `disabledMcpServers` and `MEMORY.md` manual steps. After `ui#2379`: the first default-tier launch proves Sonnet with `--effort high`. |
| `ui#2384` (`#2072`) | Delivered, diff NOT read. Read it, CI, review, merge. It filed `#2074`: read it and launch its worker. |
| `#2071` | The orchestrator swaps `CLAUDE_CODE_OAUTH_TOKEN` to the main account in all three repositories before 4 December 2026 (`claude setup-token`, then `gh secret set` from stdin), after `ui#2383` merges. |
| `ui#2376` (`#2062`) | Green and approved at `936dade59`. Device proof: `verify-main-501e-staging.apk` (red) and `verify-branch-2376-staging.apk` (green) in the `4b980cf7` scratchpad, on the throwaway AVD at the owner size. Put the Android SDK `platform-tools` on PATH (`adb` was not found). Then merge, Android Open. |
| `ui#2375` (`#2063`) | Round 2 `4212629f0` pushed, threads resolved. CI, review, device proof (20 drags), merge, Android Open. |
| `ui#2377` (`#2061`) | Round 2 commit `3712bdf65` local, NOT pushed, diff NOT read, both launches used. Salvage it, fix thread `PRRT_kwDOR5Siws61FNh4` if it is still open, resolve both threads, push. Fold `#2075` and `#2076` (worker-filed) into `#2061` and close them. |
| `ui#2374` (`#1861`) | Round 7 `f25ab7e4c` pushed. Read the macOS `pushDiagnostics`, `push-apsctl-status.log` and `push-unified.log` to find where the done reminder stops; fix that cause. |
| Desktop Release 0.1.26 staging | Run 42492679821 attempt 2. File waiter: `wait-desk-42492679821-a2.done.json` in the `25768799` scratchpad, `--started-at` 21:04:30Z on the relay day. Then the staging and production web releases, then `landing#127`. |
| Notary `e44eaa63` | File waiter: `notary-e44eaa63/done.json` in the `36945796` scratchpad, `--started-at` 08:03:50Z on the relay day. A signal only. |
| `landing#127` (`#1563`) | Approved and green; merge after signed 0.1.26 is on `desktop-production`. |

Inventory: open pull requests ui `#1989`, `#2374`, `#2375`, `#2376`, `#2377`, `#2378` to `#2385`; api none; landing `#127`. Unpushed: `fix/ticket-2061-search-clear-centre` (`3712bdf65`). Running workers: none. Stashes: none checked beyond the clean orchestrating checkout. Intake this relay: Sentry `ORBIT-MOBILE-Q` only (no new event), mail 0, Play 0.

## Then, in this order

1. Answer any owner message first, in his language.
2. Start the two file waiters above and one `tools/wait-ci.mjs` over every open ui pull request.
3. Drive Batch T to merged (rows above), then `#2074`.
4. Drive `#2062`, `#2063`, `#2061` and `#1861` as their rows say.
5. Then the rest of `## The order`: desktop 0.1.26 releases, `#2057`, `#2056`, `#1560`, `#1563`, `#1561` device checks, `#2030`, the `#315` live Astra gate window, `#33` last, and the auto-work intake cycle when idle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs` or `tools/wait-file.mjs`, as Bash background tasks with timeout 7200000). Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Batch T order, file the diet tickets, work them first: done (ten tickets `#2064` to `#2073`, eight delivered) and carried (rows above).
- Waiters on the desktop run and the notary poll: carried (rows above).
- `ui#2374` round 7: done (`f25ab7e4c` pushed); its root cause step carried.
- Salvage `#2061`, drive `#2062` and `#2063`: done in part (`ui#2377` opened, `ui#2375` round 2, `ui#2376` green); the rest carried.
- `#315` gate window, desktop and web releases, `landing#127`, `#2057`, `#2056`, `#1560`, `#1563`, `#1561`, `#2030`, `#33`, intake, release order: carried through `## The order` and its standing rules.
- Owner orders, refused routes, identifiers and helper catalogue: carried by reference to `b40d003ed:.claude/handoffs/NEXT.md` and the spec, superseded in form by the owner's diet order.

Every identifier here came from a previous session: treat each as a lead to verify.
