/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place (he is angry about stray captions and about Astra controls that lost their labels); build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him (his latest order: "the rest is not waiting on me, just do it yourself"); when an MCP reaches the wrong account, use `claude-in-chrome`.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 140 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id. Read the previous session's carried `prev-sleep-decisions-0d656a8b.md` (D1 to D12) first, then `prev-sleep-decisions-c8de2c30.md` and `prev-sleep-decisions-65af1e8e.md`. Every helper, procedure and rule in the previous prompt still binds: read it with `git show HEAD~1:.claude/handoffs/NEXT.md` for the full helper list (`launch-new-ticket.sh`, `launch-review-round.sh`, `new-worktrees.sh`, `extract-replies.sh`, `answer-push.sh`, `body-merge.sh`, `base-overlap.sh`, `delta-overlap.sh <base sha> <pr>...` (new: overlap with what main changed since a given base), `mc-full.sh`, `api-wt-tests.sh <label> <worktree>`, `wait-done.sh`, `log.sh`, `carry-out.sh`, `prod-sql.sh`, `staging-sql.sh`, `refresh-delivery-map.sh`, `release-carry.sh` and `close-released.sh` (now pinned to production web `728b83ac` and the Android Open 1.3.96 source `d36522a7`; repoint both after the next releases), `joblogs.sh`, the `eval-env/` and `sweep-1151/` scripts) and the Render, Play, Sentry and Gmail details. Gate tools take their CI flags: `check-copy.mjs --check`, `check-timeless.mjs --base origin/main`, `check-feature-parity.mjs --ci --production origin/main --base origin/main` (without them they exit 2 with usage). A clean `git merge-tree` is not a compile: an API combined check runs `api-wt-tests.sh` on the merged tree (it caught a `HabitCreateParams` break this session).

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 46, placed 46, unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `728b83ac`, API `main` is `eae3c20e`, landing `main` is `0d5e3df4`. Staging and production web `728b83ac` (both verified); staging API `eae3c20e`, production API `bf6e59e2`; Android Open 1.3.96 (155) available. Open pull requests: UI `#2040`, `#2039`, `#2038`, `#2036`, `#1984`, `#1989` (relay docs); API `#909`, `#903`; landing none. Workers: none running (`#1700` delivered `ui#2039` at `852173d30`, `#1701` delivered `ui#2040` at `e7e798059`). CI waiters were running for `ui#2036`+`ui#1984` and `ui#2038`; restart them with `ui#2039` and `ui#2040`.

| Item | Disposition |
| --- | --- |
| `#1700` (owner report, top priority) | Delivered as `ui#2039` (`852173d30`, 35 files: both `menu.tsx`, standalone Astra actions, `design/astra-mark-only-surfaces.md`, canvas README, one en and pt-BR string). Not yet read by the orchestrator: read the diff against the owner's binding method in the ticket comments (revert only the mark-only hunks of `e397f2a2a`, keep the brand-word removals, the Hoje chips and the placeholder unchanged, every form fill control untouched), approve any changed string through `/second-opinion`, run the hermetic layout specs it names, then CI, approval, merge. |
| `#1702` (owner report, filed during the drain) | First launch of the session, at default: date button hover hugs the date text, no repeated `title` tooltip, Android check. New worktree from `main` with `new-worktrees.sh orbit-ui-mobile 1702:fix/ticket-1702-date-hover`. |
| `#1701` (owner report) | Delivered as `ui#2040` (`e7e798059`). Not yet read: check the emoji well sits at the trailing end of the title row with the Astra fill icon, every "why it is disabled" caption is gone and no visible string was added; then CI, approval, merge. `#1700` and `#1701` both touch habit form tests; merge order decides who carries. |
| `ui#2038` (`#1699`) | Copy approved (comment posted). CI, Pullfrog, merge, production web. |
| `orbit-api#908` (`#1697`) | Merged (`01e6e0f4`), live on staging (verified): unauthenticated `initialize` gets 401 with `resource_metadata`, the suffixed metadata URL is 200, the staging connector still answers tool calls (posted on `#1697`). Next: the Claude dialog check on the staging URL through `claude-in-chrome`, then production API with the `/api/chat` check. |
| `#1698` | Delivered as `orbit-api#909` (`eeac0a70`); conflicts with `main` in `OAuthControllerTests.cs`. Read the diff (SSRF limits, migration), commit-only main carry round, combined API tests, push, CI, merge, staging, dialog check with the default CIMD option, production API. |
| `ui#2036`, `ui#1984` | Pushed at `d59cb2e64` and `db8df8b3a`. CI, fresh approvals, merge; then `#579`. `#1700` also edits both `menu.tsx`: the second to merge takes a main carry. |
| Releases | After `#1700`, `#1701` and `ui#2038` merge: production web, then one Android Open release from `main` (carries `#1683`, `#1620`, `#1700`, `#1701`); then `close-released.sh` for `#1683`, `#1620`. Read the Desktop Release 0.1.1 staging run 40140756152. |
| `orbit-api#907` (`#1696`) production | Held until the owner's production connector carries an OAuth-family key (owner told how: remove, re-add with sign-in and "Registrar automaticamente"). |
| `#26` | The live gate at root (bullet in the spec has the env contract and the harness's own Codex grader and reset); then the `orbit-api#903` comparison. |
| `#1623`, `#62`, `#195`, AVD session (`#1610`, `#1595`, `#32`), `#1662` probe | As in their spec bullets. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task. Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep rules, helper list: carried (decision log pointer moved to `0d656a8b`).
- Answer the owner first: carried; answered his connector, reload notice, Astra label and emoji messages, each with a ticket (`#1698` to `#1702`).
- `ui#2036`: round 1b pushed with threads resolved; carried for CI and merge. `ui#1984`: carry pushed; carried.
- Production web: done (`728b83ac`, verified). `#1683`: carried to the next Android Open release (web is live). `#1620`, `#1662`: carried.
- `orbit-api#907` production: carried (held on the owner's connector).
- `#1697`: delivered as `orbit-api#908`; carried.
- `#1624`: done and closed (Google brand verified and published, Instagram current).
- `#1560`: updater keys provisioned; staging Desktop Release dispatched; sign-in proof carried.
- `orbit-api#903`, `#26`: carried (the `#26` gate setup is written into its spec bullet).
- QA habit `506a5425`: done (deleted through the staging connector).
- `#1688`, `#1690`, `#1689`, `#1687`: done and closed (1.3.96 available). `#1610`: carried (AVD).
- `#1623`, `#62`, `#195`: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
