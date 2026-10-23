/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

Check free disk first (`df -g /System/Volumes/Data`); the standing floor is 50 GiB. If the floor is breached, run the carried `scratch-wt-prune.sh dry`, then `run`. Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` (it copies about 18,000 entries, so run it as a background task), update the session line in `open-log.sh` (the header names the session and the one it relays), and read `prev-sleep-decisions-755adb5c.md` (D1 to D13 of this chain's eighth session), then `prev-sleep-decisions-8d972f8f.md`. Run `carry-out.sh` after every few decisions and before any relay. Redirects in Bash use literal paths (write a script or a log entry with the Write tool, then run it). Ticket comments go through `node tools/comment-ticket.mjs`, never raw `gh issue comment`. Use an MCP for any service that has one (Sentry, Render, PostHog, Orbit); never Chrome for those. Carried helpers: `launch-new-ticket.sh <repo> <issue> <worktree> <base> <tier> [note]` (worktrees come from `node tools/create-worktree.mjs ... --base-branch main`, then rename the branch); `rb-launch.sh` for review batches; `review-summary.mjs <repo:pr>...`; `failed-tests.sh <pr>`; `run-layout.sh <label> <head> <specs...>`. Thread ids for `resolve-bot-thread.mjs` come from `node tools/list-bot-threads.mjs --pr <n> --repo <key> --no-request --wait-seconds 0`.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 88, placed 88, unplaced 0, placed twice 0, placed closed 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

The relay tool stops this session's CI waiters, so re-arm `tools/wait-ci.mjs` for every open pull request below. UI `main` is `ea102cc9`; API `main` is `3b199d35`. Every Pullfrog review counts only at the exact head and after its push.

| Item | Disposition |
| --- | --- |
| ui#1966 `#1630` test fix | `dd6537dd`, one test file: each case gets its own refresh token. First task: green CI and a fresh exact-head review, then merge. It unblocks every open UI pull request. |
| Ten approved UI PRs | ui#1963 `7820eff7`, ui#1961 `4832f1fc`, ui#1959 `4cd2ebe1`, ui#1958 `8cbcc393`, ui#1955 `b240fd3d`, ui#1952 `03c81672`, ui#1946 `6e5ca232`, ui#1944 `2edf0d1f`, ui#1903 `5539c3fd`, ui#1897 `8be3e663`: each APPROVED at its exact head with 0 threads. Their reds are `main`'s `profile-response.test.ts` (Web unit jsdom 1/2, Unit Tests). After ui#1966 merges, close and reopen each at the same head (standing rule on recomputed merge commits), wait for green, merge with `--match-head-commit`, using the local merge-result check where the base moved onto a shared file. ui#1955 also had one layout case (`smoke-log-latency.spec.ts` en 412) red on CI; it passed 13 of 13 on `main`'s build locally, so treat a repeat as a flake to fix on `main`. ui#1903 `#181`'s root 38-scenario proof is done (39 passed). After ui#1958 merges, the `#1619` gamification consumer follow-up PR starts (D10 of the eighth session's predecessor). |
| ui#1965 `#1633` | `2555f37c`: `createSmokeHabit` uses the empty-state Create manually button when Today has no habits. Root proof done. Waits on CI (it carries `main`'s red too) and review. After merge: one production web release, then rerun the post-deploy smoke; `#1633` closes only on 6 of 6. |
| ui#1964 docs | This handoff's PR; merge after CI and review. |
| Dependabot UI1915/1916/1930/1932 | Sequential, unchanged. |
| `#1630` | Sentry `ORBIT-WEB-V` still 164 events, last `00:09:47Z` before the release. Close after the Android Open release carries the shared validator and no new events. |
| `#1622` | Production API serves the icons. Search Console recrawl of `https://useorbit.org/` requested; `api.useorbit.org/` refused (not an indexable page). Re-check `https://www.google.com/s2/favicons?domain=useorbit.org&sz=128` and the connector list later; close only when the new mark shows. |
| `#1624` | `thomas-brain` `chore/ticket-1624-brand-assets` at `da92c39` (pushed). Remaining: merge it into `thomas-brain` `main`, the pt-BR feature graphic (native headline approved first, rendered from a pt-BR copy of the banner source), the profile uploads. Ticket comment has the violet scan dispositions. |
| `#418` | `b17b97b0` on `thomasluizon/ticket-418-recovery-proof` (one commit on API `8ac0be8d`), no PR. Its Stryker packet is `application/reports/application-418-dispositions.json` in the e4903a0b scratchpad attempt `orbit-418-mutation-root-dqn8mdw4`. Next: a deep Codex round to review the critical recovery survivors and add the real guards, then compose the body and publish once. |
| Android | After ui#1959 `#1628` merges, run an Open release through the android-release skill; it carries `#1629`, `#1630`, `#1628` and the Open-pending fixes; verify Play availability and close what it completes. |
| `#1627`, `#1625`, `#1612`, `#1623`, `#1613`, `#1620`, `#1626` | Unchanged: `#1627` is live and waits for the Astra staging sweep; `#1625` waits on the owner's phone check; `#1612` waits on the staging admin Orbit MCP; `#1623` needs real captures; `#1613` carries after `#1607` merges; `#1620` is blocked; `#1626` follows `#1635`. |
| Workers, waiters, chain | No worker running. No live waiter after the relay. The chain stays open. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order in it a ticket before the turn ends.
2. Drive the in-flight rows: ui#1966 first, then reopen and merge the approved PRs, ui#1965, one production web release, the smoke rerun and the Android Open release.
3. Follow `## The order` from Batch 0c onward, preserving one bullet per open ticket.
4. Run the full real-call Astra staging sweep only after the current Astra work is deployed, and judge every answer against the block-first rule and `#1627`'s expert bar.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task, never a trailing `&`. Keep `LOAD_MAX=60 SPACING=45`, the hard ceiling, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded `--relaunch-reason` past the per-branch launch cap. Worker orders name focused suites and type checks; CI runs the complete suites. Workers start no server, browser, database or emulator; root owns the single Chromium and hermetic Playwright lane. Background tasks use a 7200000 ms ceiling. Keep 50 GiB free. Merge only at an exact approved head with green checks and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad restore, carry and relay procedures, Sleep rules: carried above.
- `#1633` zero-habit smoke round: done as ui#1965 with root proof; release and smoke rerun carried.
- `#1630` Sentry check: done (no new events); closure carried for Android.
- `#181` root 38-scenario run: done (39 of 39 on fresh build `miEeYrYu4SDOA4-4ulVeB`).
- PR rows ui#1955, ui#1944, ui#1961, ui#1959, ui#1946, ui#1958, ui#1903, ui#1897, ui#1963, ui#1952: all approved at their heads; merge carried behind ui#1966 (superseded "waits on CI and review").
- `#1624` asset work: part 1 done in `thomas-brain`; the rest carried.
- `#1622`, `#1627`, `#1625`, `#1612`, `#1623`, `#418`, `#1613`, `#1620`, `#1626`, Android, Dependabot, ui#1964: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
