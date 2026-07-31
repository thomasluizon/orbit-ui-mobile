---
name: watch
description: >-
  Answer "what is every child session doing right now" in one screen. Reads every Orca worktree
  in the Orbit repos via tools/worker-watch.mjs and reports, per worker: the Linear ticket, the
  branch, the ticket's Linear state, ALIVE, GONE or UNKNOWN liveness, and the delivery verdict
  worker-status.mjs decided. Read-only: it sends nothing to a worker and moves no
  ticket. Use when the question is "is that worker still working", "is anything stuck", "what
  are my workers doing", or "where does the fleet stand" during an /orchestrate run.
argument-hint: "[ui|api|landing] (default: every repo)"
effort: low
---

# Watch

The live view of the worker fleet. `/orchestrate` launches and merges; this only looks.

Thomas never runs `tools/` scripts by hand, so this skill is the ONLY supported way to ask the
question. Never answer it by handing over the `node` line.

## 1. Read the fleet

```bash
node tools/worker-watch.mjs
```

With a repo argument, scope it: `--repo ui|api|landing`. Add `--json` for the machine-readable
report. Those are the only flags; `--no-contract` and `--lines <n>` were deleted with the repaint
sampler.

Run it from the orbit-ui-mobile repo root. Every figure comes from one `worker-status.mjs` call
per worktree, which fetches the base, reads the pull request and reads Linear, so budget roughly
five seconds per worktree: measured at 4.9 s for one and 9.2 s for two. That is the cost of an
operator-invoked snapshot and it is deliberate, because the cheaper alternative is deriving
liveness locally, which is the defect this tool no longer has. Exit 0 means the report printed,
and that includes "no Orca worktrees": an empty fleet is a result, not a failure. Exit 2 means a
usage or config error, including a `--repo` whose configured path orca does not list as a
repository main worktree.

## 2. Read the two verdicts, which answer different questions

**ALIVE, GONE or UNKNOWN is LIVENESS**, and it is `worker-status.mjs`'s reading, not this tool's.
It resolves the launcher-written PID marker (`orbit-worker-pids.jsonl` in that worktree's git
directory) against the real process table. **UNKNOWN is neither alive nor gone: it is a state
nobody read**, and the row says why. A pid that answers alive but whose claim is older than the 16
hour reuse backstop reads UNKNOWN rather than ALIVE, because a recycled pid answering for a dead
worker is the same lie in the other direction. Liveness says whether the process exists. It says
nothing about whether the work is any good or even started.

**The DELIVERY verdict** is one of `DELIVERED`, `WORKING`, `STALLED`, `AWAITING-MERGE`, `IDLE` or
`UNKNOWN`, derived by `worker-status.mjs` from artifacts (commits above the fetched base, a clean
worktree, the branch pushed, and an open pull request). CHANGES_REQUESTED blocks.
No approval is required. If an approval exists, it must name the current head. Delivery also requires zero unresolved threads and every automated review item is reconciled, the issue In Review with its pull request
attached, and final screenshots plus critique when `visible-effect`.

| verdict | what it is |
|---|---|
| `DELIVERED` | the contract is met. Merge-side work is yours now |
| `WORKING` | the process is alive and the contract is not met yet. Leave it alone |
| `STALLED` | process GONE, PR open, and CHANGES_REQUESTED, a stale approval, or review work remains. **This costs a run** |
| `AWAITING-MERGE` | gone with review gates clear. Bookkeeping, not a relaunch |
| `IDLE` | no live worker and no open pull request. Nothing is wrong; the ticket is simply between pull requests |
| `UNKNOWN` | something on the path could not be read. Act on nothing and surface it |

`IDLE` and `STALLED` were one state until ORB-163 split them, and conflating them is expensive in
both directions: relaunching an IDLE ticket duplicates work, and reading a STALLED one as idle
loses a run. Headless workers take no mid-run turn, so the remedy for STALLED is always to update
the prompt file and relaunch, never to nudge.

## 3. Answer, then stop

Lead with the count and the exceptions, not with a table of everything that is fine.

```
4 workers: 3 ALIVE, 1 GONE
  ORB-88   GONE    STALLED: commits, pushed, pr-open
           -> died or finished early. Its unmet list is the relaunch prompt.
  ORB-90   ALIVE   WORKING  (12 commits)
  ...
```

Then stop. This skill decides nothing: what to do about a stalled worker is `/orchestrate`'s
judgement, and only `/orchestrate` may spend a relaunch allowance. A headless worker has no live
turn channel at all, so `tools/nudge-worker.mjs` refuses every invocation; the remedy is an updated
prompt file and a relaunch. Never move a Linear ticket from here, and never treat UNKNOWN as an
answer.
