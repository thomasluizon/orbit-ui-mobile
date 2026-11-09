/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec. On `main`, `run-state.mjs` has no `updateRunState` until `ui#2392` merges: change the record with `writeRunState({ ...readRunState(), ... })`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 39be95a1-b20c-480f-bbd2-ee23c2318a3b` as a background task (literal absolute paths, no `$HOME` in a redirect target) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D10). Helpers: `gl.sh` (gated launch), `co-rb.sh` (commit-only order), `fetch-threads-any.sh <repo name> <pr>...`, `append-note.sh`, `run-spec.sh`, `repro-2077.sh`. Write scratchpad files with the Write tool or a heredoc to a literal absolute path: the guardrail refuses a redirect to a path built from a variable. Start every waiter as a Bash background task, never with a trailing `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` (not 0) to post the review request.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `21f6045ae`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2392` (`#2081`) | Head `531e9f362`, CI green, review requested. Wait with `--require-check pullfrog-approval`, merge on approval. |
| `ui#2397`, `ui#2394`, `ui#2396`, `ui#2393`, `ui#2388` | The CI waiter reached its ceiling. `ui#2397` (`#2084`, `386b6fe0a`) green: request the review. `ui#2394` (`#2087`, `a9ac9ca5f`) failing only `installed (macos-latest, Developer ID)`: rerun it once, then read the log. `ui#2393` (`#2083`, `557b77e7f`) failing `Upgrade layout geometry`, `Unit Tests`, `Layout shard 3`, `Web unit (chromium 5/20)`: read each failure and fix at the root (a CI-fix batch). `ui#2396` (`#2086`, `43a682ff9`) and `ui#2388` (docs) had `Unit Tests` failing while other checks ran: read it. Then request each review and run one `--require-check pullfrog-approval` waiter. |
| `ui#2395` (`#2085`) | The review worker hit the 45 minute hard ceiling: unpushed `25ce52f57` plus a merge of `main` (`eb25be55f`) in worktree `ticket-2085-relay-quiet-point`, tree clean, no final report. Read the diff against the four threads (spec bullet), finish what it left, run both suites, write the evidence into the body, resolve, push, request the review. |
| `landing#128` (`#2082`) | Head `d8713e19b`, CI green; second review COMMENTED with threads `PRRT_kwDORqm3lM61ZSFy` and `PRRT_kwDORqm3lM61ZSF7`. Decided to fix both (spec bullet): compose one review-batch order, launch, read, resolve, push, review; copy verdict before merge. |
| `ui#2389` (`#2077`) | Layout red at `4686f7094`. `repro-2077.sh` timed out twice at the web server start (`next start` with `output: standalone`). Match the CI layout job's server start in `run-spec.sh`, prove the cause red, then compose and launch the CI-fix order. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2392`, `#2389`, `#2388`; api none; landing `#128`. Unpushed: `25ce52f57` and `eb25be55f` on `feature/ticket-2085-relay-quiet-point`. Stashes: 0 in all three repositories. Uncommitted work: none. Running workers: none. Detached checks: none. The CI waiter over ui `#2388`, `#2393`, `#2394`, `#2396`, `#2397` stops at the relay: start a new one.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate: waiters first, then the `#2085` salvage, then the `landing#128` and `#2077` launches. Rerun 504-only failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry is due one hour after the last listing in `intake.wake`).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `ui#2392`, `ui#2396`, `ui#2394`, `ui#2393` and `landing#128` pushed with every thread resolved; the `ui#2397` diff read; the `#2083` batch delivered; the `ui#2392` and `landing#128` reviews requested.
- Carried: the `#2085` salvage, the `landing#128` second batch, the `ui#2389` CI fix, every review and merge, the Android Open and production web, the desktop and landing releases, `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "launch the `#2083` batch" (delivered) and the `landing#128` not-applicable replies (Pullfrog re-raised both; now fixed instead).

Every identifier here came from a previous session: treat each as a lead to verify.
