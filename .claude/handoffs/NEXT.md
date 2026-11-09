/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 97850de8-58ec-415f-8fca-036f341ec263` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D16). Helpers: `gl.sh`, `launch-new-ticket.sh`, `new-ticket-wt.sh`, `co-rb.sh`, `last-report.mjs`, `run-spec.sh`, `repro-2062-guard.sh` (restore a `layout-build` artifact, then a spec red and green), `log-decision.sh`, `reconcile.sh`, `inventory.sh`, `note-2086-rb2.md`, `note-verify-cap.md`. Write scratchpad files to literal absolute paths. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 21 open, 21 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `56f562c11`; API `main` `3da71dcf6`; landing `main` `5d9971870`. Production web `0e43371b0`, API `3da71dcf6`, landing `7fb212c42`; desktop 0.1.26; Android Open 1.3.149 (209); TestFlight `a727bce32`. Merged since the last handoff: `ui#2395` (`e42dcdaf7`), `ui#2393` (`cd10e29ef`), `ui#2389` (`56f562c11`), `landing#128` (`5d9971870`), all in the run ledger. No open pull request is approved.

| Item | Disposition |
| --- | --- |
| `ui#2396` (`#2086`) `740b2d410` | Review batch 2 committed by a worker as `8ca981a03`, NOT pushed (inert `aria-hidden` slot in selection on both platforms, specs back to the normal supporting titles, two doc sentences; log `#2086-80136-1794267890871-worker-account.log` under `orbit-workers`). Read the diff (D95) and report, run `today-rows-layout.spec.ts` and `subhabit-indent.spec.ts` red at `740b2d410` and green at `8ca981a03` with `run-spec.sh` (restore the run's `layout-build` artifact), run the changed Chromium geometry test, update the body, resolve thread `habit-row.tsx:261` from a fresh `list-bot-threads.mjs` read, push once, then CI, review, merge. |
| `ui#2399` (`#2077` Expo patch set) `eab862d03` | Diff and body read. CI waiter, review request, approval waiter, merge. Then merge `main` into `ui#2394`. |
| `ui#2398` (`#2062`) `376d30b16` | CI green, review requested. Approval waiter, merge, close `#2062`. |
| `ui#2397` (`#2084`) `9d613f7e4` | Review batch 2 pushed, thread resolved. CI waiter, review request, approval waiter, merge. |
| `#2082` | `landing#128` merged as `5d9971870`. Run the landing `/release`, verify useorbit.org, then close. |
| `ui#2394` (`#2087`) `9cee6293d` | Fix `3689964f8` committed in `ticket-2087-windows-icon-tile`, NOT pushed. After `ui#2399` merges: merge `main`, push once, CI (rerun a flaky macOS job), review, merge. |
| `#2083`, `#2085` | Merged. `#2083`: check the rendered sign-in on staging at 412 and 1280 px, then ship. `#2085`: confirmed by this relay; close with `tools/complete-ticket.mjs`. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2399`, `#2398`, `#2397`, `#2396`, `#2394`, `#2388`; api none; landing none. Unpushed commits: `3689964f8` on `feature/ticket-2087-windows-icon-tile` (held on purpose) and `8ca981a03` on `fix/ticket-2086-select-mode-log-control` (awaiting proof). Stashes: 0 in all three. Uncommitted work: none outside this handoff. Running workers: none. Detached checks: none. No CI waiter is live after the relay.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. Rerun 504-only and abandoned-job failures. Record each merge sha in the run ledger at merge time.
3. Android Open for `#2062`, `#2077` (with `ui#2399`), `#2061`, `#2083` and `#2086` once they merge, then production web (a staging release first for the `#2083` sign-in check); a desktop release for `#1861`, `#2084` and `#2087`; the landing `/release` for `#2082`.
4. Then the rest of `## The order`, and the auto-work intake cycle (Sentry, mailbox, reviews: due now).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; the `#2071` question re-added; `ui#2398` proven and pushed; the `#2077` Expo worker (`ui#2399`); `ui#2395`, `ui#2393` and `ui#2389` merged; the `#2087` manifest fix written; the `landing#128` and `ui#2397` review batches pushed; intake cycle 1 (nothing new).
- Carried: the waiters, review requests and merges for every open pull request; the Android Open and production web; the desktop and landing releases; `#2030`, `#1561`, `#1563`, `#315`, `#33`, Batch 6 (admit when Batch 0c settles), intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "launch `note-2087-ci3.md`" (done, `3689964f8`); "read the `ui#2399` diff" (read).

Every identifier here came from a previous session: treat each as a lead to verify.
