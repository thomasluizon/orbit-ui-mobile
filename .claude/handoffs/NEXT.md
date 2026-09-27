/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main` and on releases: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); an `orbit-api` merge to `main` deploys; run `/android-release` to the open track when the Android fixes on `main` justify a build. Never merge `redesign/main` to `main`.

The adopted run record may still carry the closed, unmerged rows `api#535` and `api#579` with blockers; mark each `closed: true` from the fact that its pull request closed without a merge (`#788`), so the run can end BLOCKED on them honestly. A wait on the clock (a measurement window) has no registered wake source: move those items out of `remaining`, record them in the run record, and wake on a background timer.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 123 open tickets, all 123 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

THE REDESIGN GATE is an owner stop: Batch 1 is done, and no gate build is made until the owner decides whether it talks to a new Render service running `orbit-api` `redesign/main` or to production. Everything before the gate is the run's work.

## In flight (verify each first)

| item | disposition |
|---|---|
| Open pull requests | none in `orbit-ui-mobile`, `orbit-api` or `orbit-landing-page` |
| `#763` | record the after-deploy rows per call of the summary reader once the busiest account requests a summary (the `jsonb_to_recordset` reader in `pg_stat_statements`), then close it |
| `#790`, `#792` | closed; record on each ticket the after-deploy rows per call of the Today candidate read and facts read once real use resumes |
| Egress per active account | read Egress per day on the Supabase organization usage page (claude-in-chrome) for the first full day with real use after the fixes, divide by that day's active accounts, write it into the spec's `## Current state` |
| `#556`, `#746` syncs | current (UI through `#1213` except `#1204`, API through `#618`); run the next carry after the next `main` merge in each repository, cherry-picking only the new commits |
| `#565`, `#566` | watch windows; close each after seven days on its carrying release (the spec's `## Current state` names both) if Sentry shows no recurrence of ORBIT-WEB-C or ORBIT-MOBILE-5 |
| `#390`, `#134` | wait for the owner's device test; nothing for the run |
| Running workers | none |
| Stashes | none in any of the three repositories |
| Unpushed commits | none on any branch with a remote |
| Stale worktrees | listed at the end of the spec's `## Current state` (seven UI and one API branch with no remote left, six detached API checkouts, two of them dirty); verify each and remove it with `node tools/teardown-worktree.mjs` or by hand when nothing unmerged remains |

## Then, in order

1. The in-flight rows above.
2. The spec's `## The order`: the rest of Batch E (the `#763` record and the next shapes the Batch E text names), Batch 0b (syncs), Batch 0c (watch windows and owner device tests); Batch 1 is done, so STOP at THE REDESIGN GATE and wait for the owner's API decision.
3. Owner decisions already taken, recorded on the tickets: copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`; console and dashboard steps are the run's, through the `claude-in-chrome` skill; every client egress waste is fixed, not only ticketed. Egress fixes go to `main`; `redesign/main` is synced from `main`.
4. A ticket body names the outcome and its acceptance; when a suggested method conflicts with the acceptance (identical results), the acceptance wins.
5. A review finding on a sync pull request that is also a defect on `main` is fixed on `main` first and then carried in the same sync; a sync changes no behaviour beyond carrying.

## Previous prompt, disposition

- Opening, entry point, sleep authorization and goal: carried above in its words; the board count is updated to 123 and the gate choice is restated as a new Render service or production.
- In flight, `orbit-api` PR 613 (`#784`): done, merged as `16c08268` on `redesign/main`, `#784` closed.
- In flight, `orbit-ui-mobile` PR 1201 (`#682`): done, merged as `defca6cb` on `redesign/main`, `#682` closed.
- In flight, `orbit-ui-mobile` PR 1204 (contract rebaseline): done, merged as `116d7720` on `main`.
- In flight, `#745`: done, recorded (5,088 to 532) and closed.
- In flight, `#762` and `#763`: `#762` done (recorded on the ticket); `#763` carried above.
- In flight, `#556` and `#746` syncs: done (UI PRs 1205, 1210, 1212; API PRs 614, 616, 619); the next syncs are carried.
- In flight, `#565`, `#566`, `#390`, `#134`: carried.
- In flight, running workers and stashes: checked, none.
- In flight, unpushed commits on `ticket-620`, `ticket-666`, `ticket-674`, `ticket-680`: done, verified as clean base merges and removed.
- In flight, dirty detached worktrees `merge-1126`, `ui-main`, `menu-probe`: done, removed; `merge-api-583` and `merge-api-584`: carried as stale worktrees.
- In flight, superseded worktree `ticket-757-codex-no-apps` and branch `ticket-589-fortnightly-import`: superseded by the stale-worktree row, which covers every remaining worktree.
- Step 1 (in-flight rows): carried as step 1.
- Step 2 (the order to the gate): carried as step 2; Batch 1 is now done.
- Steps 3 and 4: carried as steps 3 and 4.
- Carried section (timed decision log in the scratchpad; owner items in `## Current state` without quotes or attribution; identifiers are leads): carried below.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
