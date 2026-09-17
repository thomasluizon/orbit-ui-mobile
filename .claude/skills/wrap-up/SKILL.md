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

## Every step ENDS THE TURN and waits for him to say proceed

This is the contract, not a style note. A step whose output Thomas never saw did not run, and a step
he never got to read before the next one started is the same failure one turn later.

**Each step is its own turn.** Print that step's output, then the handover line, then STOP. Do not
begin the next step in the same turn. The next step starts when he replies.

The handover line is the last line of the turn, exactly:

- End of step 1: `say proceed to go to /questions`
- End of step 2: `say proceed to go to /handoff`

Step 3 has no handover line. `/handoff` ends with its own last line and that is the end.

**Step 1 ends with the `/progress` answer printed to him, in the chat.** Not gathered, not used
internally to inform the handoff: printed, in the shape `/progress` defines. Then the step-1 handover
line. Then stop.

**Step 2 ends with either his answers or an explicit empty result.** If questions survive the filter,
they go to him through `AskUserQuestion` and the turn ends when they are answered. If none survive,
say so in one line and say what you filtered and why it closed. "No questions" that he never saw is
indistinguishable from never having looked. Then the step-2 handover line. Then stop.

**Step 3 starts only after he has said proceed to it.** If you find yourself writing the spec in the
same turn as the progress answer, stop and go back.

Under `--sleep` the gates still hold. `--sleep` changes what happens AFTER `/handoff`, never whether
he reads the first two steps. A `--sleep` run that writes the spec without showing him progress and
questions has skipped the two steps he asked for.

### This skill failed this way on the day it shipped

2026-09-16, its first run: the state was gathered, the questions were resolved internally, and the
handoff was already half written before Thomas said "you didnt run /progress, im not seeing your
summary ... you didn ask any questions ... and you are already doing the handoff?"

The cause was the old Reply section below, which said not to narrate the steps. That is correct about
narration and was read as "produce no output", which is the opposite of the point. Narrating is
saying "now running /progress". Output is the progress answer itself. Never confuse them.

## Reply

Do not narrate the steps: no "now running /progress", no "step 2 of 3". Their OUTPUT is the reply.

`/progress` prints its answer, then `say proceed to go to /questions`. `/questions` asks its
questions or states the empty result, then `say proceed to go to /handoff`. `/handoff` ends with its
own one line: the `NEXT.md` path and its branch. That last line is the end of the reply. Nothing
after it.

Each of the three keeps its own writing contract. Three short replies across three turns, not one
merged summary.
