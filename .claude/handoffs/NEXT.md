/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep. Read `TESTING.md` `## Astra capability eval` before any `#26` step.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `crank: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is MAX WORKERS, MAX SPEED: crank is on (section below). When the owner writes, answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him; when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome: do not retry that route, and do not sign in to staging web through Google in Chrome. Do not sign in to GitGuardian or any other third-party dashboard through a GitHub OAuth grant.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 180 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id (this relay ran `carry-out.sh`). Read the carried `prev-sleep-decisions-883f2d5b.md` first (D1 onward), then `prev-sleep-decisions-e022762f.md`. Every helper, procedure and rule in the previous prompts still binds: read them with `git show HEAD~1:.claude/handoffs/NEXT.md` through `git show HEAD~4:.claude/handoffs/NEXT.md` for the full helper list and the Render, Play, Sentry and Gmail details. Helpers added this relay: `accept-195/sub.mjs` and `accept-195/retro.mjs` (eval-account acceptance; set `ORBIT_EVAL_BASE_URL` or the refresh fails before any request and leaves a `.refresh-failed` marker to delete), `run-26-gate2.sh` (the detached gate rerun at `2fdf42ca3`), `layout-2052.sh` and `build-579.sh` (local proofs). The relay checkout is behind `main` after a relay: merge `origin/main` into it locally first (no push) so the launcher and skills match `main`. Staging web is `https://app-staging.useorbit.org`, production web `https://app.useorbit.org`, staging API `https://orbit-api-staging-uqu2.onrender.com`, production API `https://api.useorbit.org`. The staging API is a free Render service that sleeps when idle and takes about 40 seconds to wake: run `staging-keepawake.sh` as a background task during every staging API deploy, and curl `/health` until it answers before any eval credential refresh. A production API release of a commit staging does not serve must pass `-f sha=<the staging commit>`. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; new tickets through `tools/create-ticket.mjs`; body edits through `tools/update-ticket.mjs --confirm-replace`; thread ids come from `tools/list-bot-threads.mjs` output. In Bash, a redirect target must be a literal path (no variable targets, no here-strings), nothing may write or link inside `node_modules`, and a command line naming the worker engine's exec subcommand is refused. Branches use only `feature/`, `fix/` or `chore/`. `node tools/check-dashes.mjs` takes `--text "<body>"` for a pull request body.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 45, placed 45 (`#1722`, `#1723`, `#1724` new in Batch 0b; `#1708`, `#577`, `#227`, `#1623` closed and removed), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `2fdf42ca3`, API `main` is `430acd76`, landing `main` is `0d5e3df4`. Staging and production web `eb2b588fe`. Staging and production API `430acd76`. Android Open 1.3.98 (157, from `b081fabd2`) is live. Read every worktree named below first: a finished worker leaves commits, a dirty tree or nothing.

| Item | Disposition |
| --- | --- |
| `orbit-api#918` (`#1719`) | Pushed `df516d09` (round 1 approved at `7789beb8`; then the GitGuardian fixture fix). Next: green CI and a fresh Pullfrog approval at `df516d09`, merge, then take a local `pg_dump` of staging from the operator Mac into the scratchpad, dispatch `staging-reseed.yml` at least ten hours before `orbit-staging` `expiresAt` (Render MCP `list_postgres_instances`), verify `/health`, migrations, the owner seed, the staging connector and the three eval refreshes, and close `#1718` and `#1719`. If `#1719` cannot merge in time, run every eval-account step first. |
| `ui#2057` (`#579`) | Local only, not pushed: `a1e04eff6` (both threads, three suites green), `317999127` (Today script estimate 774,698 against the 820,000 cap; `main` measures 810,667) and `a2665ed11` (`packages/shared` `sideEffects` is `["*.css"]` instead of `false`, so the shared spacing stylesheet can never be pruned; bundle tests 5 of 5; web build exit 0 with `--orbit-space-12` in the built CSS). Before pushing, settle one risk in a deep round: `317999127` loads the toast through `next/dynamic` with `loading: () => null` in `app-toast-host.tsx` and `notification-delete-notice.tsx`, so a failure toast raised while offline may never render if its chunk was not fetched yet; keep the budget win and make the toast reliable offline (for example preload the chunk after first paint) with a test that fails today. Then answer and resolve `PRRT_kwDOR5Siws6v_BPd` and `PRRT_kwDOR5Siws6v_BPh` (sheet positioning styles target only marked menu wrappers; busy radio items stay focusable while rejecting selection), edit the body, push once, CI, approval, merge, release. |
| `ui#2052` (`#1715`) | Pushed `85b148c31` (hermetic layout 57 of 57 locally). Next: green CI and a fresh approval at that head, merge, web release, the next Android Open release. |
| `ui#2050` (`#1713`) | Approved at `d3ce8c7be`, 0 unresolved; the cancelled `Android release build` job was rerun. It shares `apps/mobile/__tests__/components/habits/habit-form-fields.test.tsx` with `eb2b588fe`: merge after a combined local check or a base merge. Then release and resolve each Sentry group. |
| `ui#2058` (`#1720`) | Pushed `e2a056594`. Next: CI, fresh approval, merge (harness, no release). |
| `ui#2060` (`#1721`) | Delivered `31ec94200`, read. Next: CI, Pullfrog, merge. |
| `orbit-api#919` (`#1723`) | Delivered, read. Next: CI, Pullfrog, merge. |
| `orbit-landing-page#120` (`#1724`) | Pullfrog COMMENTED with P2 `PRRT_kwDORqm3lM6v_nVN` (`.github/workflows/release.yml:153`, honor Render's rate-limit retry delay) and `Build` and `CodeQL` red. Next: one review round for the thread and both reds, then merge. |
| `ui#2061` (`#1722`) | Delivered at `6547195a8`. The worker fixed two test-isolation failures the full tools run exposed and verified them by targeted reruns only, so read the diff and the CI tools job before trusting it. Next: CI, Pullfrog, merge. |
| `#26` gate | `ui#2059` merged (`2fdf42ca3`). Run `perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' bash run-26-gate2.sh` in the daily window after 00:00 UTC, when the Free eval account has messages again, with a background poller on `run-26-gate2/DONE`. First run the `#195` near-zero allowance check in that same window. Then file each failure on its ticket, restore the limits, flags off, decide `orbit-api#903`. |
| `#195` | Four criteria passed and posted; only the near-zero allowance remains (next Free window). |
| `#1714` | Live on staging and production web; close after the next Android Open release carries it. |
| Next Android Open release | Dispatch after `ui#2052`, `ui#2050` and `ui#2057` merge (or sooner if one waits long), carrying `#1714`, `#1715`, `#1713`, `#579`; then close those tickets with `close-released.sh` (update its constants). |
| `orbit-api#903` (`#582`) | Held for the `#26` comparison. |
| `#1698`, `#62`, `#1662`, `#1641`, AVD session (`#1610`, `#1595`), `#1560` sign-in proof, `#1658`, `#972`, `#1151` sweep rerun | As in their spec bullets. `#62` and `#1151` use the eval accounts (the owner's staging web session is dead); `#1151` is best run after the `#26` fixtures give the Pro account habits. `#1662` probes the eval Pro account inside a proactive window after the fixtures. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate, `orbit-api#918` first.
3. The rest of `## The order`.

## Crank

The owner ordered maximum velocity: the run state carries `crank: true`, which `adoptRelayRun` inherits. Invoke `/crank` immediately after `/sleep` entry (`.claude/skills/crank/SKILL.md` governs): keep the worker pool full to `caps.parallelTickets`, start every launchable ticket at once, merge and release every pull request the moment it meets the merge bar, base-merge at once when a red check needs it. Quality gates never drop. A cranked relay hands off with `/handoff --relay --sleep --crank`. Only `/crank --disable` ends it.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base (`base-overlap.sh`), otherwise after a combined local check or a base merge. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never reset an AI counter or rotate accounts to finish an eval run; the owner allowed the raised staging ceilings for the current `#26` window only. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep and Crank rules, helper list: carried (decision log pointer moved to `883f2d5b`; the OAuth-grant refusal, `update-ticket.mjs`, the redirect rule detail and the new helpers added).
- `orbit-api#918` row: carried (round 1 pushed and approved; GitGuardian fixture round pushed at `df516d09`).
- `ui#2057` (`#579`) row: carried (the budget continuation committed `317999127`; the offline toast risk and the `sideEffects` correction added).
- `ui#2052` row: carried (CI round pushed at `85b148c31`).
- `ui#2053` and `ui#2050` row: `ui#2053` done (merged `eb2b588fe`, staging and production web); `ui#2050` carried.
- `ui#2058`, `ui#2059` row: `ui#2059` done (merged `2fdf42ca3`); `ui#2058` carried (round 1 pushed).
- `#1721` row: done as a launch (delivered as `ui#2060`); merge carried.
- `#26` gate row: carried (runner `run-26-gate2.sh` prepared at the new `main`).
- `#195` row: free sub-habit and Retrospective done (posted on the ticket); the near-zero allowance carried.
- Android Open 1.3.98 row: done (available; `#1708`, `#577`, `#227` closed); the next Open release carried.
- `#1623` row: done (published in both locales, closed).
- `orbit-api#903`, `#1698`, `#62`, `#1662`, `#1641`, AVD session, `#1560` sign-in proof, `#1658`, `#972`, `#1151`: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
