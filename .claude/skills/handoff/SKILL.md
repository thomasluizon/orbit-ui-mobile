---
name: handoff
description: Turn the current session into one prompt a fresh session can run to continue the work. Carries context by POINTING at the ADRs, docs, tickets and drawings that already hold it, and inlines only what this session established that is written nowhere else. Use at the end of a working session, when context is running out, or when the user says /handoff, hand this off, continue this in a new session. It writes a prompt; it never does the work the prompt describes.
argument-hint: "[extra instructions for the NEXT session]"
effort: high
---

# /handoff: carry the work into a fresh session

**Input**: $ARGUMENTS. Empty means "continue what this session was doing". Anything else is **extra
work for the NEXT session**, appended to the prompt you produce. **You never do that work now.**
`/handoff refine the Perfil screen` writes a prompt that continues the plan AND refines Perfil; it
does not refine Perfil.

## Why this exists, and the one failure it prevents

A handoff prompt written from memory goes stale between the writing and the reading. The 2026-08-22
redesign session opened with a handoff carrying six confident facts: the board size, how many tickets
had a wrong Status, that `#36` needed a label, that `#316` to `#321` were all open, that a board view
needed recreating, and that Wrapped was blocked on a Pro gate. **Every one of the six was wrong by the
time it was read.** The session cost real time proving that.

So the prompt you write has two jobs and they pull against each other: carry enough that the next
session is not starting cold, and carry nothing it should be checking for itself. Resolve it the same
way every time: **point at the durable source, state the delta, and mark every identifier as a lead.**

## What a good handoff prompt is made of

**1. Pointers, which carry the bulk.** The context mostly already lives somewhere durable. Name the
source and let the next session read it. In this repo the homes are:

| context | where it lives |
|---|---|
| a decision and its reasoning | the ADR in the brain vault, `2 Areas/20-29 Orbit Engineering/Decisions/` |
| what is live right now | `hot.md`, auto-loaded, so name the section rather than quoting it |
| the work itself | GitHub tickets in `thomasluizon/orbit-tickets`, board 2 |
| what a surface should look like | `DESIGN.md`, and the canvas document in the Claude Design project |
| audience, positioning, copy | `BRAND.md` |
| the shape of the code | `architecture.json`, read instead of exploring |
| how a run went | the run log the activity keeps, such as `design/prompts/screens.md` |
| a published page | its artifact URL |

Cite precisely: an ADR by its title, a document by its path, a ticket by its number, a canvas document
by its name and project id. A pointer the next session cannot resolve is worse than no pointer.

**2. The delta, which is the part only you have.** Whatever this session established that is written
in no durable place: a decision the user made in conversation, a claim that failed checking, a defect
found and not yet filed, a number re-derived live. This is the whole reason the prompt exists, so it
goes in full, with its evidence.

**When the delta is large, the honest move is to file it rather than carry it.** A decision belongs in
an ADR, a defect belongs in a ticket, a state change belongs in `hot.md`. Say so plainly and offer to
file it first, so the next prompt can point at it instead of restating it. A fact that lives only in a
handoff prompt is one paste away from being lost.

**3. The task, stated as work rather than as history.** What to do next, in the order it has to happen.
Then `$ARGUMENTS`, if the user gave any, as its own clearly separated section.

## Steps

**A. Work out what the session was actually doing.** Not what it talked about: what it was moving
toward, what it finished, and where it stopped. If the session was long enough to be compacted, treat
your own recall as a draft and check it against the durable trail: the scratchpad, `git log`, the
tickets touched, the files changed. Read rather than remember.

**B. Re-derive the live state instead of asserting it.** Anything the next session will act on gets
checked now, in this run, and goes into the prompt with the command that produced it so the next
session can re-run it. A count, a ticket state, a branch, a gate: check it. Where checking is expensive
or slow, write the command into the prompt instead of the answer.

**C. Separate what is settled from what is open.** Settled decisions travel as pointers and are not
reopened. Open questions travel as questions, each with the reason it is still open and who has to
answer it. A question the next session cannot tell from a decision will get decided by accident.

**D. Write the prompt.** Address the next session directly, in the second person, as a work order.
Lead with the job in one or two sentences, then Read first, then state, then the delta, then what to
do, then the extra instructions. Match the house voice: plain words, short sentences, no em dash and
no en dash anywhere.

Put this near the top of every prompt you write, in your own words:

> Every identifier below came from a previous session. Treat each as a lead to verify, not a fact.

**E. Hand it over.** Save it under the session scratchpad so it survives the turn, print it in one
fenced block so it can be copied whole, and say in one line what you deliberately left out and why.

## What this skill does not do

It writes a prompt and nothing else. No code, no tickets, no commits, no board writes, and none of the
work described by `$ARGUMENTS`. If the session left something half done, the prompt says so; it does
not finish it on the way past.

The one exception is filing the delta somewhere durable when the user agrees to it, because that makes
the prompt shorter and the context permanent. Ask first, then use the normal route for that kind of
fact: `/brain-decide` for a decision, `/ticket` for work, `/brain` for a durable note.
