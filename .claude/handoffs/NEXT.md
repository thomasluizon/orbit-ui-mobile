/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 00fb06d3-566b-42c9-8784-014ced46953a` as a background task (literal absolute paths, no `$HOME` in a redirect target) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D7). Helpers: `gl.sh` (gated launch), `co-rb.sh` (commit-only ui order), `co-rb-landing.sh` (commit-only landing order), `last-report.mjs <worker log>`, `sum-threads.mjs <list-bot-threads JSON>`, `fetch-threads-any.sh`, `log-decision.sh`, `run-spec.sh`, `reconcile.sh` (board against `## The order`). Write scratchpad files with the Write tool or a heredoc to a literal absolute path: the guardrail refuses a redirect to a path built from a variable. In zsh, `echo =====` fails. Start every waiter as a Bash background task, never with a trailing `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` (not 0) to post the review request, and a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `85ba63d1d`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No open pull request is approved; every review thread is resolved.

| Item | Disposition |
| --- | --- |
| `ui#2389` (`#2077`) `ed1238943`, `ui#2395` (`#2085`) `b9f343777`, `ui#2394` (`#2087`) `9cee6293d`, `ui#2396` (`#2086`) `109a35eb8`, `ui#2397` (`#2084`) `384da829e` | Pushed, CI running or settled. Start one CI waiter over all five; on green, request each review (`--wait-seconds 90`), then one approval waiter; merge at the merge bar. `ui#2397`'s `installed (windows-latest)` readers test is the first proof of the DWM read-back. |
| `landing#128` (`#2082`) `565f440` | Pushed, threads resolved. Run a fresh `/second-opinion` on the unified `M chip` strings (framed as a claimed copy defect) and post the DISAGREE on the pull request, then CI waiter, review request, approval waiter, merge, landing `/release`. |
| `ui#2393` (`#2083`) `b6859e2ab` | Red only in Layout shard 3: `e2e/layout/search-empty-icon-action.spec.ts:62` at 1280px en, the search textbox never appears; the same spec failed on the `#2086` branch (run 42662245847), so it is a `main` flake. Reproduce it red with `run-spec.sh` in the `#2083` worktree (`--repeat-each`, `-g "1280px in en"`), fix the root cause in a worker on `#2062` (habit search area), then rerun the `ui#2393` run. |
| `ui#2388` | This relay's docs branch; CI runs on each relay push. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2389`, `#2388`; api none; landing `#128`. Unpushed commits: none in any worktree of the three repositories. Stashes: 0 in all three. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry was listed at 21:25 UTC on 9 November 2026 and is due now).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; the `#2077` batch delivered (`ed1238943`); the `#2085` batch delivered (`b9f343777`, review-body Behavior bullet fixed, corrected measurement in the body, D149 and a ticket comment); the landing copy batch delivered (`30c27b4` plus `565f440`, both threads resolved).
- Carried: the CI waiters, review requests, approval waiters and merges; the landing `/second-opinion`; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "start one CI waiter over `ui#2393` and `ui#2397`" (`ui#2393` went red on a `main` flake, now its own row; `ui#2397` joins the five-PR waiter); "`ui#2394` same path" (its `PR Metadata` was red on the parity rule; fixed by `9cee6293d`).

Every identifier here came from a previous session: treat each as a lead to verify.
