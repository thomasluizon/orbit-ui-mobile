---
name: execute
description: Orchestrate ONE issue from number to PR by chaining the existing pipeline — /prime (context load only) → grill-me → /plan → [HARD GATE: user approves the plan] → /implement — with a blocking confirmation gate at every stage boundary. Nothing auto-advances; nothing implements without explicit approval. Use when the user wants to take a single issue end-to-end with checkpoints they control.
argument-hint: <issue-number>
---

# Execute: issue → prime → grill → plan → implement (gated)

A thin conductor over the PIV control loop. It invokes the commands and skill that
already exist and inserts a hard, blocking gate at every stage boundary. It writes
no new logic and re-implements nothing — `/prime`, `grill-me`, `/plan`, and
`/implement` own their own behavior. Reference them by name; never restate how they
work.

**The control loop:**

```
/prime <issue>  →  [GATE 1]  →  grill-me  →  [GATE 2]  →  /plan <issue>  →  [GATE 3]  →  /implement <plan-path>
 (load only)                  (questions)                 (writes plan)    (approve)     (owns its own push gate)
```

## Inputs & mode

**Input**: `$ARGUMENTS` — a single issue number (`123` or `#123`).

Parse `$ARGUMENTS` and count numeric tokens (split on whitespace OR commas, mirroring
`/prime`'s mode detection):

| Numeric tokens | Action |
|---|---|
| 0 | Ask the user for an issue number. Do nothing else until you have one. |
| 1 | Proceed with the single-issue control loop below. |
| ≥ 2 | **STOP.** `/execute` is single-issue only. Tell the user to run `/prime <N1> <N2> …` for the parallel multi-issue worktree flow (`/prime`, `/plan`, and `/implement` all carry their own multi-issue modes). Do not start the loop. |

`/execute` targets ONE issue in `thomasluizon/orbit-ui-mobile`.

## Stage 1 — PRIME (context load only)

Run `/prime <issue>` in single-issue mode. Wait for its context summary and stop
there. `/prime` is load-only: it loads both repos, the issue, conventions, and recent
state, and ends at its own "Suggested next step: `/plan …`". It never plans, never
edits files, never implements. Do NOT carry past `/prime`'s output into any work —
the only path forward is GATE 1. This is the standing rule from
`feedback_prime_loads_context_only.md`: priming loads context, full stop.

Then present **GATE 1**.

## Stage 2 — GRILL (clarifying questions)

Once GATE 1 returns `proceed`, invoke the `grill-me` skill against the primed issue
context. Use it to resolve the open questions and risks `/prime` surfaced and any
ambiguity in the acceptance criteria. `grill-me` owns the mechanics (one question at a
time; `Question / Recommended answer / Why it matters`; no code during grilling). Do
not re-describe grilling here and do not write code while grilling.

The user exits the grill loop explicitly. That exit is **GATE 2**.

## Stage 3 — PLAN

Once GATE 2 returns `proceed`, run `/plan <issue>` in single-plan mode, folding in the
decisions resolved during grilling. The single-issue plan lands at
`.claude/plans/issue-<N>.plan.md`. Capture that exact path — Stage 4 needs it.

`/plan` ends at its own passive "Next Step: Review the plan, then `/implement …`".
`/execute` replaces that suggestion with the active, blocking **GATE 3**.

## Stage 4 — IMPLEMENT (only after the hard plan gate)

Reachable ONLY through an explicit `approve` at GATE 3. Run
`/implement .claude/plans/issue-<N>.plan.md` (path-based mode) with the path captured
in Stage 3.

`/implement` owns its OWN downstream confirmation: it asks the user to confirm before
pushing and opening the PR (its Phase 7). `/execute` does NOT re-add or fight that
gate — `/execute` owns the gates up to and including the pre-implement approval, then
delegates the push/PR checkpoint to `/implement`.

## Gates (the core of this skill)

Every stage boundary is a HARD, blocking confirmation. Default-deny: on no response or
an ambiguous response, do nothing — restate the gate and wait. Never auto-advance.

### GATE 1 — after PRIME, before GRILL

Show the `/prime` summary: issue title / labels / parity flag, acceptance criteria,
open questions / risks, and current branches.

| Response | Effect |
|---|---|
| `proceed` | Start grilling (Stage 2). |
| `edit <note>` / `clarify <note>` | Fold the note into grilling, then start Stage 2. |
| `abort` | Stop. Report that nothing past priming ran. |

### GATE 2 — after GRILL, before PLAN

Show the resolved decisions and answers from grilling.

| Response | Effect |
|---|---|
| `proceed` | Run `/plan` (Stage 3). |
| `more` | Keep grilling (back to Stage 2). |
| `abort` | Stop. |

### GATE 3 — after PLAN, before IMPLEMENT (the critical gate)

Show the plan path plus the plan's **Summary**, **Files to Change**, and **Tasks**.

| Response | Effect |
|---|---|
| `approve` | Run `/implement <plan-path>` (Stage 4). |
| `revise <feedback>` | Re-run `/plan` with the feedback. Loop back to GATE 3. Do NOT implement. |
| `abort` | Stop. |

**NOTHING is implemented without an explicit `approve` here.** No response, a question,
or anything other than `approve` keeps the loop at the plan — it never falls through to
`/implement`.

### Final checkpoint (not owned here)

The push/PR confirmation inside `/implement` (its Phase 7) remains the final gate and
is intentionally NOT duplicated by `/execute`.

## Output / suggested next step

- **On normal completion:** defer to `/implement`'s own final output (branches + PR
  URLs from its Phase 9). Do not re-summarize the implementation.
- **On abort at any gate:** state which stage it stopped at and how to resume — re-run
  `/execute <issue>`, or jump straight to the next command in the loop (`/prime`,
  `grill-me`, `/plan`, or `/implement .claude/plans/issue-<N>.plan.md`) to continue
  from that point.
