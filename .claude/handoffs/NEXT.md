/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live registered wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main` and on releases: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); an `orbit-api` merge to `main` deploys; run `/android-release` to the open track when the Android fixes on `main` justify a build. Never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 126 open tickets, all 126 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

THE REDESIGN GATE is an owner stop: the owner has not decided whether the closed internal build talks to a staging API or production, and no gate build is made until that decision arrives. Everything before the gate is the run's work.

## In flight (verify each first)

| item | disposition |
|---|---|
| `orbit-api` PR 613 (`#784`, base `redesign/main`, head `1eccb7df`) | review-batch commit `21359cb3` ("fix: execute confirmed tool after step stream failure") is committed but NOT pushed, in worktree `orca/workspaces/orbit-api/ticket-784-live-tool-steps`. Merge its report into the body (`tools/merge-review-batch-body.mjs`), resolve its open thread, push once, wait for the review, then merge into `orbit-api` `redesign/main` |
| `orbit-ui-mobile` PR 1201 (`#682`, base `redesign/main`, head `b4bf124b`) | NOT approved: the newest Pullfrog review of that head commented, `pullfrog-approval` is red, and 2 threads are open in `packages/shared/src/chat/pending-operation-card-view.ts` (line 230, bulk-deletion action rows; line 248, targets past the first ten lose per-item removal). Launch a `--review-batch` worker (check the branch launch count; a third launch needs `--relaunch-reason`), then merge when approved. It completes Batch 1 with PR 613 |
| `orbit-ui-mobile` PR 1204 (`chore/contract-snapshot`, base `main`, head `2b3d98ba`) | the automated contract rebaseline; blocked on checks and review. Drive it to approval and merge it to `main` |
| `#745` | record the Supavisor 24-hour `Connection authenticated` count after its deploy on the ticket (before: 5,092; the window closes about 16:34 UTC the day after the deploy), then close it |
| `#762`, `#763` | merged on `main`; take two `pg_stat_statements` snapshots at least an hour apart in daytime traffic, record after-deploy rows per call on each ticket, close them, and record egress per active user in the spec's `## Current state` |
| `#556`, `#746` syncs | due after the next `main` merges in each repository (PR 1204 for the UI) |
| `#565`, `#566` | seven-day watch windows; close each after seven days with no recurrence on the carrying release |
| `#390`, `#134` | wait for the owner's device test; nothing for the run |
| Running workers | none |
| Stashes | none in any of the three repositories |
| Unpushed commits | `ticket-784-live-tool-steps` (1, above). `ticket-620`, `ticket-666`, `ticket-674`, `ticket-680` show 39 to 40 and 2 commits ahead, but their PRs (1113, 1110, 1114, 1116) are merged; confirm with `git cherry` and remove the worktrees |
| Dirty detached worktrees | `merge-1126` (98 files), `ui-main` (1), `menu-probe` (4), `merge-api-583` (7), `merge-api-584` (8): old merge and probe checkouts whose pull requests merged; read each `git status`, then remove them if nothing unmerged remains |
| Superseded | worktree `ticket-757-codex-no-apps` and branch `ticket-589-fortnightly-import`: nothing depends on them; delete at teardown |

## Then, in order

1. The in-flight rows above.
2. The spec's `## The order`: the rest of Batch E (measurements), Batch 0b (syncs), Batch 0c (watch windows and owner device tests), Batch 1 (`#784`, `#682`), then STOP at THE REDESIGN GATE and wait for the owner's API decision.
3. Owner decisions already taken, recorded on the tickets: copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`; console and dashboard steps are the run's, through the `claude-in-chrome` skill; every client egress waste is fixed, not only ticketed. Egress fixes go to `main`; `redesign/main` is synced from `main`.
4. A ticket body names the outcome and its acceptance; when a suggested method conflicts with the acceptance (identical results), the acceptance wins.

## Previous prompt, disposition

- Opening, entry point, sleep authorization and goal: carried above in its words; the board count is updated to 126.
- Egress priority: done for fixes (`#742` to `#745` and `#758` to `#763` merged on `main`); the measurements are carried as in-flight rows.
- PR 1172 (`#216`): done, merged and `#216` closed. `orbit-api` PR 596 (`#760`) and PR 597 (`#761`): done, merged and deployed, tickets closed. `#762` and `#763` workers: done, merged on `main`; measurement carried.
- `#745`: carried above. `#556` sync: done (PR 1202); the next sync is carried. Worktree `ticket-757-codex-no-apps`: carried as superseded.
- Step 1, `/android-release` and Data safety: done. 1.3.36 (95) and 1.3.37 (96) are live on the open track, 95 is on the internal track, and Data safety now declares the Sentry data with no advertising ID; Google is reviewing it.
- Step 2 (the order to the gate): carried as step 2, with the gate now an owner stop on the API choice.
- Steps 3 and 4: carried as steps 3 and 4; `#740`, `#297` and `#200` are done and closed.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes, dates or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
