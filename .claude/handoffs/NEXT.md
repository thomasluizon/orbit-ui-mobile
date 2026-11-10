/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB; `prune-durable.sh` in the scratchpad deletes only redundant run-carry mirrors). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D6). Helpers: `log-decision.sh`, `mark-merged.mjs` (ledger merge sha), `wait-main-push.sh` (main push CI for a release), `gl2.sh` (load and spacing gate, then `launch-worker.mjs`; use it, not `gl.sh`, which exports `CLAUDE_CONFIG_DIR`), `staging-login-probe.mjs` (headless `/login` render check, run from `apps/web`). Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`, never with `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 60` or more to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, and it needs a reply body on stdin. Read the review body as well as the threads before every delivery. Run `verify-delivery.mjs` for a pull request that changes `tools/` from its own worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 10 open, 10 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `5a9c08e0d`; API `main` `b981e4f9f`; landing `main` `5d9971870`. Production and staging web `5a9c08e0d` (desktop 0.1.28 on both channels); production API `3da71dcf6`; Android Open 1.3.150 (210); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| `api#1105` `57f4c5092` | Approved (`pullfrog-approval` SUCCESS, 0 threads), auto-merge on. Confirm it merged, record the merge sha, then an API release (staging, then production; runtime packages changed). If it stays `OPEN`, read `mergeStateStatus` and fix the cause. |
| `ui#2405` (`#1560` ci-limits) `dd7ab7d26` | Review round 1 fixed (both threads resolved, body updated). CI running: arm `wait-ci.mjs`; on green verify delivery from its worktree, then `list-bot-threads.mjs --wait-seconds 900` for the fresh review, clear findings, merge. |
| `ui#2406` (`#1560` acceptance waits) `9c2751f27` | CI green, delivery verified, review requested (read it with `list-bot-threads.mjs --no-request`). Acceptance proof: pull request run 42814128716 passed both installed jobs; dispatched run 42821396905 on the branch is the second (`gh run view`). Dispatch one more after it ends (one at a time: runs on one ref cancel each other). Then clear findings and merge. |
| `#2090` | New owner order: Apple and Windows logos on the landing download buttons. Launch a landing worker through `gl2.sh` (`compose-prompt.mjs`), then landing releases. |
| `#2071` | Owner sign-in pending. A `token-swap.py` run started before this relay has a 30 minute deadline; if it has ended, run it again from the scratchpad after the owner signs in (spec `## Open questions`). |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after `resolveAfter` in `intake.sentry` with no new event, then close. |
| `#2030` | Close on the owner-device `android_update_sheet_shown` event from 1.3.150 or later (latest seen: 1.3.146 build 206). |
| `ui#2388` | This relay's docs branch. |

Inventory: open pull requests ui `#2406`, `#2405`, `#2388`; api `#1105`; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Worktrees: `ticket-1560-ci-limits`, `ticket-1560-acceptance-waits` (clean, pushed), `orca/workspaces/orbit-api/dependabot-1105` (detached at `57f4c5092`, pushed). Detached worktrees with no unique work: `combined-2065`, `drift-evidence-path`, `ticket-1560-mac-signing`, `ticket-2077-expo-patch-set`, `verify-2036-main`. Intake this session: Sentry two issues, no new event (last listing 12:14 UTC); mailbox empty.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `#2071` question re-added; `#2087` released (staging run 42805174762 after one rerun of a blank-`/login` smoke, production run 42813806261, desktop 0.1.28) and closed; `ui#2405` CI green, reviewed, review round fixed; `ui#2406` benchmark keep-alive race fixed and CI green; `api#1105` test race fixed, CI green, approved; intake cycles.
- Carried: `ui#2405`, `ui#2406` merge; `api#1105` merge and API release; `#2089`; `#2030`; `#1560`, `#1561`, `#1563`, `#315`, `#33`, intake, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "run `wait-main-push.sh` then a web release for `#2087`" (done); "rerun `Desktop Installed Acceptance` several times" (now dispatched runs, one at a time).

Every identifier here came from a previous session: treat each as a lead to verify.
