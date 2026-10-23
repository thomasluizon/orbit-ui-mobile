/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (it clones about 18,000 entries with `cp -c`, so run it as a background task), update the session line in `open-log.sh` (the header names the session and the one it relays), and read `prev-sleep-decisions-6f988b14.md` (D1 to D17 of this chain's ninth session), then `prev-sleep-decisions-755adb5c.md`. Run `carry-out.sh` after every few decisions and before any relay. Redirects in Bash use literal paths (write a script or a log entry with the Write tool, then run it). Ticket comments go through `node tools/comment-ticket.mjs`, never raw `gh issue comment`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]`; `new-worktrees.sh <repo dir> <issue>:<branch>...` (creates from `main`, never touches an existing folder); `gated-launch.sh` for review rounds composed with `compose-prompt.mjs --review-batch`; `failed-tests.sh <pr>`; `ticket-pr-map.sh <ticket>...`. Thread ids for `resolve-bot-thread.mjs` come from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0`. Landing `main` requires up-to-date branches: after each landing merge, `gh pr update-branch` the next landing PR, which restarts its CI and review.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 83, placed 83, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm `tools/wait-ci.mjs` for every open pull request below. UI `main` is `ea102cc9`; API `main` is `3b199d35`; landing `main` is `4790c44d`. Every Pullfrog review counts only at the exact head and after its push.

| Item | Disposition |
| --- | --- |
| ui#1966 `#1630` test fix | `dd6537dd`, APPROVED at that head. Its failed jobs were rerun (Web unit chromium 8/8: composer-geometry and onboarding-flow 320 header; Layout shard 1: action-rows 412 pt-BR click timeout; none imports its one test file). Green rerun: merge with `--match-head-commit`. A repeat red: fix those flakes on `main` in their own PR first. It unblocks every open UI pull request. |
| Ten approved UI PRs | ui#1963 `7820eff7`, ui#1961 `4832f1fc`, ui#1959 `4cd2ebe1`, ui#1958 `8cbcc393`, ui#1955 `b240fd3d`, ui#1952 `03c81672`, ui#1946 `6e5ca232`, ui#1944 `2edf0d1f`, ui#1903 `5539c3fd`, ui#1897 `8be3e663`: each APPROVED at its exact head with 0 threads; their only reds are `main`'s `profile-response.test.ts`. After ui#1966 merges, close and reopen each at the same head, wait for green, merge with `--match-head-commit`, using the local merge-result check where the base moved onto a shared file. After ui#1958 merges, the `#1619` gamification consumer follow-up PR starts. |
| ui#1965 `#1633` | `2555f37c`, root proof done; its reds are only `main`'s jsdom test. Reopen after ui#1966, then review and merge. After merge: one production web release, then rerun the post-deploy smoke; `#1633` closes only on 6 of 6. |
| ui#1967 `#62` | `c313fc7e` (parity round pushed, body updated); waits on CI and a fresh exact-head review; copy already approved. Production web and Android Open delivery follow. |
| ui#1968 `#249` | `10512faf`, BRAND.md only; waits on CI and review. |
| ui#1964 docs | This handoff's PR; merge after CI and review. |
| landing#117 `#280`/`#282` | Updated with landing `main` to `038938fb`; needs fresh CI and review, then merge and a landing production release. |
| landing#118 `#272` | `c2dbc19`; Build will fail until `PUBLIC_TURNSTILE_SITE_KEY` exists. Create the Turnstile widget through the Cloudflare API (Keychain `orbit-cloudflare-api-token`), set the GitHub repository variable and the Render landing services' env, then rerun; copy check: no visitor strings changed. Merge after landing#117, with an update-branch first. |
| `#418` | `576d707f` on `thomasluizon/ticket-418-recovery-proof`, no PR. Detached root Stryker rerun in packet `418-root-mutation-576d` (durable scratchpad; result in `root-result.exit` and the attempt's `*-418-dispositions.json`). Read the targeted dispositions per owner, confirm the 21 guard-gap mutants are killed, compose the body (Tracks) from `report-418-survivors-576d707f.md` and publish once. If the run did not finish, relaunch it with `launch-root-mutation.py` in that packet. |
| Android | After ui#1959 `#1628` and ui#1963 `#1635` merge, run an Open release through the android-release skill; verify Play availability and close what it completes. |
| `#1630`, `#1622`, `#1624`, `#1534` | `#1630` closes after the Android Open release carries the shared validator and Sentry `ORBIT-WEB-V` shows no new events. `#1622` waits on Google's favicon cache (still the old planet). `#1624`: pt-BR feature graphic and profile uploads remain (assets merged in `thomas-brain` `031d23df`). `#1534`: cancel once `#1626` detaches the routing Worker route. |
| `#1627`, `#1625`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626` | Unchanged: `#1627` waits for the Astra staging sweep; `#1625` waits on the owner's phone check; `#1612` waits on the staging admin Orbit MCP; `#1623` needs real captures; `#1613` carries after `#1607` merges; `#1620` is blocked; `#1626` follows `#1635`. |
| Dependabot UI1915/1916/1930/1932 | Sequential, unchanged. |
| Workers, waiters, chain | No worker running. The `#418` Stryker run is detached and outlives the relay. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows: ui#1966 first, then reopen and merge the approved PRs, ui#1965, one production web release, the smoke rerun, the Android Open release, the landing PRs and a landing production release.
3. Follow `## The order`: Batch 0c and Batch 2b remain only on named conditions; Batch 3 is in flight (`#272`, `#280`); then Batch 4 onward, one bullet per open ticket.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above.
- ui#1966 first: carried (approved, failed jobs rerun).
- Ten approved PRs, ui#1965, ui#1964, Dependabot, Android, `#1630`, `#1622`, `#1627`, `#1625`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626`: carried.
- `#1624` merge into `thomas-brain` `main`: done (`031d23df`, thomas-brain#3); pt-BR graphic and uploads carried.
- `#418` deep Codex round on the critical survivors: done (`576d707f`); root mutation acceptance and publication carried.
- "Follow the order from Batch 0c onward": carried; Batch 0b reconciled (four tickets canceled), Batch 3 started (landing#116 merged, landing#117 and landing#118 open, ui#1968 open), `#62` published as ui#1967.

Every identifier here came from a previous session: treat each as a lead to verify.
