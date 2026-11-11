/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 (`Run Orbit on one Claude Ultra account after a harness token diet, with Max 100 as the fallback.md`) through the Obsidian MCP (fall back to a file read when the MCP fails). Read `DESIGN.md` (`## Motion`, `## Bans`, `## Habit list`), `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk on `/System/Volumes/Data` (floor 50 GiB). There is no open owner question.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption). Then repoint every helper that still holds the predecessor id, full or first 8 characters, with `perl -pi` (`grep -l <predecessor 8> *.sh *.mjs` lists them), and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md`: read its last ten entries. Write scratchpad files with the Write tool, with literal absolute paths (the guardrail refuses a redirect to a path that holds a shell variable). Start every waiter as a Bash background task with `run_in_background`. A `resolve-bot-thread.mjs` id must come from a `verdict.sh` read in the same session. Read the review body and the threads before every delivery. Filter every large tool output before it prints, never read the spec in full twice, and send long work (a diagnosis, a review fix, a rendered check) to a background subagent: the previous session reached the relay threshold in about one hour. Take every decision log time from `date -u`.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive the rest with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 22 open, 22 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `4fbdf12ba`; API `main` `1a70835b4`; landing `main` `aa0eaed9c`. Production and staging API `1a70835b4`; staging and production web `3db3e8c40`; landing `599bdfb69`; Android Open 1.3.152 (213); TestFlight production 1.3.152 (2). Each row's detail is its `## The order` bullet.

| Item | Disposition |
| --- | --- |
| `ui#2436` (`#2114`, the owner report on a logged parent habit, first priority) | Worker delivery at `f4e30cca2` with `main` merged; CI started. Read the diff (D95), approve the copy "due tomorrow" and "volta amanhã" with `/second-opinion` and post the verdict, chain, merge at the bar, release web staging and production and Android Open, run a signed-in check with `staging-web-session.cjs`, then tell the owner in his language and close. |
| `ui#2423` (`#2106`) | Head `c1e262c4a`, 5 unresolved threads. Worktree `ticket-2106-one-version-release` is dirty: 11 files of an uncommitted review fix from a subagent that this relay ended (its tools gate did not finish). Read the diff against the note `rb-2423-r1.md`, run the focused tests and `node tools/test-tools.mjs`, commit, deliver with `deliver-fix.sh`, chain. |
| `ui#2431` (`#2097`) | First in the merge order, holds `main` at `91192cb9e`. Read `verdict.sh ui 2431`; merge at the bar when approved, clean and `behind_by=0`. App Review is still `WAITING_FOR_REVIEW`: read `asc-api.mjs GET /v1/reviewSubmissions/a7a890f6-71dc-4595-a297-d4ed05608bb3`. |
| Merge order | One at a time: `main` merge, chain, merge at the bar, `record-merge.mjs`: `ui#2431`, `ui#2422`, `ui#2418`, `ui#2426`, `ui#2424` (approved at `9aa5694c1`), `ui#2434`, then the rest as approved. |
| `ui#2435` (`#1561`) | The TestFlight tool fix at `2b3e52821` (diff read). Read its verdict, merge at the bar, then rerun the failed `testflight-access` job of run `43111017034` and read its summary. |
| ui `#2425`, `#2433`, `#2419`, `#2430`, `#2420`, `#2421` | Each waits for a chain result at its head (`d6001b393`, `fb938a253`, `635076378`, `6e88d0eec`, `e2a624d18`, `9a7eba6f2`). Read `verdict.sh` for each, then fix or queue. `ui#2433` also needs its Layout install step log read. |
| `landing#133` (`#2095`, with `#2090`) | Head `0e6e886`, CI green, review did not approve. Read `verdict.sh landing 133`, fix, merge at the bar, then landing staging and production and the rendered checks. |
| Intake | Mailbox and store reviews empty at the last cycle. Sentry and the Fable usage page are unreadable: this account has no Sentry connector and no Chrome browser is connected. |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2436`, `#2435`, `#2434`, `#2433`, `#2431`, `#2430`, `#2426`, `#2425`, `#2424`, `#2423`, `#2422`, `#2421`, `#2420`, `#2419`, `#2418`, `#2388`; landing `#133`. Dirty worktree: `ticket-2106-one-version-release` (above). Unpushed commits, stashes, running workers and detached checks: none. Worker launches: `#2114` 1 of 2, `#1561` tool fix branch 1 of 2, `#2111` 1 of 2, `#2112` 1 of 2. Waiters to arm: one `chain-review.sh` per pull request in CI or review, and `wait-auto-work.mjs` when nothing is launchable.

## Then, in this order

1. Answer any owner message first, in his language, before any other work and before a relay step.
2. `ui#2436` (the owner report) to merge and release, then `ui#2423`, then the merge order and the other in-flight rows, within the load gate.
3. The rest of `## The order` and the auto-work intake cycle.

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: the relay entry; the owner report filed as `#2114`, reproduced red, cause read, worker delivery `ui#2436`; the web production release at `3db3e8c40` and `#2111` closed after a signed-in staging check; the landing staging failure cause read (the Render build measures 24,007 startup bytes) and the Lighthouse fix pushed on `landing#133`; the production iOS Release 1.3.152 (2) uploaded; `ui#2427` merged; review fixes delivered on `ui#2424`, `ui#2433` and `ui#2425`; the outage reruns; one intake cycle.
- Superseded: `ui#2427` first in the merge order (merged; `ui#2431` is first); `main` into `ui#2423` after the iOS release (done; its review found 5 threads); the `landing#133` push after six rendered checks (pushed; the review did not approve).
- Carried: every other in-flight row; the merge order; `#1563`, `#315`, `#33`, `#2074` on or after 16 November 2026.

Every identifier here came from a previous session: treat each as a lead to verify.
