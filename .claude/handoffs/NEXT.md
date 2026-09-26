# NEXT

Read `.claude/specs/orbit-prod-release.md` before acting. Enter through `/sleep`; it runs `/orchestrate` itself. Nobody is awake to answer: take every decision with the best approach and log it in the session scratchpad.

## Goal

Finish the spec: a production release with an empty ticket board and the whole-redesign approval. The run ends only when the spec is done or for an external cause (allowance exhausted, machine stopped, owner says stop). Check what is left with `gh issue list --repo thomasluizon/orbit-tickets --state open --limit 400`. At handoff time the board had 144 open tickets, all 144 placed in the spec's `## The order` (0 unplaced, 0 placed twice).

## In flight (verify each first; every identifier here is a lead)

| item | disposition |
|---|---|
| `orbit-ui-mobile` PR 1172 (`#216`, base `main`) | review fix `e90c5fe4` committed in the ticket worktree, not pushed: merge its report into the body (copy approval table included), resolve the three threads, merge `main`, push, drive to merge |
| `orbit-ui-mobile` PR 1171 (`#556` sync) | review fix commits in the ticket worktree, not pushed (head `1d8998a5`): merge the report into the body, resolve the Expo interface thread, push, drive to merge |
| `orbit-ui-mobile` PR 1170 (`#24` Stage 3 part 1) | review fixes pushed at `632883d2`; merging `redesign/main` conflicts in both `block-frame.tsx` files and `sonar-project.properties`: launch a worker to merge and re-verify, then drive to merge |
| `orbit-ui-mobile` PR 1168 (`#632`) | approved and green at `40b10b32` but conflicts with `redesign/main`: merge the base, test, push, merge after a fresh approval |
| `orbit-api` PR 595 (`#751`) | review fix pushed at `16a49fbd`; CI and review pending: drive to merge |
| `orbit-api` PR 594 (`#740`) | delivered at `ef8125ab`; CI and first review pending. Before merge, re-count live mixed reminder habits (1 at handoff); after deploy it must be 0 and that habit keeps its local time |
| `#745` | merged; record the Supavisor 24-hour `Connection authenticated` count after its deploy on the ticket (before: 5,092), then close it |
| Egress measurement | compare `pg_stat_statements` per-shape calls and rows against the pre-deploy snapshot recorded on `#742`, and record remaining egress per active user in the spec's `## Current state` |
| Running workers, stashes | none running at handoff; no stashes in the three primary checkouts; landing has no open pull requests |

## Then, in order

1. Once PR 1172, PR 595 and PR 594 merge and deploy, run `/android-release` to the open track (owner approved): 1.3.35 is the first build without AdMob. After it is live, update Play Console Data safety (remove the advertising ID and ads declarations) through `claude-in-chrome`.
2. File one harness ticket: remove the Supabase connector from the Codex worker environment, because a worker ran SQL against the production project through it.
3. The spec's `## The order`: the rest of Batch E, Batch 0b, Batch 0c, Batch 1, then STOP at THE REDESIGN GATE (a closed Play internal build for the owner; never merge `redesign/main` to `main`).
4. Owner decisions already taken, recorded on the tickets: `#740` extends the relative reminder model (paired editor ticket `#752`); `#297` uses real-time push; ads are deleted everywhere (`#200` removes the backend); copy is written and approved by the run through `BRAND.md`, the brain, `/humanizer` and `/second-opinion`; browser steps are the run's, through the `claude-in-chrome` skill.

## Carried

Keep a timed decision log in the session scratchpad outside the repository, and track what still needs the owner in the spec's `## Current state` without quotes, dates or attribution. Every identifier in this prompt came from a previous session: treat each as a lead to verify.
