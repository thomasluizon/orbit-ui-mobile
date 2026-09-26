---
name: sleep
description: Put /orchestrate in --sleep mode with a decision log; unattended continuation exists only through that orchestrator lifecycle. Take every decision yourself, always the best approach and never the easiest, write each decision to a log, and keep shipping until he says stop. On stop, report every decision and everything that shipped. Use when he says /sleep, I am going to sleep, keep working while I sleep, or good night.
argument-hint: [optional focus, for example "finish 814 then groundwork tickets"]
---

# Sleep mode

The timed decision log lives in this session's scratchpad outside every repository. Tracked specs,
prompts and lessons retain only current rules and state, without log entries or session IDs.

**At a glance:** the owner is asleep. Nobody answers a question tonight. You decide, you record, you
put the current `/orchestrate` run in `--sleep` mode or enter a new one, keep working through its
lifecycle, and account for it when he wakes.
This skill is an entry policy for that path, not a standalone continuation mechanism.

Sleep mode does not lower the bar. It raises it, because the reviewer who normally catches a bad
call is unconscious.

## 1. Open the log and enter the canonical orchestrator

Read the existing run record with `readRunState` before acting. Take the exact `sessionId`
from the parent directory of the system prompt's `scratchpad` path, never from the final
`scratchpad` component.

Your first action must write the run state through `writeRunState` with this session id and
`sleep: true`. Do this before queue work or log setup. A record with a different `sessionId` makes
the Stop guard inert until this write replaces it. Read the state back with `readRunState`, and
confirm the session id and `sleep: true` before the first turn ends.

If an `/orchestrate` run is active, change that run to `--sleep` in place. Do not enter the
orchestrator again, and do not plan the queue again. Keep its admitted `remaining` queue. Preserve
its repository-qualified `pullRequests` and append-only `readinessLedger`.

`writeRunState` in `tools/lib/run-state.mjs:66` unions the previous `pullRequests` and
`readinessLedger` forward only when the previous and new session ids match. If the write replaces a
different session id, pass every pull request that this session owns in the same call. Otherwise,
the write drops those ledger rows.

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

If no `/orchestrate` run is active, `/sleep` must enter `/orchestrate <scope> --sleep` in this
session. Read and execute `.claude/skills/orchestrate/SKILL.md`, including preflight and step 2b,
before you start queue work or end a turn. Use the supplied focus to select its scope. Without a
focus, use its `--auto` queue selection. Apply `--cloud --parallel` only when `cloud.enabled` is true
and only for the repository bound by `cloud.repositoryKey`. No command-line option overrides a false
flag. Do not run a separate loop from this document. If the runtime cannot execute
that lifecycle with a background task that re-invokes this session, report that unattended
continuation is unavailable. A decision log or a run record alone never establishes a working
sleep run.

## 2. What counts as a decision

Log a choice when a reasonable person could have chosen otherwise. That includes:

- Which work to start next, and what you left alone.
- Any judgement about scope: what belongs in a pull request and what becomes a ticket.
- Any merge, and the evidence you had at the moment you merged.
- Any time you disagreed with a review, a lane, a subagent, or a previous session.
- Any time you deferred something to the owner instead of guessing.

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
Keep a registered wake source until the queue is complete.

Follow `/orchestrate`'s "Every turn under `--sleep` ends with a live wake source, named" protocol:

- At step 2b, write canonical state through `writeRunState` in `tools/lib/run-state.mjs`, from the
  orchestrating checkout. Use this session's exact `sessionId`, `sleep: true`, and the admitted
  `remaining` queue. Read it back with `readRunState` to confirm it before the first wait. An old
  session's record is ignored by `rules-sleep.mjs`.
- Preserve repository-qualified `pullRequests` and the append-only `readinessLedger`, with actual
  receipt paths. Update state at step 9 as work lands. Never clear the ledger to claim completion.
- While actionable work or readiness debt remains, always leave a live background wake source
  that will re-invoke this session and name it on the turn's last line. Only
  `tools/launch-worker.mjs`, `tools/submit-cloud-worker.mjs --watch <receiptPath>`, and
  `tools/wait-ci.mjs --repo <key> --pr <n>` call `registerWakeSource`. These calls write
  `.git/orbit-wake-sources/<pid>.json`. A background shell command does not register a wake source,
  however long it runs. A background `npm install` is not a wake source. A remote Cloud task or a GitHub check by itself cannot
  wake this session.
- If a slot is free and admission permits new ticket work, launch the next worker.
  When work waits on CI or review, start `tools/wait-ci.mjs` in the background for those pull requests.
  Verify the wake source is live; a stale pid file or an unscheduled promise to watch CI is not one.
- When the owner says stop, clear `sleep` for this session and report. On queue exhaustion write
  `remaining: []` and retain the ledger. Finish only with READY receipts or recorded named blockers,
  following the canonical protocol; report blocked work as blocked.

The Stop hook is a guard against missing continuation, not a scheduler. Standalone `/sleep` has no
separate scheduler: its continuation promise applies only after the `/orchestrate --sleep` entry
above is complete.

## 5. Worker capacity follows D89

Read the current local cap from `caps.parallelTickets` in `.claude/orchestrator.json`.
Memory pressure may lower the active pool, but never ends the run.
`materialize-cloud-result.mjs` stays serial across the fleet, so Cloud delivery still runs one
ticket at a time. Sleep mode does not raise the pool. Memory pressure lowers it, and never ends a run.

Cloud implementations are unavailable while `cloud.enabled` is false. When enabled, they use
`caps.cloudParallelTasks`, currently **8**, and remain bound to `ui` by `cloud.repositoryKey`.
`orbit-api` and `orbit-landing-page` tickets stay local. These are the same caps used by
`/orchestrate` and `.claude/orchestrator.json`, as in #829's D89 operating contract.

## 6. Hard stops, which sleep mode never relaxes

Stop and log instead of acting, every time:

1. **Never merge to `main`.** Every UI pull request targets `redesign/main` until the redesign ships.
2. **Never `--admin`, never force push, never rewrite pushed history, never `--no-verify`.**
3. **Never `--delete-branch` on a branch another pull request is stacked on.** Retarget first.
4. **Never touch anything a real person sees tonight.** No Play Console release, no production
   deploy, no production database write, no email, no public post, no external message.
5. **Never delete a worktree or branch that holds work nobody merged.**
6. **Apply D90 for the remainder of the redesign.** D76 steps 3 and 7 and D88's per-screen hold
   are suspended, so screens may proceed without a conversation or eyes wait. The granted canvas,
   `DESIGN.md` under D42, the step 6 ui-skills sweep, Pullfrog and all gates still apply. D76 and
   D88's hold return when the redesign ships. Any unresolved product or design choice still blocks.
7. **Never decide a product or taste question.** Copy, pricing, positioning, brand, and design
   direction are his. Take the reversible path, which is usually leaving the current behaviour alone,
   log it as blocked, and move on to other work.

## 7. What may merge overnight, and what may not

**D88 authorizes groundwork merges without asking. D90 extends those same terms to
screens for the remainder of the redesign.** The per-screen merge hold is suspended during that
period, along with D76's conversation and eyes waits as specified in #829. D90 leaves product and
design authority with the owner and preserves the implementation requirements and gates.

Before each merge, require all three on the exact current head: green checks, fresh Pullfrog
approval at that head, and zero unresolved threads. Log the head and evidence. The orchestrator may
then use ordinary `gh pr merge --squash` against `redesign/main`, with `--match-head-commit <sha>`
to refuse a moved head. Implementation workers never merge.

**Never use `--admin` or a direct merge API in `/sleep`.** Admin merge remains confined to the
canonical `/merge-prs` skill after the owner explicitly invokes it for an already-approved frozen PR
set, per `CLAUDE.md`. Neither `/sleep` nor standing authority invokes that exception. Direct APIs
stay forbidden without exception, including `PUT /repos/{owner}/{repo}/pulls/{number}/merge` and
GraphQL `mergePullRequest`. Never merge to `main` from this run. Outside D88/D90 authority, leave
the PR ready for the owner; do not invent authorization from green checks.

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

**The admission gate stops new fronts.** `launch-worker.mjs` and `submit-cloud-worker.mjs` refuse
new ticket work above either configured open pull request or queued run cap. Existing pull request
branches remain eligible for review and salvage. Prefer driving what is open to mergeable.

## 8b. Generate one completion contract for the worker's mode

Use `tools/compose-prompt.mjs` for local orders. Only pass `--cloud` for Cloud orders after confirming
`.claude/orchestrator.json` has `cloud.enabled: true`. Do not append push-and-stop text to every
order: the canonical generator selects one consistent contract.

**Local order:** compile and run focused tests, commit, run broader verification, push and open or
update exactly one non-draft pull request against the supplied base. Report its URL and tests, then
stop. Do not wait on CI or poll GitHub Actions; the orchestrator owns CI waiting and readiness.
Opening the pull request remains part of the worker's job.

**Local review-fix order:** a worker that answers a Pullfrog batch on an existing pull request is
composed with `--review-batch`. It commits and tests, reports the commit SHA and its evidence, and
stops WITHOUT pushing. The orchestrator carries the report's evidence, assumptions and manual steps
into the pull request body, resolves every thread on that commit, then pushes once, exactly as
`/orchestrate` step 8 says. A push before the threads are resolved starts a review that cannot
approve and spends a second one.

**Cloud order:** the required finishing text must lead with this standalone instruction, before
any edit/test bullet, as encoded by `CLOUD_FINISHING_CONTRACT` in `tools/lib/cloud-worker.mjs`:

> Commit the implementation. Without a commit there is no diff and the work is lost.

Then edit, compile and run focused tests in the container, stage named paths and commit before
broader verification. Never bypass a rejecting hook; report its exact output. Never push, create
a branch or open a pull request. Report the commit and test results, then stop without waiting on
CI. The orchestrator owns materialization, local delivery and CI waiting. The submitter reuses the
same contract without duplicating it. Never send a locally composed order to the Cloud submitter.

The Cloud order also requires a committed `.claude/cloud-handoff.json` carrying `needsDecision`,
`assumptions`, `manualSteps` and `testResults`, even when the lists are empty. Materialization
preserves it in `materialized.handoff` in the receipt. Read it before local delivery: a missing or
invalid artifact, or a non-null `needsDecision`, blocks delivery and readiness. Carry assumptions
and manual steps into the PR body. Follow `/orchestrate`'s Cloud handoff procedure; a final report
in the container is supplementary and cannot replace the artifact.

A Cloud task can report `ready` with an empty diff. Require a commit before delivery.
Ticket #433 owns the harness handling of empty results; this instruction does not treat an empty
result as successful delivery.

That is why both modes hand CI waiting back to the orchestrator.

## 9. When something blocks

A blocked item is not a reason to stop the session. Log it, leave the tree in a state the owner can read,
and take the next item.

Write blocked items under a `## Blocked, needs owner decision` heading in the same log, so the wake report can
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
