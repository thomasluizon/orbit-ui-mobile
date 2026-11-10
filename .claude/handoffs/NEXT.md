/auto-work

Read `.claude/specs/orbit-prod-release.md` first: `## Standing rules`, `## The order`, `## Decision pointers`, `## Current state` and `## Open questions`. Open brain ADR D149 through the Obsidian MCP, and the others it lists only when a step needs them. Read `DESIGN.md`, `BRAND.md` and `design/canvas/README.md` before any UI diff.

Entry: `/auto-work` enters `/sleep`, adopts this relay (`adoptRelayRun`), keeps `autoWork: true`, then `/crank`, then `/orchestrate` over the admitted queue without replanning. Check that this prompt is the newest open relay (`gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`), run `node tools/relay-checkout.mjs --check`, and check free disk (floor 50 GiB; `prune-durable.sh` in the scratchpad deletes only redundant run-carry mirrors). Adoption clears `openOwnerQuestions`: re-add the `#2071` question from the spec with `updateRunState`.

Scratchpad: run `$HOME/.orbit-run-carry/carry-from-predecessor.sh <new full id> <predecessor full id> 0589c2a5-9987-419c-9a59-212b0a9d6846` as a background task (literal absolute paths) and wait for it to exit before writing any file there (the predecessor id is `relay.from` after adoption), then point `mirror.sh` at `durable-<new 8>` and `intake-noboard.sh` at `<new 8>-c<n>` with `perl -pi`, and run `mirror.sh` with `bash`. The predecessor log is `prev-sleep-decisions-<predecessor 8>.md` (D1 to D5). Helpers: `log-decision.sh`, `mark-merged.mjs` (ledger merge sha), `wait-main-push.sh` (main push CI for a release), `gl2.sh` (load and spacing gate, then `launch-worker.mjs`; use it, not `gl.sh`, which exports `CLAUDE_CONFIG_DIR`). Write scratchpad scripts with the Write tool and literal absolute paths. Start every waiter as a Bash background task with `run_in_background`, never with `&`. Kill a process only by its recorded pid. `list-bot-threads.mjs` needs `--wait-seconds 60` or more to post the review request; a `resolve-bot-thread.mjs` id must come from a `list-bot-threads.mjs` read in the same session, and it needs a reply body on stdin. Read the review body as well as the threads before every delivery. Run `verify-delivery.mjs` for a pull request that changes `tools/` from its own worktree.

## Goal

Finish the spec: an empty board except `#33` and the `#2074` measurement, verified releases, every `#315` launch list ticket closed, then `#315` closed with its verdict. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: 10 open, 10 placed, 0 unplaced, 0 placed twice.

## In flight

UI `main` `5a9c08e0d`; API `main` `b981e4f9f`; landing `main` `5d9971870`. Production web `733cd2d4b` (desktop 0.1.27); staging web `733cd2d4b` (staging desktop 0.1.28); Android Open 1.3.150 (210); TestFlight `a727bce32`.

| Item | Disposition |
| --- | --- |
| `#2087` | `ui#2394` merged as `5a9c08e0d`. Run `wait-main-push.sh 5a9c08e0db057d1c501b408eac5c4c8b2c2250b2` (or the newest `main`), then a web release from that passing `main` (staging first); close `#2087` after production. |
| `ui#2405` (`#1560` ci-limits) `f289c16be` | CI running (main merged). Three CI fixes landed (parallel per-case PowerShell processes, workflow tests for per-workspace limits, desktop lint scope). On green: verify delivery from its worktree, request review, clear findings (no worker launch left: write small fixes yourself under step 8), merge. |
| `ui#2406` (`#1560` acceptance waits) `4e95defe8` | CI running (main merged). Fix: `lsregister -f` on the installed macOS app, `posix.join` plist path. On green: verify delivery, request review, clear findings, rerun `Desktop Installed Acceptance` several times as proof, merge. |
| `api#1105` `b03e5f560` | CI running (OpenAI 2.15 fix `900a3c8b1`, API `main` merged). On green: `list-bot-threads.mjs --repo api --pr 1105 --re-review --wait-seconds 900`; its auto-merge merges on approval; then an API release (runtime packages changed). |
| `#2089` | Resolve `ORBIT-WEB-1E` at the first hourly listing after the `resolveAfter` mark in `intake.sentry` with no new event, then close. |
| `#2030` | Close on the owner-device `android_update_sheet_shown` event from 1.3.150 (latest seen: 1.3.146 build 206). |
| `ui#2388` | This relay's docs branch. |
| `#2071` | Waits on the owner's fresh claude.ai sign-in (open question). |

Inventory: open pull requests ui `#2406`, `#2405`, `#2388`; api `#1105`; landing none. Unpushed commits: none. Stashes: 0. Uncommitted work: none outside this relay. Running workers: none. Worktrees: `ticket-1560-ci-limits`, `ticket-1560-acceptance-waits` (clean, pushed), `orca/workspaces/orbit-api/dependabot-1105` (detached at `b03e5f560`, pushed). Detached worktrees with no unique work: `combined-2065`, `drift-evidence-path`, `ticket-1560-mac-signing`, `ticket-2077-expo-patch-set`, `verify-2036-main`. Intake this session: Sentry two issues, no new event; mailbox and Play reviews empty.

## Then, in this order

1. Answer any owner message first, in his language.
2. The in-flight rows above, within the load gate. After each merge, merge `main` into every other open branch whose CI still runs. Rerun 504-only, abandoned-job and proven-flake failures once. Record each merge sha in the run ledger at merge time.
3. The rest of `## The order` and the auto-work intake cycle (Sentry hourly, mailbox, reviews).

## Crank

Invoke `/crank` immediately after `/sleep` entry; `crank: true` is inherited. Keep the pool full within the load gate, merge at the merge bar, quality gates unchanged. Hand off with `/handoff --relay --sleep --crank`.

## Sleep

Unattended: never ask the owner; decide with the best option and log it. Keep a live wake source (`tools/launch-worker.mjs`, `tools/wait-ci.mjs`, `tools/wait-release.mjs`, `tools/wait-file.mjs` or `tools/wait-auto-work.mjs`, as Bash background tasks with timeout 7200000). Workers may not start an emulator or a browser driver. Merge only with `gh pr merge --squash --match-head-commit <full sha>` after green checks, a fresh Pullfrog approval at that head and zero unresolved threads. Never add an attribution line. At the context threshold, drain and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Done: relay adopted; `#2071` question re-added; `ui#2394` merged (`5a9c08e0d`); `api#1104` merged by auto-merge (`b981e4f9f`) after a requested review published `pullfrog-approval`; `api#1105` build fixed (OpenAI 2.15) and pushed; `ui#2405` and `ui#2406` CI failures fixed and pushed with `main` merged; intake cycle.
- Carried: the `#2087` web release; `ui#2405`, `ui#2406` review and merge; `api#1105` review, merge and API release; `#2089` resolve and close; `#2030`; `#1560`, `#1561`, `#1563`, `#315`, `#33`, intake, `#2071`, `#2074` on or after 16 November 2026.
- Superseded: "merge `main` into `ui#2405` and `ui#2406` after `ui#2394`" (done with the CI fixes); "check `api#1105` for Stripe.net 53" (it carries no Stripe.net update).

Every identifier here came from a previous session: treat each as a lead to verify.
