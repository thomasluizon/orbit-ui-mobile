/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> bddb6bbe-0954-4234-91c9-73ff9a168d91 63d0e926-8e4b-4733-9215-e5630a271cd4` as a background task (absolute paths, no shell variable in a redirect target) before writing any file there, then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. The predecessor log is `sleep-decisions.md` in the `bddb6bbe` scratchpad (D1 to D17). Helpers there: `gl.sh`, `co.sh` (compose an order plus a note; add `--review-batch` for a review fix), `launch-*.sh`, `order-*.md`, `note-*.md`, `report-*.md`, `token-swap.py`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 15 open, 15 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `a72c71895`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26 on both channels; Android Open 1.3.149 (209).

| Item | Disposition |
| --- | --- |
| `ui#2389` (`#2077`) | Head `cb674c5e2` (review fix `891f8b785` plus a main merge), three threads resolved, CI starting. Request the review after green CI, merge, then Android Open with `#2062` and `#2061`, then production web. |
| `ui#2377` (`#2061`) | Head `687a3ac78`, threads resolved, CI green, review requested at that head. Merge on approval. |
| `ui#2391` (`#1560`) | Head `6d165f6cb` (Android boot gate fixes added), CI green, review requested at that head. Merge on approval, then verify the shell update on the Mac. |
| `ui#2374` (`#1861`) | Head `a6b4e6391`, six threads resolved, CI green, review requested at that head. Merge on approval. |
| `ui#2388` | This relay's docs PR carries this handoff; its thread `PRRT_kwDOR5Siws61NGbT` (round 11 already landed) is answered by this rewrite: resolve it with `resolve-bot-thread.mjs`, then request the review and merge. |
| `#2030` | Close on the owner-device probe after the next Android Open. AVD `orbit-repro-2030` stays until the `#2077` Android proof. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). Then `python3 -I token-swap.py` in the scratchpad. |
| `#2074` | Never holds the launch (owner order). Run `tools/review-rounds.mjs` on or after 16 November 2026; fix the cause if the share is not clearly below 43%. |
| `#2078`, `#2079`, `#2080` | New CodeQL tickets in Batch 6; admit when Batch 0c settles. |

Inventory: open pull requests ui `#2391`, `#2389`, `#2388`, `#2377`, `#2374`; api none; landing none. Unpushed branches: none. Stashes: 0. Detached worktrees `combined-2065`, `drift-evidence-path`, `ticket-1560-mac-signing`, `verify-2036-main`: clean, no unmerged work. Running workers: none.

## Then, in this order

1. Answer any owner message first, in his language.
2. One `tools/wait-ci.mjs` over `ui#2389`, then a `--require-check pullfrog-approval` waiter over the requested reviews; rerun 504-only failures.
3. The in-flight rows above.
4. Android Open for `#2062`, `#2077` and `#2061` once `ui#2389` and `ui#2377` merge, then production web.
5. Then the rest of `## The order`: `#1861`, `#1560`, `#2030`, Batch 6 (`#2078`, `#2079`, `#2080`), `#1561` device checks, `#1563`, the `#315` live Astra gate window, `#33` last, and the auto-work intake cycle when idle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads; Pullfrog reviews only on request. A worker killed for no progress after its final report is delivered by hand from that report. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: `ui#2390` merged (`a72c71895`), `#2065` closed; `#2074` step 2 proven (ticket comment); `ui#2388`'s two older threads resolved; `#1861` rounds 11 and 12 plus the review batch (`a6b4e6391`), Windows Done proven through the registered activator; `ui#2391` reruns and two boot gate fixes; `ui#2377` and `ui#2389` review batches delivered; intake cycle (Sentry, mail, Play) clean.
- Carried: `ui#2389`, `ui#2377`, `ui#2391`, `ui#2374` merges, `#2071`, `#2077` Android Open, `#2030`, `#1561`, `#1563`, `#315`, `#33`, intake, the AVD deletion.
- Superseded: the `#2074` launch hold (owner order: it never holds the launch); `#1861` round 11 (done, then round 12 and the review batch).

Every identifier here came from a previous session: treat each as a lead to verify.
