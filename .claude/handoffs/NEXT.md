/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec. `ui#2392` is merged, so `main` has `updateRunState`; this relay branch does not, so change the record with `writeRunState({ ...readRunState(), ... })` here.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 39be95a1-b20c-480f-bbd2-ee23c2318a3b` as a background task (literal absolute paths, no `$HOME` in a redirect target) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new id>` and `intake-noboard.sh` at `<new id>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D11). Helpers: `gl.sh` (gated launch), `co-rb.sh` (commit-only ui order), `joblog.sh <repo name> <job id>`, `fetch-threads-any.sh <repo name> <pr>...`, `append-note.sh`, `run-spec.sh` (serves the layout build on port 3000), `repro-2077.sh`. Write scratchpad files with the Write tool or a heredoc to a literal absolute path: the guardrail refuses a redirect to a path built from a variable. Start every waiter as a Bash background task, never with a trailing `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` (not 0) to post the review request. A worker's final message can be a short notice: read the full report from the earlier assistant text in its log.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `85ba63d1d`; API `main` `3da71dcf6`; landing `main` `7fb212c42`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No open pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2393` (`#2083`), `ui#2394` (`#2087`), `ui#2396` (`#2086`) | Each went green, then took `main`: heads `e7d38c396`, `8c398a641`, `21f58b032`, CI running. Start one `wait-ci` over the three; on green, request each review (`--wait-seconds 90`), then wait with `--require-check pullfrog-approval` and merge on approval. |
| `ui#2397` (`#2084`) | Batch commit `0d32715b5` unpushed in worktree `ticket-2084-windows-title-bar` answers thread `PRRT_kwDOR5Siws61aH2O`. Log path in `2084-rb1-log.path`. Read the report and diff, merge `main`, write the body, resolve, push once, review after green CI. |
| `ui#2395` (`#2085`) | Suites green at `eb25be55f` (unpushed). Merging `main` conflicts in `.claude/hooks/relay-at-threshold.mjs` (see the spec bullet). Compose one review-batch order that merges `main`, keeps both behaviours and reruns both suites; then body, resolve four threads, push, review. |
| `landing#128` (`#2082`) | Unpushed batch commit `8b5dbae` answers the header thread. Launch `order-2082-rb2b.md` (Mac label `Download for Mac (M chip)` and `Baixar para Mac (chip M)`, amend into `8b5dbae`) with a `--relaunch-reason`; then body, resolve both threads, push, review; copy verdict before merge. |
| `ui#2389` (`#2077`) | Local repro red with `repro-2077.sh` (port 3000): `[data-shell-fab-pending]` count 0 at 412 and 840. Compose the CI-fix order with that command as its proof. |
| `ui#2388` | This relay's docs branch; CI runs on each relay push. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2397`, `#2396`, `#2395`, `#2394`, `#2393`, `#2389`, `#2388`; api none; landing `#128`. Unpushed: `0d32715b5` (`feature/ticket-2084-windows-title-bar`), `25ce52f57` and `eb25be55f` (`feature/ticket-2085-relay-quiet-point`), `8b5dbae` (landing `feature/ticket-2082-downloads-on-top`). Stashes: 0. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate: the CI waiter first, then the `#2085`, `landing#128` and `#2077` launches and the `#2084` delivery. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web; a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle when idle (Sentry is due one hour after the last listing in `intake.wake`).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `ui#2392` merged (`85ba63d1d`, `#2081` closed); the `#2085` suites passed; the `ui#2393`, `ui#2394` and `ui#2396` CI went green and each took `main`; the `ui#2397` thread classified FIX and its batch committed; the landing header thread committed; the `#2077` repro made red.
- Carried: the `#2085` merge-conflict batch, push and review; the landing Mac label batch; the `#2084` delivery; the `#2077` CI fix; the three reviews; every merge; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "wait on `ui#2392` and `ui#2397` approval" (`ui#2392` merged; `ui#2397` got a COMMENTED review).

Every identifier here came from a previous session: treat each as a lead to verify.
