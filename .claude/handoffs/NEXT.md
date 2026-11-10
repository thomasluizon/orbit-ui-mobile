/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB; `prune-durable.sh` in the scratchpad deletes only redundant run-carry mirrors). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi` (replace the predecessor's 8-character id), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D9). Helpers: `run-spec.sh`, `compare-ico-pixels.mjs` (decoded ICO layer diff), `run-tools-hooks.sh <worktree> <label>`, `mark-merged.mjs` (ledger merge sha), `wait-main-push.sh` (main push CI for a release), `log-decision.sh`, `launch-ticket-ui.sh` and `launch-ticket-api.sh`. Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 90` to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session. Read the review body as well as the threads before every delivery.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 17 open, 17 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `f643f107d`; API `main` `0def909d5`; landing `main` `5d9971870`. Production web `b9ed49284` with desktop 0.1.27, API `3da71dcf6`, landing `5d9971870`; staging web `b9ed49284` with staging desktop 0.1.28; Android Open 1.3.149 (209); TestFlight `a727bce32`. Every open UI pull request carries `main` `f643f107d` and has CI running; none is approved at its current head.

| Item | Disposition |
| --- | --- |
| `ui#2401` (`#2078`) `bd20b8bf6` | CI running. Then delivery, review request, merge; check CodeQL alert 52 reads `fixed` after the next `main` scan; close `#2078`. |
| `ui#2402` (`#2079`) `f3dc1be72` | CI running (the earlier red run was two runner timeouts, folded into `#1560`). Then delivery, review, merge; dismiss alert 54 as `false positive` (comment of 280 characters or fewer naming the new test); close `#2079`. |
| `ui#2394` (`#2087`) `ee158bc8e` | Review 4 fixed (`48e6cc791`), thread resolved, CI running. Then delivery with the branch's own `verify-delivery.mjs`, review, merge, desktop release (staging first). |
| `ui#2403` (`#2089`) `8ceba962e` | Worker PR for Sentry `ORBIT-WEB-1E`, read and correct. CI running. Then delivery, review, merge, production web; resolve `ORBIT-WEB-1E` only after that release shows no new event. |
| `#2086`, `#2083`, `#2077`, `#2061`, `#2062` | All merged. Android Open 1.3.150 (210) from the newest `main` whose `test.yml` and `guards.yml` push runs passed (`f643f107d` runs were in progress), then the Android proof and close each; `#2086` also needs production web. |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2403`, `#2402`, `#2401`, `#2394`, `#2388`; api none; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Detached checks: none. Intake: Sentry `ORBIT-MOBILE-Q` (no new event) and `ORBIT-WEB-1E` (ticketed as `#2089`), last listed this session; mailbox and Play reviews empty.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. Android Open as in the table; one production web release (staging first) for `#2086`, `#2087` and `#2089` once they merge.
4. `#1560` once Batch 6 merges (the folded CI timeout included), then the rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `#2071` question re-added; `ui#2400` merged (`38a967112`) and `#2088` closed; `#1861` and `#2084` closed with release evidence; `ui#2396` review 5 fixed and merged (`f643f107d`); `ui#2394` review 4 fixed; Batch 6 admitted: `api#1103` merged (`0def909d5`), alert 28 dismissed, `#2080` closed, `ui#2401` and `ui#2402` open; Sentry `ORBIT-WEB-1E` root-caused and ticketed as `#2089` (`ui#2403`); intake cycles (mail and Play empty).
- Carried: `ui#2401`, `ui#2402`, `ui#2394` to merge; Android Open; production web for `#2086` and `#2087`; closes for `#2083`, `#2077`, `#2061`, `#2062`, `#2086`; `#2030`, `#1560`, `#1561`, `#1563`, `#315`, `#33`, intake, the AVD deletion, `#2071`, `#2074` on or after 16 November 2026; run `npm ci` in the main checkout at a quiet point (no waiter importing packages), because local `check-native-module-copies` fails there and in the worktrees.
- Superseded: "Batch 6 now that `ui#2398` has merged" (admitted; one PR merged, two in CI); "close `#1861` and `#2084`" (closed).

Every identifier here came from a previous session: treat each as a lead to verify.
