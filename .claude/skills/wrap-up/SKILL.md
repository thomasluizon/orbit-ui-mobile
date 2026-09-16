---
name: wrap-up
description: Close a working session in one command. Runs /progress, then /questions, then /handoff, in that order, and stops. Use when Thomas says /wrap-up, wrap up, close out the session, or is about to stop for the day. Pass --sleep to hand --sleep to /handoff so the run continues unattended instead of waiting for a person. It runs three skills; it never does the work they surface.
argument-hint: "[--sleep] [extra instructions for the NEXT session]"
effort: medium
---

# /wrap-up

Three skills, in this order, in one turn:

1. `/progress`
2. `/questions`
3. `/handoff`

**Input**: `$ARGUMENTS`. `--sleep` anywhere in it is passed through to `/handoff` and to nothing
else. Everything else is extra instructions for the NEXT session, and it is passed to `/handoff`
too, verbatim. `/progress` and `/questions` take no arguments from here.

## The order is the point

Each step feeds the next, which is why this exists as one command instead of three.

- **`/progress` first** establishes what is actually true right now, read from live git and ticket
  state rather than from what this session remembers doing. Everything after it is written against
  that, so a session that drifted cannot hand off a story instead of a state.
- **`/questions` second**, because the progress pass is what exposes the open decisions. Every
  question it raises is either answered from the code, the ticket, the brain or a search, or it goes
  to Thomas through `AskUserQuestion` with a recommendation. **Do not start `/handoff` until every
  surviving question has his answer.** A handoff that carries an unanswered question hands the
  blocker forward instead of clearing it, and he is right here.
- **`/handoff` last**, so the spec it writes carries his fresh answers rather than the questions.

Run each one by invoking the skill, not by improvising its behaviour. Each has its own contract and
this skill does not override any of it.

## What this skill never does

The work. Not the thing `/progress` reports as half built, not the thing `/questions` just got an
answer about, and nothing `$ARGUMENTS` describes. All of it goes into the handoff.

**`/handoff` is the end of the session, and so is this.** That rule lives in
`.claude/skills/handoff/SKILL.md` and it binds here identically: once step 3 has committed, anything
Thomas asks goes into `.claude/handoffs/NEXT.md`, not into the tree. The only exception is his
explicit "do this now, then hand off".

Under `--sleep` the run does continue, in this session, exactly as the handoff skill's own `--sleep`
section describes. That is the one case where work follows a wrap-up.

## Stopping early

If `/questions` surfaces nothing and `/progress` finds nothing moved, still run `/handoff`. A short
session is still a session, and the next one needs the state.

If Thomas answers a question in a way that removes a whole effort, say so in the progress line and
let `/handoff` record the removal in that effort's spec. Do not act on it.

## Reply

Do not narrate the three steps as they run. `/progress` produces its own answer, `/questions` asks
its own questions, and `/handoff` ends with its own one line: the `NEXT.md` path and its branch.
That last line is the end of the reply. Nothing after it.
