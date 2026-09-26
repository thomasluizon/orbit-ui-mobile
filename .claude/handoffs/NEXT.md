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

Done: the API half (#742 to #745, merged on `main`). Not done: the app half, which was never measured or ticketed. Both clients fetch every 200-item Today page on each refresh (`packages/shared/src/utils/habit-list-pagination-core.ts:7-9`), refetch habits on every window focus with a 30-second stale time (`apps/*/hooks/use-habit-queries.ts`), and poll notifications every 5 minutes (`NOTIFICATIONS_REFETCH_INTERVAL` in `packages/shared/src/query/options.ts`). Measure the request volume these cause after the API fixes deploy, then ticket and fix what the product does not need. Egress fixes go to `main`; `redesign/main` is synced from `main`.

## In flight (verify each first)

| item | disposition |
|---|---|
| `orbit-ui-mobile` PR 1172 (`#216`, base `main`) | review fix `e90c5fe4` committed in the ticket worktree, not pushed: merge its report into the body (with the approved copy table), resolve the three threads, merge `main`, push, drive to merge |
| `orbit-ui-mobile` PR 1171 (`#556` sync) | review fix commits in the ticket worktree, not pushed (head `1d8998a5`): merge the report into the body, resolve the Expo interface thread, push, drive to merge |
| `orbit-ui-mobile` PR 1170 (`#24` Stage 3 part 1) | review fixes pushed at `632883d2`; merging `redesign/main` conflicts in both `block-frame.tsx` files and `sonar-project.properties`: launch a worker to merge and re-verify, then drive to merge |
| `orbit-ui-mobile` PR 1168 (`#632`) | approved and green at `40b10b32` but conflicts with `redesign/main`: merge the base, test, push, merge after a fresh approval |
| `orbit-api` PR 595 (`#751`) | review fix pushed at `16a49fbd`; CI finished after the handoff, result unread: read it and drive to merge |
| `orbit-api` PR 594 (`#740`) | delivered at `ef8125ab`; CI finished after the handoff, result unread. Before merge, re-count live mixed reminder habits (1 at handoff); after deploy it must be 0 and that habit keeps its local time |
| `#745` | merged; record the Supavisor 24-hour `Connection authenticated` count after its deploy on the ticket (before: 5,092), then close it |
| Egress measurement | compare `pg_stat_statements` per-shape calls and rows against the pre-deploy snapshot recorded on `#742`, and record remaining egress per active user in the spec's `## Current state` |
| Running workers, stashes | none running at handoff; no stashes in the three primary checkouts; landing has no open pull requests |

## Then, in order

1. Once PR 1172, PR 595 and PR 594 merge and deploy, run `/android-release` to the open track: 1.3.35 is the first build without AdMob. After it is live, update Play Console Data safety (remove the advertising ID and ads declarations) through the `claude-in-chrome` skill.
2. File one harness ticket: remove the Supabase connector from the Codex worker environment, because a worker ran SQL against the production project through it.
3. The spec's `## The order`: the rest of Batch E, Batch 0b, Batch 0c, Batch 1, then STOP at THE REDESIGN GATE (a closed Play internal build for the owner; never merge `redesign/main` to `main`).
4. Owner decisions already taken, recorded on the tickets: `#740` extends the relative reminder model (paired editor ticket `#752`); `#297` uses real-time push; ads are deleted everywhere (`#200` removes the backend); copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`; console and dashboard steps are the run's, through the `claude-in-chrome` skill.

## Previous prompt, disposition

- Its opening, goal, egress priority and `## Carried` instructions: carried above in its words.
- Its in-flight rows, done: `orbit-api` PR 587 merged `105245c6`; `orbit-ui-mobile` PR 1161 merged `345d62be`; PR 1160 merged `cb834210`; `orbit-api` PR 586 merged `159e757f`; PR 1162 merged `2b055c38`; PR 1163 merged `ccf3c373`; PR 1164 merged `8023c269`; PR 1165 merged `572c4f08`; PR 1166 merged `be00581a`; `orbit-api` PR 588 merged `3e39abcb`; `#681` merged as PR 1167 `62d48a0f`. `#632` is carried as PR 1168.
- Its step 1, `/android-release`: done, 1.3.34 (93) reached the open track (run `36254399981`); the next release is step 1 above.
- Its steps 2 and 3: carried as steps 3 and 4 above; `#741` closed as `#199`'s duplicate and `#199` merged `166be68c`.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes, dates or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
