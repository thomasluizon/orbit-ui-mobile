/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him (his latest order: "the rest is not waiting on me, just do it yourself"); when an MCP reaches the wrong account, use `claude-in-chrome`.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (147 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id. Read the previous session's carried `prev-sleep-decisions-c8de2c30.md` (D1 to D16) first, then `prev-sleep-decisions-65af1e8e.md`. Every helper, procedure and rule in the previous prompt still binds: read it with `git show HEAD~1:.claude/handoffs/NEXT.md` for the full helper list (`launch-new-ticket.sh`, `launch-review-round.sh`, `new-worktrees.sh`, `extract-replies.sh`, `answer-push.sh`, `body-merge.sh`, `base-overlap.sh`, `delta-overlap.sh <base sha> <pr>...` (new: overlap with what main changed since a given base), `mc-full.sh`, `api-wt-tests.sh <label> <worktree>`, `wait-done.sh`, `log.sh`, `carry-out.sh`, `prod-sql.sh`, `staging-sql.sh`, `refresh-delivery-map.sh`, `joblogs.sh`, the `eval-env/` and `sweep-1151/` scripts) and the Render, Play, Sentry and Gmail details. Gate tools take their CI flags: `check-copy.mjs --check`, `check-timeless.mjs --base origin/main`, `check-feature-parity.mjs --ci --production origin/main --base origin/main` (without them they exit 2 with usage). A clean `git merge-tree` is not a compile: an API combined check runs `api-wt-tests.sh` on the merged tree (it caught a `HabitCreateParams` break this session).

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 46, placed 46, unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `728b83ac`, API `main` is `eae3c20e`, landing `main` is `0d5e3df4`. Staging web `6b1fcfa3`, production web `d36522a7`; staging API `eae3c20e`, production API `bf6e59e2`; Android Open 1.3.96 (155) "Em análise" in Play at the last read. Open pull requests: UI `#2036`, `#1984`, `#1989` (relay docs); API `#903`; landing none. Workers: none running. Unpushed worker commits: two (below). Uncommitted: `thomas-brain` holds the `#1623` set and the older untracked `orbit/founder/`.

| Item | Disposition |
| --- | --- |
| `ui#2036` (`#1561` step 2) | Round 1 done, NOT pushed: `c59ff35a3` (widget authorization expiry and persisted background updates) on main merge `9c9a73543`, worktree `orca/workspaces/orbit-ui-mobile/ticket-1561-ios-widget-ipad`, log `#1561-8250-1792880596990.log` in `orbit-workers/`. Read the diff and report, check the PageHeader and OtpInput font-scale item, extract the two thread replies (`PRRT_kwDOR5Siws6v8BCd`, `PRRT_kwDOR5Siws6v8BCg`), edit the body, resolve threads, push with `answer-push.sh`, CI, approval, merge. |
| `ui#1984` (`#577`) | Main carry done, NOT pushed: `db8df8b3a` in `orca/workspaces/orbit-ui-mobile/ticket-577-headless-overlays`, log `#577-92240-1792880378693.log`. Read the remerge diff (`git show --remerge-diff`), push, CI, fresh approval, merge, then `#579`. |
| Production web | Release `main` (carries `ui#2023`, `ui#2021`, `ui#2033`, `ui#2031`, `ui#2037`) after the `/api/chat` log check and the 300 s drain rule; then close `#1683`; `#1620` and `#1662` close per their bullets. Then one Android Open release from main. |
| `orbit-api#907` (`#1696`) | Merged, staging verified (criterion 1). Production HELD until the owner's connector carries an OAuth-family key (production `ApiKeys` row named `Claude.ai` with `OAuthFamilyId` set) or a follow-up handles legacy `Claude.ai` keys; decide with the `#1696` comment. |
| `#1697` | New, owner report: launch at default first. |
| `#1624` | Owner order: do "Verificar marca" and the Instagram picture check yourself through `claude-in-chrome` first thing. |
| `#1560` | Step 5 merged (`ui#2037`). Next: provision the two updater keys into the `desktop-staging` and `desktop-production` environments without printing them (PR Manual steps), the staging desktop sign-in proof (closes `#1679`), then step 4 needs its API ticket. |
| `orbit-api#903` (`#582`) | Held for the `#26` comparison; `ui#2021` is now on staging, so the `#26` gate can run. |
| QA habit `506a5425` (`QA schedule check 227`) | Delete from the owner's staging account (connector delete now works on staging). |
| `#1688`, `#1690`, `#1689`, `#1687`, `#1610` | Close each once Android Open 1.3.96 shows available; the AVD session for `#1610`, `#1595`, `#32` stays. |
| `#1623` | English Astra frame after 04:00 UTC on the en demo account, render, `thomas-brain` PR, Play upload. |
| `#62`, `#195` | Rendered staging acceptance, then close (`#195` needs the free eval account at its habit ceiling; the ceiling is `FreeMaxHabits` in `AppConfig`). |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task. Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep rules, helper list: carried (decision log pointer moved to `c8de2c30`).
- Answer the owner first: carried; answered his `/progress --full`, connector and delegation messages.
- Android Open 1.3.96 availability: carried (still in review).
- Production API `918141de`: done (run 40133566445).
- `orbit-api#905`: done (merged `bf6e59e2`, production run 40135922721).
- `ui#2023`, `ui#2021`, `ui#1984`: `#2023` and `#2021` done (merged after the trio check plus targeted checks); `#1984` carried (carry committed, unpushed).
- `ui#2033`: done (merged `c71b2f1e`, `#1693` closed). `ui#2031`: done (merged `375310d7`). `ui#2034`: done (merged `282b7c45`, `#1692` closed).
- `orbit-api#903`, `#26`, `#1623`, `#62`, `#195`, AVD session, closes after Android availability: carried.
- `#1624`, `#1660`, `#1641` owner items: superseded for `#1624` (owner order, now run work); `#1660` and `#1641` carried as owner items.

Every identifier here came from a previous session: treat each as a lead to verify.
