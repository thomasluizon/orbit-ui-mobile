---
name: ticket
description: One bug, chore, improvement, task, docs change, defect, or other single work item in, ONE executable Linear ticket out. Uses the same 6.2 template and check-ticket.mjs validation as /feature. A defect requires a red repro or honest unreproduced evidence; non-defects explicitly omit the red repro. Writes no code and fixes nothing; /orchestrate or a direct session picks the ticket up.
argument-hint: <the single defect, chore, improvement, task, docs change, or feature>
effort: medium
---

# /ticket: one work item -> one Linear ticket

The split between `/ticket` and `/feature` is cardinality: this skill produces one
ticket, while `/feature` decomposes a larger idea into a project of tickets.

This skill takes the narrower D1 path: it creates Linear tickets only for work owned
by orbit-ui-mobile (`repo:ui`) or orbit-api (`repo:api`). For orbit-landing-page,
infrastructure, or Dependabot work, stop before drafting and state that GitHub Issues
is the source of truth. A GitHub Issues creation path is intentionally not added here
because that would widen this single-Linear-ticket workflow beyond its scope.

## Phase A: classify and gather evidence

1. Classify the work and choose exactly one Linear type label:
   - `Bug` for a defect where current behaviour contradicts intended behaviour.
   - `Feature` for a new user or system capability.
   - `Improvement` for a chore, enhancement to existing behaviour, refactor,
     tooling task, or docs task.
2. Before creation, state the chosen type and why in one line. Never infer the type
   silently.
3. For a defect, Rule 1 of `.claude/rules/core.md` binds before the ticket exists:
   reproduce the defect or gather the evidence from Sentry via the MCP, logs via
   Render MCP, or the DB via the read-only postgres MCP. Never ask Thomas to paste
   what a tool can fetch. The repro command, Sentry issue link, or exact manual steps
   goes first in the ticket body's Test scenarios section, marked as the red case
   that must turn green. If reproduction is impossible, use the honest statement
   "unreproduced, evidence below" and include the evidence.
4. For every non-defect, explicitly omit a red repro. Test scenarios still prove the
   requested new or changed behaviour, but no fabricated red case or unreproduced
   statement belongs in the ticket.

## Phase B: interrogate

1. Spawn the `product-manager` agent for every ticket with the work item and
   `architecture.json`. It returns the sharpened problem statement, affected
   surfaces and endpoints, open questions, and whether one ticket remains the right
   shape.
2. When the work touches a UI surface, spawn `design-specialist` in parallel. It
   returns the binding DESIGN.md constraints and whether the request needs a token
   or pattern DESIGN.md lacks. For a pure chore or harness ticket with no UI surface,
   explicitly state that `design-specialist` was skipped and why.
3. Batch every genuine fork into one AskUserQuestion call. Do not ask what the
   codebase, `architecture.json`, or DESIGN.md already answers.

## Phase C: prove scope completeness

Before drafting or editing anything, read and execute
`.claude/skills/_shared/scope-completeness.md`. Carry every required entry into the
ticket's Scope and Affected modules / files.

## Phase D: draft and create

1. Draft ONE ticket with the 6.2 sections. Severity and blast radius go in Problem
   for defects. Root-cause hypotheses go in Technical details, labelled as
   hypotheses.
2. Label with exactly one `repo:*` and exactly one of `Feature`, `Bug`, or
   `Improvement`; add `parity:yes|no` for ui and `visible-effect` when the fix
   changes pixels. If the work genuinely spans repos, that is TWO tickets (api
   blocks ui) even when it began as one request (D4), so use `/feature` instead.
3. Pick the project. Every ticket belongs to one: /orchestrate is project-scoped
   by default, so a project-less ticket is created and then never picked up by
   anything. Route the ticket into the project whose scope it falls in (a redesign
   ticket to `539 Redesign`, an Astra ticket to `562 Astra`, a launch blocker to
   `Launch`); `Backlog` is the home for everything else, including tech debt.
   Never invent a project for a single ticket. `orca linear project list` is the
   current set.
4. Validate with `node tools/check-ticket.mjs --file <draft>`, then create with
   `node tools/new-ticket.mjs --title "<t>" --project "<name>" --team ORB
   --state Todo --body-file - --label "<repo:*>" --label "<type>"
   [--label "<parity:*>"]` (it wraps `orca linear create` and re-validates the
   issue the API reported, so the check cannot land on a guessed identifier).
   Print the identifier it returns.

No fixing inside this skill, even for a one-liner: the ticket is the record that makes
the work reviewable.
