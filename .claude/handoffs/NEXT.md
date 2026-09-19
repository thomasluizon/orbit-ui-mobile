# NEXT

**Read `.claude/specs/orbit-prod-release.md` first.** It is the living spec for this effort and it
was rebuilt on 2026-09-19: the batch order now covers all 103 open tickets, every one placed in
exactly one batch, and it ends with a section on what the night of 2026-09-18 into 09-19 taught.

This session started cold. Nothing is running, no worker exists, and the machine was powered off
between then and now.

## The task

Finish `.claude/specs/orbit-prod-release.md`: an empty board and a production release. **Re-derive
what is left rather than trusting any list here**, because a ticket that reads blocked or fixed is a
lead and not a fact.

## The operating contract

Enter through `/orchestrate`. **Codex is out until 2026-09-22**, so the worker is Claude headless
through `node tools/launch-worker.mjs`, which is the only path, and whose LAUNCHER pid is the wake
source rather than the worker's. **Never use a Claude subagent as a worker.** A subagent IS the right
tool for a review, pointed at the worktree carrying the exact head.

**One worker at a time on this machine.** Two plus review subagents exhausted it on 2026-09-19 and
the low-memory guard reaped both mid-round.

**A machine resource is never a reason to stop.** Use fewer workers and keep going. Only an exhausted
allowance, every batch finished, or Thomas saying stop is an ending. `require-wake-source.mjs` now
enforces this.

Every UI pull request targets `redesign/main`, which is unprotected. `design/canvas/` and `DESIGN.md`
under D42 stay authoritative, D95 keeps a broken gate out of the run it judges, and D103's redesign
gate stands: when every screen ticket is done, **stop** and ship a closed Play INTERNAL build for
Thomas rather than merging to `main`.

Take every decision yourself, always the best approach and never the easiest, and log each one.

## In flight, with a disposition for each

| What | State | Disposition |
|---|---|---|
| `ui#1029` (`#612`) | open at `a0f53299`, **P1** | Round 4 needed. Its own round 3 broke a cold load of `/step-up`: `useHeldAccountId` is null there because the route is not under `(app)`, so 13 tests fail with an empty body. **Do not fix by reverting to an unnamespaced key.** Six dirty files preserved in `ticket-612-web-overlays`. |
| `ui#1030` (`#615`) | open, round 2 delivered | Needs a re-review at its head. It took the `ReadInit` type narrowing, so a mutating call through the read function is now a compile error. |
| `ui#1033` (`#610`) | open at `db19b29b` | **Never reviewed at any head.** |
| `ui#1032` (`#586`) | **CLOSED unmerged** | Cancelled by Thomas. Branch `fix/ticket-586-widget-destination` left in place, 4 dirty files, deliberately. |
| `api#521` | **APPROVED** at `774f26b1` | Thomas merges and deploys by hand on or after 2026-09-22. |
| `api#534` (`#599`) | **APPROVED**, five rounds | Same. Round 5 was declared the last round there; do not open a sixth. |
| `api#528` (`#529`) | built, inert | Deploy, then flip `RequireApiKeyCreationStepUp` to `true` **only after `api#534` deploys**, and read the row back. |
| `api#531`, `api#533` | open | Reviews owed at their exact heads. |
| `.claude/orchestrator.json` | one uncommitted line | **Revert on 2026-09-22**, worker back to `codex`. |

## The tools gate has four known reds, and they are not defects

`node tools/test-tools.mjs` reports `FAILED (4)`, 1823 assertions, about nine minutes:

```
launch-worker.mjs: the default tier resolves gpt-5.6-sol at high reasoning effort
launch-worker.mjs: each tier reports itself and resolves a different argument vector
orchestrator-config.mjs: the shipped default implementer is gpt-5.6-sol at high reasoning effort
orchestrator-config.mjs: the shipped mechanical implementer keeps the model and lowers reasoning effort
```

All four pin `gpt-5.6-sol` as the shipped worker, and all four are red only because of the
uncommitted `"worker": "claude"` line in `.claude/orchestrator.json`, which exists while Codex is
out. **Reverting that line on 2026-09-22 should clear all four.** That was not driven to proof, so
confirm it rather than assuming it, and do not chase them as defects before you do.

Separately, `#627`'s `create-worktree` flake can add two more reds under load. It passes 9 of 9 under
`--only create-worktree`.

## Start here

1. **`#627`**, first in batch 0b. Two `create-worktree` cases use one number as both the kill
   deadline and the pass budget, so the tools gate throws a false red under load. Fixing it makes
   every other harness ticket verifiable.
2. **`ui#1029` round 4**, then **`ui#1030`'s re-review**, then **`ui#1033`'s first review**.
3. Then batch 0b proper, then 0c's live Android defects, then batch 1.

## The two worth knowing about before you touch anything

- **`#631`** is the most serious thing filed that night. `localStorage` keeps the last Google
  signer's Supabase session, `supabase.auth.signOut()` appears nowhere in `apps/web`, and the public
  `/auth-callback` accepts `INITIAL_SESSION`. So a later visit from history or a bookmark silently
  signs that browser back in as them. Verified on all three legs.
- **A pull request body squashes into history.** Five were blocked or corrected on 2026-09-19 for a
  false claim in one. Name the body as part of the deliverable in every order.

The full decision log for that night, 155 entries, is in that session's scratchpad at
`sleep-decisions.md`.
