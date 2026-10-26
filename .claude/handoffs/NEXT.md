/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep. Read `TESTING.md` `## Astra capability eval` before any `#26` step.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `crank: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is MAX WORKERS, MAX SPEED: crank is on (section below). When the owner writes, answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him, and before naming anything as waiting on him, verify it in this session against the code and every installed tool (staging has fixed-code test accounts); when he says he did a step, close on it and never re-ask how he did it; when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome and clicking Ignore on a GitGuardian incident: do not retry either. Do not sign in to staging web through Google in Chrome, and do not sign in to GitGuardian or any other third-party dashboard through a GitHub OAuth grant. Never add a rule, gate or approval step the owner did not ask for.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 140 GiB at this relay, after removing the ignored `node_modules` of 45 merged-ticket UI worktrees; remove each worktree's ignored `apps/web/.next` after its hermetic run; `scratch-wt-prune.sh dry|run` in the scratchpad pins each head under `refs/orbit-scratch-archive/` and skips live, dirty and branch trees; add the predecessor's session prefix `9bc03d64` to its `SKIP_SESS` first). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id. Then repoint the carried helpers the carry does not rewrite: `perl -pi -e 's/<old full id>/<new full id>/g'` over `avd-accept/*.mjs`, `avd-accept/*.sh`, `eval-env/*.mts`, `eval-env/*.mjs`, and `chmod +x avd-accept/*.sh`. Read the carried `prev-sleep-decisions-9bc03d64.md` first (D1 to D21), then `prev-sleep-decisions-22f819f7.md` (D1 to D33), then `prev-sleep-decisions-522119b2.md`. Every helper, procedure and rule in the previous prompts still binds: list them with `git log --format=%h -10 -- .claude/handoffs/NEXT.md` and read each with `git show <sha>:.claude/handoffs/NEXT.md`. Helpers added this relay: `eval-env/day-1745.mts` (day summary against Hoje, with `LOG_TITLES` toggled on and off), `eval-env/month-1747.mts` (the eleven habit month prompts, refresh and Calendário parity), `eval-env/probe-400.mts`, `avd-accept/r390-replay.mjs <log|skip|delete> <x> <y>` (`PRETAPPED=1` when the offline action was confirmed by hand), `run-26-gate3.sh` (point its `git worktree add` commit at the merge of `ui#2091` first), `note-1743-both.md`, `note-1747-both.md`, `note-1752-r2.md`, `note-1755-rb1.md`, `note-1756-rb1.md`, `note-26-use-intl.md`. The staging API logs are Render resource `srv-dasotg8473hc739a5gjg` (workspace `tea-ctg9ljtumphs73dep1o0`); production web's origin is `https://orbit-web-3qmv.onrender.com`. Worker logs live in `$TMPDIR/orbit-workers/` (`/bin/ls -t`). In Bash, a redirect target must be a literal path: a command whose redirect target contains `$(...)` or `$VAR` is refused, so write a script file or use the Write tool. A tracked spec or prompt line may not carry a literal date. Nothing may write or link inside `node_modules`. `list-bot-threads.mjs` needs `--wait-seconds 0 --no-request` for a quick read. Only one hermetic Playwright run at a time. Fetch `origin` in the root checkout before any `git worktree add` of a new `main` commit. Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; new tickets through `tools/create-ticket.mjs`. Branches use only `feature/`, `fix/` or `chore/`. A pull request the coordinator opens ends its body with the Claude Code attribution line.

## Goal

Finish the spec: every requested production fix, the Astra overhaul (the approved `#1740` plan, `#1755` to `#1761`, `#1762` to `#1764`, then `#1743`, `#1747`, `#1748`, `#1750`), the owner reports, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff (`node reconcile-order.mjs` in the scratchpad): open 51, placed 51, unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `59abed358`, API `main` is `6d068bad`, landing `main` is `14293563`. Staging and production API serve `b4454cac` (verified); staging web serves `4ede9419f` (verified); production web of `4ede9419f` was dispatched (run 40276362748) with a wait-release that may still run. One worker may still run: the `#1743` relaunch. Read each named worktree and worker log first.

| Item | Disposition |
| --- | --- |
| Production web run 40276362748 | Read its result (`gh run view`, then `/api/health` on `https://orbit-web-3qmv.onrender.com` must show `4ede9419f`). Then the next Android Open batches `#1736`, `#1746` and `#1739` from `main`. Then staging API of `6d068bad` (`#1758`) and production after it; close `#1758` on staging. |
| `#1743` relaunch | Worktree `ticket-1743-astra-blocks-on-app-rows` (deep, second launch). Read the outcome: a pull request, commits, or a NEEDS_DECISION. Then the per-block `/second-opinion` rounds the ticket orders. |
| `orbit-api#930` (`#1755`) | Round 1 committed `ac5a03e7`, not pushed (worktree `ticket-1755-astra-redundant-work`). `body-round.sh api 930 <worker log> 930-rb1`, reply file for `PRRT_kwDORKgXhc6wJV-c`, `answer-push.sh`, waiter, review, copy approval, merge. |
| `orbit-api#929` (`#1756`) | Pushed `83324b90`, thread resolved; its waiter finished. Read CI and the fresh review, copy approval of the framing examples, merge, staging. |
| `orbit-api#931` (`#1762`), `#932` (`#1750`), `#933` (`#1747` fix) | Opened by workers. Read each diff, start waiters, review rounds on reds, copy approvals, merge, staging. After `#933` is on staging, rerun `eval-env/month-1747.mts` and close `#1747`; launch `#1764`. After `#931`, launch `#1763`. |
| `ui#2088` (`#1742`), `ui#2089` (`#1752`), `ui#2090` (`#1748`), `ui#2091` (`#26` install) | Read each diff, waiters (one runs on `ui#2088`), reviews, merge. `ui#2088` needs `node tools/ios-simulator.mjs` twice and `node tools/check-dependency-edits.mjs` on its head before merge. |
| `#26` gate | Staging Pro AI limits are RAISED. After `ui#2091` merges: point `run-26-gate3.sh` at that merge commit, run it detached, file results, `staging-ai-limits.sh restore`, flags off (list, change, list), then `#582`. If the rerun cannot start soon, restore the limits first. |
| `#390` (AVD) | Bulk log round passed. Next: find whether the queued next-day skip replayed (staging app log `Bulk skipped` after 06:03 UTC), rerun the skip round, then delete; then `#1151`'s Android cells, delete the habits and the AVD. |
| `#1733` | `ui#2084` merged and live; close the ticket. |
| `#26` free case | `edge-free-limit-en`: rerun `run-26-free.sh` after the Free account's daily window resets (never reset a counter). |
| `#1641` | After 08:00 local only: a new staging email and the Gmail web and app check, then the production `Ses__FromEmail` switch. |
| `#1735` | Read production web logs for an out-of-memory restart through the window ending 24 hours after run 40244503719 finished (`updatedAt` 00:20 UTC on the day of this relay), then close. |
| `#1679`, `#1752`, `#1732` | The desktop sign-in proof against staging, then close `#1679`; the ten-run watches. |
| `#62`, `orbit-api#903`, `#732`, `#1113`, `#1619`, `#1662`, `#1617`, `#1716`, `#1706`, `#1674`, `#1726`, `#1658`, `#1654`, `#1562`, `#1751`, `#1757`, `#1759`, `#1760`, `#1761` | As in their spec bullets. |

Inventory: open pull requests are the eleven above plus `orbit-api#903` and this relay's `ui#1989`; no stash and no detached-head work was created this relay; unpushed work is `orbit-api#930`'s `ac5a03e7` only.

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Crank

The owner ordered maximum velocity: the run state carries `crank: true`, which `adoptRelayRun` inherits. Invoke `/crank` immediately after `/sleep` entry (`.claude/skills/crank/SKILL.md` governs): keep the worker pool full to `caps.parallelTickets`, start every launchable ticket at once, merge and release every pull request the moment it meets the merge bar, base-merge at once when a red check needs it. Quality gates never drop. A cranked relay hands off with `/handoff --relay --sleep --crank`. Only `/crank --disable` ends it.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check (with no OpenAPI drift for `orbit-api`) or a base merge. A head-pinned `pullfrog-approval` success that reports nothing to review since an approved head, with that approval undismissed, counts as the approval of a base-merge head. A red that also fails on a clean `main` build is `main`'s flake: merge, and ticket the flake. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Production web admission needs staging to serve the same commit: dispatch production with the verified staging SHA when `main` has moved by non-runtime commits. A long local check that must survive a relay runs detached through `perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV'`. Never reset an AI counter or rotate accounts to finish an eval run. Never sign in to the owner's production account with an emailed code. No email while the owner sleeps. The permission classifier refused SonarCloud writes through the page's web API: use the page's own controls. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, newest-prompt check, scratchpad and carry procedures, Crank and Sleep rules, the do-not-re-ask and refused-route instructions: carried (helper list and decision log pointers updated; the carry repoint step added).
- Releases row: done for staging and production API of `b4454cac` and staging web of `4ede9419f` (verified); production web dispatched (carried as the first row); Android Open carried; the `#1754` and `#1745` staging checks done and both closed; the `#1747` check failed (fix `orbit-api#933`); the `#1757` staging check carried in its bullet.
- `ui#2084` (`#1733`) row: done (merged `4ede9419f`); the close carried; `#1742` launched (now `ui#2088`).
- `ui#2087` row: done (merged `59abed358`); the gate rerun carried behind `ui#2091`; the limits are raised.
- `ui#2086` row: done (merged `468e2b5db`).
- `orbit-api#928` row: done (base merge, merged `6d068bad`); staging carried.
- `orbit-api#929` row: advanced (round 1 pushed `83324b90`); merge carried.
- `orbit-api#930` row: advanced (round 1 committed, unpushed); push carried.
- `#1750` row: done as a relaunch (now `orbit-api#932`).
- `#1743`, `#1748` row: `#1748` launched (now `ui#2090`); `#1743` relaunched after its NEEDS_DECISION (filed `#1762`, `#1763`).
- `#390` row: advanced (bulk log passed); skip, delete, `#1151` cells and the AVD deletion carried.
- `#26` free case, `#1641`, `#1735`, `#1679`, `ui#2082`, `#1732` rows: carried (`#1752` rescoped, its fix is `ui#2089`).
- The remaining tickets row: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
