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

## 4. What sleep mode changes

**Worker parallelism rises.** The two-worker cap exists because Thomas is at the keyboard. He is not,
so D81's unattended limit applies. Run at most 5. Subprocess exhaustion has been measured at 6 and
above, so 5 is the ceiling, not 8.

**Nothing else gets looser.** Every rule below still binds.

## 5. Hard stops, which sleep mode never relaxes

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

## 6. Choose the next work in this order

1. Unblock what is already in flight. Answer every open review thread. Fix what the review found.
2. Merge what is genuinely ready: green at the current head, a fresh approval, and zero unresolved
   threads. Bookkeeping never blocks a merge.
3. Take open tickets that need no conversation. Prefer `needs:no-conversation`, a `Bug`, or a
   `harness` label. Read the ticket body as the prompt.
4. Fix the defects your own review turns up, and file what does not belong in the pull request
   you are in.
5. If nothing is ready, improve the gates that failed to catch tonight's defects. That is real work,
   not filler.

**Never invent work to look busy, and never widen a pull request to fill time.**

## 7. When something blocks

A blocked item is not a reason to stop the session. Log it, leave the tree in a state Thomas can read,
and take the next item.

Write blocked items under a `## Blocked, needs Thomas` heading in the same log, so the wake report can
lift them straight out.

## 8. Watch the allowance

Codex usage meters on a rolling five hour window plus a weekly cap, shared across every surface, and
the worker model spends it faster than the previous one. If workers start failing for quota rather
than for code, stop spawning them, log it, and switch to work you can do without a worker.

## 9. The wake report

He will say stop. Re-read the log file first, then answer in two parts and nothing else.

**Part one, every decision.** A numbered table: the decision, what you chose, and the one line of
evidence under it. Include the ones you got wrong and corrected, and say so plainly.

**Part two, what shipped.** Group it:

- Merged, with pull request numbers and what each one changed.
- Open, with the exact state and what it waits on.
- Tickets filed, with why each one is not in a pull request.
- Blocked, needing him, lifted from the log.

Then one honest paragraph: what is better than when he went to sleep, and what you would not defend.
