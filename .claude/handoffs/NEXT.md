/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 1bb297eb-e4a3-4098-a27c-ba48224346ad` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D10). Helpers: `gl.sh`, `launch-new-ticket.sh`, `new-ticket-wt.sh`, `co-rb.sh`, `last-report.mjs`, `run-spec.sh`, `prove-2086.sh` (CI build red, local hermetic build green), `prove-2062-rb1c.sh`, `mark-merged.mjs` (ledger merge sha), `wait-main-push.sh` (main push CI for a release), `log-decision.sh`. Write scratchpad files to literal absolute paths, or put the command in a script file. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `b9ed49284`; API `main` `3da71dcf6`; landing `main` `5d9971870`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. Merged since the last handoff: `ui#2399` (`b36990c60`), `ui#2397` (`b9ed49284`), both in the run ledger. `#2085` closed. No open pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2396` (`#2086`) `be09aab78` | Worker commit `457b89826` (strip-width fix, last review fix attempt) NOT pushed; log `#2086-69337-1794273490122-worker-account.log`. Read the diff (D95) and report, build `be09aab78` and `457b89826` locally (pattern in `prove-2086.sh`), run `today-rows-layout.spec.ts` and `subhabit-indent.spec.ts` red then green and the Chromium geometry test, rewrite the body for the shipped design (review 3 body finding), resolve thread `habit-row.tsx:262` from a fresh read, push once, CI, review, merge. |
| `ui#2400` (`#2088`) `724b553b2` | Fix `f1024d476` committed, NOT pushed (see the spec's `#2088` entry). Update the body, resolve thread `relay-checkout.mjs:40`, push once, CI, review, merge, close `#2088`. |
| `ui#2398` (`#2062`) `5c3a5d098` | Proven, threads resolved, body rewritten, CI running. CI waiter, review request, approval waiter, merge, close `#2062` after Android Open. |
| `ui#2394` (`#2087`) `67ccada7f` | Review 1 fix pushed, thread resolved. CI waiter (rerun a macOS acceptance flake once), review request, approval waiter, merge. |
| Web staging run 42730041680 (`b36990c60`) | Failed at `Staple aarch64-apple-darwin` on an Apple network drop. Rerun its failed jobs (`gh run rerun 42730041680 --failed`), then `wait-release.mjs` with service `https://orbit-web-staging-eakn.onrender.com`. |
| `#2083` | After staging serves `b36990c60`: rendered sign-in at 412 and 1280 px, then production web and Android Open, then close. |
| `#2082` | Landing `/release` (staging, then production `5d9971870`), verify useorbit.org, close. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2400`, `#2398`, `#2396`, `#2394`, `#2388`; api none; landing none. Unpushed commits: `f1024d476` on `fix/ticket-2088-merge-commit-hook`, `457b89826` on `fix/ticket-2086-select-mode-log-control`. Stashes: 0 in all three. Uncommitted work: none outside this handoff (older clean worktrees without an upstream are unchanged). Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web (staging first); a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order` (Batch 6 once Batch 0c settles), and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `#2071` question re-added; `ui#2399` merged (`b36990c60`) and `ui#2394` got `main`; `ui#2397` merged (`b9ed49284`); `#2085` closed; the `#2086` batch 2 proven (red 16 failed, green 57) and pushed; `ui#2398` review batch proven and pushed; intake cycle (Sentry, mailbox, Play reviews: nothing new).
- Carried: `ui#2396`, `ui#2398`, `ui#2394` to merge; Android Open and production web; the desktop and landing releases; `#2083` staging check; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "`ui#2398` approval waiter, merge" (review 1 asked for a redesign, done in `5c3a5d098`); "`ui#2397` CI waiter" (merged).

Every identifier here came from a previous session: treat each as a lead to verify.
