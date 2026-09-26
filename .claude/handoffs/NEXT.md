/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live registered wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main` and on releases: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); an `orbit-api` merge to `main` deploys; run `/android-release` to the open track when the Android fixes on `main` justify a build. Never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 145 open tickets, all 145 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## Priority: Supabase egress

The Supabase project hit its monthly egress quota. Egress stays first until the spec's `### Batch E: Supabase egress, first` is done: measure per query shape, rank by bytes, fix the biggest first with before and after evidence. Egress fixes go to `main`; `redesign/main` is synced from `main`.

Done: #742 to #744, #758 and #759 merged, and the per-shape delta measured (every old large shape stopped growing). In flight: the four remaining root causes, #760 to #763, below. After they deploy, take two `pg_stat_statements` snapshots an hour apart, record each ticket's after-deploy rows per call on it, and record the remaining egress per active user in the spec's `## Current state`.

## In flight (verify each first)

| item | disposition |
|---|---|
| `orbit-ui-mobile` PR 1172 (`#216`, base `main`) | all three review attempts used; head `07bf5220` has every check green and zero unresolved threads; waiting only on Pullfrog's approval of that head. Merge when approved; a new blocking finding makes it an exhausted-fixer blocker to record |
| `orbit-api` PR 596 (`#760`, base `main`) | worker delivered; allowlist fix pushed at `7ee0025d`; waiting on CI and the first Pullfrog review. Drive through review, merge, deploy |
| `orbit-api` PR 597 (`#761`, base `main`) | worker delivered at `1f64aeb2`; waiting on CI and the first Pullfrog review. Drive through review, merge, deploy |
| `#762` worker (worktree `orbit-api/ticket-762-completion-dates-sql`, branch `fix/ticket-762-completion-dates-sql`, newest `#762-*.log` in the launcher log directory) | relaunched with the decision to keep skip logs in achievement progress; outcome unknown. Read the worktree and log first; at handoff it held one unpushed commit and uncommitted changes. Its branch has used two launches; a relaunch needs `--relaunch-reason` |
| `#763` worker (worktree `orbit-api/ticket-763-summary-log-window`, branch `fix/ticket-763-summary-log-window`) | relaunched (third launch) with the overdue-date and measurement decisions; outcome unknown. Read the worktree and newest `#763-*.log` first; at handoff it held uncommitted changes |
| `#745` | record the Supavisor 24-hour `Connection authenticated` count after its deploy on the ticket (before: 5,092; the window closes about 16:34 UTC the day after the deploy), then close it |
| `#556` sync | due: carry every `main` merge since the last sync (ads removal, the notification poll, the Codex worker isolation, the habit refetch fix, the reminder model, and `#216` once merged) |
| Stashes, other worktrees | no stashes in the three primary checkouts; landing has no open pull requests; the other UI worktrees used this session are clean and pushed |

## Then, in order

1. Once PR 1172 merges, run `/android-release` to the open track: 1.3.35 is the first build without AdMob. After it is live, update Play Console Data safety (remove the advertising ID and ads declarations) through the `claude-in-chrome` skill.
2. The spec's `## The order`: the rest of Batch E, Batch 0b, Batch 0c, Batch 1, then STOP at THE REDESIGN GATE (a closed Play internal build for the owner; never merge `redesign/main` to `main`).
3. Owner decisions already taken, recorded on the tickets: `#740` extends the relative reminder model (deployed; paired editor ticket `#752` is next in Batch 0c); `#297` uses real-time push; ads are deleted everywhere (`#200` removes the backend); copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`; console and dashboard steps are the run's, through the `claude-in-chrome` skill; every client egress waste is fixed, not only ticketed.
4. A ticket body names the outcome and its acceptance; when a suggested method conflicts with the acceptance (identical results), the acceptance wins. Two egress tickets this run had to be corrected by comment for that reason.

## Previous prompt, disposition

- Its opening, entry point, sleep authorization, goal and `## Carried` instructions: carried above in its words.
- Its egress priority: carried above; the per-shape measurement is done and became #760 to #763.
- Its in-flight rows: PR 1176 done (merged `2376c94d`, #758 closed); PR 1173 done (merged `0e815b28`); PR 1171 done (merged `f88082bd`); PR 1170 done (merged `eaa66406`); PR 1168 done (merged `1a630821`, #632 closed); `orbit-api` PR 594 done (merged `3c49e9ad`, deployed, mixed reminder habits 1 to 0 with the habit keeping its local times, recorded on #740); PR 1172 carried above; `#745` carried above; worktree `ticket-757-codex-no-apps` superseded (nothing depends on it; delete it at teardown).
- Its step 1, `/android-release`: carried as step 1 (PR 594 is deployed; PR 1172 remains).
- Its steps 2 and 3: carried as steps 2 and 3.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes, dates or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
