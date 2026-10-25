/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him ("the rest is not waiting on me, just do it yourself"); when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome: do not retry that route, and do not sign in to staging web through Google in Chrome (a provider sign-in page).

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 127 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id. Read the previous session's carried `prev-sleep-decisions-1e50c797.md` first (D1 to D11), then `prev-sleep-decisions-94d1e7a7.md`. Every helper, procedure and rule in the previous prompts still binds: read them with `git show HEAD~1:.claude/handoffs/NEXT.md` and `git show HEAD~2:.claude/handoffs/NEXT.md` for the full helper list and the Render (workspace `tea-ctg9ljtumphs73dep1o0`; production API `srv-d6tc2isr85hc739bf75g`), Play, Sentry and Gmail details. New helpers in the carried scratchpad: `staging-ai-limits.sh raise|restore|show` (staging Pro AI limits only, reads back), `run-26.sh` (the detached `#26` eval runner), `eval-env/exhaust-budget.mjs` (spends the budget eval account's 5 free messages), `sweep-1151/probe-proactive-eval.mts` (proactive probe on the eval accounts), `desktop-latest/` (the checked `latest.json`). Ticket comments and closes go through `tools/comment-ticket.mjs` and `tools/complete-ticket.mjs`; thread ids come from `tools/list-bot-threads.mjs` output. In Bash, a redirect target must be a literal path (the guardrail refuses variable targets).

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 47, placed 47 (`#1705` in Batch 0c is new; `#1704` closed and removed), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `728b83ac`, API `main` is `dec1187a`, landing `main` is `0d5e3df4`. Staging and production web `728b83ac`; staging API `dec1187a` (verified), production API `ba387360` (verified). Android Open 1.3.96 (155). Open pull requests: UI `#2043`, `#2042`, `#2041`, `#2040`, `#2039`, `#2038`, `#2036`, `#1984`, `#1989` (relay docs); API `#903`; landing none. No worker is running.

| Item | Disposition |
| --- | --- |
| `#26` eval, second run | Running detached in the PREVIOUS session's scratchpad (the session folder named by the run state's `relay.from`), directory `run-26/` (`eval.log`, `exit.txt`, `DONE`). Its credentials file is that scratchpad's `eval-env/eval-credentials.json`, which the run rotates: use that file, never the carried copy. Start a Bash background poll on `DONE` for the wake. When it ends: read the report, record every failure on its owning ticket, then `staging-ai-limits.sh restore`, then disable `astra_eval_trace` and `astra_block_first` for the three eval accounts through the staging connector (list, disable, list), then decide `#582` (`orbit-api#903`). If it stops on a fixture or budget error, fix the cause and rerun (rerun `exhaust-budget.mjs` when the budget account's UTC day rolls over). |
| `ui#1984` (`#577`) | Green and approved at `db8df8b3a`, 0 threads, but behind `main` and shares `notification-bell.test.tsx`: rerun `mc-full.sh 1984 db8df8b3aeeeff6f1bb0f3f466a931cc4bc0c0ad` detached (setsid, poll its summary); merge at the approved head only when every lane passes; then `#579`. |
| `ui#2040` (`#1701`), `ui#2039` (`#1700`) | Round 2 pushed (`e997dbd9b`, `4747ac70e`), threads resolved. CI, fresh approval, merge. Both touch habit form tests, and `#2039` and `ui#1984` both edit `menu.tsx`: the second to merge takes a main carry or a combined check. |
| `ui#2043` (`#1705`) | Delivered (`25d5ce9e5`), diff and test read and kept. CI, approval, merge, production web, resolve Sentry `ORBIT-WEB-13`, close. |
| `ui#2042` (`#1702`), `ui#2041` (`#1703`), `ui#2038` (`#1699`), `ui#2036` (`#1561` step 2) | CI was running; read each rollup, then approval and merge. `#1562` starts after `ui#2036` merges. |
| `#1698` | Merged and on staging API. Run the Claude dialog check with the default CIMD option against staging, then release production API (`release.yml` production; staging serves `dec1187a`), then close. |
| Releases | After the UI fixes merge: production web from `main`, then one Android Open release from `main` (carries `#1683`, `#1620`, `#1700`, `#1701`, `#1702`); repoint `release-carry.sh` and `close-released.sh`, then close `#1683`, `#1620`. |
| `#1662` | No proactive item for any readable account; probe the eval Pro account inside a trigger window (spec bullet). |
| `#31` | Only `ORBIT-API-1H` is open (owned by `#1696`); close `#31` when it resolves. |
| `#1623`, `#62`, `#195`, AVD session (`#1610`, `#1595`, `#32`), `#1560` sign-in proof, `#1658` | As in their spec bullets (the en demo account's AI ceiling resets at 04:00 UTC for the `#1623` Astra frame). |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task (never a trailing `&`). Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep rules, helper list: carried (decision log pointer moved to `1e50c797`).
- `ui#2040` (`#1701`) rescope round: done (`e997dbd9b` pushed); carried for CI and merge.
- `ui#2039` (`#1700`): a round 2 for its tools red and Pullfrog thread is done (`4747ac70e`); carried for CI and merge. `ui#2042`: carried.
- `ui#2038` round 3 and `ui#2036` round 2: carried for CI and merge.
- `ui#2041` (`#1703`): carried for CI and merge.
- `ui#1984` (`#577`): approved and green; carried behind the combined check.
- `orbit-api#909` (`#1698`): done as a merge (`dec1187a`) and staging API; dialog check and production carried.
- `orbit-api#910` (`#1704`): done (merged `ba387360`, staging and production API verified, `#1704` closed).
- `#26`: setup done, flags enabled for the eval accounts, second run running; carried.
- `#1662` probe: done as far as possible (no current item; the owner's staging session expired); carried.
- Desktop `latest.json` check: done (four signed packages, posted on `#1560`).
- `#1595` QA habit deletion: done (already gone).
- `#1623`, `#62`, `#195`, AVD session, `#1560` sign-in proof: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
