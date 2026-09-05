---
name: sleep
description: Thomas goes to sleep and the session keeps working alone. Take every decision yourself, always the best approach and never the easiest, write each decision to a log, and keep shipping until he says stop. On stop, report every decision and everything that shipped. Use when he says /sleep, I am going to sleep, keep working while I sleep, or good night.
argument-hint: [optional focus, for example "finish 814 then groundwork tickets"]
---

# Sleep mode

**At a glance:** Thomas is asleep. Nobody answers a question tonight. You decide, you record, you
keep working, and you account for all of it when he wakes.

Sleep mode does not lower the bar. It raises it, because the reviewer who normally catches a bad
call is unconscious.

## 1. Open the log before you do anything else

Write the decision log to `sleep-decisions.md` in this session's scratchpad directory, the one named
in your system prompt. Keep it outside every repository, so no gate and no commit ever sees it.

Start it with the wake time, the head of `redesign/main`, and every open pull request with its state.
That header is what tells you later what changed while he slept.

**Append to the log the moment a decision is made, never in a batch at the end.** Context gets
summarized on a long run. The file survives that; your memory of it does not. Re-read the file before
you write the wake report.

One entry per decision, in this shape:

    ## D<n> HH:MM  <one line, what you decided>
    Options:  <the real alternatives, including the easy one you rejected>
    Chose:    <what you did>
    Because:  <the evidence, with file:line, a command output, or a named authority>
    Cost:     <what this gives up, or "nothing found">
    Reversible: yes | no, and how to undo it

## 2. What counts as a decision

Log a choice when a reasonable person could have chosen otherwise. That includes:

- Which work to start next, and what you left alone.
- Any judgement about scope: what belongs in a pull request and what becomes a ticket.
- Any merge, and the evidence you had at the moment you merged.
- Any time you disagreed with a review, a lane, a subagent, or a previous session.
- Any time you deferred something to Thomas instead of guessing.

Do not log routine tool calls, greps, or reads. A log nobody can finish reading is not a record.

## 3. The bar: the best approach, never the easiest

This is the whole point of the mode. When two paths differ in cost and quality, take the better one
and write down what the cheaper one would have cost.

Concretely, in this repository that means:

- Fix the cause, not the symptom. A red check that goes green by relaxing the check is not a fix.
- Never write a test whose case source cannot see what the test is meant to catch. Prove a new guard
  by breaking the thing it guards, then restoring it.
- Never leave a partial screen, a dead export, or a suppression you added to get past a gate.
- Confirm an external interface against the real response or the installed source. An npm `overrides`
  entry is not a dependency declaration, and importable is not declared.

## 4. Keep a live wake source, or the night ends silently

**This is the mechanism that makes the mode work at all.** Nothing continues an unattended session
except a background task finishing and re-invoking it. A turn that ends with no live task ends the
night, and what it leaves behind looks exactly like a run that finished, so nobody goes looking.
That is how 2026-08-06 ended.

`.claude/hooks/require-wake-source.mjs` refuses a stop that would do this, but it arms only when the
run record says so. Write the record when you enter sleep mode, in the checkout you orchestrate from:

    node -e "import('./tools/lib/run-state.mjs').then(m=>m.writeRunState({sessionId:process.argv[1],sleep:true,remaining:process.argv.slice(2)}))" <sessionId> <ticket> <ticket>

Keep `remaining` honest as work lands, and clear `sleep` when Thomas says stop. `launch-worker.mjs`
registers itself as a wake source, so a running worker is real evidence rather than a claim.

**When nothing is left to wait on and work remains, start the next item.** Free slots plus a
non-empty queue is not a reason to end the turn. It is the definition of the next action.

## 5. What sleep mode changes

**Worker parallelism rises, and this session holds it at 5.**

D81 sets the attended cap at 2 and permits 8 for an unattended run. 8 is D81's number, not this
file's. Hold at 5 anyway: the machine has 8 cores, the orchestrator needs one, and subprocess
exhaustion was observed at 6 and above on 2026-09-02.

Treat 5 as an operating choice for the night, not as an amendment to D81. Amending a decision record
is Thomas's, so raise it with him rather than editing `orchestrate/SKILL.md` overnight.

**Nothing else gets looser.** Every rule below still binds.

## 6. Hard stops, which sleep mode never relaxes

Stop and log instead of acting, every time:

1. **Never merge to `main`.** Every UI pull request targets `redesign/main` until the redesign ships.
2. **Never `--admin`, never force push, never rewrite pushed history, never `--no-verify`.**
3. **Never `--delete-branch` on a branch another pull request is stacked on.** Retarget first.
4. **Never touch anything a real person sees tonight.** No Play Console release, no production
   deploy, no production database write, no email, no public post, no external message.
5. **Never delete a worktree or branch that holds work nobody merged.**
6. **Never run the D76 screen loop.** Steps 1 to 4 need Thomas in conversation. A screen built with
   no conversation behind it is out of contract, and that exact violation caused the rebuild wave of
   2026-09-02. Groundwork tickets are fine. Screens are not.
7. **Never decide a product or taste question.** Copy, pricing, positioning, brand, and design
   direction are his. Take the reversible path, which is usually leaving the current behaviour alone,
   log it as blocked, and move on to other work.

Rule 7 has teeth. On 2026-09-04 a worker rewrote a conversion headline in two locales so that its own
new guard would pass. The guard was wrong, the copy was right, and no gate caught it.

## 7. What may merge overnight, and what may not

The standing authority Thomas gave is narrow, and it is not a licence to merge anything green.

**A groundwork pull request may merge.** Harness, tooling, gates, configuration and documentation.
The bar is all three of: green at the current head, a fresh Pullfrog approval at that same head, and
zero unresolved threads. Bookkeeping never blocks it. Never `--admin`, never to `main`.

**A screen pull request may NOT merge overnight, however green it is.** D76 step 7 makes Thomas's
eyes the evidence and step 8 makes his approval the gate. A screen that CI likes is not a screen he
has seen. Leave it READY, say so in the wake report, and let him look.

If you cannot tell which kind a pull request is, it is a screen. Leave it.

## 8. Choose the next work in this order

1. Unblock what is already in flight. Answer every open review thread. Fix what the review found.
2. Merge what section 7 permits, and only that.
3. Take open tickets that need no conversation. Prefer `needs:no-conversation`, a `Bug`, or a
   `harness` label. Read the ticket body as the prompt.
4. Fix the defects your own review turns up, and file what does not belong in the pull request
   you are in.
5. If nothing is ready, improve the gates that failed to catch tonight's defects. That is real work,
   not filler.

**Never invent work to look busy, and never widen a pull request to fill time.**

## 9. When something blocks

A blocked item is not a reason to stop the session. Log it, leave the tree in a state Thomas can read,
and take the next item.

Write blocked items under a `## Blocked, needs Thomas` heading in the same log, so the wake report can
lift them straight out.

## 10. Watch the allowance

Codex usage meters on a rolling five hour window plus a weekly cap, shared across every surface, and
the worker model spends it faster than the previous one. If workers start failing for quota rather
than for code, stop spawning them, log it, and switch to work you can do without a worker.

## 11. The wake report

He will say stop. Re-read the log file first, then answer in two parts and nothing else.

**Part one, every decision.** A numbered table: the decision, what you chose, and the one line of
evidence under it. Include the ones you got wrong and corrected, and say so plainly.

**Part two, what shipped.** Group it:

- Merged, with pull request numbers and what each one changed.
- Open, with the exact state and what it waits on.
- Tickets filed, with why each one is not in a pull request.
- Blocked, needing him, lifted from the log.

Then one honest paragraph: what is better than when he went to sleep, and what you would not defend.
