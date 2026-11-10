/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB; `prune-durable.sh` in the scratchpad deletes only redundant run-carry mirrors). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 41382670-eedb-40c7-b840-37ef1e06c785` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D8). Helpers: `run-spec.sh`, `prove-2086-rb3.sh`, `verify-2086-rb4.sh`, `edit-2086-rb4.mjs`, `edit-2088-rb2.mjs`, `probe-reftable.sh`, `check-2083-signin.mjs`, `mark-merged.mjs` (ledger merge sha), `wait-main-push.sh` (main push CI for a release), `log-decision.sh`. Write scratchpad files to literal absolute paths, or put the command in a script file. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 20 open, 20 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `b9ed49284`; API `main` `3da71dcf6`; landing `main` `5d9971870`. Production web `0e43371b0`, API `3da71dcf6`, landing `5d9971870` (`#2082` closed); staging web `b36990c60`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. No open pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2396` (`#2086`) `457b89826` | Review 4 (3 threads) answered by `b6aa0646f`, NOT pushed: the web spacer is pointer-inert through an inline style (new Chromium test red: `pointerEvents` `auto` and the tap caught by the spacer; green), each row builds its menu once on web and Android, and `getHabitRowSelectionSpacerWidth` in `@orbit/shared/utils` is the one width (shared test 3 passed). Detached check `verify-2086-rb4.sh` (pid 29234) writes `2086-rb4-done.json` and `2086-rb4-summary.txt` in the predecessor scratchpad; its start time is in `2086-rb4-started.txt`. Start `tools/wait-file.mjs` on that file with that start. Green: add the batch to the body, resolve threads `PRRT_kwDOR5Siws61iIM-`, `PRRT_kwDOR5Siws61iINF` and `PRRT_kwDOR5Siws61iINL` from a fresh read, push once, CI, review. This was a fourth fix round (decision D8); a further blocking review is an exhausted-fixer blocker. |
| `ui#2398` (`#2062`) `02752b69c` | Review 3 COMMENTED, thread `PRRT_kwDOR5Siws61iOCM` (`hydration-guard.ts:71`): vendored React guards `checkDCE`, `setStrictMode`, `onCommitFiberUnmount` and `onPostCommitFiberRoot` with a `typeof` check and reads a missing `isDisabled` as false (`react-dom-client.production.js` lines 680, 10209, 13267 and 18584). Drop the four stubs and `isDisabled`, correct the doc comment and `__tests__/layout/hydration-probe.test.ts` lines 51 to 63, run the probe and streamed-route tests, resolve, push once, CI, review, merge, then close `#2062` after Android Open. |
| `ui#2400` (`#2088`) `3a479e8c5` | Reftable fix pushed, thread resolved. CI waiter, review request, approval waiter, merge, close `#2088`. |
| `ui#2394` (`#2087`) `53bc00469` | Review 2 fix pushed, body rewritten, thread resolved. CI waiter, review request, approval waiter, merge. Local `check-native-module-copies` fails on `main` too (`apps/mobile/node_modules/@formatjs/fast-memoize` missing after the Expo patch set): run `npm ci` in the main checkout before the next full tools gate. |
| `#2083` | Staging sign-in checked (ticket comment). Production web and Android Open, then close. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2400`, `#2398`, `#2396`, `#2394`, `#2388`; api none; landing none. Unpushed commits: `b6aa0646f` on `fix/ticket-2086-select-mode-log-control`. Stashes: 0. Uncommitted work: none. Running workers: none. Detached checks: `verify-2086-rb4.sh` (pid 29234). Intake: the last Sentry listing found 1 known issue; mailbox and Play reviews empty.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077`, `#2061`, `#2083` and `#2086` once they merge, then production web (staging first; it also ships desktop for `#1861`, `#2084` and `#2087`).
4. Batch 6 (`#2078`, `#2079`, `#2080`) once `ui#2398` merges, then the rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `#2071` question re-added; disk cleared to 66.7 GiB; web staging rerun verified (`b36990c60`); landing released to staging and production and `#2082` closed; `#2083` staging sign-in checked; `ui#2400` fixes pushed (cherry-pick, then reftable); `ui#2396` batch 3 proven (red 12, green 57) and pushed; `ui#2398` export fix pushed; `ui#2394` macOS flake rerun and review 2 fix pushed; intake cycle (nothing new).
- Carried: `ui#2396`, `ui#2398`, `ui#2400`, `ui#2394` to merge; Android Open and production web with desktop; `#2083` close; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "the landing `/release` for `#2082`" (done); "web staging rerun" (done).

Every identifier here came from a previous session: treat each as a lead to verify.
