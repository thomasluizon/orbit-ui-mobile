/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 175964a0-fa26-42df-8f01-67edbf4dbad5` as a background task (literal absolute paths, no `$HOME` in a redirect target) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D7). Helpers: `gl.sh` (gated launch), `co-rb.sh` (commit-only ui order), `last-report.mjs <worker log>` (prints a worker's full report), `fetch-threads-any.sh <repo name> <pr>...`, `run-spec.sh`, `repro-2077.sh`. Write scratchpad files with the Write tool or a heredoc to a literal absolute path: the guardrail refuses a redirect to a path built from a variable. Start every waiter as a Bash background task, never with a trailing `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` (not 0) to post the review request, and a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. A worker's report is the last assistant text with `## Test evidence` in its log.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `85ba63d1d`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No open pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2393` (`#2083`) | CI green, review requested at `e7d38c396`. Start the approval waiter (`--require-check pullfrog-approval`), merge on approval. |
| `ui#2389` (`#2077`), `ui#2394` (`#2087`), `ui#2396` (`#2086`) | CI running. One `wait-ci` over the three; on green, request each review (`--wait-seconds 90`), then wait with `--require-check pullfrog-approval` and merge on approval. |
| `ui#2395` (`#2085`) | Batch and `main` merge pushed at `b84cdbce1`, four threads resolved, body updated. Wait on CI, request the review, merge on approval. |
| `landing#128` (`#2082`) | Third batch pushed at `684f7954a`, three threads resolved, body fixed. Wait on CI, request the review; `/humanizer` on the two Mac labels and the `/second-opinion` copy verdict on the PR before merge. |
| `ui#2397` (`#2084`) | Red: `installed (windows-latest)` fails `test-acceptance-readers.ts:441` (the spec's `#2084` bullet has the reading and both leads). Compose a commit-only CI-fix order (deep tier, `--relaunch-reason`), launch with `gl.sh`, read the diff, push, then CI and review. |
| `ui#2388` | This relay's docs branch; CI runs on each relay push. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2389`, `#2388`; api none; landing `#128`. Unpushed: none (checked the `#2085`, `#2084`, `#2082` and `#2077` worktrees). Stashes: 0 in all three repositories. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate: the waiters first, then the `#2084` CI-fix launch. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry was listed at 20:17 UTC; the next listing is due one hour after `intake.wake.sentryListedAt`).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; the `ui#2393` review requested; the landing third batch launched and delivered (`684f7954a`, body fixed, three threads resolved); the `#2085` delivery (`b84cdbce1` pushed, four threads resolved, body from both reports).
- Carried: the CI waiters and the other five reviews; every merge; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "one `wait-ci` over the four" (`ui#2393` is green and `ui#2397` is red, see the rows above); "compose a landing `--review-batch` order from `note-2082-rb3.md`" and "read the `#2085` merge diff, push once" (done).

Every identifier here came from a previous session: treat each as a lead to verify.
