/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> c21fcd32-ff81-453c-92f7-e3256fbcbf47` as a background task (literal absolute paths, no `$HOME` in a redirect target) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D11). Helpers: `gl.sh` (gated launch), `co-rb.sh` (commit-only ui order), `fetch-threads-any.sh <repo name> <pr>...`, `run-spec.sh`, `repro-2077.sh`. Write scratchpad files with the Write tool or a heredoc to a literal absolute path: the guardrail refuses a redirect to a path built from a variable. Start every waiter as a Bash background task, never with a trailing `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` (not 0) to post the review request, and a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. A worker's report is the last assistant text with `## Test evidence` in its log.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `85ba63d1d`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No open pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2393` (`#2083`), `ui#2394` (`#2087`), `ui#2396` (`#2086`), `ui#2397` (`#2084`, head `211d1be3d`) | CI running. One `wait-ci` over the four; on green, request each review (`--wait-seconds 90`), then wait with `--require-check pullfrog-approval` and merge on approval. |
| `ui#2389` (`#2077`) | CI fix pushed at `6170bb03b` (spec-only, see spec). Start a CI waiter, then the review, merge on approval. |
| `ui#2395` (`#2085`) | Batch plus `main` merge unpushed at `b84cdbce1` in worktree `ticket-2085-relay-quiet-point`, suites green. Read the merge diff, body from `2085-rb1-report.md` and `2085-rb2-report.md`, resolve four threads, push once, review after green CI. |
| `landing#128` (`#2082`) | Head `098d4942b`, COMMENTED, three P1 FIX threads. Compose a landing `--review-batch` order from `note-2082-rb3.md`, launch with a `--relaunch-reason`; then fix the body's header event bullets, resolve the three threads, push, review; `/humanizer` and the `/second-opinion` copy verdict before merge. |
| `ui#2388` | This relay's docs branch; CI runs on each relay push. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2389`, `#2388`; api none; landing `#128`. Unpushed: `b84cdbce1` (`feature/ticket-2085-relay-quiet-point`). Stashes: 0. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate: the CI waiters first, then the `landing#128` launch and the `#2085` delivery. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry was listed at 20:17 UTC; the next listing is due one hour after `intake.wake.sentryListedAt`).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; the `#2084` batch delivered (`211d1be3d`, thread resolved); the landing Mac label batch delivered (`098d494`, both threads resolved, CI green, review requested); the `#2077` CI fix delivered (`6170bb03b`); the `#2085` merge batch committed (`b84cdbce1`); Sentry, mail and review intake ran (nothing new).
- Carried: the `#2085` push and review; the landing third review batch; the five reviews; every merge; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "launch `order-2082-rb2b.md`" (done; a third review followed) and "compose the `#2077` CI-fix order" (done).

Every identifier here came from a previous session: treat each as a lead to verify.
