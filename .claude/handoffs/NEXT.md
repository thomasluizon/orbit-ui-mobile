/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else: `## Standing rules`, `## The order`, `### THE REDESIGN GATE`, `## Decision pointers`, `## Current state` and `## Open questions`. The first Current state paragraph is the latest handoff. Batch history is context only, never ticket placement. Open the listed brain ADRs through Obsidian MCP, including D145, D146 and D147. Read `AGENTS.md` and its delegated `CLAUDE.md`; read `DESIGN.md` in full, `BRAND.md` and `design/canvas/README.md` before any UI diff or sweep.

## Entry point

`/sleep` is the only entry point; it enters the repository's queue procedure itself. This is an automatic relay: `adoptRelayRun` returns true, so continue the adopted run and its queue without replanning. If it returns false because the relay launch failed and the owner started this session by hand, write the run as the relay successor yourself (`relay.from` the predecessor, `sleep: true`, `pending: false`), confirm the chain successor with `confirmChainSuccessor`, and continue. The coordinator runs in the engine the owner starts it in. Workers, independent reviews and Pullfrog run on Codex `gpt-6.1-sol` only, through the configured launcher (tiers `default`, `mechanical`, `deep`, `max`); no Claude worker, Claude subagent or Cloud Codex. `/second-opinion` runs when the owner names it or for copy approval.

The owner's latest order is maximum velocity and quality: keep the worker pool full under the load gate, drive every open pull request to merge, and ship releases as soon as their pull requests land. The owner is awake and reporting: answer each message first, in his language, and give each order a ticket (or a rescope of its existing ticket) before the turn ends. His standing instructions: research before experimenting; add no visible string out of place; build his orders in full or not at all; never mention rotating an API key that showed in a log; do every step yourself that needs no password, 2FA or payment from him ("the rest is not waiting on me, just do it yourself"); when an MCP reaches the wrong account, use `claude-in-chrome`. The permission classifier refused reading a staging sign-in code from Gmail in Chrome this session: do not retry that route.

Check that this prompt is the newest: `gh pr list --repo thomasluizon/orbit-ui-mobile --state open --search "relay in:title"`. A newer open relay docs pull request than the one carrying this file supersedes it; read its `NEXT.md` with `git show origin/<branch>:.claude/handoffs/NEXT.md`.

Check free disk first (`df -g /System/Volumes/Data`); the floor is 50 GiB (about 130 GiB at this relay). Restore the durable scratchpad with `$HOME/.orbit-run-carry/carry-from-durable.sh <new session id>` as a background task BEFORE writing any file into the new scratchpad; pass the FULL 36-character session id. Read the previous session's carried `prev-sleep-decisions-94d1e7a7.md` first (D1 onward), then `prev-sleep-decisions-0d656a8b.md` and `prev-sleep-decisions-c8de2c30.md`. Every helper, procedure and rule in the previous prompt still binds: read it with `git show HEAD~1:.claude/handoffs/NEXT.md` for the full helper list (`launch-new-ticket.sh`, the new `launch-new-ticket-layout.sh <issue> <worktree> <base> <tier> [note]` (compose with `--layout-guard`), `launch-review-round.sh`, `new-worktrees.sh`, `extract-replies.sh`, `answer-push.sh`, `body-merge.sh`, `base-overlap.sh`, `delta-overlap.sh`, `mc-full.sh`, `api-wt-tests.sh`, `wait-done.sh`, `log.sh`, `carry-out.sh`, `prod-sql.sh`, `staging-sql.sh`, `refresh-delivery-map.sh`, `release-carry.sh`, `close-released.sh`, `joblogs.sh`, `proof-1703.sh`, the `eval-env/` and `sweep-1151/` scripts) and the Render (workspace `tea-ctg9ljtumphs73dep1o0`; production API `srv-d6tc2isr85hc739bf75g`), Play, Sentry and Gmail details. Gate tools take their CI flags: `check-copy.mjs --check`, `check-timeless.mjs --base origin/main`, `check-feature-parity.mjs --ci --production origin/main --base origin/main`. A clean `git merge-tree` is not a compile: an API combined check runs `api-wt-tests.sh` on the merged tree.

## Goal

Finish the spec: every requested production fix, the Astra overhaul, the owner reports, deferred asset and email work, verified releases and an empty board, in `## The order`. Re-derive what remains with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. Reconciliation at this handoff: open 47, placed 47 (`#1703` in Batch 0b, `#1704` in Batch 0c are new), unplaced 0, placed twice 0. Newly filed scope gets exactly one order bullet in the session it arrives. An external interruption is the only earlier ending.

## In flight

UI `main` is `728b83ac`, API `main` is `01e6e0f4`, landing `main` is `0d5e3df4`. Staging and production web `728b83ac`; staging and production API `01e6e0f4` (both verified). Android Open 1.3.96 (155) available. Open pull requests: UI `#2042`, `#2041`, `#2040`, `#2039`, `#2038`, `#2036`, `#1984`, `#1989` (relay docs); API `#910`, `#909`, `#903`; landing none.

| Item | Disposition |
| --- | --- |
| `ui#2040` (`#1701`), owner report | First launch of the session: a commit-only round at default on `ui#2040` with the `#1701` rescope comment as its note (no dashed box around the emoji group, no resting circle border on the Astra fill button, a spinner replacing the glyph while any form fill runs, no visible string). Then body, push, CI, approval, merge. |
| `ui#2039` (`#1700`), `ui#2042` (`#1702`) | Diffs read and kept; `#2039` copy approved and posted. CI, approval, merge (`#2039` and `#2040` both touch habit form tests, and `#2039` and `ui#1984` both edit `menu.tsx`: the second to merge takes a main carry or a combined check). |
| `ui#2038` (`#1699`) | Round 3 pushed at `8d9fff398` (Wrapped tap zones kept at 48 px with the notice; pager vertical padding 8 px). CI, approval, merge. |
| `ui#2041` (`#1703`) | Local red/green proof posted (fixed passes, reverted fails with the CI timeout). CI, approval, merge. |
| `ui#1984` (`#577`) | Failed layout job rerun (the `#1703` race). CI, approval, merge; then `#579`. |
| `ui#2036` (`#1561` step 2) | Round 2 pushed at `1f0fa7c04`, thread resolved. CI, approval, merge. |
| `orbit-api#909` (`#1698`) | Main carry pushed at `571c8b5a`. CI, fresh approval, merge, staging API, the CIMD dialog check, production API. |
| `orbit-api#910` (`#1704`) | Delivered at `d346485b`, diff read and kept. CI, approval, merge, staging API; it unblocks `#26`. |
| `#26` | Blocked on `#1704` (spec bullet has the setup done and the exact next steps); the owner's staging account is admin now. |
| `#1696` | Live in production; stays open for criterion 2 (step-up) after the owner re-adds his connector. |
| Releases | After `#2039`, `#2040`, `#2042`, `#2038` merge: production web, then one Android Open release from `main` (carries `#1683`, `#1620`, `#1700`, `#1701`, `#1702`); repoint `release-carry.sh` and `close-released.sh`, then close `#1683`, `#1620`. |
| `#1662` probe | `npx tsx sweep-1151/probe-proactive.mts` (macOS has no `timeout`). |
| `#1623`, `#62`, `#195`, AVD session (`#1610`, `#1595`, `#32`), `#1560` sign-in proof | As in their spec bullets. |

## Then, in this order

1. Answer any owner message first, in his language, and give each order a ticket or a rescope before the turn ends.
2. The in-flight rows above, pool full under the load gate.
3. The rest of `## The order`.

## Sleep

Unattended run. Never ask the owner; decide with the recommended option and log it with `log.sh`. Keep a live wake source while work remains: only the launcher, `tools/wait-ci.mjs` and `tools/wait-release.mjs` register one, and only as a Bash background task. Keep `LOAD_MAX=60 SPACING=45`, `deep` after a failed round, `max` after a second, no `ultra`, and a recorded relaunch reason past the per-branch launch cap. Merge only at an exact approved head with every check green and zero unresolved threads, using `gh pr merge --squash --match-head-commit <full sha>`; a head behind its base merges without a base merge only when its files share none with the newer base, otherwise after a combined local check. Read every worker diff before pushing it. Before any push, `git merge-tree --write-tree --name-only origin/main HEAD` must exit 0. Resolve threads and edit the body before the push. Never sign in to the owner's production account with an emailed code. At the context threshold, drain, carry and relay through `node tools/relay-session.mjs`.

## Previous prompt, disposition

- Reading list, entry point, scratchpad and carry procedures, Sleep rules, helper list: carried (decision log pointer moved to `94d1e7a7`).
- `#1700`: diff read and kept, copy approved; carried for CI and merge. `#1701`: diff read and kept; carried. `#1702`: done as a delivery (`ui#2042`); carried for CI and merge.
- `ui#2038`: round 3 pushed; carried for CI and merge. Owner report on the emoji fill borders and spinner: answered, folded into `#1701`. `ui#2036`: round 2 pushed; carried. `ui#1984`: red diagnosed as `#1703`, rerun; carried.
- `orbit-api#908` / `#1697`: done (dialog check passed, production API `01e6e0f4` verified, closed).
- `#1698`: main carry pushed; carried. `orbit-api#907` production: done (released with `01e6e0f4`; criterion 2 carried).
- Desktop Release 0.1.1 staging: read, green; `latest.json` check carried.
- `#26`: setup done, blocked on `#1704` (new). `orbit-api#903`: carried behind `#26`.
- `#1623`, `#62`, `#195`, AVD session, `#1662` probe, `#1560` sign-in proof: carried.

Every identifier here came from a previous session: treat each as a lead to verify.
