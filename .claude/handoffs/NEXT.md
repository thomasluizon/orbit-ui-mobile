/sleep

Read `.claude/specs/orbit-prod-release.md` before anything else.

## Entry point

`/sleep` is the only entry point. It enters `/orchestrate --sleep` itself; do not start `/orchestrate` separately.

## Sleep

This is an unattended run. Nobody is awake to answer: never ask the owner, take every decision with the best approach, and log each one in the session scratchpad the moment it is made. Write the run state for this session with `sleep: true` first, keep a live registered wake source at the end of every turn, and keep going until the goal below is met or an external cause stops the run.

The owner's written authorization overrides the sleep skill's generic hard stops on `main` and on releases: merge to `main` every pull request that belongs there once its exact head has green checks, a Pullfrog approval of that head and zero unresolved threads (ordinary `gh pr merge --squash --match-head-commit`, never `--admin`); an `orbit-api` merge to `main` deploys; run `/android-release` to the open track when the Android fixes on `main` justify a build. Never merge `redesign/main` to `main`.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 144 open tickets, all 144 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## Priority: Supabase egress

The Supabase project hit its monthly egress quota. Find and fix every egress waste in the app and the API before other new work: N+1 patterns where the API makes a thousand calls instead of one bulk call, over-fetching (selecting or returning far more rows or columns than needed), unbounded list queries, polling, and anything else that moves more data than the product needs. The owner will upgrade the Supabase plan, but the app must be optimized first. Measure egress per query shape (`pg_stat_statements` through the Supabase connector, or the performance-measurement tooling), rank by bytes, and fix the biggest first with before and after evidence. The spec's `### Batch E: Supabase egress, first` holds the procedure.

Done: the API half (#742 to #745) and the notification poll (#759, merged). In flight: the habit list refetch fix (#758, PR 1176). Not done: the per-shape delta measurement. `pg_stat_statements` is cumulative, so take two snapshots of the top 60 shapes by rows an hour or more apart, rank the difference, map each still-growing shape to its code path, and ticket and fix what the product does not need. The largest cumulative shapes not yet checked for current growth: HabitLogs by `HabitId = ANY` with `Value >` and `Date >=` (queryid -2342874060490848411, about 2,770 rows per call), a Habits join HabitLogs by `UserId` with `Date >=` (-5386604327098026800), full-column `Users` reads (-1247698440644666107, -4050359370207136490), and `SentReminders` reads (-5581988026537845833). Egress fixes go to `main`; `redesign/main` is synced from `main`.

## In flight (verify each first)

| item | disposition |
|---|---|
| `orbit-ui-mobile` PR 1176 (`#758`, base `main`) | a review-batch worker was running at handoff (worktree `ticket-758-habit-refetch`, branch `fix/ticket-758-habit-refetch`), sent to drop the client-side cache reconciliation behind six Pullfrog P1s and SonarCloud's 43.8% new-code coverage, keeping the 5-minute freshness, stale-only reconnect and palette reuse. Outcome unknown: read the worktree and the newest `#758-*.log` in the launcher log directory first, then merge the report into the body, resolve the six threads, push |
| `orbit-ui-mobile` PR 1173 (handoff prompt gate, base `redesign/main`) | the three Pullfrog P1 fixes are one unpushed commit in worktree `handoff-prompt-gate-rd`, proven by break and restore; hooks harness exit 0 and `node tools/test-tools.mjs` exit 0 (2,409 assertions). Add the `UserPromptSubmit` payload evidence to the body (capture the full key set; the installed Claude Code binary builds `hook_event_name:"UserPromptSubmit",prompt:<text>` on the common hook fields), resolve the three threads, push, drive to merge first |
| `orbit-ui-mobile` PR 1172 (`#216`, base `main`) | pushed with `main` merged and all threads resolved; waiting on CI and a fresh Pullfrog approval; merge when ready |
| `orbit-ui-mobile` PR 1171 (`#556` sync) | pushed; checks green; needs a Pullfrog approval at its head; merge, then open the next sync carrying every `main` merge since (ads removal, the notification poll, the Codex worker isolation `1f121171`, and `#216` once merged) |
| `orbit-ui-mobile` PR 1170 (`#24` Stage 3 part 1) | base merge and review batch 2 pushed; two of three review-fix attempts used; waiting on CI and review |
| `orbit-ui-mobile` PR 1168 (`#632`) | `redesign/main` merged and pushed; checks green; needs a fresh Pullfrog approval |
| `orbit-api` PR 594 (`#740`) | review batches 1 and 2 pushed; two of three attempts used; waiting on CI and review. Before merge, re-count live mixed reminder habits (1 at handoff); after deploy it must be 0 and that habit keeps its local times |
| `#745` | record the Supavisor 24-hour `Connection authenticated` count after its deploy on the ticket (before: 5,092; the window closes about 16:34 UTC the day after the deploy), then close it |
| Worktree `ticket-757-codex-no-apps` | PR 1174 merged; its local branch `ticket-757-static-mcp-rejected` holds a rejected alternative (a static per-server MCP disable list) and may be deleted at teardown |
| Stashes, other repositories | no stashes in the three primary checkouts; landing has no open pull requests |

## Then, in order

1. Once PR 1172 and PR 594 merge and deploy, run `/android-release` to the open track: 1.3.35 is the first build without AdMob. After it is live, update Play Console Data safety (remove the advertising ID and ads declarations) through the `claude-in-chrome` skill.
2. The spec's `## The order`: the rest of Batch E, Batch 0b, Batch 0c, Batch 1, then STOP at THE REDESIGN GATE (a closed Play internal build for the owner; never merge `redesign/main` to `main`).
3. Owner decisions already taken, recorded on the tickets: `#740` extends the relative reminder model (paired editor ticket `#752`); `#297` uses real-time push; ads are deleted everywhere (`#200` removes the backend); copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`; console and dashboard steps are the run's, through the `claude-in-chrome` skill; every client egress waste is fixed, not only ticketed.

## Previous prompt, disposition

- Its opening, entry point, sleep authorization, goal, egress priority and `## Carried` instructions: carried above in its words, with the egress status updated.
- Its in-flight rows: `orbit-api` PR 595 done, merged `2d0831ca`. PRs 1172, 1171, 1170, 1168, 1173 and 594 carried above with their new state. `#745` and the egress measurement carried. Running workers and stashes re-inventoried above.
- Its step 1, `/android-release`: carried as step 1 above (PR 595 has merged; PR 1172 and PR 594 remain).
- Its step 2, the harness ticket for the Supabase connector in Codex workers: done, filed as `#757` and merged as PR 1174 (`1f121171`).
- Its steps 3 and 4: carried as steps 2 and 3 above.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes, dates or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
