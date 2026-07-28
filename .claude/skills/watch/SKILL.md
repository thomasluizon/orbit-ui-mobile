---
name: watch
description: >-
  Answer "what is every child session doing right now" in one screen. Reads every Orca worktree
  in the Orbit repos via tools/worker-watch.mjs and reports, per worker: the Linear ticket, the
  branch, the ticket's Linear state, BUSY or IDLE classified by repaint delta, the last
  meaningful output lines with TUI repaint noise stripped, and the worker-status.mjs contract
  verdict. Read-only: it sends nothing to a worker and moves no ticket. Use when the question is
  "is that worker still working", "is anything stuck", "what are my workers doing", or "where
  does the fleet stand" during an /orchestrate run.
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

With a repo argument, scope it: `--repo ui|api|landing`. Add `--no-contract` when the question
is purely "is it alive" and the wait for a fetch plus a `gh` call per worktree is not worth it;
add `--lines <n>` when the default eight output lines cut off the thing you are looking for.

Run it from the orbit-ui-mobile repo root. It samples liveness over 3 seconds, so it takes a few
seconds plus roughly a second per worktree for the contract verdict. Exit 0 means the report
printed, and that includes "no Orca worktrees" - an empty fleet is a result, not a failure.

## 2. Read the two verdicts, which answer different questions

**BUSY or IDLE is LIVENESS**, measured as repaint delta across two `orca terminal list` samples:
a running turn repaints its spinner continuously, an idle TUI emits nothing at all. It says
whether a turn is running. It says nothing about whether the work is any good or even started.

**CONTRACT MET or NOT MET is DELIVERY**, from `worker-status.mjs`, derived from artifacts
(commits above the fetched base, a clean worktree, the branch pushed, a PR open, the issue In
Review with its PR attached, final screenshots and the critique artifact when
`visible-effect`). This is the one that decides whether a ticket is done.

The pairs mean different things, and the diagnosis is in the combination:

| liveness | contract | what it is |
|---|---|---|
| BUSY | NOT MET | working. Leave it alone |
| IDLE | MET | finished. Merge-side work is yours now |
| IDLE | NOT MET | **stopped early**: it ended a turn on a question, hit a wall, or died. Read its last output lines, then decide |
| BUSY | MET | finishing up after the PR, or drifted past its contract. Read the output lines |

`IDLE + NOT MET` is the one that costs a run, because nobody is at that keyboard. The last
output lines in the report are usually enough to tell a question apart from a crash.

## 3. Answer, then stop

Lead with the count and the exceptions, not with a table of everything that is fine.

```
4 workers: 3 BUSY, 1 IDLE
  ORB-88   IDLE   NOT MET: commits, pushed, pr-open
           last output: "Which of these two approaches do you want?"
           -> stopped on a question. Its unmet list is the nudge.
  ORB-90   BUSY   NOT MET  (working, 12 commits)
  ...
```

Then stop. This skill decides nothing: what to send a stalled worker is `/orchestrate`'s
judgement, and the sanctioned way to send it is `tools/nudge-worker.mjs`, which refuses to
deliver into a busy TUI. Never send to a worker from here, never move a Linear ticket from here,
and never treat IDLE as done.
