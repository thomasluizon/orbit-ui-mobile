/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 2dec8170-ad43-4a49-a728-e7c1c6bdd213` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D6). Helpers: `gl.sh`, `launch-new-ticket-layout.sh`, `new-ticket-wt.sh`, `co-rb.sh`, `co-rb-landing.sh`, `last-report.mjs`, `sum-threads.mjs`, `log-decision.sh`, `run-spec.sh`, `reconcile.sh`, `inventory.sh`. Batch notes: `note-landing128-rb4.md`, `note-review-2397-2396.md`, `hydration-probe.spec.ts.txt` (the throttled probe). Write scratchpad files to literal absolute paths; the guardrail refuses a redirect to a path built from a variable. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `85ba63d1d`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No open pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2398` (`#2062`) `93e027ad7` | New worker PR, CI running. Read the diff (D95), prove the throttled guard test red and green with `run-spec.sh` (restore a `layout-build` artifact into `ticket-2062-layout-hydration-wait`), CI waiter, review request, merge. |
| `ui#2397` (`#2084`), `ui#2396` (`#2086`), `landing#128` (`#2082`) | Reviews COMMENTED; findings in `## The order` and the two scratchpad notes. Launch the three review batches, deliver, request reviews, approval waiter, merge, then the landing `/release`. |
| `ui#2395` (`#2085`), `ui#2389` (`#2077`), `ui#2393` (`#2083`, failed shard rerun) | CI nearly settled. CI waiter, review request, approval waiter, merge. |
| `ui#2394` (`#2087`) | Red on the Expo SDK Pin (upstream `expo` 58.0.23) and a macOS install job: launch the `#2077` Expo patch worker from `main` first, merge it, merge `main` into the open UI branches that need it, read the macOS log. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2398`, `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2389`, `#2388`; api none; landing `#128`. Unpushed commits: none. Stashes: 0 in all three. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle (Sentry, mailbox, reviews: due now).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; landing copy approved (`/second-opinion` DISAGREE high, posted on `landing#128`); `landing#128`, `ui#2397` and `ui#2396` reviews requested (each came back with findings); the `ui#2393` flake reproduced and its cause verified, fixed in `ui#2398`; the failed `ui#2393` jobs rerun.
- Carried: the CI waiters, review requests, approval waiters and merges for `ui#2395`, `ui#2389`, `ui#2393`; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "one CI waiter over all five" (split in two for speed); "fix the flake in a worker on `#2062`" (now `ui#2398`).

Every identifier here came from a previous session: treat each as a lead to verify.
